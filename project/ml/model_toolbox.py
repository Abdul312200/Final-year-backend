from __future__ import annotations

import glob
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler

# ---------------------------------------------------------------------------
# Keras compatibility shim
# ---------------------------------------------------------------------------
# Models saved with a Keras version that added `quantization_config` to Dense
# fail to load on versions that don't recognise that key.
# Fix: open the .keras zip in-memory, strip the unknown key from config.json,
# then feed the patched bytes to load_model via a NamedTemporaryFile.
# This works across Keras 2 (tf.keras) and standalone Keras 3.
# ---------------------------------------------------------------------------
import io
import json
import os
import tempfile
import zipfile


def _strip_quantization(obj) -> None:
    """Recursively remove quantization_config from every layer config dict."""
    if isinstance(obj, dict):
        obj.pop("quantization_config", None)
        for v in obj.values():
            _strip_quantization(v)
    elif isinstance(obj, list):
        for item in obj:
            _strip_quantization(item)


def _safe_load_model(model_path):
    """
    Load a .keras model file.
    On first attempt loads normally.
    If Keras raises a 'quantization_config' deserialization error, rewrites
    the embedded config.json in-memory to remove the unknown keys, then retries.
    """
    try:
        import tensorflow as tf
        # Limit TF memory so it doesn't OOM on low-RAM servers (Render free tier)
        for gpu in tf.config.list_physical_devices("GPU"):
            tf.config.experimental.set_memory_growth(gpu, True)
        from tensorflow.keras.models import load_model
    except ImportError:
        from keras.models import load_model  # standalone Keras 3

    path_str = str(model_path)

    # ── Attempt 1: normal load ──────────────────────────────────────────────
    try:
        return load_model(path_str, compile=False)
    except Exception as first_err:
        if "quantization_config" not in str(first_err):
            raise  # unrelated error — re-raise as-is

    # ── Attempt 2: patch config.json inside the .keras zip ─────────────────
    buf = io.BytesIO()
    with zipfile.ZipFile(path_str, "r") as zin, \
         zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "config.json":
                cfg = json.loads(data.decode("utf-8"))
                _strip_quantization(cfg)
                data = json.dumps(cfg).encode("utf-8")
            zout.writestr(item, data)

    buf.seek(0)
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".keras")
    try:
        with os.fdopen(tmp_fd, "wb") as f:
            f.write(buf.read())
        return load_model(tmp_path, compile=False)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

from data_pipeline import (
    FeatureScalers,
    PipelineConfig,
    fetch_ohlcv,
    clean_ohlcv,
    add_technical_indicators,
)

# Algorithm types
AlgorithmOrBest = Literal["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet", "best"]
Algorithm = Literal["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet"]

# Default tickers for training
DEFAULT_TICKERS = [
    # US stocks
    "AAPL", "ADBE", "AMD", "AMZN", "GOOGL", "INTC", "JPM",
    "META", "MSFT", "NFLX", "NVDA", "TSLA", "V", "WMT",
    "BA", "BAC", "CRM", "CSCO", "DIS", "JNJ", "KO",
    "MA", "MCD", "NKE", "ORCL", "PEP", "PG", "PYPL",
    # Indian stocks
    "HDFCBANK.NS", "INFY.NS", "RELIANCE.NS", "TCS.NS",
    "ICICIBANK.NS", "SBIN.NS", "WIPRO.NS", "TITAN.NS",
    "BAJFINANCE.NS", "MARUTI.NS",
    "HINDUNILVR.NS", "BHARTIARTL.NS", "ITC.NS",
    "AXISBANK.NS", "KOTAKBANK.NS", "LT.NS",
]

# US stocks that don't need .NS suffix
US_STOCKS = {
    "AAPL", "ADBE", "AMD", "AMZN", "GOOGL", "INTC", "JPM",
    "META", "MSFT", "NFLX", "NVDA", "TSLA", "V", "WMT",
    "BA", "BAC", "CRM", "CSCO", "DIS", "JNJ", "KO",
    "MA", "MCD", "NKE", "ORCL", "PEP", "PG", "PYPL",
}


def _models_dir() -> Path:
    """Returns path to models directory"""
    return Path(__file__).resolve().parent / "models"


def _model_key(symbol: str) -> str:
    """Convert symbol to safe filename key"""
    return symbol.replace(".", "_")


