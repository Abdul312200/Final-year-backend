from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import yfinance as yf
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from model_toolbox import (
    DEFAULT_TICKERS,
    list_available_models,
    load_best_models,
    model_artifacts_exist,
    normalize_symbol,
    predict_next_close,
    fetch_close_series,
)

from train_toolbox import (
    TrainConfig,
    train_one,
    train_many,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

US_STOCKS = {
    "AAPL", "ADBE", "AMD", "AMZN", "GOOGL", "INTC", "JPM",
    "META", "MSFT", "NFLX", "NVDA", "TSLA", "V", "WMT",
    "BA", "BAC", "CRM", "CSCO", "DIS", "JNJ", "KO",
    "MA", "MCD", "NKE", "ORCL", "PEP", "PG", "PYPL",
}

# Full stock registry — single source of truth for both frontend and backend
STOCK_REGISTRY = {
    "us": [
        {"symbol": "AAPL",  "name": "Apple Inc."},
        {"symbol": "ADBE",  "name": "Adobe Inc."},
        {"symbol": "AMD",   "name": "Advanced Micro Devices"},
        {"symbol": "AMZN",  "name": "Amazon"},
        {"symbol": "BA",    "name": "Boeing"},
        {"symbol": "BAC",   "name": "Bank of America"},
        {"symbol": "CRM",   "name": "Salesforce"},
        {"symbol": "CSCO",  "name": "Cisco Systems"},
        {"symbol": "DIS",   "name": "Walt Disney"},
        {"symbol": "GOOGL", "name": "Alphabet (Google)"},
        {"symbol": "INTC",  "name": "Intel Corporation"},
        {"symbol": "JNJ",   "name": "Johnson & Johnson"},
        {"symbol": "JPM",   "name": "JPMorgan Chase"},
        {"symbol": "KO",    "name": "Coca-Cola"},
        {"symbol": "MA",    "name": "Mastercard"},
        {"symbol": "MCD",   "name": "McDonald's"},
        {"symbol": "META",  "name": "Meta Platforms"},
        {"symbol": "MSFT",  "name": "Microsoft"},
        {"symbol": "NFLX",  "name": "Netflix"},
        {"symbol": "NKE",   "name": "Nike"},
        {"symbol": "NVDA",  "name": "NVIDIA"},
        {"symbol": "ORCL",  "name": "Oracle"},
        {"symbol": "PEP",   "name": "PepsiCo"},
        {"symbol": "PG",    "name": "Procter & Gamble"},
        {"symbol": "PYPL",  "name": "PayPal"},
        {"symbol": "TSLA",  "name": "Tesla"},
        {"symbol": "V",     "name": "Visa"},
        {"symbol": "WMT",   "name": "Walmart"},
    ],
    "india": [
        {"symbol": "ADANIENT.NS",   "name": "Adani Enterprises"},
        {"symbol": "ADANIPORTS.NS", "name": "Adani Ports"},
        {"symbol": "ASIANPAINT.NS", "name": "Asian Paints"},
        {"symbol": "AXISBANK.NS",   "name": "Axis Bank"},
        {"symbol": "BAJAJ-AUTO.NS", "name": "Bajaj Auto"},
        {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance"},
        {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel"},
        {"symbol": "BPCL.NS",       "name": "BPCL"},
        {"symbol": "CIPLA.NS",      "name": "Cipla"},
        {"symbol": "DRREDDY.NS",    "name": "Dr. Reddy's"},
        {"symbol": "HCLTECH.NS",    "name": "HCL Technologies"},
        {"symbol": "HDFCBANK.NS",   "name": "HDFC Bank"},
        {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever"},
        {"symbol": "ICICIBANK.NS",  "name": "ICICI Bank"},
        {"symbol": "INDUSINDBK.NS", "name": "IndusInd Bank"},
        {"symbol": "INFY.NS",       "name": "Infosys"},
        {"symbol": "ITC.NS",        "name": "ITC Limited"},
        {"symbol": "KOTAKBANK.NS",  "name": "Kotak Mahindra Bank"},
        {"symbol": "LT.NS",         "name": "Larsen & Toubro"},
        {"symbol": "MARUTI.NS",     "name": "Maruti Suzuki"},
        {"symbol": "NESTLEIND.NS",  "name": "Nestle India"},
        {"symbol": "ONGC.NS",       "name": "ONGC"},
        {"symbol": "RELIANCE.NS",   "name": "Reliance Industries"},
        {"symbol": "SBIN.NS",       "name": "State Bank of India"},
        {"symbol": "SUNPHARMA.NS",  "name": "Sun Pharma"},
        {"symbol": "TCS.NS",        "name": "Tata Consultancy Services"},
        {"symbol": "TECHM.NS",      "name": "Tech Mahindra"},
        {"symbol": "TITAN.NS",      "name": "Titan Company"},
        {"symbol": "WIPRO.NS",      "name": "Wipro"},
    ],
}


def _safe_download_close(symbol: str, period: str) -> pd.Series:
    """
    Download Close prices and always return a flat 1-D Series,
    regardless of yfinance version (handles MultiIndex columns).
    """
    data = yf.download(symbol, period=period, progress=False, auto_adjust=True)
    if data.empty:
        raise ValueError(f"No data returned for {symbol}")
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)
    if "Close" not in data.columns:
        raise ValueError(f"No Close column for {symbol}")
    closes = data["Close"].dropna()
    if isinstance(closes, pd.DataFrame):
        closes = closes.iloc[:, 0]
    return closes


def fix_symbol(symbol: str) -> str:
    return normalize_symbol(symbol)


# -------------------- PREDICTION -----------------------
@app.post("/predict")
def predict(data: dict):
    ticker = data.get("ticker", "AAPL")
    days = int(data.get("input_days", 60))
    algorithm = (data.get("algorithm") or "lstm").lower()

    # Models are trained with 60-day sequences, ensure minimum
    if days < 60:
        days = 60

    try:
        result = predict_next_close(ticker=ticker, input_days=days, algorithm=algorithm)  # type: ignore[arg-type]
        return {
            "ticker": result.ticker,
            "fixed_symbol": result.fixed_symbol,
            "algorithm": result.algorithm,
            "current_price": result.current_price,
            "predicted_price": result.predicted_price,
            "input_days_used": days,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


# -------------------- HISTORY -----------------------
@app.get("/history/{symbol}")
def get_history(symbol: str):
    fixed_symbol = fix_symbol(symbol)

    closes = _safe_download_close(fixed_symbol, period="60d")
    close_values = np.asarray(closes).reshape(-1)

    return {
        "dates": [str(d.date()) for d in closes.index],
        "close": [float(v) for v in close_values]
    }


@app.get("/investment-advice/{symbol}")
def investment_advice_route(symbol: str):
    try:
        fixed_symbol = fix_symbol(symbol)

        closes = _safe_download_close(fixed_symbol, period="90d")

        if closes.empty or len(closes) < 20:
            return {"advice": "Not enough data to analyze"}

        # Convert to clean float list
        prices = [float(p) for p in np.asarray(closes).reshape(-1)]

        recent = float(prices[-1])
        old = float(prices[0])

        if old == 0:
            return {"advice": "Invalid price history"}

        # % Change
        change_pct = ((recent - old) / old) * 100

        # Safe volatility
        returns = closes.pct_change().dropna()
        volatility = float(np.std(np.asarray(returns).reshape(-1)) * 100)

        # RULES
        if change_pct > 5 and volatility < 3:
            advice = "Suitable for Long-Term Investment"
        elif change_pct > 2 or volatility < 5:
            advice = "Good for Short-Term Trading"
        else:
            advice = "Hold — Low momentum"

        return {
            "advice": advice,
            "change_pct": round(change_pct, 2),
            "volatility": round(volatility, 2)
        }

    except Exception as e:
        return {"advice": f"Error: {str(e)}"}


@app.get("/stocks")
def get_stocks():
    """Return full stock registry with US and Indian stocks"""
    all_symbols = (
        [s["symbol"] for s in STOCK_REGISTRY["us"]] +
        [s["symbol"] for s in STOCK_REGISTRY["india"]]
    )
    available = list_available_models()
    # Annotate each stock with trained model info
    def annotate(stock_list):
        result = []
        for s in stock_list:
            sym = s["symbol"]
            result.append({
                **s,
                "trained_algorithms": available.get(sym, []),
                "has_lstm": "lstm" in available.get(sym, []),
                "has_arima": "arima" in available.get(sym, []),
            })
        return result
    return {
        "us": annotate(STOCK_REGISTRY["us"]),
        "india": annotate(STOCK_REGISTRY["india"]),
        "total": len(all_symbols),
    }


@app.get("/tickers")
def get_tickers():
    return {"default": DEFAULT_TICKERS}


@app.get("/models")
def get_models():
    return {
        "available": list_available_models(),
        "best": load_best_models(),
        "algorithms": ["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet"],
        "algorithms_supported_in_predict": ["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet", "best"],
        "note": "Train models with: python train_models.py --all-default --algorithms lstm,gru,cnn_lstm,xgboost,prophet",
    }


# -------------------- TRAINING -----------------------
class TrainRequest(BaseModel):
    tickers: List[str]
    algorithms: List[str] = ["lstm"]
    seq_len: int = 60
    epochs: int = 5
    batch_size: int = 32
    period: str = "5y"


class BulkTrainRequest(BaseModel):
    market: str = "all"          # "us", "india", or "all"
    algorithms: List[str] = ["lstm", "arima"]
    seq_len: int = 60
    epochs: int = 10
    batch_size: int = 32
    period: str = "5y"
    skip_existing: bool = True   # skip if model already trained


@app.post("/train/all")
def train_all_stocks(req: BulkTrainRequest):
    """
    Train LSTM + ARIMA (or specified algorithms) for all registered stocks.
    Use skip_existing=true to resume interrupted training.
    """
    # Build symbol list based on market filter
    symbols = []
    if req.market in ("us", "all"):
        symbols += [s["symbol"] for s in STOCK_REGISTRY["us"]]
    if req.market in ("india", "all"):
        symbols += [s["symbol"] for s in STOCK_REGISTRY["india"]]

    valid_algos = ["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet"]
    algos = [a.lower() for a in req.algorithms if a.lower() in valid_algos]
    if not algos:
        raise HTTPException(status_code=400, detail="No valid algorithms specified")

    cfg = TrainConfig(
        seq_len=req.seq_len,
        epochs=req.epochs,
        batch_size=req.batch_size,
        period=req.period,
    )

    results: dict = {}
    skipped = []

    for symbol in symbols:
        norm = normalize_symbol(symbol)
        results[norm] = {}
        for algo in algos:
            # Skip if model already trained and skip_existing is True
            if req.skip_existing and model_artifacts_exist(norm, algo):
                results[norm][algo] = "skipped (already trained)"
                skipped.append(f"{norm}/{algo}")
                continue
            try:
                train_one(norm, algo, cfg)
                results[norm][algo] = "ok"
            except Exception as e:
                results[norm][algo] = f"error: {str(e)}"

    trained_count = sum(
        1 for r in results.values() for s in r.values() if s == "ok"
    )
    error_count = sum(
        1 for r in results.values() for s in r.values() if s.startswith("error")
    )

    return {
        "status": "completed",
        "total_stocks": len(symbols),
        "algorithms": algos,
        "trained": trained_count,
        "skipped": len(skipped),
        "errors": error_count,
        "results": results,
    }




@app.post("/train")
def train_models(req: TrainRequest):
    """Train models for specified tickers and algorithms"""
    try:
        # Normalize symbols
        symbols = [normalize_symbol(t) for t in req.tickers]
        
        # Validate algorithms
        valid_algos = ["lstm", "ann", "arima", "gru", "cnn_lstm", "xgboost", "prophet"]
        algos = [a.lower() for a in req.algorithms if a.lower() in valid_algos]
        
        if not algos:
            raise HTTPException(status_code=400, detail="No valid algorithms specified")
        
        # Create training config
        cfg = TrainConfig(
            seq_len=req.seq_len,
            epochs=req.epochs,
            batch_size=req.batch_size,
            period=req.period,
        )
        
        # Train models
        results = train_many(symbols, algos, cfg)
        
        return {
            "status": "completed",
            "results": results,
            "trained_count": sum(1 for ticker_results in results.values() 
                               for status in ticker_results.values() 
                               if status == "ok")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


# -------------------- STOCK ANALYSIS -----------------------
@app.get("/analyze/{symbol}")
def analyze_stock(symbol: str, period: str = "1y"):
    """Comprehensive stock analysis using yfinance"""
    try:
        fixed_symbol = normalize_symbol(symbol)
        stock = yf.Ticker(fixed_symbol)
        
        # Get historical data
        hist = stock.history(period=period)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail="No data available for this symbol")
        
        # Calculate metrics
        current_price = float(hist['Close'].iloc[-1])
        open_price = float(hist['Open'].iloc[-1])
        high_52w = float(hist['High'].max())
        low_52w = float(hist['Low'].min())
        avg_volume = float(hist['Volume'].mean())
        
        # Price changes
        price_change_1d = float(hist['Close'].iloc[-1] - hist['Close'].iloc[-2]) if len(hist) > 1 else 0
        price_change_pct_1d = (price_change_1d / hist['Close'].iloc[-2] * 100) if len(hist) > 1 else 0
        
        # Moving averages
        ma_20 = float(hist['Close'].tail(20).mean()) if len(hist) >= 20 else current_price
        ma_50 = float(hist['Close'].tail(50).mean()) if len(hist) >= 50 else current_price
        
        # Volatility
        returns = hist['Close'].pct_change().dropna()
        volatility = float(returns.std() * np.sqrt(252) * 100)  # Annualized
        
        # Try to get company info
        try:
            info = stock.info
            company_name = info.get('longName') or info.get('shortName') or symbol
            market_cap = info.get('marketCap', 0)
            pe_ratio = info.get('trailingPE', None)
            dividend_yield = info.get('dividendYield', None)
        except:
            company_name = symbol
            market_cap = 0
            pe_ratio = None
            dividend_yield = None
        
        return {
            "symbol": symbol,
            "fixed_symbol": fixed_symbol,
            "company_name": company_name,
            "current_price": round(current_price, 2),
            "open_price": round(open_price, 2),
            "price_change_1d": round(price_change_1d, 2),
            "price_change_pct_1d": round(price_change_pct_1d, 2),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "ma_20": round(ma_20, 2),
            "ma_50": round(ma_50, 2),
            "avg_volume": int(avg_volume),
            "volatility": round(volatility, 2),
            "market_cap": market_cap,
            "pe_ratio": pe_ratio,
            "dividend_yield": dividend_yield,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# -------------------- STOCK COMPARISON -----------------------
@app.post("/compare")
def compare_stocks(data: dict):
    """Compare multiple stocks"""
    try:
        symbols = data.get("symbols", [])
        period = data.get("period", "1y")
        
        if not symbols or len(symbols) < 2:
            raise HTTPException(status_code=400, detail="Provide at least 2 symbols to compare")
        
        comparisons = []
        
        for symbol in symbols:
            try:
                analysis = analyze_stock(symbol, period)
                comparisons.append(analysis)
            except:
                # Skip symbols that fail
                continue
        
        if len(comparisons) < 2:
            raise HTTPException(status_code=400, detail="Not enough valid symbols to compare")
        
        # Add relative performance
        best_performer = max(comparisons, key=lambda x: x['price_change_pct_1d'])
        most_volatile = max(comparisons, key=lambda x: x['volatility'])
        
        return {
            "comparisons": comparisons,
            "best_performer_1d": best_performer['symbol'],
            "most_volatile": most_volatile['symbol'],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison failed: {str(e)}")


# -------------------- STOCK NEWS & INFO -----------------------
@app.get("/info/{symbol}")
def get_stock_info(symbol: str):
    """Get detailed stock information and news"""
    try:
        fixed_symbol = normalize_symbol(symbol)
        stock = yf.Ticker(fixed_symbol)
        
        info = stock.info
        
        # Get recent news if available
        try:
            news = stock.news[:5] if hasattr(stock, 'news') and stock.news else []
            news_items = [{
                "title": item.get('title', ''),
                "publisher": item.get('publisher', ''),
                "link": item.get('link', ''),
            } for item in news]
        except:
            news_items = []
        
        return {
            "symbol": symbol,
            "fixed_symbol": fixed_symbol,
            "company_name": info.get('longName') or info.get('shortName', symbol),
            "sector": info.get('sector', 'N/A'),
            "industry": info.get('industry', 'N/A'),
            "website": info.get('website', ''),
            "description": info.get('longBusinessSummary', 'No description available'),
            "market_cap": info.get('marketCap', 0),
            "employees": info.get('fullTimeEmployees', 0),
            "news": news_items,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Info fetch failed: {str(e)}")

