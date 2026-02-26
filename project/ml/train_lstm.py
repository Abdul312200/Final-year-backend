import yfinance as yf
import numpy as np
import pandas as pd
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
import joblib
import os

def fetch_data(ticker='AAPL', period='3y'):
    data = yf.download(ticker, period=period, progress=False)
    df = data[['Close']].dropna()
    return df

def create_sequences(values, seq_len=60):
    X, y = [], []
    for i in range(seq_len, len(values)):
        X.append(values[i-seq_len:i])
        y.append(values[i])
    return np.array(X), np.array(y)

def train_and_save(ticker='AAPL', seq_len=60, epochs=3):
    df = fetch_data(ticker)
    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(df)
    
    X, y = create_sequences(scaled, seq_len)
    X = X.reshape((X.shape[0], X.shape[1], 1))

    if X.shape[0] < 10:
        print("Not enough data to train")
        return

    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(seq_len, 1)),
        Dropout(0.2),
        LSTM(32),
        Dropout(0.2),
        Dense(1)
    ])

    model.compile(optimizer='adam', loss='mse')
    model.fit(X, y, epochs=epochs, batch_size=32, verbose=1)

    os.makedirs('models', exist_ok=True)
    
    # SAVE IN NEW FORMAT
    model.save(f'models/{ticker}_lstm.keras')  
    joblib.dump(scaler, f'models/{ticker}_scaler.pkl')

    print("Saved model and scaler!")

if __name__ == '__main__':
    train_and_save('AAPL', seq_len=60, epochs=3)