# Indian stock base symbols (without .NS) for quick lookup
INDIAN_STOCKS = {
    "HDFCBANK", "INFY", "RELIANCE", "TCS", "ICICIBANK",
    "SBIN", "WIPRO", "TITAN", "BAJFINANCE", "MARUTI",
    "HINDUNILVR", "BHARTIARTL", "ITC", "AXISBANK",
    "KOTAKBANK", "LT", "HCLTECH", "TECHM", "NESTLEIND",
    "SUNPHARMA", "DRREDDY", "CIPLA", "ONGC", "BPCL",
    "ADANIENT", "ADANIPORTS", "BAJAJ-AUTO", "INDUSINDBK",
    "M&M", "ASIANPAINT",
}


def normalize_symbol(symbol: str) -> str:
    """
    Normalize stock symbol to proper format.
    Handles: AAPL, HDFCBANK.NS, HDFCBANK_NS, hdfcbank
    """
    symbol = symbol.strip().upper()

    # Convert _NS suffix to .NS (frontend format)
    if symbol.endswith("_NS"):
        symbol = symbol[:-3] + ".NS"

    # Already has a dot suffix (.NS, .BO, etc.) — return as-is
    if "." in symbol:
        return symbol

    # Explicit US stock list
    if symbol in US_STOCKS:
        return symbol

    # Explicit Indian stock list
    if symbol in INDIAN_STOCKS:
        return f"{symbol}.NS"

    # Check if a trained model exists with .NS suffix
    key_with_ns = _model_key(f"{symbol}.NS")
    md = _models_dir()
    if any(md.glob(f"{key_with_ns}_*.keras")) or any(md.glob(f"{key_with_ns}_*.pkl")):
        return f"{symbol}.NS"

    # Default: assume US stock
    return symbol


def fetch_close_series(symbol: str, period: str = "60d"):
    """Fetch closing price series for a symbol (retries on empty response)."""
    import time
    last_err: Exception | None = None
    for attempt in range(3):
        if attempt:
            time.sleep(2 * attempt)   # 2 s, then 4 s between retries
        data = yf.download(symbol, period=period, progress=False, auto_adjust=True)
        if not data.empty:
            break
        last_err = ValueError(f"No data returned for {symbol}")
    else:
        raise last_err or ValueError(f"No data returned for {symbol}")

    if data.empty:
        raise ValueError(f"No data returned for {symbol}")

    # Flatten MultiIndex columns produced by newer yfinance versions
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    if "Close" not in data.columns:
        raise ValueError(f"No close data for {symbol}")

    closes = data["Close"].dropna()

    # Squeeze in case we got a single-column DataFrame instead of a Series
    if isinstance(closes, pd.DataFrame):
        closes = closes.iloc[:, 0]

    if closes.empty:
        raise ValueError(f"No close data for {symbol}")

    return closes


def model_artifacts_exist(symbol: str, algorithm: Algorithm) -> bool:
    """Check if model artifacts exist for given symbol and algorithm."""
    md  = _models_dir()
    key = _model_key(symbol)

    if algorithm in ["lstm", "ann", "gru", "cnn_lstm"]:
        model_file = md / f"{key}_{algorithm}.keras"
        # Accept either new pipeline artifact or legacy scaler
        pipe_file   = md / f"{key}_{algorithm}_pipeline.pkl"
        scaler_file = md / f"{key}_{algorithm}_scaler.pkl"
        return model_file.exists() and (pipe_file.exists() or scaler_file.exists())
    elif algorithm == "arima":
        return (md / f"{key}_arima.pkl").exists()
    elif algorithm == "xgboost":
        model_file = md / f"{key}_xgboost.pkl"
        pipe_file   = md / f"{key}_xgboost_pipeline.pkl"
        scaler_file = md / f"{key}_xgboost_scaler.pkl"
        return model_file.exists() and (pipe_file.exists() or scaler_file.exists())
    elif algorithm == "prophet":
        return (md / f"{key}_prophet.pkl").exists()

    return False


