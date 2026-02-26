"""
data_pipeline.py
================
Centralised data-cleaning, preprocessing and feature-engineering module for
stock price prediction.

Pipeline stages
---------------
1. Fetch        – download OHLCV from yfinance (auto-adjusted for splits/divs)
2. Clean        – handle NaN, zero/negative prices, extreme outliers
3. Feature eng. – technical indicators (RSI, MACD, Bollinger Bands, ATR, …)
4. Scale        – MinMaxScaler on Close, RobustScaler on all other features
5. Sequences    – build (X, y) overlapping windows
6. Split        – temporal train / validation split (no look-ahead leakage)
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from typing import Optional

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
from scipy import stats
from sklearn.preprocessing import MinMaxScaler, RobustScaler

warnings.filterwarnings("ignore", category=FutureWarning)

# ---------------------------------------------------------------------------
# 1. RAW DATA FETCHING
# ---------------------------------------------------------------------------

def fetch_ohlcv(symbol: str, period: str = "5y", interval: str = "1d") -> pd.DataFrame:
    """
    Download OHLCV data from Yahoo Finance.

    Uses ``auto_adjust=True`` so prices already account for splits and
    dividends – no manual correction needed.

    Returns
    -------
    pd.DataFrame with DatetimeIndex and columns Open, High, Low, Close, Volume.
    Raises ValueError if the download returned no data.
    """
    data = yf.download(
        symbol,
        period=period,
        interval=interval,
        progress=False,
        auto_adjust=True,
    )
    if data.empty:
        raise ValueError(f"No data returned for {symbol!r} (period={period})")

    # Flatten MultiIndex columns produced by some yfinance versions
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    # Keep only the columns we care about
    keep = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in data.columns]
    return data[keep].copy()


# ---------------------------------------------------------------------------
# 2. DATA CLEANING
# ---------------------------------------------------------------------------

def clean_ohlcv(df: pd.DataFrame, *, zscore_threshold: float = 4.0) -> pd.DataFrame:
    """
    Clean raw OHLCV data in-place-safe way (returns a copy).

    Steps
    -----
    * Drop rows where *all* values are NaN.
    * Forward-fill then backward-fill remaining NaNs (handles trading halts).
    * Remove rows with zero or negative Close prices.
    * Winsorise extreme Close outliers detected via z-score on log-returns.
    * Clip Volume to ≥ 0.
    """
    df = df.copy()

    # 1. Drop fully-empty rows
    df.dropna(how="all", inplace=True)

    # 2. Fill gaps – ffill first, then bfill for leading NaNs
    df.ffill(inplace=True)
    df.bfill(inplace=True)

    # 3. Drop rows where Close is still NaN (should be a no-op after bfill)
    df.dropna(subset=["Close"], inplace=True)

    # 4. Remove non-positive prices (data errors / halted stocks)
    df = df[df["Close"] > 0].copy()

    # 5. Outlier detection on log-returns
    if len(df) > 30:
        log_ret = np.log(df["Close"] / df["Close"].shift(1)).dropna()
        z_scores = np.abs(stats.zscore(log_ret))
        bad_idx = log_ret.index[z_scores > zscore_threshold]
        if len(bad_idx) > 0:
            # Replace outlier Close values with the previous valid Close
            df.loc[bad_idx, "Close"] = np.nan
            df["Close"].ffill(inplace=True)

    # 6. Fix Volume
    if "Volume" in df.columns:
        df["Volume"] = df["Volume"].clip(lower=0)
        df["Volume"].ffill(inplace=True)

    return df


# ---------------------------------------------------------------------------
# 3. FEATURE ENGINEERING
# ---------------------------------------------------------------------------

def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute and append technical indicators to a cleaned OHLCV DataFrame.

    Added columns
    -------------
    log_return      – 1-day log return
    sma_5/20/50     – Simple Moving Averages
    ema_12/26       – Exponential Moving Averages
    macd            – MACD line (EMA12 – EMA26)
    macd_signal     – 9-period EMA of MACD
    macd_hist       – MACD histogram
    rsi_14          – 14-period Relative Strength Index (0–100)
    bb_upper/lower  – Bollinger Bands (20-period, ±2 σ)
    bb_pct          – %B: position within Bollinger Bands (0–1)
    atr_14          – 14-period Average True Range (when High/Low available)
    volume_ratio    – Volume / 20-day rolling mean volume
    momentum_1/5/10 – Percentage price change over 1, 5, 10 days
    """
    df = df.copy()
    c = df["Close"]

    # --- Returns ---
    df["log_return"] = np.log(c / c.shift(1))

    # --- Simple Moving Averages ---
    for w in [5, 20, 50]:
        df[f"sma_{w}"] = c.rolling(w).mean()

    # --- Exponential Moving Averages ---
    for span in [12, 26]:
        df[f"ema_{span}"] = c.ewm(span=span, adjust=False).mean()

    # --- MACD ---
    df["macd"]        = df["ema_12"] - df["ema_26"]
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"]   = df["macd"] - df["macd_signal"]

    # --- RSI (14) ---
    delta = c.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / loss.replace(0, np.nan)
    df["rsi_14"] = 100.0 - (100.0 / (1.0 + rs))

    # --- Bollinger Bands (20-period, 2σ) ---
    bb_mid = c.rolling(20).mean()
    bb_std = c.rolling(20).std()
    df["bb_upper"] = bb_mid + 2.0 * bb_std
    df["bb_lower"] = bb_mid - 2.0 * bb_std
    # %B: 0 = at lower band, 1 = at upper band; may exceed [0,1]
    denom = (df["bb_upper"] - df["bb_lower"]).replace(0, np.nan)
    df["bb_pct"] = (c - df["bb_lower"]) / denom

    # --- ATR (14) – requires High & Low ---
    if {"High", "Low"}.issubset(df.columns):
        h = df["High"]
        l = df["Low"]
        tr = pd.concat(
            [h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()],
            axis=1,
        ).max(axis=1)
        df["atr_14"] = tr.rolling(14).mean()

    # --- Volume features ---
    if "Volume" in df.columns:
        vol = df["Volume"].replace(0, np.nan).ffill()
        vol_ma = vol.rolling(20).mean().replace(0, np.nan)
        df["volume_ratio"] = vol / vol_ma

    # --- Price Momentum ---
    for lag in [1, 5, 10]:
        df[f"momentum_{lag}"] = c.pct_change(lag)

    return df


