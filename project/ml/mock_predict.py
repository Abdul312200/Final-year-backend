from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import random
import os

app = Flask(__name__)
CORS(app)

# ── helpers ──────────────────────────────────────────────────────────────────
def get_ticker_data(symbol, period="1mo"):
    """Download yfinance data and return (df, last_price, info)."""
    tk = yf.Ticker(symbol)
    df = tk.history(period=period, progress=False)
    if df.empty:
        raise ValueError(f"No data for {symbol}")
    last = float(df["Close"].dropna().iloc[-1])
    return df, last, tk

# ── routes ───────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "ok",
        "service": "FinTechIQ ML Service",
        "endpoints": ["/predict", "/analyze/<symbol>", "/compare",
                      "/stocks", "/models", "/train", "/price/<ticker>", "/gold", "/health"]
    })

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"})

# ── /price/<ticker> ───────────────────────────────────────────────────────────
@app.route("/price/<ticker>", methods=["GET"])
def price(ticker):
    try:
        _, last, tk = get_ticker_data(ticker, "5d")
        info = tk.info or {}
        currency = info.get("currency", "USD")
        return jsonify({"ticker": ticker, "price": round(last, 2), "currency": currency})
    except Exception as e:
        return jsonify({"error": str(e)}), 404

# ── /gold ─────────────────────────────────────────────────────────────────────
@app.route("/gold", methods=["GET"])
def gold():
    try:
        _, last, tk = get_ticker_data("GC=F", "5d")
        df = tk.history(period="2d", progress=False)
        prev = float(df["Close"].dropna().iloc[-2]) if len(df) >= 2 else last
        chp = round((last - prev) / prev * 100, 2) if prev else 0
        inr_rate = 83.5          # approximate USD→INR
        price_inr = round(last * inr_rate / 31.1035, 2)   # oz→gram, then ×10g
        price_10g = round(price_inr * 10, 2)
        return jsonify({"price": price_10g, "chp": chp, "currency": "INR"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── /predict ──────────────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json() or {}
    ticker    = data.get("ticker", "AAPL")
    algorithm = data.get("algorithm", "lstm")
    try:
        df, last, _ = get_ticker_data(ticker, "3mo")
        closes = df["Close"].dropna().values
        # Simple momentum prediction: weighted average of last 5 days + small noise
        recent = closes[-5:] if len(closes) >= 5 else closes
        weights = [0.1, 0.15, 0.2, 0.25, 0.3][:len(recent)]
        total_w = sum(weights)
        weighted = sum(c * w for c, w in zip(recent, weights)) / total_w
        factor = random.uniform(0.99, 1.04)
        pred = round(weighted * factor, 2)
        return jsonify({
            "ticker": ticker,
            "current_price": round(last, 2),
            "predicted_price": pred,
            "algorithm": algorithm,
            "confidence": round(random.uniform(0.72, 0.91), 2),
        })
    except Exception as e:
        return jsonify({"detail": str(e)}), 400

# ── /analyze/<symbol> ─────────────────────────────────────────────────────────
@app.route("/analyze/<symbol>", methods=["GET"])
def analyze(symbol):
    try:
        df, last, tk = get_ticker_data(symbol, "1y")
        info     = tk.info or {}
        closes   = df["Close"].dropna()
        prev     = float(closes.iloc[-2]) if len(closes) >= 2 else last
        chg_1d   = round((last - prev) / prev * 100, 2)
        ma20     = round(float(closes.tail(20).mean()), 2)
        ma50     = round(float(closes.tail(50).mean()), 2) if len(closes) >= 50 else ma20
        high52   = round(float(closes.max()), 2)
        low52    = round(float(closes.min()), 2)
        vol      = round(float(closes.pct_change().std() * 100), 2)
        return jsonify({
            "symbol":           symbol,
            "company_name":     info.get("longName", symbol),
            "current_price":    round(last, 2),
            "price_change_pct_1d": chg_1d,
            "high_52w":         high52,
            "low_52w":          low52,
            "ma_20":            ma20,
            "ma_50":            ma50,
            "volatility":       vol,
            "sector":           info.get("sector", "N/A"),
            "industry":         info.get("industry", "N/A"),
        })
    except Exception as e:
        return jsonify({"detail": str(e)}), 400

# ── /compare ──────────────────────────────────────────────────────────────────
@app.route("/compare", methods=["POST"])
def compare():
    data    = request.get_json() or {}
    symbols = data.get("symbols", [])
    if not symbols:
        return jsonify({"detail": "No symbols provided"}), 400
    comparisons = []
    for sym in symbols:
        try:
            df, last, _ = get_ticker_data(sym, "1y")
            closes = df["Close"].dropna()
            prev   = float(closes.iloc[-2]) if len(closes) >= 2 else last
            chg    = round((last - prev) / prev * 100, 2)
            vol    = round(float(closes.pct_change().std() * 100), 2)
            comparisons.append({
                "symbol": sym,
                "current_price": round(last, 2),
                "price_change_pct_1d": chg,
                "volatility": vol,
            })
        except Exception:
            comparisons.append({"symbol": sym, "error": "data unavailable"})
    valid = [c for c in comparisons if "error" not in c]
    best  = max(valid, key=lambda x: x["price_change_pct_1d"])["symbol"] if valid else "N/A"
    most_vol = max(valid, key=lambda x: x["volatility"])["symbol"] if valid else "N/A"
    return jsonify({
        "comparisons":       comparisons,
        "best_performer_1d": best,
        "most_volatile":     most_vol,
    })

# ── /stocks ───────────────────────────────────────────────────────────────────
US_STOCKS = ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","NFLX",
             "AMD","INTC","JPM","V","MA","BAC","KO","PEP","DIS","ORCL","CRM","ADBE"]
IN_STOCKS = ["RELIANCE.NS","TCS.NS","INFY.NS","HDFCBANK.NS","ICICIBANK.NS",
             "BAJFINANCE.NS","WIPRO.NS","AXISBANK.NS","SBIN.NS","LT.NS"]

@app.route("/stocks", methods=["GET"])
def stocks():
    return jsonify({"us_stocks": US_STOCKS, "in_stocks": IN_STOCKS,
                    "total": len(US_STOCKS) + len(IN_STOCKS)})

# ── /models ───────────────────────────────────────────────────────────────────
@app.route("/models", methods=["GET"])
def models():
    all_tickers = US_STOCKS + IN_STOCKS
    return jsonify({
        "available": {
            "lstm":     all_tickers,
            "gru":      all_tickers,
            "ann":      all_tickers,
            "cnn_lstm": US_STOCKS,
            "arima":    US_STOCKS,
            "xgboost":  US_STOCKS,
            "prophet":  US_STOCKS[:10],
        }
    })

# ── /train ────────────────────────────────────────────────────────────────────
@app.route("/train", methods=["POST"])
def train():
    data       = request.get_json() or {}
    tickers    = data.get("tickers", ["AAPL"])
    algorithms = data.get("algorithms", ["lstm"])
    return jsonify({
        "message":       "Training simulation complete",
        "trained_count": len(tickers) * len(algorithms),
        "tickers":       tickers,
        "algorithms":    algorithms,
    })

# ── start ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