def list_available_models() -> dict[str, list[str]]:
    """
    List all available trained models.
    Returns dict mapping ticker symbols to list of available algorithms.
    """
    md = _models_dir()
    models_map: dict[str, set[str]] = {}
    
    # Find all model files
    for pattern in ["*_lstm.keras", "*_ann.keras", "*_gru.keras", "*_cnn_lstm.keras",
                    "*_arima.pkl", "*_xgboost.pkl", "*_prophet.pkl"]:
        for path in md.glob(pattern):
            # Extract algorithm from filename
            stem = path.stem  # e.g., "AAPL_lstm"
            parts = stem.rsplit("_", 1)
            if len(parts) == 2:
                key, algo = parts
                # Convert key back to symbol
                symbol = key.replace("_", ".")
                if symbol not in models_map:
                    models_map[symbol] = set()
                models_map[symbol].add(algo)
    
    # Convert sets to sorted lists
    return {symbol: sorted(list(algos)) for symbol, algos in sorted(models_map.items())}


def load_best_models() -> dict[str, str]:
    """
    Return the best model algorithm for each ticker.
    Currently defaults to 'lstm' if available, otherwise first available algorithm.
    """
    available = list_available_models()
    best_map = {}
    
    for symbol, algos in available.items():
        if "lstm" in algos:
            best_map[symbol] = "lstm"
        elif "gru" in algos:
            best_map[symbol] = "gru"
        elif "cnn_lstm" in algos:
            best_map[symbol] = "cnn_lstm"
        elif algos:
            best_map[symbol] = algos[0]
    
    return best_map


@dataclass
class PredictionResult:
    """Result of a prediction"""
    ticker: str
    fixed_symbol: str
    algorithm: str
    current_price: float
    predicted_price: float
    input_days_used: int = 60


