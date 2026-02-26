/**
 * Language Detector Service
 * Detects Tamil, English, and Tanglish (code-mixed Tamil-English)
 * Uses franc for ISO language detection + custom heuristics
 */

import { franc } from 'franc';

// Tamil Unicode range: U+0B80–U+0BFF
const TAMIL_UNICODE_REGEX = /[\u0B80-\u0BFF]/;

// Tanglish (Tamil words written in English) patterns
const TANGLISH_PATTERNS = [
  // Common Tamil words in English script
  /\b(sollu|solla|solren|solunga|solungal)\b/i,
  /\b(yenna|enna|en|yen)\b/i,
  /\b(epdi|yeppadi|eppadi|yepdi)\b/i,
  /\b(irukku|iruku|irukkanga|irukka)\b/i,
  /\b(pathi|patri|pattri)\b/i,
  /\b(nalla|nala|nanba|nanbane)\b/i,
  /\b(paaru|paaro|paaren|paarvai)\b/i,
  /\b(vaanga|vaanga|vaa|va)\b/i,
  /\b(illa|illai|ille)\b/i,
  /\b(saari|sari|parvailla|parvaila)\b/i,
  /\b(ungaluku|ungalukku|unakku|unaku)\b/i,
  /\b(enna|yenna)\s+(vilaiya|price|rate)/i,
  /\b(inniki|innaiku|indha|inda)\b/i,
  /\b(thaan|than|dhaan|dhan)\b/i,
  /\b(konjam|konja|kொஞ்சம்)\b/i,
  /\b(varthai|varathu|varuthe)\b/i,
  /\b(mudiyuma|mudiyuma|mudium)\b/i,
  /\b(theriyuma|theriyuma|theriyum)\b/i,
  /\b(seekiram|sigaram|vegam)\b/i,
  /\b(romba|romba|ромба)\b/i,
  /\b(nallathu|nandri|thanks da|thanks di)\b/i,
  /\b(da|di|nga|pa|ma|dei|aiyya)\b/i,   // Tamil colloquial suffixes
  /\b(stock|share)\s+(pathi|vilaiya|sollu|epdi)\b/i,
  /\b(vangalam|vangalama|vidalama|vidal)\b/i,
  /\b(aprom|apparam|apprum|aprum)\b/i,
  // Investment / action Tanglish verbs
  /\b(pannurathu|pannanum|pannarathu|pannalathu|panren|panrom)\b/i,
  /\b(seivadhu|seiyalam|seiyalama|seiven)\b/i,
  /\b(thodanga|thodangalam|aarambikka|aarambikkalam)\b/i,
];

// Tamil terms related to stocks/finance
const TAMIL_STOCK_TERMS = {
  "பங்கு": "stock",
  "பங்குகள்": "stocks",
  "விலை": "price",
  "முன்னறிவிப்பு": "prediction",
  "வாங்கு": "buy",
  "விற்கு": "sell",
  "கணிப்பு": "forecast",
  "பகுப்பாய்வு": "analyze",
  "முதலீடு": "invest",
  "சந்தை": "market",
  "நிறுவனம்": "company",
  "தற்போதைய": "current",
  "லாபம்": "profit",
  "நஷ்டம்": "loss",
  "ஏற்றம்": "rise",
  "இறக்கம்": "fall",
  "உயர்வு": "high",
  "குறைவு": "low",
  "வட்டி": "interest",
  "பண்டம்": "commodity",
  "தங்கம்": "gold",
  "வெள்ளி": "silver",
  "ரூபாய்": "rupee",
  "டாலர்": "dollar",
  "ஒப்பிடு": "compare",
  "உதவி": "help",
  "காட்டு": "show",
  "தகவல்": "info",
};

// Tanglish-to-English intent mapping
const TANGLISH_INTENT_MAP = {
  // Price queries
  "price sollu": "tell price",
  "vilaiya sollu": "tell price",
  "yenna vilaiya irukku": "what is the price",
  "enna rate": "what rate",
  "epdi irukku": "how is it",
  "yeppadi irukku": "how is it",
  
  // Prediction queries
  "eppadi pogudu": "where will it go",
  "mundha pogumo": "will it go up",
  "keezhay pogumo": "will it go down",
  "predict sollu": "tell prediction",
  "future sollu": "tell future",
  
  // Analysis
  "pathi sollu": "tell about",
  "analyze pannu": "do analyze",
  "details sollu": "tell details",
  "info sollu": "tell info",
  
  // Buy/Sell
  "vangalam": "should buy",
  "vangalama": "should I buy",
  "vidalama": "should I sell",
  "buy panlama": "should I buy",
  "sell panlama": "should I sell",
  
  // Help
  "enna panlam": "what can do",
  "solluda": "tell me",
  "sollunga": "please tell",
  "help sollu": "tell help",

  // Commodities
  "thangam vilaiya sollu": "tell gold price",
  "thangam vilai": "gold price",
  "thangam epdi irukku": "how is gold",
  "velli vilai": "silver price",
  "vilarang sollu": "tell price details",
  "vilarang": "price details",
};

