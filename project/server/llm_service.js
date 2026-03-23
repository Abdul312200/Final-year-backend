/**
 * LLM Service — Gemini Primary + GitHub Models + Ollama Fallback
 * Primary:   Google Gemini 1.5 Flash (free tier)
 * Secondary: GitHub Models (OpenAI-compatible endpoint)
 * Fallback:  Ollama local LLM (llama3.2 / mistral)
 *
 * ⚠️ Set fresh API keys in .env (never commit raw keys).
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import ollama from 'ollama';
import axios from 'axios';

// ─── Configuration ──────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL   || 'gemini-1.5-flash';
const GITHUB_MODELS_TOKEN = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '';
const GITHUB_MODELS_ENDPOINT = (process.env.GITHUB_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com').replace(/\/$/, '');
const GITHUB_MODELS_MODEL = process.env.GITHUB_MODELS_MODEL || 'gpt-4.1-mini';
const OLLAMA_HOST    = process.env.OLLAMA_HOST    || 'http://127.0.0.1:11434';
const OLLAMA_MODEL   = process.env.OLLAMA_MODEL   || 'llama3.2';

// ─── System Prompts ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_EN = `You are FinTechIQ — an expert stock market and financial AI assistant.

STRICT RULES you MUST follow:
1. ONLY answer questions about stocks, shares, market analysis, trading, investments, finance, mutual funds, ETFs, commodities (gold/silver/oil), and financial markets.
2. If asked about unrelated topics (weather, sports, movies, cooking, health advice, politics, relationships, etc.) — politely DECLINE and redirect to stock topics.
3. Support English, Tamil, and Tanglish (Tamil written in English letters). When user writes in Tamil or Tanglish, respond in Tamil.
4. Keep answers CONCISE, structured with bullet points and emojis.
5. For buy/sell advice always add: ⚠️ "This is not financial advice. Consult a SEBI-registered advisor."
6. Reference FinTechIQ tools when relevant:
   - 📈 Stock prediction: "predict AAPL"
   - 📊 Analysis: "analyze TCS.NS"
   - ⚖️ Compare: "compare AAPL vs TSLA"
   - 💰 Price: "price MSFT"
7. Use Indian context (₹, NSE/BSE) when applicable.
8. Never make up stock prices — say "use our live price tool."`;

const SYSTEM_PROMPT_TA = `நீங்கள் FinTechIQ — ஒரு நிபுண பங்கு சந்தை AI உதவியாளர்.

கட்டாய விதிகள்:
1. பங்குகள், சந்தை, முதலீடு, வர்த்தகம், நிதி தொடர்பான கேள்விகளுக்கு மட்டுமே பதில் சொல்லுங்கள்.
2. தொடர்பில்லாத கேள்விகளை மறுக்கவும், பங்கு கேள்விகளுக்கு திருப்பி விடவும்.
3. தமிழ், ஆங்கிலம், Tanglish ஆதரிக்கவும். தமிழில் கேட்கும்போது தமிழில் பதில் சொல்லுங்கள்.
4. சுருக்கமான, bullet points மற்றும் emoji உடன் பதில் சொல்லுங்கள்.
5. ⚠️ "இது நிதி ஆலோசனை அல்ல. SEBI பதிவுசெய்யப்பட்ட ஆலோசகரை அணுகவும்."`;

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
      console.warn('⚠️  Gemini quota exceeded — falling back to Ollama');
      return { success: false, reason: 'quota_exceeded', text: null };
    }
    console.error('Gemini error:', msg);
    return { success: false, reason: msg, text: null };
  }
}

async function askGitHubModels({ userMessage, conversationHistory = [], lang = 'en' }) {
  if (!GITHUB_MODELS_TOKEN || GITHUB_MODELS_TOKEN === 'YOUR_NEW_GITHUB_TOKEN_HERE') {
    return { success: false, reason: 'github_models_not_configured', text: null };
  }

  const systemPrompt = lang === 'ta' ? SYSTEM_PROMPT_TA : SYSTEM_PROMPT_EN;
  const messages = [
    { role: 'system', content: systemPrompt },
    ...toOpenAIHistory(conversationHistory.slice(-6)),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await axios.post(
      `${GITHUB_MODELS_ENDPOINT}/chat/completions`,
      {
        model: GITHUB_MODELS_MODEL,
        messages,
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 600,
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_MODELS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text) {
      return { success: false, reason: 'github_models_empty_response', text: null };
    }

    return { success: true, text, model: GITHUB_MODELS_MODEL, source: 'github-models' };
  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message || err?.message || String(err);
    if (status === 429 || msg.toLowerCase().includes('rate')) {
      console.warn('⚠️  GitHub Models rate limited — falling back to Ollama');
      return { success: false, reason: 'github_models_rate_limited', text: null };
    }
    if (status === 401 || status === 403) {
      console.warn('⚠️  GitHub Models auth failed — check token permissions');
      return { success: false, reason: 'github_models_auth_failed', text: null };
    }
    console.warn('GitHub Models error:', msg);
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

// ─── Main Entry — Gemini, then GitHub Models, then Ollama, then static ──────────
async function askLLM({ userMessage, conversationHistory = [], lang = 'en' }) {
  const geminiResult = await askGemini({ userMessage, conversationHistory, lang });
  if (geminiResult.success) return geminiResult;

  console.log(`Gemini failed (${geminiResult.reason}), trying GitHub Models...`);
  const githubResult = await askGitHubModels({ userMessage, conversationHistory, lang });
  if (githubResult.success) return githubResult;

  console.log(`GitHub Models failed (${githubResult.reason}), trying Ollama...`);
  const ollamaResult = await askOllama({ userMessage, conversationHistory, lang });
  if (ollamaResult.success) return ollamaResult;

  // Static intelligent fallback when all LLMs are unavailable
  const staticReply = lang === 'ta'
    ? `📊 FinTechIQ AI உதவியாளர் இங்கே!\n\nதற்போது AI சேவை கிடைக்கவில்லை. நேரடி கட்டளைகளை பயன்படுத்தவும்:\n\n📈 முன்னறிவிப்பு: "predict AAPL"\n📊 பகுப்பாய்வு: "analyze TCS"\n💰 விலை: "RELIANCE price"\n⚖️ ஒப்பீடு: "compare AAPL vs MSFT"\n\n⚠️ இது நிதி ஆலோசனை அல்ல.`
    : `📊 FinTechIQ AI Assistant here!\n\nAI service is temporarily unavailable. Use direct commands:\n\n📈 Prediction: "predict AAPL"\n📊 Analysis: "analyze TCS"\n💰 Price: "RELIANCE price"\n⚖️ Compare: "compare AAPL vs MSFT"\n📋 Models: "available models"\n\n⚠️ Not financial advice. Consult a SEBI-registered advisor.`;

  return { success: true, text: staticReply, source: 'static', model: 'fallback' };
}

async function getLLMStatus() {
  const geminiOk   = !!(GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_NEW_GEMINI_KEY_HERE');
  const githubOk   = !!(GITHUB_MODELS_TOKEN && GITHUB_MODELS_TOKEN !== 'YOUR_NEW_GITHUB_TOKEN_HERE');
  const ollamaOk   = await isOllamaAvailable();
  const models     = ollamaOk ? await listOllamaModels() : [];
  const bestOllama = ollamaOk ? await getBestOllamaModel() : null;
  return {
    gemini: { available: geminiOk, model: GEMINI_MODEL, status: geminiOk ? '✅ Configured' : '⚠️  Key not set — add GEMINI_API_KEY to .env' },
    githubModels: {
      available: githubOk,
      model: GITHUB_MODELS_MODEL,
      endpoint: GITHUB_MODELS_ENDPOINT,
      status: githubOk ? '✅ Configured' : '⚠️  Token not set — add GITHUB_MODELS_TOKEN to .env',
    },
    ollama: { available: ollamaOk, models, activeModel: bestOllama, status: ollamaOk ? `✅ Running (${models.length} model(s))` : '⚠️  Not running — run: ollama serve', installGuide: 'https://ollama.ai' },
    primary: geminiOk ? 'gemini' : githubOk ? 'github-models' : ollamaOk ? 'ollama' : 'none',
  };
}

// Initialise on import
initGemini();

export {
  askLLM,
  askGemini,
  askGitHubModels,
  askOllama,
  isOllamaAvailable,
  listOllamaModels,
  getBestOllamaModel,
  ensureOllamaModel,
  getLLMStatus,
};