def predict_next_close(
    ticker: str,
    input_days: int = 60,
    algorithm: AlgorithmOrBest = "best"
) -> PredictionResult:
    """
    Predict next closing price for a ticker using specified algorithm.
    
    Args:
        ticker: Stock symbol
        input_days: Number of historical days to use (minimum 60)
        algorithm: Model algorithm to use, or 'best' for auto-selection
        
    Returns:
        PredictionResult with prediction details
    """
    # Normalize symbol
    fixed_symbol = normalize_symbol(ticker)
    
    # Determine which algorithm to use
    if algorithm == "best":
        best_models = load_best_models()
        if fixed_symbol not in best_models:
            raise FileNotFoundError(f"No trained models found for {fixed_symbol}")
        algo_to_use = best_models[fixed_symbol]
    else:
        algo_to_use = algorithm
        if not model_artifacts_exist(fixed_symbol, algo_to_use):  # type: ignore[arg-type]
            raise FileNotFoundError(
                f"Model {algo_to_use} not found for {fixed_symbol}. "
                f"Train it first with: python train_models.py --tickers {ticker} --algorithms {algo_to_use}"
            )
    
    # Ensure minimum input days
    if input_days < 60:
        input_days = 60
    
    # Fetch historical data
    closes = fetch_close_series(fixed_symbol, period=f"{input_days + 30}d")
    # Safely extract scalar – newer yfinance can return a single-element Series
    last_val = closes.iloc[-1]
    current_price = float(last_val.iloc[0] if isinstance(last_val, pd.Series) else last_val)
    
    # Load model and predict based on algorithm type
    md = _models_dir()
    key = _model_key(fixed_symbol)

    if algo_to_use in ["lstm", "ann", "gru", "cnn_lstm"]:
        # Deep learning models
        model_path  = md / f"{key}_{algo_to_use}.keras"
        pipe_path   = md / f"{key}_{algo_to_use}_pipeline.pkl"
        scaler_path = md / f"{key}_{algo_to_use}_scaler.pkl"  # legacy

        model = _safe_load_model(model_path)

        # ── Multi-feature path (new models) ───────────────────────────────
        if pipe_path.exists():
            artifact  = joblib.load(pipe_path)
            scalers: FeatureScalers = artifact["scalers"]
            feat_cols: list[str]    = artifact["feature_cols"]

            # Fetch & prepare OHLCV
            raw_df = fetch_ohlcv(fixed_symbol, period=f"{input_days + 90}d")
            df     = clean_ohlcv(raw_df)
            if feat_cols:
                df = add_technical_indicators(df)

            used_cols = ["Close"] + feat_cols
            df.dropna(subset=used_cols, inplace=True)

            if len(df) < input_days:
                raise ValueError(
                    f"Not enough data after cleaning for {fixed_symbol}: "
                    f"{len(df)} rows < {input_days} required"
                )

            window = df[used_cols].tail(input_days)
            scaled = scalers.transform(window, feat_cols)  # (seq_len, n_feats)

            if algo_to_use == "ann":
                # ANN: flatten to (1, seq_len * n_features)
                X = scaled.reshape(1, -1)
            else:
                # LSTM / GRU / CNN-LSTM: (1, seq_len, n_features)
                X = scaled.reshape(1, input_days, scaled.shape[1])

            pred_scaled    = model.predict(X, verbose=0)[0][0]
            predicted_price = scalers.inverse_close(pred_scaled)

        # ── Legacy close-only path (old models) ───────────────────────────
        elif scaler_path.exists():
            scaler: MinMaxScaler = joblib.load(scaler_path)

            close_values = closes.tail(input_days).to_numpy().reshape(-1, 1)
            scaled_1d    = scaler.transform(close_values)

            if algo_to_use == "ann":
                X = scaled_1d.reshape(1, input_days)
            else:
                X = scaled_1d.reshape(1, input_days, 1)

            pred_scaled    = model.predict(X, verbose=0)[0][0]
            predicted_price = float(scaler.inverse_transform([[pred_scaled]])[0][0])

        else:
            raise FileNotFoundError(
                f"No scaler/pipeline artifact found for {fixed_symbol} / {algo_to_use}"
            )
        
    elif algo_to_use == "arima":
        # ARIMA model
        model_path = md / f"{key}_arima.pkl"
        model = joblib.load(model_path)
        
        # ARIMA forecast
        forecast = model.forecast(steps=1)
        predicted_price = float(forecast[0])
        
    elif algo_to_use == "xgboost":
        # XGBoost model
        model_path = md / f"{key}_xgboost.pkl"
        pipe_path  = md / f"{key}_xgboost_pipeline.pkl"
        scaler_path = md / f"{key}_xgboost_scaler.pkl"  # legacy

        model = joblib.load(model_path)

        # ── Multi-feature path ─────────────────────────────────────────────
        if pipe_path.exists():
            artifact  = joblib.load(pipe_path)
            scalers: FeatureScalers = artifact["scalers"]
            feat_cols: list[str]    = artifact["feature_cols"]

            raw_df = fetch_ohlcv(fixed_symbol, period=f"{input_days + 90}d")
            df     = clean_ohlcv(raw_df)
            if feat_cols:
                df = add_technical_indicators(df)

            used_cols = ["Close"] + feat_cols
            df.dropna(subset=used_cols, inplace=True)

            window = df[used_cols].tail(input_days)
            scaled = scalers.transform(window, feat_cols)
            X = scaled.reshape(1, -1)  # flatten

            pred_scaled     = model.predict(X)[0]
            predicted_price = scalers.inverse_close(pred_scaled)

        # ── Legacy path ────────────────────────────────────────────────────
        elif scaler_path.exists():
            scaler: MinMaxScaler = joblib.load(scaler_path)
            close_values = closes.tail(input_days).to_numpy().reshape(-1, 1)
            scaled       = scaler.transform(close_values)
            X = scaled.reshape(1, input_days)
            pred_scaled     = model.predict(X)[0]
            predicted_price = float(scaler.inverse_transform([[pred_scaled]])[0][0])

        else:
            raise FileNotFoundError(
                f"No pipeline/scaler artifact for {fixed_symbol} / xgboost"
            )

    elif algo_to_use == "prophet":
        # Prophet model
        model_path = md / f"{key}_prophet.pkl"
        model = joblib.load(model_path)

        # Create future dataframe for next day (timezone-naive)
        next_day = closes.index[-1] + pd.Timedelta(days=1)
        if hasattr(next_day, "tz_localize"):
            next_day = next_day.tz_localize(None)
        future = pd.DataFrame({"ds": [next_day]})
        forecast = model.predict(future)
        predicted_price = float(forecast["yhat"].iloc[0])
        
    else:
        raise ValueError(f"Unknown algorithm: {algo_to_use}")
    
    return PredictionResult(
        ticker=ticker,
        fixed_symbol=fixed_symbol,
        algorithm=algo_to_use,
        current_price=round(current_price, 2),
        predicted_price=round(predicted_price, 2),
        input_days_used=input_days,
    )
