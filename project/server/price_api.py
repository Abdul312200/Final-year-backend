from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import uvicorn

app = FastAPI(title="FinTechIQ Price API")

# -----------------------------
# ENABLE CORS
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# LIVE STOCK PRICE API
# -----------------------------
@app.get("/price/{symbol}")
def get_price(symbol: str):
    try:
        symbol = symbol.upper()

        # US stock symbols (comprehensive list)
        us_stocks = {
            "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX",
            "AMD", "INTC", "ORCL", "CRM", "ADBE", "CSCO", "PYPL",
            "JPM", "V", "MA", "BAC", "WMT", "DIS", "NKE", "MCD", "KO", "PEP",
            "BA", "JNJ", "PG", "XOM"
        }

        # Add .NS for Indian stocks
        if "." not in symbol and symbol not in us_stocks:
            symbol = symbol + ".NS"

        stock = yf.Ticker(symbol)
        data = stock.history(period="1d")

        if data.empty:
            return {
                "error": "Invalid ticker or market closed",
                "symbol": symbol
            }

        price = round(float(data["Close"].iloc[-1]), 2)

        return {
            "symbol": symbol,
            "price": price,
            "currency": "INR" if symbol.endswith(".NS") else "USD"
        }

    except Exception as e:
        return {
            "error": "Failed to fetch price",
            "details": str(e)
        }

# -----------------------------
# LIVE GOLD PRICE API (XAU → INR per 10g)
# -----------------------------
@app.get("/gold")
def get_gold_price():
    try:
        import concurrent.futures

        def fetch_gold_usd():
            t = yf.Ticker("GC=F")
            d = t.history(period="1d")
            if d.empty:
                raise ValueError("No gold data")
            return float(d["Close"].iloc[-1])

        def fetch_usd_inr():
            t = yf.Ticker("USDINR=X")
            d = t.history(period="1d")
            if d.empty:
                return 83.5  # fallback rate
            return float(d["Close"].iloc[-1])

        with concurrent.futures.ThreadPoolExecutor() as ex:
            f_gold = ex.submit(fetch_gold_usd)
            f_fx   = ex.submit(fetch_usd_inr)
            gold_usd = f_gold.result(timeout=10)
            usd_inr  = f_fx.result(timeout=10)

        TROY_OZ_TO_GRAMS = 31.1035
        price_inr_per_10g = round((gold_usd * usd_inr / TROY_OZ_TO_GRAMS) * 10)

        # Simple percentage change placeholder (goldapi chp equivalent)
        gold_hist = yf.Ticker("GC=F").history(period="5d")
        chp = None
        if len(gold_hist) >= 2:
            prev = float(gold_hist["Close"].iloc[-2])
            curr = float(gold_hist["Close"].iloc[-1])
            chp = round((curr - prev) / prev * 100, 2)

        return {
            "price": price_inr_per_10g,
            "chp": chp,
            "gold_usd": round(gold_usd, 2),
            "usd_inr": round(usd_inr, 2),
            "unit": "INR/10g"
        }

    except Exception as e:
        return {"error": "Failed to fetch gold price", "details": str(e)}


# -----------------------------
# START SERVER
# -----------------------------
if __name__ == "__main__":
    print("✔ Price API running at http://127.0.0.1:5001")
    uvicorn.run(app, host="127.0.0.1", port=5001)
