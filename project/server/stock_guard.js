/**
 * Stock Guard — Enforces stock-only conversation policy
 * Blocks non-stock/financial questions and returns appropriate denial messages
 */

// ─── Allowed Topics ────────────────────────────────────────────────────────────
const STOCK_KEYWORDS = [
  // English
  'stock','stocks','share','shares','equity','market','nse','bse','nasdaq','nyse',
  'predict','prediction','forecast','price','rate','quote','trade','trading',
  'invest','investment','investor','portfolio','dividend','ipo','listing',
  'bull','bear','rally','crash','correction','volatility','volume',
  'analyze','analysis','compare','comparison','trend','chart','technical',
  'fundamental','pe ratio','eps','revenue','profit','earnings','quarter','annual',
  'buy','sell','hold','long','short','hedge','derivative','futures','options',
  'mutual fund','sip','etf','index','sensex','nifty','dow','s&p','nasdaq',
  'rupee','dollar','currency','forex','commodity','gold','silver','oil','crude',
  'aapl','tsla','msft','googl','amzn','meta','nvda','nflx','amd','intc',
  'reliance','tcs','infosys','hdfc','icici','bajaj','wipro','hcl','axis',
  'lstm','gru','arima','xgboost','prophet','model','train','training',
  // LLM provider/status terms (chatbot capability queries)
  'gemini','ollama','github models','github model','github','llm','ai model','model status','provider status','api model',
  'candle','candlestick','rsi','macd','bollinger','ema','sma','moving average',
  'support','resistance','breakout','pullback','momentum','swing',
  'sector','industry','cap','large cap','mid cap','small cap','market cap',
  // Tamil
  'பங்கு','விலை','முன்னறிவிப்பு','வாங்கு','விற்கு','சந்தை','முதலீடு','லாபம்',
  'நஷ்டம்','கணிப்பு','பகுப்பாய்வு','தங்கம்','வெள்ளி','ரூபாய்','ஏற்றம்','இறக்கம்',
  // Tanglish
  'panju','vilai','vilaiya','mudaleedu','lābam','nattam','sondai','munarruvip',
  'vaangalam','vidalama','buyma','sellma','price sollu','stock sollu',
  'epdi irukku','epdi iruku','epdi irruku','sollu','pathi','patri','vilarang',
  'ku epdi','la epdi','stock epdi','share epdi',
];

// Tamil/Tanglish greetings and general stock talk that should be allowed
// Note: \b does not work with Tamil Unicode — use includes() for Tamil words
const ALLOWED_GREETINGS_REGEX = [
  /\b(hi|hello|vanakkam|hey|helo|hai|good morning|good evening|good afternoon)\b/i,
  /\b(help|help pannu|yenna panlam|enna panlam|solluda|sollunga)\b/i,
  /\b(thanks|thank you|nandri|thx|ty)\b/i,
  /\b(bye|goodbye|poyittu varen|ok|okay)\b/i,
];

// Plain inclusion check for Tamil Unicode greetings (\b doesn't work on Unicode)
const ALLOWED_GREETINGS_TAMIL = [
  'வணக்கம்', 'நன்றி', 'சரி', 'போகிறேன்', 'உதவி', 'ஹலோ',
];

// ─── Blocked Topics ─────────────────────────────────────────────────────────────
const BLOCKED_TOPICS = [
  // General knowledge
  { pattern: /\b(recipe|food|cook|cooking|restaurant|chef)\b/i, topic: 'cooking' },
  { pattern: /\b(movie|film|actor|actress|cinema|series|netflix show|web series)\b/i, topic: 'entertainment' },
  { pattern: /\b(cricket|football|soccer|tennis|sport|ipl match|game score)\b/i, topic: 'sports' },
  { pattern: /\b(weather|temperature|rain|storm|forecast.*weather)\b/i, topic: 'weather' },
  { pattern: /\b(politics|politician|election|vote|party|minister|government policy)\b/i, topic: 'politics' },
  { pattern: /\b(medicine|doctor|hospital|disease|symptom|health|covid|cancer|treatment)\b/i, topic: 'health' },
  { pattern: /\b(love|relationship|girlfriend|boyfriend|marriage|family advice)\b/i, topic: 'personal' },
  { pattern: /\b(homework|assignment|essay|study|exam|school|college grade)\b/i, topic: 'education' },
  { pattern: /\b(joke|funny|meme|story|riddle)\b/i, topic: 'entertainment' },
  { pattern: /\b(translate|translation)\s+(?!stock|share|market)/i, topic: 'translation' },
  { pattern: /\b(write.*poem|poem|poetry|song|lyric)\b/i, topic: 'creative writing' },
  { pattern: /\b(travel|tourist|hotel|flight|visa|trip)\b/i, topic: 'travel' },
];

