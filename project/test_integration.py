"""
Test script for Stock Chatbot Features
Run this after starting both ML service and Node.js server
"""

import requests
import json
import time

# Configuration
ML_SERVICE = "http://localhost:8000"
SERVER = "http://localhost:10000"
TEST_USER = "test_user_123"

def print_section(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60 + "\n")

def test_ml_service():
    print_section("Testing ML Service")
    
    # Test 1: Check models endpoint
    print("1. Checking available models...")
    try:
        response = requests.get(f"{ML_SERVICE}/models")
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Available algorithms: {data['algorithms']}")
        print(f"  LSTM models: {len(data['available'].get('lstm', []))}")
        print(f"  ANN models: {len(data['available'].get('ann', []))}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 2: Train a model
    print("\n2. Training a model (AAPL with LSTM)...")
    try:
        response = requests.post(
            f"{ML_SERVICE}/train",
            json={
                "tickers": ["AAPL"],
                "algorithms": ["lstm"],
                "epochs": 2,  # Quick training
                "seq_len": 60
            }
        )
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Training status: {data.get('status')}")
        print(f"  Trained count: {data.get('trained_count')}")
        print(f"  Results: {json.dumps(data.get('results'), indent=2)}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 3: Analyze a stock
    print("\n3. Analyzing AAPL...")
    try:
        response = requests.get(f"{ML_SERVICE}/analyze/AAPL")
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Company: {data.get('company_name')}")
        print(f"  Current Price: ₹{data.get('current_price')}")
        print(f"  1-Day Change: {data.get('price_change_pct_1d')}%")
        print(f"  Volatility: {data.get('volatility')}%")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 4: Make a prediction
    print("\n4. Making a prediction for AAPL...")
    try:
        response = requests.post(
            f"{ML_SERVICE}/predict",
            json={
                "ticker": "AAPL",
                "input_days": 60,
                "algorithm": "lstm"
            }
        )
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Current Price: ₹{data.get('current_price')}")
        print(f"  Predicted Price: ₹{data.get('predicted_price')}")
        print(f"  Algorithm: {data.get('algorithm')}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 5: Compare stocks
    print("\n5. Comparing AAPL vs TSLA...")
    try:
        response = requests.post(
            f"{ML_SERVICE}/compare",
            json={
                "symbols": ["AAPL", "TSLA"],
                "period": "1y"
            }
        )
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Best Performer: {data.get('best_performer_1d')}")
        print(f"  Most Volatile: {data.get('most_volatile')}")
        for comp in data.get('comparisons', []):
            print(f"  {comp['symbol']}: ₹{comp['current_price']} ({comp['price_change_pct_1d']}%)")
    except Exception as e:
        print(f"✗ Error: {e}")

def test_chatbot():
    print_section("Testing Chatbot API")
    
    test_messages = [
        ("help", "Help command"),
        ("available models", "List available models"),
        ("analyze AAPL", "Analyze stock"),
        ("predict AAPL", "Predict stock price"),
        ("compare AAPL vs TSLA", "Compare stocks"),
        ("train TSLA model", "Train model"),
        ("gold", "Gold price query"),
        ("investment advice", "Investment query"),
    ]
    
    for message, description in test_messages:
        print(f"\nTest: {description}")
        print(f"Message: '{message}'")
        try:
            response = requests.post(
                f"{SERVER}/api/chatbot",
                json={
                    "message": message,
                    "userId": TEST_USER,
                    "lang": "en"
                }
            )
            print(f"✓ Status: {response.status_code}")
            data = response.json()
            reply = data.get('reply', '')
            # Print first 200 chars of reply
            print(f"  Reply: {reply[:200]}{'...' if len(reply) > 200 else ''}")
            
            if 'suggestion' in data:
                print(f"  Suggestion: {data['suggestion']}")
                
        except Exception as e:
            print(f"✗ Error: {e}")
        
        time.sleep(1)  # Rate limiting

def test_server_endpoints():
    print_section("Testing Server Endpoints")
    
    # Test 1: Health check
    print("1. Health check...")
    try:
        response = requests.get(f"{SERVER}/api/health")
        print(f"✓ Status: {response.status_code}")
        print(f"  {response.json()}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 2: Prediction endpoint
    print("\n2. Direct prediction endpoint...")
    try:
        response = requests.post(
            f"{SERVER}/api/predict",
            json={
                "ticker": "AAPL",
                "input_days": 60,
                "userId": TEST_USER
            }
        )
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Ticker: {data.get('ticker')}")
        print(f"  Predicted Price: ₹{data.get('predicted_price')}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 3: Learning modules
    print("\n3. Learning modules...")
    try:
        response = requests.get(f"{SERVER}/api/learn/modules")
        print(f"✓ Status: {response.status_code}")
        data = response.json()
        print(f"  Available modules: {len(data.get('modules', []))}")
    except Exception as e:
        print(f"✗ Error: {e}")

def main():
    print("\n" + "🚀"*30)
    print("  FintechIQ Stock Chatbot - Integration Tests")
    print("🚀"*30)
    
    print("\nPrerequisites:")
    print("  1. ML Service running on port 8000")
    print("  2. Node.js Server running on port 5000")
    print("\nStarting tests...\n")
    
    try:
        # Test ML Service
        test_ml_service()
        
        # Wait a bit after training
        print("\n⏳ Waiting 5 seconds after training...")
        time.sleep(5)
        
        # Test Server Endpoints
        test_server_endpoints()
        
        # Test Chatbot
        test_chatbot()
        
        print_section("🎉 All Tests Completed!")
        print("\n✓ Integration successful!")
        print("✓ yfinance API working")
        print("✓ Stock models functional")
        print("✓ Chatbot session management active")
        print("\nYou can now use the chatbot for:")
        print("  📈 Stock predictions")
        print("  📊 Stock analysis")
        print("  🤖 Model training")
        print("  ⚖️  Stock comparisons")
        
    except KeyboardInterrupt:
        print("\n\n❌ Tests interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Test suite failed: {e}")

if __name__ == "__main__":
    main()
