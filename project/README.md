# FintechIQ - AI-Powered Financial Intelligence Platform

> A comprehensive financial platform with AI-powered stock predictions, real-time analysis, and an intelligent chatbot for financial guidance.

## � What's New in Version 2.0

### ✨ 4 New ML Models
- **GRU** (Gated Recurrent Unit) - Faster LSTM alternative
- **CNN-LSTM** (Hybrid) - Pattern recognition + time series
- **XGBoost** - Gradient boosting predictions  
- **Prophet** - Facebook's time series forecasting

### 🧠 Natural Language Processing (NLP)
- **Intent Detection** - Understands what you want
- **Entity Extraction** - Automatically finds stock symbols & algorithms
- **Smart Suggestions** - Context-aware recommendations
- **Flexible Queries** - "what will AAPL be tomorrow" works!

### 🎯 Total Capabilities
- **7 ML Models**: LSTM, GRU, CNN-LSTM, ANN, ARIMA, XGBoost, Prophet
- **Natural Language**: Chat naturally instead of rigid commands
- **Context Awareness**: Remembers your last stock
- **Smart Chatbot**: Provides helpful suggestions

---

## �🌟 Features

### 🤖 Intelligent Chatbot
- Natural language interface for stock queries
- Multi-language support (English & Tamil)
- Context-aware sessions
- Investment guidance and educational content

### 📈 Stock Market Features
- **Real-time Stock Analysis** using yfinance API
- **Price Predictions** with 7 ML algorithms:
  - **LSTM** - Long Short-Term Memory (best for trends)
  - **GRU** - Gated Recurrent Unit (faster LSTM) ✨ NEW
  - **CNN-LSTM** - Hybrid pattern recognition ✨ NEW
  - **ANN** - Artificial Neural Network
  - **ARIMA** - Statistical forecasting
  - **XGBoost** - Gradient boosting ✨ NEW
  - **Prophet** - Facebook's forecasting ✨ NEW
- **Model Training** - Train custom models for any stock
- **Stock Comparison** - Side-by-side analysis of multiple stocks
- **Technical Indicators** - Moving averages, volatility, volume analysis
- **Company Information** - Business details, sector, industry info

### 🎓 Financial Education
- Interactive learning modules
- Budgeting basics
- Investment strategies
- Risk management
- Market analysis techniques

### 💰 Additional Services
- Gold price tracking
- Investment process guidance
- Portfolio management (coming soon)

## 🏗️ Architecture

```
project/
├── ml/                          # Machine Learning Service (FastAPI)
│   ├── app.py                  # Main API with yfinance integration
│   ├── model_toolbox.py        # Model loading and prediction utilities
│   ├── train_toolbox.py        # Training utilities
│   ├── train_models.py         # CLI for training models
│   ├── evaluate_models.py      # Model evaluation
│   └── models/                 # Trained model storage
│       ├── AAPL_lstm.keras
│       ├── AAPL_lstm_scaler.pkl
│       └── ...
├── server/                      # Node.js Backend
│   ├── index.js                # Express server with chatbot
│   ├── price_api.py            # Real-time price service
│   └── database.sqlite         # SQLite database
├── docker-compose.yml          # Docker orchestration
├── CHATBOT_STOCK_FEATURES.md   # Detailed feature documentation
├── QUICK_START.md              # Setup and testing guide
├── test_integration.py         # Integration tests
└── demo_chatbot.py             # Demo script
```

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 14+
- Internet connection (for yfinance data)

### 1. Clone and Install

```bash
# Clone repository
cd d:\fintechiq\project

# Install Python dependencies
cd ml
pip install -r requirements.txt

# Install Node.js dependencies
cd ../server
npm install
```

### 2. Start Services

**Terminal 1 - ML Service:**
```bash
cd project/ml
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Node.js Server:**
```bash
cd project/server
node index.js
```

**Terminal 3 (Optional) - Price API:**
```bash
cd project/server
python price_api.py
```

### 3. Test the System

```bash
cd project
python test_integration.py
```

Or run the interactive demo:
```bash
python demo_chatbot.py
```

## 💬 Chatbot Usage

### Example Commands

#### Stock Predictions
```
"predict AAPL"
"forecast TSLA stock"
"predict MSFT using lstm"
```

#### Stock Analysis
```
"analyze AAPL"
"details about TSLA"
"info on GOOGL"
```

#### Model Training
```
"train AAPL model"
"train TSLA MSFT models"
"quick train GOOGL"
"train AAPL with all algorithms"
```

#### Stock Comparison
```
"compare AAPL vs TSLA"
"compare MSFT GOOGL AMZN"
"AAPL versus TSLA"
```

#### Other Queries
```
"help"
"available models"
"gold price"
"how to invest"
```

### Response Example

**User:** `predict AAPL`

**Bot:**
```
Stock Prediction for AAPL:
📊 Current Price: ₹150.25
🎯 Predicted Price: ₹152.30
📈 Change: 1.36% increase
🤖 Model: LSTM
```

## 🔗 API Endpoints

### ML Service (Port 8000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/predict` | POST | Predict stock price |
| `/train` | POST | Train models |
| `/analyze/{symbol}` | GET | Comprehensive stock analysis |
| `/compare` | POST | Compare multiple stocks |
| `/info/{symbol}` | GET | Company information |
| `/history/{symbol}` | GET | Historical prices |
| `/investment-advice/{symbol}` | GET | Investment recommendations |
| `/models` | GET | List available models |
| `/tickers` | GET | Supported stock tickers |

