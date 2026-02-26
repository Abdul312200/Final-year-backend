from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import random
import os

app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def index():
    return jsonify({'status': 'ok', 'service': 'FinTechIQ ML Service', 'endpoints': ['/predict', '/health']})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    ticker = data.get('ticker', 'AAPL')
    try:
        df = yf.download(ticker, period='1mo', progress=False)
        last = float(df['Close'].dropna().values[-1])
    except Exception:
        last = 100.0
    factor = random.uniform(0.98, 1.05)
    pred = last * factor
    return jsonify({'ticker': ticker, 'predicted_price': round(pred,2)})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port)
