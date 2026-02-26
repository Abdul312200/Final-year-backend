# Quick Start Guide - Stock Features Integration

## Prerequisites

Ensure you have:
- Python 3.8+
- Node.js 14+
- yfinance already in requirements.txt ✓

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd project/ml
pip install -r requirements.txt
```

The requirements.txt already includes:
- fastapi
- uvicorn
- yfinance
- tensorflow
- pandas
- numpy
- scikit-learn
- statsmodels
- joblib

### 2. Install Node.js Dependencies

```bash
cd project/server
npm install
```

Required packages:
- express
- cors
- axios
- sequelize
- sqlite3

### 3. Start the ML Service

```bash
cd project/ml
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

### 4. Start the Node.js Server

In a new terminal:
```bash
cd project/server
node index.js
```

Expected output:
```
DB connected & synced
Backend listening on http://localhost:5000
```

### 5. (Optional) Start Price API Service

If you need real-time price updates:
```bash
cd project/server
python price_api.py
```

## Testing the Chatbot

### Using cURL

#### 1. Test Help Command
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"help\", \"userId\": \"test_user\"}"
```

#### 2. Train a Model
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"train AAPL model\", \"userId\": \"test_user\"}"
```

#### 3. Analyze a Stock
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"analyze AAPL\", \"userId\": \"test_user\"}"
```

#### 4. Make a Prediction
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"predict AAPL\", \"userId\": \"test_user\"}"
```

#### 5. Compare Stocks
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"compare AAPL vs TSLA\", \"userId\": \"test_user\"}"
```

### Using Postman or Frontend

**Endpoint:** `POST http://localhost:5000/api/chatbot`

**Request Body:**
```json
{
  "message": "predict AAPL",
  "userId": "user123",
  "lang": "en"
}
```

**Response:**
```json
{
  "reply": "Stock Prediction for AAPL:\n📊 Current Price: ₹150.25\n🎯 Predicted Price: ₹152.30\n📈 Change: 1.36% increase\n🤖 Model: LSTM"
}
```

## Direct ML API Testing

### 1. Get Available Models
```bash
curl http://localhost:8000/models
```

### 2. Train Models Directly
```bash
curl -X POST http://localhost:8000/train \
  -H "Content-Type: application/json" \
  -d '{
    "tickers": ["AAPL", "TSLA"],
    "algorithms": ["lstm"],
    "epochs": 3
  }'
```

### 3. Predict Directly
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "input_days": 60,
    "algorithm": "lstm"
  }'
```

### 4. Analyze Stock
```bash
curl http://localhost:8000/analyze/AAPL
```

### 5. Compare Stocks
```bash
curl -X POST http://localhost:8000/compare \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "TSLA", "MSFT"],
    "period": "1y"
  }'
```

### 6. Get Stock Info
```bash
curl http://localhost:8000/info/AAPL
```

## Pre-Training Models (Recommended)

To enable immediate predictions, pre-train models for popular stocks:

```bash
cd project/ml

# Train individual stocks
python train_models.py --tickers AAPL,TSLA,MSFT,GOOGL --algorithms lstm

# Or train all default stocks (takes longer)
python train_models.py --all-default --algorithms lstm
```

This will create model files in `project/ml/models/`:
- `AAPL_lstm.keras`
- `AAPL_lstm_scaler.pkl`
- etc.

## Verifying Installation

### Check ML Service Health
```bash
curl http://localhost:8000/models
```

Should return:
```json
{
  "available": {
    "lstm": [...],
    "ann": [...],
    "arima": [...]
  },
  "best": {},
  "algorithms": ["lstm", "ann", "arima"],
  ...
}
```

### Check Server Health
```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{
  "status": "ok"
}
```

### Check Chatbot Response
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "help"}'
```

Should return a structured help message.

## Docker Setup (Alternative)

If using Docker:

```bash
cd project
docker-compose up --build
```

This will start:
- ML service on port 8000
- Node.js server on port 5000
- Database automatically configured

## Common Issues

### Issue: "Model not found"
**Solution:** Train the model first:
```bash
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "train AAPL model"}'
```

### Issue: "Connection refused to ML service"
**Solution:** Ensure ML service is running on port 8000

### Issue: "No data available for symbol"
**Solution:** 
- Check internet connection (yfinance needs internet)
- Verify stock symbol is correct
- Some stocks may not have data in yfinance

### Issue: "Training taking too long"
**Solution:** Use quick training mode:
```
"quick train AAPL"
```

## Performance Tips

1. **Pre-train popular stocks** during off-peak hours
2. **Use 'best' algorithm** in predictions to automatically pick the best model
3. **Cache analysis results** for frequently queried stocks
4. **Limit concurrent training** to avoid resource exhaustion
5. **Use quick training** for testing, standard for production

## Next Steps

1. ✅ Start both services (ML + Server)
2. ✅ Test with help command
3. ✅ Train models for your favorite stocks
4. ✅ Make predictions and analyze stocks
5. ✅ Compare stocks to find opportunities
6. ⏭️ Build frontend interface (if needed)
7. ⏭️ Set up automated retraining
8. ⏭️ Add monitoring and logging

## API Documentation

For full API documentation, visit:
- ML Service: `http://localhost:8000/docs` (FastAPI auto-generated docs)
- Chatbot Features: See `CHATBOT_STOCK_FEATURES.md`

## Example Workflow

```bash
# 1. Start services
cd project/ml && uvicorn app:app --port 8000 --reload &
cd project/server && node index.js &

# 2. Train some models
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "train AAPL TSLA MSFT models"}'

# 3. Wait for training to complete (1-3 minutes)

# 4. Make predictions
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "predict AAPL"}'

# 5. Compare stocks
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "compare AAPL vs TSLA vs MSFT"}'

# 6. Get detailed analysis
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "analyze AAPL"}'
```

## Support

For more detailed information:
- Chatbot Features: `CHATBOT_STOCK_FEATURES.md`
- Stock Setup: `STOCKS_SETUP.md`
- Model Training: Check `train_models.py --help`

---

*Happy Trading! 📈💰*
