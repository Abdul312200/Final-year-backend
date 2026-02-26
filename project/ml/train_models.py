from __future__ import annotations

import argparse

from model_toolbox import DEFAULT_TICKERS, normalize_symbol
from train_toolbox import TrainConfig, train_many


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train stock models (LSTM / ANN / ARIMA) for multiple tickers")

    p.add_argument(
        "--tickers",
        type=str,
        default=",")

    p.add_argument(
        "--all-default",
        action="store_true",
        help="Train for the built-in DEFAULT_TICKERS list",
    )

    p.add_argument(
        "--algorithms",
        type=str,
        default="lstm",
        help="Comma-separated: lstm,ann,arima",
    )

    p.add_argument("--seq-len", type=int, default=60)
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--period", type=str, default="5y")
    p.add_argument("--arima-order", type=str, default="5,1,0")

    return p.parse_args()


def main() -> None:
    args = parse_args()

    algos = [a.strip().lower() for a in args.algorithms.split(",") if a.strip()]
    if not algos:
        raise SystemExit("No algorithms provided")

    if args.all_default:
        symbols = DEFAULT_TICKERS
    else:
        raw = [t.strip() for t in (args.tickers or "").split(",") if t.strip()]
        if not raw:
            raise SystemExit("Provide --tickers AAPL,TSLA or use --all-default")
        symbols = [normalize_symbol(t) for t in raw]

    order_parts = [int(x.strip()) for x in args.arima_order.split(",")]
    if len(order_parts) != 3:
        raise SystemExit("--arima-order must be like 5,1,0")

    cfg = TrainConfig(
        seq_len=args.seq_len,
        epochs=args.epochs,
        batch_size=args.batch_size,
        period=args.period,
        arima_order=(order_parts[0], order_parts[1], order_parts[2]),
    )

    results = train_many(symbols, algos, cfg)

    # Pretty print
    for s, per_algo in results.items():
        print(f"\n=== {s} ===")
        for algo, status in per_algo.items():
            print(f"  {algo}: {status}")


if __name__ == "__main__":
    main()