// ─── Denial Messages ────────────────────────────────────────────────────────────
const DENIAL_MESSAGES = {
  en: {
    default:
      "🚫 I'm a **Stock Market Assistant** and can only help with stock-related questions.\n\nI can help you with:\n📈 Stock predictions & forecasts\n📊 Stock analysis & charts\n💰 Live stock prices\n⚖ Stock comparisons\n🤖 ML model training\n💹 Market trends & indicators\n\nTry: *\"predict AAPL\"* or *\"analyze TCS.NS\"*",
    cooking:
      "🚫 I only answer stock market questions, not cooking queries! Try asking: *\"What is the price of AAPL?\"*",
    entertainment:
      "🚫 I'm a stock market bot, not an entertainment guide! Ask me about stocks instead.",
    sports:
      "🚫 I track stock performance, not sports scores! Try: *\"analyze AAPL\"*",
    weather:
      "🚫 I predict stock prices, not weather! Ask me: *\"predict TSLA\"*",
    politics:
      "🚫 I analyze stocks, not politics. Ask me about market impact of events instead.",
    health:
      "🚫 Please consult a doctor for health queries. I only handle stock market questions.",
    personal:
      "🚫 I'm a specialized stock assistant. Ask me about investing or stock analysis!",
  },
  ta: {
    default:
      "🚫 நான் ஒரு **பங்கு சந்தை உதவியாளர்**. பங்கு தொடர்பான கேள்விகளுக்கு மட்டுமே பதில் சொல்ல முடியும்.\n\nநான் உதவக்கூடியவை:\n📈 பங்கு முன்னறிவிப்பு\n📊 பங்கு பகுப்பாய்வு\n💰 தற்போதைய விலை\n⚖ பங்கு ஒப்பீடு\n🤖 ML மாடல் பயிற்சி\n\nமுயற்சி செய்யுங்கள்: *\"AAPL பங்கு விலை\"* அல்லது *\"TCS பகுப்பாய்வு\"*",
    cooking:
      "🚫 நான் சமையல் விஷயங்கள் பதில் சொல்ல மாட்டேன்! பங்கு கேள்விகளை கேளுங்கள்.",
    entertainment:
      "🚫 நான் பங்கு சந்தை போட். பங்கு தொடர்பான கேள்விகள் கேளுங்கள்!",
    sports:
      "🚫 விளையாட்டு முடிவுகள் இல்லை! பங்கு விலை கேளுங்கள். உதாரணம்: *\"AAPL பகுப்பாய்வு\"*",
    weather:
      "🚫 வானிலை கணிப்பு இல்லை! பங்கு கணிப்பு கேளுங்கள். உதாரணம்: *\"TSLA முன்னறிவிப்பு\"*",
    politics:
      "🚫 நான் சந்தை பகுப்பாய்வு செய்கிறேன், அரசியல் இல்லை.",
    health:
      "🚫 உடல்நலம் பற்றி மருத்துவரை அணுகவும். நான் பங்கு கேள்விகளுக்கு மட்டும் பதில் சொல்வேன்.",
    personal:
      "🚫 நான் பங்கு சந்தை உதவியாளர். முதலீடு அல்லது பங்கு பகுப்பாய்வு கேளுங்கள்!",
  },
};

/**
 * Check if a message is stock-related (allowed)
 * Returns: { allowed: boolean, topic: string|null, message: string|null }
 */
function checkStockGuard(text, lang = 'en') {
  if (!text || text.trim().length === 0) {
    return { allowed: false, topic: 'empty', message: getDenialMessage('default', lang) };
  }

  const lower = text.toLowerCase();

  // Always allow greetings & help (regex for ASCII, includes() for Tamil Unicode)
  for (const pattern of ALLOWED_GREETINGS_REGEX) {
    if (pattern.test(lower)) return { allowed: true };
  }
  for (const tamilWord of ALLOWED_GREETINGS_TAMIL) {
    if (text.includes(tamilWord)) return { allowed: true };
  }

  // Check for blocked topics first (with higher specificity)
  for (const { pattern, topic } of BLOCKED_TOPICS) {
    if (pattern.test(lower)) {
      // Even if blocked topic matched, check if stock keywords also present
      // (e.g., "cricket company stocks" should be allowed)
      const hasStockKeyword = STOCK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
      if (!hasStockKeyword) {
        return {
          allowed: false,
          topic,
          message: getDenialMessage(topic, lang),
        };
      }
    }
  }

  // Check if any stock keyword is present
  const hasStockKeyword = STOCK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  if (hasStockKeyword) {
    return { allowed: true };
  }

  // Short messages (single word greetings or symbols passed through)
  if (text.trim().split(/\s+/).length <= 2) {
    const possibleSymbol = text.trim().toUpperCase();
    if (/^[A-Z]{2,5}(\.NS)?$/.test(possibleSymbol)) {
      return { allowed: true }; // Likely a stock ticker
    }
  }

  // If nothing matched, deny with default message
  return {
    allowed: false,
    topic: 'off-topic',
    message: getDenialMessage('default', lang),
  };
}

function getDenialMessage(topic, lang) {
  const msgs = lang === 'ta' ? DENIAL_MESSAGES.ta : DENIAL_MESSAGES.en;
  return msgs[topic] || msgs['default'];
}

export { checkStockGuard, getDenialMessage };
