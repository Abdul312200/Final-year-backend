/**
 * LLM Service — Gemini Primary + Groq Fallback + Ollama Local Fallback
 * Primary:   Google Gemini 2.0 Flash (free tier: 1,500 req/day)
 * Secondary: Groq LLaMA 3.1 (free tier: 14,400 req/day)
 * Fallback:  Ollama local LLM (llama3.2 / mistral)
 *
 * ⚠️ Set fresh API keys in .env (never commit raw keys).
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import ollama from 'ollama';
import axios from 'axios';

// ─── Configuration ──────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL   || 'gemini-2.0-flash';
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || '';
const GROQ_MODEL     = process.env.GROQ_MODEL     || 'llama-3.1-8b-instant';
const OLLAMA_HOST    = process.env.OLLAMA_HOST    || 'http://127.0.0.1:11434';
const OLLAMA_MODEL   = process.env.OLLAMA_MODEL   || 'llama3.2';

// ─── System Prompts ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_EN = `You are StockBot — an expert stock market assistant for Indian markets (NSE & BSE).
You speak Tamil, English, and Tanglish (Tamil-English mix).

LANGUAGE RULES:
- Detect the user's language from their message automatically.
- If the user writes in Tamil: reply fully in Tamil (use Tamil script).
- If the user writes in English: reply in clear English.
- If the user writes in Tanglish (mixed): reply in Tanglish matching their style.
- Never ask "which language do you prefer?" — just detect and respond.

TANGLISH EXAMPLES you must understand and reply to:
- "Nifty today enna achu?" → answer in Tanglish
- "TCS share price ku enna happening?" → answer in Tanglish
- "Market crash aaguthaaa?" → answer in Tanglish
- "இன்று சந்தை எப்படி இருக்கு?" → answer in Tamil

STOCK DOMAIN RULES:
- Focus ONLY on: NSE/BSE stocks, mutual funds, SIP, IPO, Nifty50, Sensex, F&O basics.
- Always add: "இது financial advice இல்ல / This is not financial advice."
- For live prices: say "Live data-ku NSE (https://www.nseindia.com) ya BSE (https://www.bseindia.com) check pannunga".
- Explain concepts simply — assume the user is a retail investor, not a trader.

STRICT RULES:
- Do NOT answer non-stock topics.
- Do NOT give specific buy/sell recommendations.
- ALWAYS add disclaimer at end of any analysis.

KNOWLEDGE BASE (always know these):
- NSE live: https://www.nseindia.com
- BSE live: https://www.bseindia.com
- Screener: https://www.screener.in
- Ticker Tape: https://www.tickertape.in`;

const SYSTEM_PROMPT_TA = `நீங்கள் StockBot — இந்திய பங்கு சந்தை (NSE & BSE) நிபுணர் AI உதவியாளர்.
தமிழ், ஆங்கிலம், Tanglish ஆகிய மூன்று மொழிகளில் பேசுவீர்கள்.

மொழி விதிகள்:
- பயனர் எழுதும் மொழியை தானாக கண்டறியவும்.
- தமிழில் எழுதினால்: முழுவதும் தமிழில் பதில் சொல்லுங்கள்.
- ஆங்கிலத்தில் எழுதினால்: தெளிவான ஆங்கிலத்தில் பதில் சொல்லுங்கள்.
- Tanglish-ல் எழுதினால்: அதே பாணியில் Tanglish-ல் பதில் சொல்லுங்கள்.
- "எந்த மொழி வேண்டும்?" என ஒருபோதும் கேட்காதீர்கள்.

பங்கு சந்தை விதிகள்:
- NSE/BSE பங்குகள், Mutual Fund, SIP, IPO, Nifty50, Sensex, F&O அடிப்படைகள் மட்டுமே பதில் சொல்லுங்கள்.
- எப்போதும் சேர்க்கவும்: "இது financial advice இல்ல / This is not financial advice."
- நேரடி விலைக்கு: "Live data-ku NSE / BSE check pannunga" என சொல்லுங்கள்.
- பயனர் ஒரு சாதாரண முதலீட்டாளர் என்று கருதுங்கள்.

கடுமையான விதிகள்:
- பங்கு சந்தை தொடர்பில்லாத கேள்விகளுக்கு பதில் சொல்லாதீர்கள்.
- குறிப்பிட்ட வாங்கு/விற்கு பரிந்துரை கொடுக்காதீர்கள்.
- எந்த பகுப்பாய்வின் இறுதியிலும் disclaimer சேர்க்கவும்.

முக்கியமான இணையதளங்கள்:
- NSE: https://www.nseindia.com
- BSE: https://www.bseindia.com
- Screener: https://www.screener.in
- Ticker Tape: https://www.tickertape.in`;

// ─── Gemini Client ────────────────────────────────────────────────────────────────
let geminiClient = null;
let geminiReady  = false;

function initGemini() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_NEW_GEMINI_KEY_HERE') {
    console.warn('⚠️  GEMINI_API_KEY not set — Gemini LLM disabled. Add it to .env');
    return false;
  }
  try {
    geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiReady  = true;
    console.log(`✅ Gemini LLM ready (${GEMINI_MODEL})`);
    return true;
  } catch (err) {
    console.error('❌ Gemini init error:', err.message);
    return false;
  }
}

// Convert OpenAI-style history → Gemini format
function toGeminiHistory(messages) {
  return messages.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

function toOpenAIHistory(messages) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

async function askGemini({ userMessage, conversationHistory = [], lang = 'en' }) {
  if (!geminiReady) {
    if (!initGemini()) return { success: false, reason: 'gemini_not_configured', text: null };
  }
  try {
    const sysInstruction = lang === 'ta' ? SYSTEM_PROMPT_TA : SYSTEM_PROMPT_EN;
    const model = geminiClient.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: sysInstruction,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ],
      generationConfig: { temperature: 0.4, topP: 0.9, maxOutputTokens: 600 },
    });
    const history = toGeminiHistory(conversationHistory.slice(-6));
    const chat    = model.startChat({ history });
    const result  = await chat.sendMessage(userMessage);
    const text    = result.response.text();
    return { success: true, text, model: GEMINI_MODEL, source: 'gemini' };
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.includes('quota') || msg.includes('429')) {
      console.warn('⚠️  Gemini quota exceeded — falling back to Groq');
      return { success: false, reason: 'quota_exceeded', text: null };
    }
    console.error('Gemini error:', msg);
    return { success: false, reason: msg, text: null };
  }
}

async function askGroq({ userMessage, conversationHistory = [], lang = 'en' }) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
    return { success: false, reason: 'groq_not_configured', text: null };
  }

  const systemPrompt = lang === 'ta' ? SYSTEM_PROMPT_TA : SYSTEM_PROMPT_EN;
  const messages = [
    { role: 'system', content: systemPrompt },
    ...toOpenAIHistory(conversationHistory.slice(-6)),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: GROQ_MODEL,
        messages,
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 600,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text) {
      return { success: false, reason: 'groq_empty_response', text: null };
    }

    return { success: true, text, model: GROQ_MODEL, source: 'groq' };
  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message || err?.message || String(err);
    if (status === 429 || msg.toLowerCase().includes('rate')) {
      console.warn('⚠️  Groq rate limited — falling back to Ollama');
      return { success: false, reason: 'groq_rate_limited', text: null };
    }
    if (status === 401 || status === 403) {
      console.warn('⚠️  Groq auth failed — check GROQ_API_KEY');
      return { success: false, reason: 'groq_auth_failed', text: null };
    }
    console.warn('Groq error:', msg);
    return { success: false, reason: msg, text: null };
  }
}

// ─── Ollama ────────────────────────────────────────────────────────────────────────
let ollamaAvailable = null;
let ollamaLastCheck = 0;

async function isOllamaAvailable() {
  const now = Date.now();
  if (ollamaAvailable !== null && now - ollamaLastCheck < 60000) return ollamaAvailable;
  try {
    const res = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 3000 });
    ollamaAvailable = res.status === 200;
  } catch { ollamaAvailable = false; }
  ollamaLastCheck = Date.now();
  return ollamaAvailable;
}

async function listOllamaModels() {
  try {
    const res = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
    return (res.data.models || []).map(m => m.name);
  } catch { return []; }
}

async function getBestOllamaModel() {
  const models   = await listOllamaModels();
  if (!models.length) return null;
  const priority = ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'gemma2', 'gemma', 'phi3', 'phi'];
  for (const p of priority) {
    const found = models.find(m => m.toLowerCase().startsWith(p));
    if (found) return found;
  }
  return models[0];
}

async function askOllama({ userMessage, conversationHistory = [], lang = 'en' }) {
  const available = await isOllamaAvailable();
  if (!available) return { success: false, reason: 'ollama_not_running', text: null };
  const model = await getBestOllamaModel();
  if (!model)  return { success: false, reason: 'no_ollama_model', text: null };
  const systemPrompt = lang === 'ta' ? SYSTEM_PROMPT_TA : SYSTEM_PROMPT_EN;
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-5),
    { role: 'user', content: userMessage },
  ];
  try {
    const response = await ollama.chat({
      model, messages,
      options: { temperature: 0.4, top_p: 0.9, num_predict: 500 },
      stream: false,
    });
    return { success: true, text: response.message?.content || '', model, source: 'ollama' };
  } catch (err) {
    console.error('Ollama error:', err.message);
    return { success: false, reason: err.message, text: null };
  }
}

async function ensureOllamaModel(modelName = OLLAMA_MODEL) {
  const models = await listOllamaModels();
  if (models.some(m => m.startsWith(modelName))) return true;
  console.log(`📥 Pulling Ollama model: ${modelName}...`);
  try {
    const stream = await ollama.pull({ model: modelName, stream: true });
    for await (const chunk of stream) { if (chunk.status) process.stdout.write('.'); }
    console.log(`\n✅ ${modelName} ready`);
    return true;
  } catch (err) {
    console.error(`❌ Pull failed: ${err.message}`);
    return false;
  }
}

function getStaticFallbackReply(userMessage, lang = 'en') {
  const q = String(userMessage || '').toLowerCase();

  const isRangeQuery = /stock\s*market\s*range|market\s*range|support|resistance|nifty|sensex|range\s*today/i.test(q);
  if (isRangeQuery) {
    return lang === 'ta'
      ? `📈 பங்கு சந்தை ரேஞ்ச் (Support / Resistance) விளக்கம்:\n\n• Range = ஒரு காலத்தில் விலை இயங்கும் மேல்/கீழ் எல்லை\n• Support = விலை மீண்டும் உயர வாய்ப்புள்ள கீழ் பகுதி\n• Resistance = விலை தடுக்கப்படும் மேல் பகுதி\n• Range breakout வந்தால் புதிய trend உருவாகலாம்\n\nதற்போதைய live மதிப்புக்கு:\n• "RELIANCE price"\n• "analyze TCS"\n• "compare AAPL vs MSFT"\n\n⚠️ இது நிதி ஆலோசனை அல்ல.`
      : `📈 Stock Market Range (Support / Resistance)\n\n• Range = price moving between lower and upper bounds\n• Support = zone where price may bounce\n• Resistance = zone where price may face selling pressure\n• A breakout from range can signal a new trend\n\nFor live values now, ask:\n• "RELIANCE price"\n• "analyze TCS"\n• "compare AAPL vs MSFT"\n\n⚠️ Not financial advice.`;
  }

  const isInvestQuery = /invest|investment|sip|mutual\s*fund|portfolio|etf/i.test(q);
  if (isInvestQuery) {
    return lang === 'ta'
      ? `💡 முதலீட்டு அடிப்படை வழிகாட்டல்:\n\n• சிறிய தொகையிலிருந்து தொடங்குங்கள் (SIP)\n• ஒரு பங்கில் மட்டும் அல்ல, பரவலாக முதலீடு செய்யுங்கள்\n• நீண்டகால பார்வை (3-5+ ஆண்டுகள்) வைத்திருங்கள்\n• வாங்கும் முன் "analyze <stock>" செய்து பாருங்கள்\n\nஉதாரணம்:\n• "analyze INFY"\n• "predict AAPL"\n\n⚠️ இது நிதி ஆலோசனை அல்ல.`
      : `💡 Investment basics:\n\n• Start small (SIP-style discipline)\n• Diversify instead of betting on one stock\n• Keep a long-term horizon (3-5+ years)\n• Analyze before buying\n\nTry:\n• "analyze INFY"\n• "predict AAPL"\n\n⚠️ Not financial advice.`;
  }

  const isPriceQuery = /price|rate|quote|vilai|விலை/i.test(q);
  if (isPriceQuery) {
    return lang === 'ta'
      ? `💰 நேரடி விலை பெற:\n\n• "RELIANCE price"\n• "AAPL price"\n• "TSLA price"\n\nமேலும் விரிவான தகவலுக்கு:\n• "analyze RELIANCE"\n• "analyze TSLA"`
      : `💰 For live stock price, ask:\n\n• "RELIANCE price"\n• "AAPL price"\n• "TSLA price"\n\nFor deeper details:\n• "analyze RELIANCE"\n• "analyze TSLA"`;
  }

  return lang === 'ta'
    ? `📊 FinTechIQ AI உதவியாளர் இங்கே!\n\nதற்போது AI சேவை கிடைக்கவில்லை. நேரடி கட்டளைகளை பயன்படுத்தவும்:\n\n📈 முன்னறிவிப்பு: "predict AAPL"\n📊 பகுப்பாய்வு: "analyze TCS"\n💰 விலை: "RELIANCE price"\n⚖️ ஒப்பீடு: "compare AAPL vs MSFT"\n\n⚠️ இது நிதி ஆலோசனை அல்ல.`
    : `📊 FinTechIQ AI Assistant here!\n\nAI service is temporarily unavailable. Use direct commands:\n\n📈 Prediction: "predict AAPL"\n📊 Analysis: "analyze TCS"\n💰 Price: "RELIANCE price"\n⚖️ Compare: "compare AAPL vs MSFT"\n📋 Models: "available models"\n\n⚠️ Not financial advice. Consult a SEBI-registered advisor.`;
}

// ─── Main Entry — Gemini → Groq → Ollama → static ──────────────────────────────
async function askLLM({ userMessage, conversationHistory = [], lang = 'en' }) {
  const geminiResult = await askGemini({ userMessage, conversationHistory, lang });
  if (geminiResult.success) return geminiResult;

  console.log(`Gemini failed (${geminiResult.reason}), trying Groq...`);
  const groqResult = await askGroq({ userMessage, conversationHistory, lang });
  if (groqResult.success) return groqResult;

  console.log(`Groq failed (${groqResult.reason}), trying Ollama...`);
  const ollamaResult = await askOllama({ userMessage, conversationHistory, lang });
  if (ollamaResult.success) return ollamaResult;

  // Static intelligent fallback when all LLMs are unavailable
  const staticReply = getStaticFallbackReply(userMessage, lang);

  return { success: true, text: staticReply, source: 'static', model: 'fallback' };
}

async function getLLMStatus() {
  const geminiOk = !!(GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_NEW_GEMINI_KEY_HERE');
  const groqOk   = !!(GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE');
  const ollamaOk = await isOllamaAvailable();
  const models     = ollamaOk ? await listOllamaModels() : [];
  const bestOllama = ollamaOk ? await getBestOllamaModel() : null;
  return {
    gemini: { available: geminiOk, model: GEMINI_MODEL, status: geminiOk ? '✅ Configured' : '⚠️  Key not set — add GEMINI_API_KEY to .env' },
    groq: {
      available: groqOk,
      model: GROQ_MODEL,
      status: groqOk ? '✅ Configured' : '⚠️  Key not set — add GROQ_API_KEY to .env',
    },
    ollama: { available: ollamaOk, models, activeModel: bestOllama, status: ollamaOk ? `✅ Running (${models.length} model(s))` : '⚠️  Not running — run: ollama serve', installGuide: 'https://ollama.ai' },
    primary: geminiOk ? 'gemini' : groqOk ? 'groq' : ollamaOk ? 'ollama' : 'none',
  };
}

// Initialise on import
initGemini();

export {
  askLLM,
  askGemini,
  askGroq,
  askOllama,
  isOllamaAvailable,
  listOllamaModels,
  getBestOllamaModel,
  ensureOllamaModel,
  getLLMStatus,
};
