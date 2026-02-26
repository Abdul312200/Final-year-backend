"""
Train ML models for all stocks from the frontend
This script trains both LSTM and ANN models for all available stocks
"""

from model_toolbox import DEFAULT_TICKERS, normalize_symbol
from train_toolbox import TrainConfig, train_many

def main():
    print(f"Training models for {len(DEFAULT_TICKERS)} stocks...")
    print("Stocks:", DEFAULT_TICKERS)
    
    # Train both LSTM and ANN (LSTM usually performs better for time series)
    algorithms = ["lstm", "ann"]
    
    # Configuration for training
    config = TrainConfig(
        seq_len=60,          # Use 60 days of historical data
        epochs=50,           # More epochs for better accuracy
        batch_size=32,       # Standard batch size
        period="5y",         # 5 years of historical data
        arima_order=(5, 1, 0)  # ARIMA parameters (not used for LSTM/ANN)
    )
    
    print("\n" + "="*70)
    print(f"Training Configuration:")
    print(f"  - Algorithms: {', '.join(algorithms)}")
    print(f"  - Sequence Length: {config.seq_len} days")
    print(f"  - Epochs: {config.epochs}")
    print(f"  - Batch Size: {config.batch_size}")
    print(f"  - Historical Period: {config.period}")
    print("="*70 + "\n")
    
    # Train all models
    results = train_many(DEFAULT_TICKERS, algorithms, config)
    
    # Print summary
    print("\n" + "="*70)
    print("TRAINING RESULTS SUMMARY")
    print("="*70)
    
    success_count = 0
    failed_count = 0
    
    for symbol, per_algo in results.items():
        print(f"\n{symbol}:")
        for algo, status in per_algo.items():
            status_icon = "✓" if "saved" in status.lower() or "success" in status.lower() else "✗"
            print(f"  {status_icon} {algo.upper()}: {status}")
            if "saved" in status.lower() or "success" in status.lower():
                success_count += 1
            else:
                failed_count += 1
    
    print("\n" + "="*70)
    print(f"Total: {success_count} succeeded, {failed_count} failed")
    print("="*70)

if __name__ == "__main__":
    main()
