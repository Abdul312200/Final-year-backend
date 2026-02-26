/**
 * NLP Processor for Enhanced Intent Recognition
 * Supports English, Tamil (Unicode + Tanglish code-mixed)
 * Uses natural language processing to understand user queries better
 */

import natural from 'natural';
import Sentiment from 'sentiment';

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const sentimentAnalyzer = new Sentiment();

// Intent patterns with synonyms and variations — English + Tamil + Tanglish
const INTENTS = {
  predict: {
    patterns: [
      /\b(predict|prediction|forecast|estimate|project|anticipate)\b/i,
      /\b(what will|what's going to|price tomorrow|next day|future price)\b/i,
      /\b(where .* (heading|going)|trend)\b/i,
      // Tamil (Unicode)
      /முன்னறிவிப்பு|கணிப்பு|எதிர்காலம்|போகும்/u,
      // Tanglish
      /\b(predict|forecast|future)\s+pannu/i,
      /\b(eppadi|yeppadi)\s+pogudu\b/i,
      /\b(enga|yenge)\s+pogudu\b/i,
      /\b(mundha|mele)\s+pogumo\b/i,
      /\b(sollu|solu)\b.*\b(future|forecast|predict)\b/i,
    ],
    keywords: ['predict', 'prediction', 'forecast', 'estimate', 'future', 'tomorrow', 'next',
               'முன்னறிவிப்பு', 'கணிப்பு', 'mundha', 'pogudu', 'mele pogumo']
  },
  
  analyze: {
    patterns: [
      /\b(analyz[e|is]|analysis|detail[s]?|info|information|about|tell me about)\b/i,
      /\b(how is|performance|metrics|statistics|stats)\b/i,
      /\b(current state|overview|summary)\b/i,
      // Tamil (Unicode)
      /பகுப்பாய்வு|விவரங்கள்|தகவல்|பற்றி/u,
      // Tanglish
      /\b(analyze|analysis)\s+pannu\b/i,
      /\b(pathi|patri)\s+sollu\b/i,
      /\bepdi\s+irukkd?\b/i,
      /\b(details|info|vilarang)\s+sollu\b/i,
    ],
    keywords: ['analyze', 'analysis', 'details', 'info', 'about', 'performance', 'stats',
               'பகுப்பாய்வு', 'விவரங்கள்', 'pathi sollu', 'epdi irukku']
  },
  
  train: {
    patterns: [
      /\b(train|training|create|build|generate) .* model/i,
      /\b(retrain|update model|new model)\b/i,
      // Tamil
      /பயிற்சி|மாடல்/u,
      // Tanglish
      /\b(train|training)\s+pannu\b/i,
      /\bmodel\s+(untara|undu|create)\b/i,
    ],
    keywords: ['train', 'training', 'create', 'model', 'build', 'retrain', 'பயிற்சி']
  },
  
  compare: {
    patterns: [
      /\b(compare|comparison|versus|vs\.?|compare to|difference between)\b/i,
      /\b(which is better|better than|outperform)\b/i,
      // Tamil
      /ஒப்பிடு|எது சிறந்தது|வித்தியாசம்/u,
      // Tanglish
      /\b(compare|comparison)\s+pannu\b/i,
      /\b(yedhu|edhu)\s+nalla\b/i,
      /\bvittiyasam\s+sollu\b/i,
    ],
    keywords: ['compare', 'comparison', 'versus', 'vs', 'better', 'difference',
               'ஒப்பிடு', 'vittiyasam', 'yedhu nalla']
  },
  
  price: {
    patterns: [
      /\b(price of|current price|stock price|trading at|quote)\b/i,
      /\b(how much|what's the price|price for)\b/i,
      // Tamil
      /விலை|தற்போதைய விலை|ரேட்|கோட்/u,
      // Tanglish
      /\b(vilaiya|rate|price)\s+sollu\b/i,
      /\benna\s+(vilaiya|rate|price)\b/i,
      /\byenna\s+(rate|vilaiya|worth)\b/i,
      /\b(ipo|rate)\s+yenna\b/i,
    ],
    keywords: ['price', 'current', 'quote', 'trading', 'worth',
               'விலை', 'vilaiya', 'rate sollu', 'enna vilaiya']
  },
  
  buy_sell: {
    patterns: [
      /\b(should i buy|should i sell|good time to buy|when to buy|when to sell)\b/i,
      /\b(buy or sell|hold or sell|invest in)\b/i,
      // Tamil
      /வாங்கலாமா|விற்கலாமா|முதலீடு செய்யலாமா/u,
      // Tanglish
      /\b(vangalama|vangalam|vanglama)\b/i,
      /\b(vidalama|sell\s+panlama)\b/i,
      /\b(buy\s+panlama|invest\s+panlama)\b/i,
      /\b(nalla\s+time|nalla\s+neram)\s+(buy|sell|vangu)\b/i,
    ],
    keywords: ['buy', 'sell', 'hold', 'invest', 'vangalam', 'vidalama', 'buy panlama',
               'வாங்கலாமா', 'விற்கலாமா']
  },

  faq: {
    patterns: [
      /\b(what is|explain|define|meaning of|how does|works)\b/i,
      /\b(rsi|macd|pe ratio|p\/e|bollinger|ema|sma|moving average)\b/i,
      /\b(sip|mutual fund|etf|ipo|dividend|market cap|bull|bear)\b/i,
      /\b(nse|bse|sensex|nifty|dow|s&p|nasdaq)\b/i,
      // Tamil
      /என்னவது|விளக்கவும்|அர்த்தம்/u,
      // Tanglish
      /\b(yenna|enna)\s+da\b/i,
      /\b(explain|define|yenna)\s+pannu\b/i,
      /\b(rsi|macd|pe|ema|sma|sip|etf|ipo)\s+(yenna|enna|pathi)\b/i,
    ],
    keywords: ['what is', 'explain', 'define', 'rsi', 'macd', 'sip', 'etf', 'ipo', 'bull', 'bear',
               'என்னவது', 'yenna da', 'enna pathi']
  },
  
  help: {
    patterns: [
      /\b(help|what can you do|capabilities|commands|how to|guide)\b/i,
      /\b(show me|list|available options)\b/i,
      // Tamil
      /உதவி|என்ன செய்யலாம்|வழிகாட்டு/u,
      // Tanglish
      /\b(help|utavi)\s+pannu\b/i,
      /\benna\s+panlam\b/i,
      /\bythu\s+panlam\b/i,
    ],
    keywords: ['help', 'commands', 'guide', 'how', 'what', 'உதவி', 'enna panlam']
  },

  invest: {
    patterns: [
      /\b(how\s+to\s+invest|start\s+investing|begin\s+invest|investment\s+tips|investment\s+guide)\b/i,
      /\b(invest\s+in\s+stocks?|stock\s+market\s+invest|share\s+market\s+invest)\b/i,
      /\b(mutual\s+fund|index\s+fund|etf|sip|lump\s+sum|portfolio)\b/i,
      /\b(beginner|newbie)\s+(invest|stock|trading)\b/i,
      // Tamil
      /முதலீடு\s+எப்படி|பங்கு\s+சந்தை\s+தொடங்க|சந்தையில்\s+எப்படி/u,
      // Tanglish — "epdi invest pannurathu / pannanum / pannalathu / pannarathu"
      /\b(epdi|yeppadi|eppadi|how)\s+invest\b/i,
      /\binvest\s+(epdi|yeppadi|pannurathu|pannanum|pannarathu|pannalathu|seivadhu)\b/i,
      /\bstock\s+(epdi|yeppadi)\s+(invest|vanga|vangura)\b/i,
      /\b(pannurathu|pannanum|pannarathu|pannalathu)\b.*\b(invest|stock|share|market)\b/i,
      /\b(invest|stock|share|market)\b.*\b(pannurathu|pannanum|pannarathu|pannalathu)\b/i,
      /\b(panam|pairam)\s+(epdi|yeppadi)\s+(invest|pottu|mukkolai)\b/i,
    ],
    keywords: ['invest', 'investment', 'sip', 'mutual fund', 'portfolio', 'etf', 'beginner',
               'pannurathu', 'pannanum', 'pannarathu', 'epdi invest', 'முதலீடு']
  },

  greeting: {
    patterns: [
      /^(hi|hello|hey|helo|hai|good morning|good afternoon|good evening)\b/i,
      /^(vanakkam|வணக்கம்)/ui,
      /^(hi\s+da|hello\s+da|hey\s+da)\b/i,
    ],
    keywords: ['hi', 'hello', 'hey', 'vanakkam', 'வணக்கம்']
  },
};

// Stock symbol extraction patterns
const STOCK_PATTERNS = [
  // Explicit patterns
  /\b([A-Z]{2,5})\.NS\b/g,  // Indian stocks with .NS
  /\b([A-Z]{2,5})\s+stock/gi,  // "AAPL stock"
  /\b(for|of|about)\s+([A-Z]{2,5})\b/gi,  // "for AAPL"
  /\bticker[:\s]+([A-Z]{2,5})\b/gi,  // "ticker: AAPL"
  // General uppercase sequences (cautious)
  /\b([A-Z]{3,5})\b/g  // 3-5 letter uppercase words
];

// Common words to exclude from stock extraction
const EXCLUDED_WORDS = new Set([
  'USD', 'INR', 'EUR', 'GBP', 'HELP', 'INFO', 'API', 'JSON', 
  'HTTP', 'LSTM', 'CNN', 'GRU', 'ANN', 'MODEL', 'TRAIN',
  'SHOW', 'LIST', 'GIVE', 'TELL', 'WHAT', 'WHICH', 'WHERE',
  'WHEN', 'WHY', 'HOW', 'PRICE', 'STOCK', 'MARKET', 'NSE', 'BSE',
  'SIP', 'ETF', 'IPO', 'MACD', 'RSI', 'EMA', 'SMA', 'NIFTY',
  'SENSEX', 'BUY', 'SELL', 'HOLD', 'SEBI', 'RBI', 'FII', 'DII',
  // Common Tanglish words that look like tickers when uppercased
  'NALLA', 'ROMBA', 'SOLLU', 'PATHI', 'EPDI', 'IRUKKU',
  'PANLAM', 'VANGA', 'VIDA', 'ENNA', 'YENNA', 'INNIKI',
  'THAAN', 'KONJAM', 'SEEKIRAM', 'ILLA', 'NANBANE',
  'THE', 'AND', 'FOR', 'WITH', 'THIS', 'THAT', 'FROM',
]);

// Tanglish → English stock intent keywords for normalization before symbol extraction
const TANGLISH_PREPROCESS = [
  [/\bpathi\s+sollu\b/gi, 'about'],
  [/\bvilaiya\s+sollu\b/gi, 'price'],
  [/\benna\s+vilaiya\b/gi, 'what price'],
  [/\bepdi\s+irukkd?\b/gi, 'how is'],
  [/\bvangalama\b/gi, 'should buy'],
  [/\bvidalama\b/gi, 'should sell'],
  // More specific Tanglish-to-English mappings (must come BEFORE generic sollu→tell)
  [/\bstock\s+(sollu|solren|sollunga)\b/gi, 'stock analysis'],
  [/\b(pathi|patri|pattri)\s+(sollu|solren)\b/gi, 'tell about'],
  [/\bvilaiya\s*(sollu|solren)?\b/gi, 'price'],
  [/\b(vilarang|vilara)\b/gi, 'price details'],
  [/\bsollu\b/gi, 'tell about'],
  [/\bpannu\b/gi, 'do'],
  [/\birukku\b/gi, 'is'],
  [/\bpoor?[ua]m?\b/gi, 'will'],
  [/\bnalla\b/gi, 'good'],
];

/**
 * Preprocess text: normalize Tanglish before NLP
 */
function preprocessText(text) {
  let processed = text;
  for (const [pattern, replacement] of TANGLISH_PREPROCESS) {
    processed = processed.replace(pattern, replacement);
  }
  return processed;
}

// Tamil stock company name → symbol map
const TAMIL_COMPANY_NAMES = {
  'ரிலையன்ஸ்': 'RELIANCE.NS',
  'டிசிஎஸ்': 'TCS.NS',
  'இன்போசிஸ்': 'INFY.NS',
  'ஆப்பிள்': 'AAPL',
  'டெஸ்லா': 'TSLA',
  'மைக்ரோசாஃப்ட்': 'MSFT',
  'அமேசான்': 'AMZN',
  'எச்டிஃப்சி': 'HDFCBANK.NS',
  'ஐசிஐசிஐ': 'ICICIBANK.NS',
  'விப்ரோ': 'WIPRO.NS',
  'ஹெச்சிஎல்': 'HCLTECH.NS',
  'அக்சிஸ்': 'AXISBANK.NS',
  'மாருதி': 'MARUTI.NS',
  'பஜாஜ்': 'BAJFINANCE.NS',
  'ஒஎன்ஜிசி': 'ONGC.NS',
  'சன்பார்மா': 'SUNPHARMA.NS',
};

// Tanglish company name → symbol map
const TANGLISH_COMPANY_NAMES = {
  'reliance': 'RELIANCE.NS',
  'tcs': 'TCS.NS',
  'infosys': 'INFY.NS',
  'apple': 'AAPL',
  'tesla': 'TSLA',
  'microsoft': 'MSFT',
  'amazon': 'AMZN',
  'hdfc': 'HDFCBANK.NS',
  'icici': 'ICICIBANK.NS',
  'wipro': 'WIPRO.NS',
  'hcl': 'HCLTECH.NS',
  'axis bank': 'AXISBANK.NS',
  'maruti': 'MARUTI.NS',
  'bajaj': 'BAJFINANCE.NS',
  'ongc': 'ONGC.NS',
  'sunpharma': 'SUNPHARMA.NS',
  'sun pharma': 'SUNPHARMA.NS',
  'google': 'GOOGL',
  'meta': 'META',
  'facebook': 'META',
  'nvidia': 'NVDA',
  'netflix': 'NFLX',
  'amd': 'AMD',
  'intel': 'INTC',
};

// Entity recognition for stock attributes
const STOCK_ATTRIBUTES = {
  algorithm: {
    patterns: [
      /\b(lstm|gru|cnn[-_]?lstm|ann|arima|xgboost|prophet)\b/gi,
      /\b(using|with|via)\s+(lstm|gru|cnn|ann|arima|xgboost|prophet)/gi
    ]
  },
  timeframe: {
    patterns: [
      /\b(today|tomorrow|next week|next month|short[-\s]?term|long[-\s]?term)\b/gi,
      /\b(\d+)\s*(day|week|month|year)s?\b/gi
    ]
  },
  action: {
    patterns: [
      /\b(buy|sell|hold|invest|trade)\b/gi
    ]
  }
};

/**
 * Extract stock symbols from text — supports English, Tamil, Tanglish
 */
function extractStockSymbols(text) {
  const symbols = new Set();
  
  // 1. Check Tamil company names (Unicode)
  for (const [tamilName, symbol] of Object.entries(TAMIL_COMPANY_NAMES)) {
    if (text.includes(tamilName)) {
      symbols.add(symbol);
    }
  }

  // 2. Check Tanglish company names (case-insensitive)
  const lowerText = text.toLowerCase();
  for (const [name, symbol] of Object.entries(TANGLISH_COMPANY_NAMES)) {
    if (lowerText.includes(name)) {
      symbols.add(symbol);
    }
  }

  // 3. Pattern-based extraction for ticker symbols
  for (const pattern of STOCK_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      let symbol = match[1] || match[2];
      if (symbol) {
        symbol = symbol.toUpperCase();
        if (EXCLUDED_WORDS.has(symbol)) continue;
        if (match[0].includes('.NS')) {
          symbol = symbol + '.NS';
        }
        symbols.add(symbol);
      }
    }
  }
  
  return Array.from(symbols);
}

/**
 * Detect intent from user message
 */
function detectIntent(text) {
  const scores = {};
  const lowerText = text.toLowerCase();
  
  // Score each intent
  for (const [intent, config] of Object.entries(INTENTS)) {
    let score = 0;
    
    // Pattern matching (higher weight)
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        score += 3;
      }
    }
    
    // Keyword matching
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) {
        score += 1;
      }
    }
    
    scores[intent] = score;
  }
  
  // Find highest scoring intent
  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);
  
  // Return intent if score > 0
  if (entries.length > 0 && entries[0][1] > 0) {
    return {
      intent: entries[0][0],
      confidence: entries[0][1],
      alternatives: entries.slice(1, 3).map(e => ({intent: e[0], confidence: e[1]}))
    };
  }
  
  return {
    intent: 'unknown',
    confidence: 0,
    alternatives: []
  };
}

