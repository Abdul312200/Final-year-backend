from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import joblib
import numpy as np

from model_toolbox import DEFAULT_TICKERS, fetch_close_series, normalize_symbol

Algorithm = Literal["lstm", "ann", "arima"]


def _models_dir() -> Path:
    return Path(__file__).resolve().parent / "models"


def _model_key(symbol: str) -> str:
    return symbol.replace(".", "_")


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true).reshape(-1)
    y_pred = np.asarray(y_pred).reshape(-1)
    eps = 1e-9
    denom = np.maximum(np.abs(y_true), eps)
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100.0)


@dataclass
class AlgoScore:
    algorithm: Algorithm
    rmse: float
    mape: float
    n_test: int


def _load_keras_model(path: Path):
    from tensorflow.keras.models import load_model

    return load_model(path)


def eval_lstm(symbol: str, seq_len: int, test_ratio: float) -> AlgoScore:
    fixed, closes = fetch_close_series(symbol, period="5y")
    if closes is None or len(closes) < seq_len + 30:
        raise ValueError("Not enough data")

    key = _model_key(fixed)
    md = _models_dir()
    model_path = md / f"{key}_lstm.keras"
    scaler_path = md / f"{key}_lstm_scaler.pkl"

    if not model_path.exists() or not scaler_path.exists():
        raise FileNotFoundError("Missing LSTM artifacts")

    scaler = joblib.load(scaler_path)
    series = closes.to_numpy().reshape(-1, 1)
    scaled = scaler.transform(series)

    # build windows
    X, y = [], []
    for i in range(seq_len, len(scaled)):
        X.append(scaled[i - seq_len : i])
        y.append(scaled[i])

    X = np.array(X).reshape((-1, seq_len, 1))
    y = np.array(y).reshape((-1, 1))

    split = int(len(X) * (1.0 - test_ratio))
    X_test, y_test = X[split:], y[split:]
    if len(X_test) < 5:
        raise ValueError("Not enough test data")

    model = _load_keras_model(model_path)
    y_pred = model.predict(X_test, verbose=0).reshape((-1, 1))

    y_test_inv = scaler.inverse_transform(y_test).reshape(-1)
    y_pred_inv = scaler.inverse_transform(y_pred).reshape(-1)

    return AlgoScore("lstm", rmse(y_test_inv, y_pred_inv), mape(y_test_inv, y_pred_inv), int(len(y_test_inv)))


def eval_ann(symbol: str, seq_len: int, test_ratio: float) -> AlgoScore:
    fixed, closes = fetch_close_series(symbol, period="5y")
    if closes is None or len(closes) < seq_len + 30:
        raise ValueError("Not enough data")

    key = _model_key(fixed)
    md = _models_dir()
    model_path = md / f"{key}_ann.keras"
    scaler_path = md / f"{key}_ann_scaler.pkl"

    if not model_path.exists() or not scaler_path.exists():
        raise FileNotFoundError("Missing ANN artifacts")

    scaler = joblib.load(scaler_path)
    series = closes.to_numpy().reshape(-1, 1)
    scaled = scaler.transform(series)

    X, y = [], []
    for i in range(seq_len, len(scaled)):
        X.append(scaled[i - seq_len : i].reshape(-1))
        y.append(scaled[i])

    X = np.array(X)
    y = np.array(y).reshape((-1, 1))

    split = int(len(X) * (1.0 - test_ratio))
    X_test, y_test = X[split:], y[split:]
    if len(X_test) < 5:
        raise ValueError("Not enough test data")

    model = _load_keras_model(model_path)
    y_pred = model.predict(X_test, verbose=0).reshape((-1, 1))

    y_test_inv = scaler.inverse_transform(y_test).reshape(-1)
    y_pred_inv = scaler.inverse_transform(y_pred).reshape(-1)

    return AlgoScore("ann", rmse(y_test_inv, y_pred_inv), mape(y_test_inv, y_pred_inv), int(len(y_test_inv)))


def eval_arima(symbol: str, test_ratio: float, order: tuple[int, int, int]) -> AlgoScore:
    # For ARIMA, we refit on a train split (fast enough, avoids relying on saved full-data model)
    from statsmodels.tsa.arima.model import ARIMA

    fixed, closes = fetch_close_series(symbol, period="5y")
    if closes is None or len(closes) < 90:
        raise ValueError("Not enough data")

    y = closes.to_numpy().reshape(-1)
    split = int(len(y) * (1.0 - test_ratio))
    y_train, y_test = y[:split], y[split:]
    if len(y_test) < 5:
        raise ValueError("Not enough test data")

    model = ARIMA(y_train, order=order)
    res = model.fit()
    y_pred = np.asarray(res.forecast(steps=len(y_test))).reshape(-1)

    return AlgoScore("arima", rmse(y_test, y_pred), mape(y_test, y_pred), int(len(y_test)))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Evaluate LSTM/ANN/ARIMA and choose best per ticker")
    p.add_argument("--tickers", type=str, default="")
    p.add_argument("--all-default", action="store_true")
    p.add_argument("--seq-len", type=int, default=60)
    p.add_argument("--test-ratio", type=float, default=0.2)
    p.add_argument("--metric", choices=["rmse", "mape"], default="rmse")
    p.add_argument("--arima-order", type=str, default="5,1,0")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    if args.all_default:
        symbols = DEFAULT_TICKERS
    else:
        raw = [t.strip() for t in (args.tickers or "").split(",") if t.strip()]
        if not raw:
            raise SystemExit("Provide --tickers or use --all-default")
        symbols = [normalize_symbol(t) for t in raw]

    parts = [int(x.strip()) for x in args.arima_order.split(",")]
    if len(parts) != 3:
        raise SystemExit("--arima-order must be like 5,1,0")
    arima_order = (parts[0], parts[1], parts[2])

    out: dict[str, dict] = {"metric": args.metric, "seq_len": args.seq_len, "test_ratio": args.test_ratio, "results": {}}

    for s in symbols:
        scores: list[AlgoScore] = []
        fixed = normalize_symbol(s)

        for algo in ("lstm", "ann", "arima"):
            try:
                if algo == "lstm":
                    scores.append(eval_lstm(fixed, seq_len=args.seq_len, test_ratio=args.test_ratio))
                elif algo == "ann":
                    scores.append(eval_ann(fixed, seq_len=args.seq_len, test_ratio=args.test_ratio))
                else:
                    scores.append(eval_arima(fixed, test_ratio=args.test_ratio, order=arima_order))
            except Exception as e:
                # keep going
                pass

        if not scores:
            continue

        key_metric = args.metric
        best = min(scores, key=lambda sc: getattr(sc, key_metric))

        out["results"][fixed] = {
            "best": best.algorithm,
            "scores": [asdict(s) for s in sorted(scores, key=lambda sc: getattr(sc, key_metric))],
        }

        print(f"{fixed}: best={best.algorithm} ({key_metric}={getattr(best, key_metric):.4f})")

    md = _models_dir()
    md.mkdir(parents=True, exist_ok=True)
    (md / "best_models.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nWrote: {md / 'best_models.json'}")


if __name__ == "__main__":
    main()
