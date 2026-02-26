from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import random

app = Flask(__name__)
CORS(app)

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
    app.run(host='0.0.0.0', port=8000)