# Default feature column order (Close is always column-0 after scaling)
FEATURE_COLS: list[str] = [
    "log_return",
    "sma_5", "sma_20", "sma_50",
    "ema_12", "ema_26",
    "macd", "macd_signal", "macd_hist",
    "rsi_14",
    "bb_pct",
    "atr_14",
    "volume_ratio",
    "momentum_1", "momentum_5", "momentum_10",
]


# ---------------------------------------------------------------------------
# 4. SCALING
# ---------------------------------------------------------------------------

@dataclass
class FeatureScalers:
    """
    Holds individual scalers for price (MinMax) and each feature (Robust).

    The Close column is always scaled with MinMaxScaler so inverse-transform
    of predictions is straightforward.  All other features use RobustScaler to
    reduce the influence of extreme values on training.
    """
    price_scaler: MinMaxScaler = field(default_factory=MinMaxScaler)
    feature_scalers: dict[str, RobustScaler] = field(default_factory=dict)

    # ------------------------------------------------------------------ fit
    def fit_transform(
        self,
        df: pd.DataFrame,
        feature_cols: list[str],
    ) -> np.ndarray:
        """Fit on *df* and return scaled array (n_rows × (1 + n_features))."""
        close_scaled = self.price_scaler.fit_transform(df[["Close"]])
        parts = [close_scaled]
        for col in feature_cols:
            scaler = RobustScaler()
            self.feature_scalers[col] = scaler
            parts.append(scaler.fit_transform(df[[col]].values))
        return np.hstack(parts)

    # --------------------------------------------------------------- transform
    def transform(
        self,
        df: pd.DataFrame,
        feature_cols: list[str],
    ) -> np.ndarray:
        """Transform *df* using already-fitted scalers."""
        close_scaled = self.price_scaler.transform(df[["Close"]])
        parts = [close_scaled]
        for col in feature_cols:
            scaler = self.feature_scalers[col]
            parts.append(scaler.transform(df[[col]].values))
        return np.hstack(parts)

    # -------------------------------------------------------- inverse (price)
    def inverse_close(self, value: float) -> float:
        """Inverse-transform a single scaled Close prediction."""
        return float(self.price_scaler.inverse_transform([[value]])[0][0])

    # ------------------------------------------------------------------ I/O
    def save(self, path: str) -> None:
        joblib.dump(self, path)

    @staticmethod
    def load(path: str) -> "FeatureScalers":
        return joblib.load(path)


# ---------------------------------------------------------------------------
# 5. SEQUENCE BUILDER
# ---------------------------------------------------------------------------

