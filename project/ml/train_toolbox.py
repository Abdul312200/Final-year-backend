from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Literal

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import MinMaxScaler

from data_pipeline import (
    PipelineConfig,
    run_pipeline,
    fetch_ohlcv,
    clean_ohlcv,
)

Algorithm = Literal["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet"]


def _models_dir() -> Path:
    return Path(__file__).resolve().parent / "models"


def _model_key(symbol: str) -> str:
    return symbol.replace(".", "_")


def download_close(symbol: str, period: str = "5y"):
    """Legacy helper – kept for backward compatibility."""
    raw = fetch_ohlcv(symbol, period=period)
    df  = clean_ohlcv(raw)
    closes = df["Close"]
    if closes.empty:
        raise ValueError(f"No close data for {symbol}")
    return closes


def _create_sequences(values: np.ndarray, seq_len: int) -> tuple[np.ndarray, np.ndarray]:
    X, y = [], []
    for i in range(seq_len, len(values)):
        X.append(values[i - seq_len : i])
        y.append(values[i])
    return np.array(X), np.array(y)


@dataclass
class TrainConfig:
    seq_len: int = 60
    epochs: int = 50           # increased; early stopping prevents overfit
    batch_size: int = 32
    period: str = "5y"
    arima_order: tuple[int, int, int] = (5, 1, 0)
    use_features: bool = True  # multi-feature OHLCV + indicators
    val_ratio: float = 0.1     # fraction of data held out for validation
    patience: int = 10         # early-stopping patience (epochs)


def train_lstm(symbol: str, cfg: TrainConfig) -> None:
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.models import Sequential

    pipe_cfg = PipelineConfig(
        seq_len=cfg.seq_len,
        val_ratio=cfg.val_ratio,
        use_features=cfg.use_features,
    )
    pipe = run_pipeline(symbol, period=cfg.period, cfg=pipe_cfg)

    X_train, X_val = pipe.X_train, pipe.X_val
    y_train, y_val = pipe.y_train, pipe.y_val

    if len(X_train) < 10:
        raise ValueError("Not enough data to train")

    n_features = pipe.n_features

    model = Sequential(
        [
            LSTM(128, return_sequences=True, input_shape=(cfg.seq_len, n_features)),
            Dropout(0.2),
            LSTM(64, return_sequences=True),
            Dropout(0.2),
            LSTM(32),
            Dropout(0.2),
            Dense(1),
        ]
    )

    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=cfg.patience,
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=cfg.patience // 2,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=cfg.epochs,
        batch_size=cfg.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    model.save(md / f"{key}_lstm.keras")
    # Save the full FeatureScalers + feature column list for inference
    joblib.dump(
        {"scalers": pipe.scalers, "feature_cols": pipe.feature_cols},
        md / f"{key}_lstm_pipeline.pkl",
    )


def train_ann(symbol: str, cfg: TrainConfig) -> None:
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    from tensorflow.keras.layers import Dense, Dropout
    from tensorflow.keras.models import Sequential

    pipe_cfg = PipelineConfig(
        seq_len=cfg.seq_len,
        val_ratio=cfg.val_ratio,
        use_features=cfg.use_features,
    )
    pipe = run_pipeline(symbol, period=cfg.period, cfg=pipe_cfg)

    X_train, X_val = pipe.X_train, pipe.X_val
    y_train, y_val = pipe.y_train, pipe.y_val

    if len(X_train) < 10:
        raise ValueError("Not enough data to train")

    # Flatten (samples, seq_len, n_features) → (samples, seq_len * n_features)
    flat_len = cfg.seq_len * pipe.n_features
    X_train_2d = X_train.reshape(len(X_train), flat_len)
    X_val_2d   = X_val.reshape(len(X_val), flat_len)

    model = Sequential(
        [
            Dense(256, activation="relu", input_shape=(flat_len,)),
            Dropout(0.3),
            Dense(128, activation="relu"),
            Dropout(0.2),
            Dense(64, activation="relu"),
            Dropout(0.2),
            Dense(1),
        ]
    )

    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=cfg.patience,
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=cfg.patience // 2,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    model.fit(
        X_train_2d, y_train,
        validation_data=(X_val_2d, y_val),
        epochs=cfg.epochs,
        batch_size=cfg.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    model.save(md / f"{key}_ann.keras")
    joblib.dump(
        {"scalers": pipe.scalers, "feature_cols": pipe.feature_cols},
        md / f"{key}_ann_pipeline.pkl",
    )


def train_arima(symbol: str, cfg: TrainConfig) -> None:
    from statsmodels.tsa.arima.model import ARIMA

    # Use cleaned Close series via data_pipeline
    closes = download_close(symbol, period=cfg.period)
    model = ARIMA(closes.to_numpy(), order=cfg.arima_order)
    result = model.fit()

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    joblib.dump(result, md / f"{key}_arima.pkl")