/**
 * Extract entities from text (algorithm, timeframe, action)
 */
function extractEntities(text) {
  const entities = {};
  
  for (const [entityType, config] of Object.entries(STOCK_ATTRIBUTES)) {
    for (const pattern of config.patterns) {
      const match = text.match(pattern);
      if (match) {
        entities[entityType] = match[1] || match[0];
        break;
      }
    }
  }
  
  return entities;
}

/**
 * Parse comparative statements (e.g., "AAPL vs TSLA vs MSFT")
 */
function parseComparison(text) {
  // Look for comparison patterns
  const vsPattern = /([A-Z]{2,5}(?:\.NS)?)\s+(?:vs\.?|versus|and|,)\s+([A-Z]{2,5}(?:\.NS)?)/gi;
  const matches = Array.from(text.matchAll(vsPattern));
  
  if (matches.length > 0) {
    const symbols = new Set();
    matches.forEach(match => {
      symbols.add(match[1].toUpperCase());
      symbols.add(match[2].toUpperCase());
    });
    return Array.from(symbols);
  }
  
  return [];
}

/**
 * Detect sentiment — uses `sentiment` npm package + Tamil/Tanglish words
 */
function detectSentiment(text) {
  // Use sentiment library for English
  const result = sentimentAnalyzer.analyze(text);
  let score = result.score;

  // Augment with Tamil/Tanglish sentiment words
  const tamilPositive = ['நல்ல', 'சிறந்த', 'உயர்வு', 'லாபம்', 'nalla', 'romba nalla', 'superb', 'super', 'good da'];
  const tamilNegative = ['மோசமான', 'நஷ்டம்', 'விழுகிறது', 'கஷ்டம்', 'kashtam', 'mosam', 'bad da', 'down pochu'];
  
  const lower = text.toLowerCase();
  tamilPositive.forEach(w => { if (lower.includes(w)) score++; });
  tamilNegative.forEach(w => { if (lower.includes(w)) score--; });

  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

/**
 * Extract numerical values (prices, percentages, dates)
 */
function extractNumbers(text) {
  const numbers = {
    prices: [],
    percentages: [],
    counts: []
  };
  
  // Extract prices
  const pricePattern = /[$₹€£]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g;
  const priceMatches = text.matchAll(pricePattern);
  for (const match of priceMatches) {
    numbers.prices.push(parseFloat(match[1].replace(',', '')));
  }
  
  // Extract percentages
  const percentPattern = /(\d+(?:\.\d+)?)\s*%/g;
  const percentMatches = text.matchAll(percentPattern);
  for (const match of percentMatches) {
    numbers.percentages.push(parseFloat(match[1]));
  }
  
  // Extract general numbers
  const countPattern = /\b(\d+)\b/g;
  const countMatches = text.matchAll(countPattern);
  for (const match of countMatches) {
    numbers.counts.push(parseInt(match[1]));
  }
  
  return numbers;
}

/**
 * Main NLP processing function — supports English, Tamil, Tanglish
 */
function processMessage(message) {
  const text = message.trim();
  
  // Preprocess Tanglish → normalize to English-friendly form for intent detection
  const preprocessed = preprocessText(text);
  
  // Detect intent on normalized text
  const intentResult = detectIntent(preprocessed);
  
  // Extract stock symbols (handles Tamil/Tanglish names too)
  let symbols = extractStockSymbols(text);
  
  // Special handling for comparisons
  if (intentResult.intent === 'compare') {
    const compSymbols = parseComparison(text);
    if (compSymbols.length > 0) {
      symbols = compSymbols;
    }
  }
  
  // Extract entities
  const entities = extractEntities(preprocessed);
  
  // Detect sentiment (enhanced with Tamil/Tanglish)
  const sentiment = detectSentiment(text);
  
  // Extract numbers
  const numbers = extractNumbers(text);

  // Tokenize for additional analysis
  const tokens = tokenizer.tokenize(preprocessed.toLowerCase()) || [];
  const stems = tokens.map(t => { try { return stemmer.stem(t); } catch { return t; } });
  
  // Build context
  const context = {
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    alternatives: intentResult.alternatives,
    symbols: symbols,
    entities: entities,
    sentiment: sentiment,
    numbers: numbers,
    tokens: tokens.slice(0, 20),  // First 20 tokens
    stems: stems.slice(0, 20),
    originalMessage: text,
    preprocessedMessage: preprocessed,
  };
  
  return context;
}

/**
 * Generate smart suggestions based on context (multilingual)
 */
function generateSuggestions(context, lang = 'en') {
  const suggestions = [];
  const isTamil = lang === 'ta' || lang === 'ta-en';
  
  // Suggest based on intent
  if (context.intent === 'predict' && context.symbols.length > 0) {
    suggestions.push(isTamil
      ? `${context.symbols[0]} ஐ பகுப்பாய்வு செய்ய விரும்புகிறீர்களா?`
      : `Would you also like to analyze ${context.symbols[0]}?`);
    suggestions.push(isTamil
      ? `பல பங்குகளை ஒப்பிட முயற்சிக்கவும்`
      : `Try comparing multiple stocks`);
  }
  
  if (context.intent === 'analyze' && context.symbols.length > 0) {
    suggestions.push(isTamil
      ? `${context.symbols[0]} இன் எதிர்கால விலை கணிக்க விரும்புகிறீர்களா?`
      : `Want to predict future price for ${context.symbols[0]}?`);
  }

  if (context.intent === 'buy_sell' && context.symbols.length > 0) {
    suggestions.push(isTamil
      ? `${context.symbols[0]} பகுப்பாய்வை பார்க்கவும்: "analyze ${context.symbols[0]}"`
      : `Check analysis before deciding: "analyze ${context.symbols[0]}"`);
  }
  
  if (context.intent === 'unknown') {
    suggestions.push(isTamil
      ? 'முயற்சிக்கவும்: "AAPL முன்னறிவிப்பு" or "TCS பகுப்பாய்வு"'
      : 'Try: "predict AAPL" or "analyze TSLA"');
    suggestions.push(isTamil
      ? '"உதவி" என தட்டச்சு செய்யவும்'
      : 'Type "help" to see all commands');
  }
  
  // No symbols detected but intent is clear
  if (['predict', 'analyze', 'price', 'buy_sell'].includes(context.intent) && context.symbols.length === 0) {
    suggestions.push(isTamil
      ? 'பங்கு சின்னம் குறிப்பிடவும் (எ.கா. AAPL, TSLA, TCS.NS)'
      : 'Please specify a stock symbol (e.g., AAPL, TSLA, TCS.NS)');
  }
  
  return suggestions;
}

// Export functions
export {
  processMessage,
  extractStockSymbols,
  detectIntent,
  extractEntities,
  parseComparison,
  detectSentiment,
  extractNumbers,
  generateSuggestions,
  preprocessText,
  TAMIL_COMPANY_NAMES,
  TANGLISH_COMPANY_NAMES,
};