/**
 * Detect the language of a message
 * Returns: 'ta' (Tamil), 'ta-en' (Tanglish), 'en' (English)
 */
function detectLanguage(text) {
  if (!text || text.trim().length === 0) return 'en';

  const trimmed = text.trim();

  // 1. Check for Tamil Unicode characters → pure Tamil
  if (TAMIL_UNICODE_REGEX.test(trimmed)) {
    return 'ta';
  }

  // 2. Check for Tanglish patterns
  let tanglishScore = 0;
  for (const pattern of TANGLISH_PATTERNS) {
    if (pattern.test(trimmed)) {
      tanglishScore++;
    }
  }

  if (tanglishScore >= 1) {
    return 'ta-en'; // Tanglish
  }

  // 3. Use franc for scientific language detection
  const detectedLang = franc(trimmed, { minLength: 3 });
  if (detectedLang === 'tam') {
    return 'ta';
  }

  return 'en';
}

/**
 * Normalize Tanglish/Tamil text to English for NLP processing
 */
function normalizeTanglish(text) {
  let normalized = text;

  // Replace Tamil Unicode terms with English equivalents
  for (const [tamil, english] of Object.entries(TAMIL_STOCK_TERMS)) {
    normalized = normalized.replace(new RegExp(tamil, 'g'), english);
  }

  // Replace Tanglish phrases with English equivalents
  for (const [tanglish, english] of Object.entries(TANGLISH_INTENT_MAP)) {
    const escaped = tanglish.replace(/\s+/g, '\\s+');
    normalized = normalized.replace(new RegExp(escaped, 'gi'), english);
  }

  return normalized;
}

/**
 * Extract stock symbols even from Tanglish
 * e.g. "TCS pathi sollu" → TCS
 */
function extractSymbolsFromTanglish(text) {
  const symbols = [];

  // Words that must never be treated as stock tickers
  const EXCLUDED = new Set([
    'STOCK', 'STOCKS', 'SHARE', 'SHARES', 'MARKET', 'PRICE', 'RATE', 'HELP',
    'BUY', 'SELL', 'HOLD', 'INFO', 'LIST', 'SHOW', 'TELL', 'GIVE', 'THE',
    'AND', 'FOR', 'WITH', 'THIS', 'THAT', 'FROM', 'NIFTY', 'SENSEX',
    'NSE', 'BSE', 'USD', 'INR', 'INVEST', 'HOW', 'WHAT', 'EPDI', 'SOLLU',
  ]);

  // Pattern: SYMBOL followed by Tamil/Tanglish trigger words (case-insensitive for symbol)
  const tanglishStockPattern = /\b([A-Za-z]{2,5}(?:\.NS)?)\s+(?:pathi|patri|sollu|solren|epdi|yeppadi|vilaiya|price|stock)\b/gi;
  for (const match of text.matchAll(tanglishStockPattern)) {
    const sym = match[1].toUpperCase();
    if (!EXCLUDED.has(sym)) symbols.push(sym);
  }

  // Pattern: SYMBOL stock sollu — e.g. "tcs stock sollu"
  const stockSolluPattern = /\b([A-Za-z]{2,6})(?:\.NS)?\s+stock\s+(?:sollu|solren|sollunga|pathi|vilaiya|epdi)\b/gi;
  for (const match of text.matchAll(stockSolluPattern)) {
    const sym = match[1].toUpperCase();
    if (!EXCLUDED.has(sym)) symbols.push(sym);
  }

  // Pattern: precedes Tamil buy/sell words
  const buyPattern = /\b([A-Za-z]{2,5}(?:\.NS)?)\s+(?:vangalam|vangalama|vidalama|sell|buy)\b/gi;
  for (const match of text.matchAll(buyPattern)) {
    const sym = match[1].toUpperCase();
    if (!EXCLUDED.has(sym)) symbols.push(sym);
  }

  return [...new Set(symbols)];
}

/**
 * Get response language tag from detected language
 * Maps our internal codes to chatbot lang parameter
 */
function getResponseLang(detectedLang) {
  if (detectedLang === 'ta') return 'ta';
  if (detectedLang === 'ta-en') return 'ta'; // Tanglish → respond in Tamil
  return 'en';
}

export {
  detectLanguage,
  normalizeTanglish,
  extractSymbolsFromTanglish,
  getResponseLang,
  TAMIL_STOCK_TERMS,
  TANGLISH_INTENT_MAP,
};