def build_sequences(
    scaled: np.ndarray,
    seq_len: int,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Create overlapping (X, y) pairs for supervised sequence learning.

    Parameters
    ----------
    scaled : array of shape (n_timesteps, n_features)
    seq_len : look-back window length

    Returns
    -------
    X : (n_samples, seq_len, n_features)
    y : (n_samples,)  – scaled Close of the *next* timestep (column 0)
    """
    X, y = [], []
    for i in range(seq_len, len(scaled)):
        X.append(scaled[i - seq_len: i, :])  # all feature columns
        y.append(scaled[i, 0])               # column 0 = scaled Close
    return np.array(X), np.array(y)


def train_val_split(
    X: np.ndarray,
    y: np.ndarray,
    val_ratio: float = 0.1,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Temporal (non-random) train / validation split.

    Splitting is done *in time order* to avoid look-ahead bias:
    the validation set contains the most recent samples.
    """
    split = int(len(X) * (1.0 - val_ratio))
    return X[:split], X[split:], y[:split], y[split:]


# ---------------------------------------------------------------------------
# 6. FULL PIPELINE CONFIG & RESULT
# ---------------------------------------------------------------------------

@dataclass
class PipelineConfig:
    seq_len: int = 60
    val_ratio: float = 0.1
    zscore_threshold: float = 4.0
    use_features: bool = True       # False → close-only (legacy mode)
    feature_cols: list[str] = field(default_factory=lambda: list(FEATURE_COLS))


@dataclass
class PipelineResult:
    X_train: np.ndarray
    X_val:   np.ndarray
    y_train: np.ndarray
    y_val:   np.ndarray
    scalers: FeatureScalers
    feature_cols: list[str]         # columns actually present after cleaning
    n_features: int                 # 1 (Close) + len(feature_cols)
    raw_df: pd.DataFrame            # cleaned + featured DataFrame


# ---------------------------------------------------------------------------
# 7. ENTRY POINT
# ---------------------------------------------------------------------------

def run_pipeline(
    symbol: str,
    period: str = "5y",
    cfg: Optional[PipelineConfig] = None,
) -> PipelineResult:
    """
    Execute the full pipeline for one stock symbol.

    Steps
    -----
    1. Fetch OHLCV (auto-adjusted)
    2. Clean: NaN-fill, remove non-positive prices, winsorise outliers
    3. Feature engineering: RSI, MACD, Bollinger Bands, ATR, volume ratio, …
    4. Drop warm-up rows (NaN from rolling indicators)
    5. Scale: MinMax on Close, Robust on everything else
    6. Build sequences of length *cfg.seq_len*
    7. Temporal train / validation split (val_ratio of tail)

    Returns
    -------
    PipelineResult with ready-to-use numpy arrays, fitted scalers, and
    the cleaned DataFrame.

    Raises
    ------
    ValueError if there is not enough data after cleaning.
    """
    if cfg is None:
        cfg = PipelineConfig()

    # --- 1. Fetch ---
    raw = fetch_ohlcv(symbol, period=period)

    # --- 2. Clean ---
    df = clean_ohlcv(raw, zscore_threshold=cfg.zscore_threshold)

    # --- 3. Feature engineering ---
    if cfg.use_features:
        df = add_technical_indicators(df)

    # --- 4. Determine which feature columns are available ---
    avail_features = [col for col in cfg.feature_cols if col in df.columns]

    # Drop warm-up rows (NaN introduced by rolling windows)
    used_cols = ["Close"] + avail_features
    df.dropna(subset=used_cols, inplace=True)

    min_rows = cfg.seq_len + 20
    if len(df) < min_rows:
        raise ValueError(
            f"Not enough clean data for {symbol!r}: {len(df)} rows after "
            f"cleaning (need ≥ {min_rows}).  Try a longer --period."
        )

    # --- 5. Scale ---
    scalers = FeatureScalers()
    if cfg.use_features and avail_features:
        scaled = scalers.fit_transform(df[used_cols], avail_features)
    else:
        # Close-only (legacy) – still use the FeatureScalers wrapper
        scaled = scalers.price_scaler.fit_transform(df[["Close"]])

    n_features = scaled.shape[1]

    # --- 6. Build sequences ---
    X, y = build_sequences(scaled, cfg.seq_len)

    # --- 7. Temporal split ---
    X_train, X_val, y_train, y_val = train_val_split(X, y, val_ratio=cfg.val_ratio)

    return PipelineResult(
        X_train=X_train,
        X_val=X_val,
        y_train=y_train,
        y_val=y_val,
        scalers=scalers,
        feature_cols=avail_features,
        n_features=n_features,
        raw_df=df,
    )
