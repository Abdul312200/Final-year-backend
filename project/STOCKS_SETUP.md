# Stock Prediction System - Complete Setup

## 📊 Supported Stocks

### US Stocks (29 stocks)
**Tech Giants:**
- AAPL (Apple), MSFT (Microsoft), GOOGL (Alphabet/Google), AMZN (Amazon)
- META (Meta/Facebook), NVDA (NVIDIA), TSLA (Tesla), NFLX (Netflix)
- AMD, INTC (Intel), ORCL (Oracle), CRM (Salesforce), ADBE (Adobe)
- CSCO (Cisco), PYPL (PayPal)

**Finance & Consumer:**
- JPM (JPMorgan), V (Visa), MA (Mastercard), BAC (Bank of America)
- WMT (Walmart), DIS (Disney), NKE (Nike), MCD (McDonald's)
- KO (Coca-Cola), PEP (PepsiCo), BA (Boeing), JNJ (Johnson & Johnson)
- PG (Procter & Gamble), XOM (Exxon Mobil)

### Indian Stocks (32 stocks)
**IT & Services:**
- TCS (Tata Consultancy Services), INFY (Infosys), WIPRO, HCLTECH, TECHM

**Banking & Finance:**
- HDFCBANK, ICICIBANK, SBIN (State Bank), KOTAKBANK, AXISBANK
- BAJFINANCE, INDUSINDBK

**Conglomerates & Energy:**
- RELIANCE, ADANIENT, ADANIPORTS, ONGC, BPCL

**Auto & Manufacturing:**
- TATAMOTORS, MARUTI, M&M (Mahindra), BAJAJ-AUTO, LT (Larsen & Toubro)

**Consumer & Pharma:**
- ITC, HINDUNILVR, ASIANPAINT, SUNPHARMA, DRREDDY, CIPLA

**Telecom & Others:**
- BHARTIARTL, TITAN, NESTLEIND, ULTRACEMCO

## 🚀 Running the Servers

### 1. ML Server (FastAPI - Port 8000)
```bash
cd project/ml
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 2. Node Server (Express - Port 5000)
```bash
cd project/server
npm start
```

### 3. Price API Server (FastAPI - Port 5001)
```bash
cd project/server
python price_api.py
```

## 🎯 Training Models

### Train All Stocks (Recommended)
```bash
cd project/ml
python train_all_stocks.py
```

This will:
- Train LSTM and ANN models for all 61 stocks
- Use 5 years of historical data
- Run 50 epochs for better accuracy
- Save models to `models/` directory

### Train Specific Stocks
```bash
python train_models.py --tickers AAPL,TSLA,HDFCBANK --algorithms lstm,ann
```

### Train with Custom Parameters
```bash
python train_models.py --all-default --algorithms lstm --epochs 100 --period 10y
```

## 📡 API Endpoints

### ML Server (Port 8000)

#### 1. Get Prediction
```http
POST /predict
Content-Type: application/json

{
  "ticker": "AAPL",
  "input_days": 60,
  "algorithm": "lstm"
}
```

#### 2. Get Price History
```http
GET /history/AAPL
```

#### 3. Get Investment Advice
```http
GET /investment-advice/AAPL
```

#### 4. List Available Models
```http
GET /models
```

### Node Server (Port 5000)

#### 1. Get Live Price
```http
GET /api/price/AAPL
```

#### 2. Get Prediction (via ML service)
```http
POST /api/predict
Content-Type: application/json

{
  "ticker": "HDFCBANK",
  "input_days": 60
}
```

## 🔧 Symbol Normalization

The system automatically handles Indian stock symbols:
- Frontend uses: `HDFCBANK`
- Backend converts to: `HDFCBANK.NS`
- US stocks remain unchanged: `AAPL` → `AAPL`

## 📈 Model Performance

**Algorithms Supported:**
1. **LSTM** (Long Short-Term Memory) - Best for time series, captures long-term patterns
2. **ANN** (Artificial Neural Network) - Fast, good for short-term predictions
3. **ARIMA** (Auto-Regressive Integrated Moving Average) - Statistical approach

**Training Configuration:**
- Sequence Length: 60 days
- Epochs: 50
- Batch Size: 32
- Historical Data: 5 years
- Train/Test Split: 80/20

## 🎨 Frontend Integration

The React frontend at [StockPrediction.jsx] includes:
- Dropdown with all 75+ stocks (US + Indian)
- Real-time price fetching
- ML-based price prediction
- 60-day price trend chart
- Investment suitability analysis

## ✅ Verification

After training completes, verify models exist:
```bash
cd project/ml/models
ls -la *.keras
```

You should see files like:
- `AAPL_lstm.keras`, `AAPL_ann.keras`
- `HDFCBANK_NS_lstm.keras`, `HDFCBANK_NS_ann.keras`
- etc.

## 🐛 Troubleshooting

### Issue: "Model not found"
**Solution:** Run training for that specific stock:
```bash
python train_models.py --tickers SYMBOL --algorithms lstm,ann
```

### Issue: "Price not available"
**Solution:** Check if:
1. Price API server is running (port 5001)
2. Symbol is correct (Indian stocks need .NS)
3. Market is open or use cached data

### Issue: "Training fails for some stocks"
**Solution:** Some stocks may not have 5 years of data. Use shorter period:
```bash
python train_models.py --tickers SYMBOL --period 2y
```

## 📝 Notes

- Training 61 stocks takes approximately 15-30 minutes
- Models are automatically saved and can be reused
- Best models are tracked in `models/best_models.json`
- Indian market data comes from NSE (National Stock Exchange)
- US market data comes from NYSE/NASDAQ via yfinance