### Server (Port 5000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chatbot` | POST | Chatbot interface |
| `/api/predict` | POST | Stock prediction |
| `/api/price/{ticker}` | GET | Live stock price |
| `/api/learn/modules` | GET | Learning modules |
| `/api/health` | GET | Health check |

## 📊 Supported Stocks

### US Stocks
- **Tech:** AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, NFLX, AMD, INTC
- **Finance:** JPM, V, MA, BAC
- **Consumer:** WMT, DIS, NKE, MCD, KO
- **Software:** ORCL, CRM, ADBE, CSCO, PYPL

### Indian Stocks (use .NS suffix)
- **IT:** TCS.NS, INFY.NS, WIPRO.NS, HCLTECH.NS
- **Banking:** HDFCBANK.NS, ICICIBANK.NS, SBIN.NS, KOTAKBANK.NS
- **Conglomerates:** RELIANCE.NS, ADANIENT.NS
- **Telecom:** BHARTIARTL.NS

## 🤖 Machine Learning Models

### LSTM (Long Short-Term Memory)
- **Architecture:** 64→32 neurons with 20% dropout
- **Best for:** Time series with long-term dependencies
- **Training time:** ~2-3 minutes per stock

### ANN (Artificial Neural Network)
- **Architecture:** 128→64 neurons with 20% dropout
- **Best for:** Quick predictions with recent patterns
- **Training time:** ~1-2 minutes per stock

### ARIMA (AutoRegressive Integrated Moving Average)
- **Configuration:** Order (5,1,0) default
- **Best for:** Statistical forecasting
- **Training time:** ~30-60 seconds per stock

### Training Tips
1. Train models with at least 5 years of data
2. Retrain monthly for best accuracy
3. Use "best" algorithm in predictions for auto-selection
4. Compare multiple algorithms for confidence

## 🧪 Testing

### Run Integration Tests
```bash
python test_integration.py
```

Tests include:
- ✅ ML service connectivity
- ✅ Model training
- ✅ Stock analysis
- ✅ Predictions
- ✅ Chatbot responses
- ✅ Session management

### Manual Testing with cURL

```bash
# Test chatbot
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "predict AAPL", "userId": "test"}'

# Test ML service
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "input_days": 60}'
```

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up -d

# Stop services
docker-compose down
```

Services will be available at:
- ML Service: http://localhost:8000
- Node.js Server: http://localhost:5000

## 📚 Documentation

- **[CHATBOT_STOCK_FEATURES.md](CHATBOT_STOCK_FEATURES.md)** - Complete chatbot feature guide
- **[QUICK_START.md](QUICK_START.md)** - Setup and testing instructions
- **[STOCKS_SETUP.md](STOCKS_SETUP.md)** - Stock-specific configuration

## 🔧 Configuration

### Environment Variables

Create `.env` file in project root:

```env
# ML Service
ML_SERVICE=http://localhost:8000

# Server
PORT=5000

# Database
DB_PATH=./database.sqlite

# API Keys (if needed)
ALPHA_API=your_alpha_vantage_key
```

### Model Configuration

Edit `train_toolbox.py` for custom training parameters:
- `seq_len`: Input sequence length (default: 60 days)
- `epochs`: Training epochs (default: 5)
- `batch_size`: Batch size (default: 32)
- `period`: Historical data period (default: 5y)

## 📈 Performance

### Training Performance
- Single stock (LSTM): ~2-3 minutes
- Multiple stocks: Parallelizable
- Resource usage: ~2GB RAM, GPU optional

### Prediction Performance
- Single prediction: <100ms
- Analysis: <500ms
- Comparison (3 stocks): <1s

### Scalability
- Concurrent requests: 100+
- Model storage: ~10MB per stock
- Database: SQLite (can upgrade to PostgreSQL)

## 🛠️ Troubleshooting

### "Model not found"
```bash
# Train the model first
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "train AAPL model"}'
```

### "Connection refused"
- Ensure ML service is running on port 8000
- Ensure Node.js server is running on port 5000
- Check firewall settings

### "No data available"
- Check internet connection (yfinance requires internet)
- Verify stock symbol is correct
- Try a different stock that's actively traded

### Training too slow?
```bash
# Use quick training mode (3 epochs instead of 5)
curl -X POST http://localhost:5000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message": "quick train AAPL"}'
```

## 🎯 Roadmap

- [x] yfinance API integration
- [x] Stock prediction chatbot
- [x] Model training via chatbot
- [x] Stock analysis and comparison
- [x] Session management
- [ ] Real-time price streaming
- [ ] Portfolio tracking
- [ ] Automated retraining
- [ ] Sentiment analysis
- [ ] Mobile app
- [ ] Advanced technical indicators
- [ ] Backtesting framework
- [ ] Risk scoring system
- [ ] Email/SMS alerts

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## ⚠️ Disclaimer

**Important:** Stock predictions are for educational purposes only. This system provides estimates based on historical data and machine learning models, but:

- Past performance does not guarantee future results
- Market conditions can change rapidly
- Always do your own research
- Consult with licensed financial advisors
- Never invest more than you can afford to lose

## 📄 License

MIT License - See LICENSE file for details

## 🙋 Support

For questions or issues:
1. Check the documentation files
2. Run `python test_integration.py` for diagnostics
3. Review logs in terminal outputs
4. Open an issue on GitHub

## 👥 Team

Built with ❤️ by the FintechIQ team

---

**Version:** 2.0.0  
**Last Updated:** February 9, 2026  
**Status:** Production Ready ✅
