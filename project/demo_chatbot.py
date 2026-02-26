"""
Enhanced Stock Chatbot - Example Usage
This script demonstrates all the features of the enhanced chatbot
"""

import requests
import json
import time

SERVER = "http://localhost:5000"
USER_ID = "demo_user"

def chat(message, lang="en"):
    """Send a message to the chatbot"""
    print(f"\n👤 User: {message}")
    response = requests.post(
        f"{SERVER}/api/chatbot",
        json={
            "message": message,
            "userId": USER_ID,
            "lang": lang
        }
    )
    data = response.json()
    print(f"🤖 Bot: {data['reply']}")
    if 'suggestion' in data:
        print(f"💡 Suggestion: {data['suggestion']}")
    time.sleep(1)
    return data

def demo_conversation():
    """Demonstrate a complete conversation flow"""
    
    print("=" * 70)
    print("  FINTECHIQ CHATBOT - STOCK FEATURES DEMO")
    print("=" * 70)
    
    # 1. Start with help
    print("\n📚 GETTING HELP")
    chat("help")
    
    # 2. Check available models
    print("\n📋 CHECKING AVAILABLE MODELS")
    chat("available models")
    
    # 3. Train a model
    print("\n🎓 TRAINING A MODEL")
    chat("quick train AAPL model")
    print("⏳ Waiting for training to complete...")
    time.sleep(10)
    
    # 4. Analyze a stock
    print("\n📊 ANALYZING A STOCK")
    chat("analyze AAPL")
    
    # 5. Make a prediction
    print("\n🔮 MAKING A PREDICTION")
    chat("predict AAPL")
    
    # 6. Compare stocks
    print("\n⚖️  COMPARING STOCKS")
    chat("compare AAPL vs TSLA vs MSFT")
    
    # 7. Get gold price
    print("\n💰 OTHER FEATURES - GOLD PRICE")
    chat("what is the gold price")
    
    # 8. Investment advice
    print("\n💡 INVESTMENT GUIDANCE")
    chat("how should I invest")
    
    # 9. Try Tamil language
    print("\n🌐 MULTILINGUAL SUPPORT (Tamil)")
    chat("help", lang="ta")
    
    print("\n" + "=" * 70)
    print("  ✅ DEMO COMPLETED SUCCESSFULLY!")
    print("=" * 70)
    print("\n💡 Try these commands yourself:")
    print("  • predict [STOCK]")
    print("  • analyze [STOCK]")
    print("  • train [STOCK] model")
    print("  • compare [STOCK1] vs [STOCK2]")
    print("  • available models")

def demo_api_calls():
    """Demonstrate direct API calls"""
    
    print("\n" + "=" * 70)
    print("  DIRECT API CALLS DEMO")
    print("=" * 70)
    
    ML_SERVICE = "http://localhost:8000"
    
    # Get stock analysis
    print("\n📊 Direct Stock Analysis:")
    response = requests.get(f"{ML_SERVICE}/analyze/TSLA")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    # Make prediction
    print("\n🔮 Direct Prediction:")
    response = requests.post(
        f"{ML_SERVICE}/predict",
        json={"ticker": "AAPL", "input_days": 60}
    )
    data = response.json()
    print(json.dumps(data, indent=2))
    
    # Get stock info
    print("\n📰 Stock Info:")
    response = requests.get(f"{ML_SERVICE}/info/GOOGL")
    data = response.json()
    print(f"Company: {data['company_name']}")
    print(f"Sector: {data['sector']}")
    print(f"Description: {data['description'][:200]}...")

if __name__ == "__main__":
    print("\n🎬 Starting Demo...\n")
    
    try:
        # Run the conversation demo
        demo_conversation()
        
        # Wait a bit
        time.sleep(2)
        
        # Run API demo
        demo_api_calls()
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Cannot connect to server!")
        print("Please ensure:")
        print("  1. ML Service is running on port 8000")
        print("  2. Node.js Server is running on port 5000")
        print("\nStart them with:")
        print("  cd project/ml && uvicorn app:app --port 8000")
        print("  cd project/server && node index.js")
    except KeyboardInterrupt:
        print("\n\n👋 Demo stopped by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