def train_gru(symbol: str, cfg: TrainConfig) -> None:
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    from tensorflow.keras.layers import GRU, Dense, Dropout
    from tensorflow.keras.models import Sequential

    pipe_cfg = PipelineConfig(
        seq_len=cfg.seq_len,
        val_ratio=cfg.val_ratio,
        use_features=cfg.use_features,
    )
    pipe = run_pipeline(symbol, period=cfg.period, cfg=pipe_cfg)

    X_train, X_val = pipe.X_train, pipe.X_val
    y_train, y_val = pipe.y_train, pipe.y_val

    if len(X_train) < 10:
        raise ValueError("Not enough data to train")

    n_features = pipe.n_features

    model = Sequential(
        [
            GRU(128, return_sequences=True, input_shape=(cfg.seq_len, n_features)),
            Dropout(0.2),
            GRU(64, return_sequences=True),
            Dropout(0.2),
            GRU(32),
            Dropout(0.2),
            Dense(1),
        ]
    )

    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=cfg.patience,
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=cfg.patience // 2,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=cfg.epochs,
        batch_size=cfg.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    model.save(md / f"{key}_gru.keras")
    joblib.dump(
        {"scalers": pipe.scalers, "feature_cols": pipe.feature_cols},
        md / f"{key}_gru_pipeline.pkl",
    )


def train_cnn_lstm(symbol: str, cfg: TrainConfig) -> None:
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    from tensorflow.keras.layers import Conv1D, LSTM, Dense, Dropout, MaxPooling1D
    from tensorflow.keras.models import Sequential

    pipe_cfg = PipelineConfig(
        seq_len=cfg.seq_len,
        val_ratio=cfg.val_ratio,
        use_features=cfg.use_features,
    )
    pipe = run_pipeline(symbol, period=cfg.period, cfg=pipe_cfg)

    X_train, X_val = pipe.X_train, pipe.X_val
    y_train, y_val = pipe.y_train, pipe.y_val

    if len(X_train) < 10:
        raise ValueError("Not enough data to train")

    n_features = pipe.n_features

    model = Sequential(
        [
            Conv1D(filters=64, kernel_size=3, activation="relu", input_shape=(cfg.seq_len, n_features)),
            MaxPooling1D(pool_size=2),
            LSTM(64, return_sequences=True),
            Dropout(0.2),
            LSTM(32),
            Dropout(0.2),
            Dense(1),
        ]
    )

    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=cfg.patience,
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=cfg.patience // 2,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=cfg.epochs,
        batch_size=cfg.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    model.save(md / f"{key}_cnn_lstm.keras")
    joblib.dump(
        {"scalers": pipe.scalers, "feature_cols": pipe.feature_cols},
        md / f"{key}_cnn_lstm_pipeline.pkl",
    )


def train_xgboost(symbol: str, cfg: TrainConfig) -> None:
    import xgboost as xgb

    pipe_cfg = PipelineConfig(
        seq_len=cfg.seq_len,
        val_ratio=cfg.val_ratio,
        use_features=cfg.use_features,
    )
    pipe = run_pipeline(symbol, period=cfg.period, cfg=pipe_cfg)

    X_train, X_val = pipe.X_train, pipe.X_val
    y_train, y_val = pipe.y_train, pipe.y_val

    if len(X_train) < 10:
        raise ValueError("Not enough data to train")

    # Flatten (samples, seq_len, n_features) → (samples, seq_len * n_features)
    flat_len = cfg.seq_len * pipe.n_features
    X_train_2d = X_train.reshape(len(X_train), flat_len)
    X_val_2d   = X_val.reshape(len(X_val), flat_len)

    model = xgb.XGBRegressor(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.8,
        colsample_bytree=0.8,
        early_stopping_rounds=20,
        eval_metric="rmse",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(
        X_train_2d, y_train,
        eval_set=[(X_val_2d, y_val)],
        verbose=False,
    )

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    joblib.dump(model, md / f"{key}_xgboost.pkl")
    joblib.dump(
        {"scalers": pipe.scalers, "feature_cols": pipe.feature_cols},
        md / f"{key}_xgboost_pipeline.pkl",
    )


def train_prophet(symbol: str, cfg: TrainConfig) -> None:
    from prophet import Prophet

    # Use cleaned close data for Prophet
    closes = download_close(symbol, period=cfg.period)

    # Prophet requires 'ds' (datetime) and 'y' (value) columns
    df = closes.reset_index()
    # Handle multi-level column names from yfinance
    df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
    df = df.rename(columns={df.columns[0]: "ds", df.columns[1]: "y"})
    # Ensure ds is timezone-naive
    df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)

    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True,
        changepoint_prior_scale=0.05,
    )
    model.fit(df)

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)

    key = _model_key(symbol)
    joblib.dump(model, md / f"{key}_prophet.pkl")


def train_one(symbol: str, algorithm: Algorithm, cfg: TrainConfig) -> None:
    if algorithm == "lstm":
        return train_lstm(symbol, cfg)
    if algorithm == "ann":
        return train_ann(symbol, cfg)
    if algorithm == "arima":
        return train_arima(symbol, cfg)
    if algorithm == "gru":
        return train_gru(symbol, cfg)
    if algorithm == "cnn_lstm":
        return train_cnn_lstm(symbol, cfg)
    if algorithm == "xgboost":
        return train_xgboost(symbol, cfg)
    if algorithm == "prophet":
        return train_prophet(symbol, cfg)
    raise ValueError(f"Unknown algorithm: {algorithm}")


def train_many(symbols: Iterable[str], algorithms: Iterable[Algorithm], cfg: TrainConfig) -> dict[str, dict[str, str]]:
    results: dict[str, dict[str, str]] = {}

    for s in symbols:
        results[s] = {}
        for algo in algorithms:
            try:
                train_one(s, algo, cfg)
                results[s][algo] = "ok"
            except Exception as e:
                results[s][algo] = f"error: {e}"

    return results
