from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import numpy as np
from tensorflow.keras.models import load_model
import joblib

app = Flask(__name__)
CORS(app)

# Load global multi-stock model + stock-wise scalers
model = load_model("models/all_stocks_lstm.h5")
scalers = joblib.load("models/all_stock_scalers.pkl")

# Stock list
STOCKS = {
    "AAPL": "AAPL",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "TSLA": "TSLA",
    "TCS": "TCS.NS",
    "INFY": "INFY.NS",
    "HDFCBANK": "HDFCBANK.NS",
    "RELIANCE": "RELIANCE.NS",
    "SBIN": "SBIN.NS",
    "ICICIBANK": "ICICIBANK.NS"
}

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        ticker = data.get("ticker", "AAPL")
        seq_len = int(data.get("input_days", 60))

        if ticker not in STOCKS:
            return jsonify({"error": "Unknown stock"}), 400

        fixed_symbol = STOCKS[ticker]
        df = yf.download(fixed_symbol, period="3y")["Close"].dropna()

        if len(df) < seq_len:
            return jsonify({"error": "Not enough historical data"}), 400

        # Proper scaler for that stock
        scaler = scalers[ticker]

        last_values = df[-seq_len:].values.reshape(-1, 1)
        last_scaled = scaler.transform(last_values)

        X = np.array([last_scaled]).reshape(1, seq_len, 1)

        pred_scaled = model.predict(X)[0][0]
        predicted_price = scaler.inverse_transform([[pred_scaled]])[0][0]

        return jsonify({
            "ticker": ticker,
            "predicted_price": round(float(predicted_price), 2)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
