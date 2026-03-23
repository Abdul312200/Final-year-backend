import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });
console.log("Loaded API KEY =", process.env.ALPHA_API ? "✓ set" : "✗ missing");

import express from "express";
import cors from "cors";
import axios from "axios";
import { Sequelize, DataTypes } from "sequelize";
import { processMessage, generateSuggestions } from "./nlp_processor.js";
import { detectLanguage, normalizeTanglish, extractSymbolsFromTanglish, getResponseLang } from "./language_detector.js";
import { checkStockGuard } from "./stock_guard.js";
import { initConversationDB, saveMessage, getConversationHistory, searchFAQ, buildConversationContext, getUserStats } from "./stock_conversation_db.js";
import { askLLM, getLLMStatus } from "./llm_service.js";
import goldRoute from "./goldRoute.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", goldRoute);

const ML_SERVICE   = process.env.ML_SERVICE   || "https://final-year-backend-2.onrender.com";
const LOCAL_ML     = process.env.LOCAL_ML     || "http://127.0.0.1:8000";
const LOCAL_PRICE  = process.env.LOCAL_PRICE  || "http://127.0.0.1:5001";
const IS_RENDER    = !!process.env.RENDER_EXTERNAL_URL;   // true when deployed on Render

// ─── ML service helpers: remote first, then local fallback (local skipped on Render) ───
const ML_TIMEOUT  = 30000;  // 30 s — generous for Render cold-start
const LCL_TIMEOUT = 10000;  // 10 s for local

async function mlGet(path) {
  try {
    return await axios.get(`${ML_SERVICE}${path}`, { timeout: ML_TIMEOUT });
  } catch (err) {
    if (IS_RENDER) throw err;   // no localhost on Render — propagate the real error
    return await axios.get(`${LOCAL_ML}${path}`, { timeout: LCL_TIMEOUT });
  }
}

async function mlPost(path, body) {
  try {
    return await axios.post(`${ML_SERVICE}${path}`, body, { timeout: ML_TIMEOUT });
  } catch (err) {
    if (IS_RENDER) throw err;   // no localhost on Render — propagate the real error
    return await axios.post(`${LOCAL_ML}${path}`, body, { timeout: LCL_TIMEOUT });
  }
}

// Fetch a live price: remote ML → local ML → local price micro-service
async function fetchLivePrice(symbol) {
  const bases = IS_RENDER ? [ML_SERVICE] : [ML_SERVICE, LOCAL_ML, LOCAL_PRICE];
  for (const base of bases) {
    try {
      const r = await axios.get(`${base}/price/${symbol}`, { timeout: 10000 });
      if (r.data?.price) return r.data;
    } catch (_) { /* try next */ }
  }
  return null;
}

// Build a basic analysis reply from raw price data when full analysis fails
function buildBasicAnalysis(symbol, priceData, lang) {
  const currency = priceData.currency === "INR" ? "₹" : "$";
  return lang === "ta"
    ? `${symbol} - அடிப்படை தகவல்:\n💰 தற்போதைய விலை: ${currency}${priceData.price}\n📌 சந்தை: ${priceData.currency === "INR" ? "NSE (India)" : "US Stock"}\n\n⚠️ விரிவான பகுப்பாய்வுக்கு ML சேவை தேவை. உள்ளூர் சேவையகம் இயங்குகிறதா என சரிபார்க்கவும்.`
    : `${symbol} - Basic Info:\n💰 Current Price: ${currency}${priceData.price}\n📌 Market: ${priceData.currency === "INR" ? "NSE (India)" : "US Market"}\n\n⚠️ Full analysis requires the ML service. Run 'python price_api.py' locally for richer data.`;
}

// =============================
// STATUS PAGE (browser-friendly)
// =============================
app.get("/", async (req, res) => {
  const llmStatus = await getLLMStatus();
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinTechIQ — AI Stock Chatbot</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; display: flex; height: 100vh; overflow: hidden; }

    /* ── Sidebar ── */
    .sidebar { width: 260px; background: #111118; border-right: 1px solid #1e1e2e; display: flex; flex-direction: column; padding: 20px 14px; gap: 12px; flex-shrink: 0; }
    .logo { display: flex; align-items: center; gap: 10px; padding: 8px 6px 16px; border-bottom: 1px solid #1e1e2e; }
    .logo-icon { font-size: 1.6rem; }
    .logo-text { font-size: 1.1rem; font-weight: 700; color: #4ade80; }
    .logo-sub  { font-size: 0.7rem; color: #555; margin-top: 1px; }

    .section-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1.2px; color: #444; padding: 6px 6px 2px; }
    .status-card { background: #16161e; border: 1px solid #1e1e2e; border-radius: 8px; padding: 10px 12px; }
    .s-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.78rem; border-bottom: 1px solid #1e1e2e; }
    .s-row:last-child { border-bottom: none; }
    .ok   { color: #4ade80; font-size: 0.75rem; }
    .warn { color: #facc15; font-size: 0.75rem; }

    .quick-btns { display: flex; flex-direction: column; gap: 6px; }
    .qbtn { background: #16161e; border: 1px solid #1e1e2e; border-radius: 7px; padding: 8px 10px; font-size: 0.78rem; color: #a0a0c0; cursor: pointer; text-align: left; transition: background 0.15s, border-color 0.15s; }
    .qbtn:hover { background: #1e1e30; border-color: #4ade8055; color: #e0e0ff; }

    .endpoint-list { font-size: 0.72rem; color: #555; padding: 0 6px; }
    .ep { display: flex; gap: 6px; padding: 3px 0; align-items: center; }
    .badge { font-size: 0.6rem; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
    .post { background: #1d4ed8; color: #fff; }
    .get  { background: #166534; color: #fff; }
    .ep-path { font-family: monospace; color: #7c7caa; }

    /* ── Main chat ── */
    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    .chat-header { padding: 16px 24px; border-bottom: 1px solid #1e1e2e; display: flex; align-items: center; justify-content: space-between; background: #0d0d14; }
    .chat-title { font-size: 1rem; font-weight: 600; color: #c8c8e8; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80; display: inline-block; margin-right: 6px; }
    .ml-badge { font-size: 0.72rem; background: #1a1a30; border: 1px solid #2a2a50; padding: 3px 10px; border-radius: 20px; color: #7c7ccc; }

    .messages { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth; }
    .messages::-webkit-scrollbar { width: 4px; }
    .messages::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 4px; }

    .msg { display: flex; gap: 10px; max-width: 80%; }
    .msg.user { align-self: flex-end; flex-direction: row-reverse; }
    .msg.bot  { align-self: flex-start; }

    .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0; margin-top: 2px; }
    .msg.user .avatar { background: #1d4ed8; }
    .msg.bot  .avatar { background: #16162a; border: 1px solid #2a2a50; }

    .bubble { padding: 10px 14px; border-radius: 14px; font-size: 0.88rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
    .msg.user .bubble { background: #1d3a6e; border-bottom-right-radius: 4px; color: #ddeeff; }
    .msg.bot  .bubble { background: #14141e; border: 1px solid #1e1e2e; border-bottom-left-radius: 4px; color: #d8d8f0; }

    .typing { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; animation: bounce 1.2s infinite; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }

    .suggestions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 24px 10px; }
    .sug-chip { background: #16161e; border: 1px solid #2a2a3a; border-radius: 20px; padding: 5px 12px; font-size: 0.75rem; color: #8888bb; cursor: pointer; transition: all 0.15s; }
    .sug-chip:hover { background: #1e1e30; border-color: #4ade8055; color: #aaaadd; }

    .input-area { padding: 12px 24px 16px; border-top: 1px solid #1e1e2e; background: #0d0d14; }
    .input-row { display: flex; gap: 10px; align-items: flex-end; }
    textarea { flex: 1; background: #16161e; border: 1px solid #2a2a3a; border-radius: 12px; padding: 10px 14px; font-size: 0.88rem; color: #e0e0e0; resize: none; outline: none; font-family: inherit; max-height: 120px; min-height: 44px; line-height: 1.4; transition: border-color 0.15s; }
    textarea:focus { border-color: #4ade8055; }
    textarea::placeholder { color: #444; }
    .send-btn { width: 44px; height: 44px; background: #4ade80; border: none; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, transform 0.1s; flex-shrink: 0; }
    .send-btn:hover { background: #22c55e; }
    .send-btn:active { transform: scale(0.95); }
    .send-btn svg { width: 18px; height: 18px; fill: #0a0a0f; }
    .send-btn:disabled { background: #1e1e2e; cursor: not-allowed; }
    .send-btn:disabled svg { fill: #444; }

    .hint { font-size: 0.7rem; color: #333; margin-top: 6px; text-align: center; }

    .welcome { text-align: center; padding: 40px 20px; opacity: 0.6; }
    .welcome h2 { font-size: 1.4rem; color: #4ade80; margin-bottom: 8px; }
    .welcome p  { font-size: 0.85rem; color: #666; }
  </style>
</head>
<body>

<!-- ══ SIDEBAR ══ -->
<div class="sidebar">
  <div class="logo">
    <div class="logo-icon">📈</div>
    <div>
      <div class="logo-text">FinTechIQ</div>
      <div class="logo-sub">AI Stock Assistant</div>
    </div>
  </div>

  <div class="section-label">System Status</div>
  <div class="status-card">
    <div class="s-row"><span>Backend</span><span class="ok">✅ :10000</span></div>
    <div class="s-row"><span>ML Service</span><span class="ok">✅ :8000</span></div>
    <div class="s-row"><span>Gemini LLM</span><span class="${llmStatus.gemini.available ? 'ok' : 'warn'}">${llmStatus.gemini.status}</span></div>
    <div class="s-row"><span>GitHub Models</span><span class="${llmStatus.githubModels?.available ? 'ok' : 'warn'}">${llmStatus.githubModels?.status || '⚠️  Not configured'}</span></div>
    <div class="s-row"><span>Ollama</span><span class="${llmStatus.ollama.available ? 'ok' : 'warn'}">${llmStatus.ollama.status}</span></div>
  </div>

  <div class="section-label">Quick Actions</div>
  <div class="quick-btns">
    <button class="qbtn" onclick="send('What stocks can you predict?')">📋 Available Models</button>
    <button class="qbtn" onclick="send('predict AAPL')">🔮 Predict AAPL</button>
    <button class="qbtn" onclick="send('analyze TSLA')">📊 Analyze TSLA</button>
    <button class="qbtn" onclick="send('compare AAPL vs MSFT')">⚖️ Compare Stocks</button>
    <button class="qbtn" onclick="send('AAPL price')">💰 Live Price</button>
    <button class="qbtn" onclick="send('help')">❓ Help</button>
  </div>

  <div class="section-label">API Endpoints</div>
  <div class="endpoint-list">
    <div class="ep"><span class="badge post">POST</span><span class="ep-path">/api/chatbot</span></div>
    <div class="ep"><span class="badge post">POST</span><span class="ep-path">/api/predict</span></div>
    <div class="ep"><span class="badge post">POST</span><span class="ep-path">/api/analyze</span></div>
    <div class="ep"><span class="badge post">POST</span><span class="ep-path">/api/compare</span></div>
    <div class="ep"><span class="badge get">GET</span><span class="ep-path">/api/llm-status</span></div>
    <div class="ep"><span class="badge get">GET</span><span class="ep-path">/api/stocks</span></div>
  </div>
</div>

<!-- ══ CHAT MAIN ══ -->
<div class="main">
  <div class="chat-header">
    <div class="chat-title"><span class="status-dot"></span>FinTechIQ Chatbot</div>
    <div class="ml-badge">Tamil · English · Tanglish</div>
  </div>

  <div class="messages" id="messages">
    <div class="welcome">
      <h2>📈 Welcome to FinTechIQ</h2>
      <p>Ask me to predict stock prices, analyze trends, compare stocks,<br>or get live prices — in English, Tamil, or Tanglish!</p>
    </div>
  </div>

  <div class="suggestions" id="suggestions">
    <span class="sug-chip" onclick="send('predict NVDA')">predict NVDA</span>
    <span class="sug-chip" onclick="send('TSLA ku epdi irukku?')">TSLA ku epdi irukku?</span>
    <span class="sug-chip" onclick="send('RELIANCE price')">RELIANCE price</span>
    <span class="sug-chip" onclick="send('compare AAPL vs GOOGL')">compare AAPL vs GOOGL</span>
    <span class="sug-chip" onclick="send('available models')">available models</span>
  </div>

  <div class="input-area">
    <div class="input-row">
      <textarea id="inp" rows="1" placeholder="Ask about stocks… 'predict AAPL', 'TSLA epdi irukku?'" onkeydown="onKey(event)" oninput="resize(this)"></textarea>
      <button class="send-btn" id="sendBtn" onclick="sendMsg()" title="Send">
        <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
    <div class="hint">Enter to send · Shift+Enter for new line</div>
  </div>
</div>

<script>
  const USER_ID = 'ui_' + Math.random().toString(36).slice(2, 9);
  const messagesEl = document.getElementById('messages');
  const inp = document.getElementById('inp');
  const sendBtn = document.getElementById('sendBtn');
  let busy = false;

  function resize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  }

  function addMsg(role, text) {
    const welcome = messagesEl.querySelector('.welcome');
    if (welcome) welcome.remove();
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML =
      '<div class="avatar">' + (role === 'user' ? '👤' : '🤖') + '</div>' +
      '<div class="bubble">' + escHtml(text) + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTyping() {
    const welcome = messagesEl.querySelector('.welcome');
    if (welcome) welcome.remove();
    const div = document.createElement('div');
    div.className = 'msg bot';
    div.id = 'typing-indicator';
    div.innerHTML = '<div class="avatar">🤖</div><div class="bubble typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('typing-indicator');
    if (t) t.remove();
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function send(text) {
    inp.value = text;
    await sendMsg();
  }

  async function sendMsg() {
    const text = inp.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    inp.value = '';
    inp.style.height = 'auto';

    addMsg('user', text);
    addTyping();

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, userId: USER_ID })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      removeTyping();
      const reply = data.reply || data.error || 'No response';
      addMsg('bot', reply);
      if (data.suggestions && data.suggestions.length) {
        updateSuggestions(data.suggestions);
      }
    } catch (err) {
      removeTyping();
      addMsg('bot', '❌ Connection error: ' + err.message + '\\nMake sure the backend is running on :5000');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      inp.focus();
    }
  }

  function updateSuggestions(arr) {
    const el = document.getElementById('suggestions');
    el.innerHTML = arr.map(s => '<span class="sug-chip" onclick="send(\\'' + s.replace(/'/g,"\\\\'") + '\\')">' + escHtml(s) + '</span>').join('');
  }

  inp.focus();
</script>
</body>
</html>`);
});

// =============================
// SESSION MANAGER FOR CHATBOT
// =============================
const chatSessions = new Map();

class ChatSession {
  constructor(userId) {
    this.userId = userId;
    this.context = {};
    this.lastActivity = Date.now();
  }

  setContext(key, value) {
    this.context[key] = value;
    this.lastActivity = Date.now();
  }

  getContext(key) {
    return this.context[key];
  }

  clearContext() {
    this.context = {};
  }
}

function getOrCreateSession(userId) {
  if (!chatSessions.has(userId)) {
    chatSessions.set(userId, new ChatSession(userId));
  }
  return chatSessions.get(userId);
}

// Clean up old sessions (older than 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of chatSessions.entries()) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      chatSessions.delete(userId);
    }
  }
}, 5 * 60 * 1000);

// =============================
// DATABASE (SQLite + Sequelize)
// =============================
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.sqlite",
  logging: false,
});

// User model
const User = sequelize.define("User", {
  name: DataTypes.STRING,
  email: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING,
});

// Prediction model
const Prediction = sequelize.define("Prediction", {
  ticker: DataTypes.STRING,
  input_days: DataTypes.INTEGER,
  predicted_price: DataTypes.FLOAT,
  requested_at: DataTypes.DATE,
});

User.hasMany(Prediction);
Prediction.belongsTo(User);

// Connect DB
(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    console.log("DB connected & synced");
  } catch (err) {
    console.error("DB error:", err);
  }
})();

// Init conversation DB
initConversationDB();

// =============================
// LLM STATUS API
// =============================
app.get("/api/llm-status", async (req, res) => {
  try {
    const status = await getLLMStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================
// HEALTH CHECK
// =============================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// =============================
// USER REGISTER
// =============================
app.post("/api/register", async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.json({ id: user.id, name: user.name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =============================
// LIVE STOCK PRICE API
// =============================
app.get("/api/price/:ticker", async (req, res) => {
  try {
    const symbol = req.params.ticker.toUpperCase();

    // US stocks list
    const US_STOCKS = new Set([
      "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "NFLX",
      "AMD", "INTC", "ORCL", "CRM", "ADBE", "CSCO", "PYPL",
      "JPM", "V", "MA", "BAC", "WMT", "DIS", "NKE", "MCD", "KO", "PEP",
      "BA", "JNJ", "PG", "XOM"
    ]);

    // Indian stocks → add .NS suffix if not already present
    let finalSymbol = symbol;
    if (!symbol.includes(".") && !US_STOCKS.has(symbol)) {
      finalSymbol = symbol + ".NS";
    }

    const priceInfo = await fetchLivePrice(finalSymbol);

    if (!priceInfo?.price) {
      return res.status(400).json({ error: "Price not available for " + finalSymbol });
    }

    res.json({
      ticker: symbol,
      current_price: priceInfo.price,
      currency: priceInfo.currency,
      time: new Date().toLocaleString(),
    });
  } catch (err) {
    console.error("PRICE API ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch price" });
  }
});

// =================================================
// LIVE GOLD PRICE API (INR per 10g via price_api.py)
// =================================================
app.get("/api/gold", async (req, res) => {
  try {
    const response = await mlGet('/gold');
    if (response.data.error) {
      return res.status(500).json({ error: response.data.error });
    }
    res.json(response.data);
  } catch (err) {
    console.error("GOLD API ERROR:", err.message);
    res.status(500).json({ error: "Failed to fetch gold price" });
  }
});

// =================================================
// STOCKS LIST API (proxy to ML service)
// =================================================
app.get("/api/stocks", async (req, res) => {
  try {
    const r = await mlGet('/stocks');
    res.json(r.data);
  } catch (err) {
    console.error("STOCKS API ERROR:", err.message);
    res.status(503).json({ error: "ML service unavailable — start ml/app.py locally" });
  }
});

// =================================================
// PREDICT PROXY (direct pass-through to ML service)
// =================================================
app.post("/predict", async (req, res) => {
  try {
    const response = await mlPost('/predict', req.body);
    res.json(response.data);
  } catch (error) {
    console.error("ML /predict error:", error.message);
    res.status(500).json({ error: "ML API failed — ensure local ML service (ml/app.py) is running" });
  }
});

// =================================================
// MAIN CHATBOT API (FINAL WITH NLP)
// =================================================
app.post("/api/chatbot", async (req, res) => {
  // Declare lang here so it is accessible in the catch block
  let lang = 'en';
  try {
    const { message, userId = "guest" } = req.body;
    const text = message.toLowerCase();
    const session = getOrCreateSession(userId);

    // =============================
    // LANGUAGE DETECTION (EN / TA / TANGLISH)
    // =============================
    const detectedLang = detectLanguage(message);
    const responseLang = getResponseLang(detectedLang);  // 'en' or 'ta'
    lang = responseLang;  // assign to outer let

    // Normalize Tanglish to English for NLP
    const normalizedMessage = (detectedLang === 'ta-en')
      ? normalizeTanglish(message)
      : message;

    // =============================
    // STOCK-ONLY GUARD
    // =============================
    const guardResult = checkStockGuard(message, lang);
    if (!guardResult.allowed) {
      await saveMessage({ userId, role: 'user', message, language: detectedLang, intent: 'blocked' });
      await saveMessage({ userId, role: 'bot', message: guardResult.message, language: lang, intent: 'blocked' });
      return res.json({ reply: guardResult.message });
    }

    // =============================
    // NLP PROCESSING
    // =============================
    const nlpContext = processMessage(normalizedMessage);
    console.log("NLP Context:", { intent: nlpContext.intent, symbols: nlpContext.symbols, lang: detectedLang });

    // Store NLP context in session
    session.setContext("nlpContext", nlpContext);
    session.setContext("lang", lang);

    // Extract symbols from NLP + Tanglish
    let nlpSymbols = nlpContext.symbols || [];
    if (detectedLang === 'ta-en') {
      const tanglishSymbols = extractSymbolsFromTanglish(message);
      nlpSymbols = [...new Set([...nlpSymbols, ...tanglishSymbols])];
    }

    const detectedIntent = nlpContext.intent;
    const detectedAlgo = nlpContext.entities?.algorithm?.toLowerCase();

    // Save user message to conversation DB
    await saveMessage({
      userId, role: 'user', message,
      language: detectedLang,
      intent: detectedIntent,
      stockSymbol: nlpSymbols[0] || null,
      sentiment: nlpContext.sentiment,
    }).catch(() => {});  // non-critical

    // -----------------------------
    // STOCK PREDICTION (Enhanced with NLP)
    // -----------------------------
    if (detectedIntent === 'predict' || text.match(/predict|prediction|forecast/)) {

      // ── "what stocks can you predict?" ────────────────────────────
      if (text.match(/what stocks|which stocks|list.*stock|can you predict|how many|available/i) && nlpSymbols.length === 0) {
        const stockList = lang === "ta"
          ? `நான் கணிக்கக்கூடிய பங்குகள்:\n\n🇺🇸 அமெரிக்க பங்குகள்:\nAAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, NFLX\nAMD, INTC, JPM, V, MA, BAC, BA, CRM, CSCO\nDIS, JNJ, KO, MCD, NKE, ORCL, PEP, PG, PYPL\n\n🇮🇳 இந்திய பங்குகள்:\nRELIANCE, TCS, INFY, HDFCBANK, ICICIBANK\nWIPRO, LTIM, BAJFINANCE, KOTAKBANK, SBIN\n\n🤖 ஆல்காரிதம்கள்: LSTM, GRU, CNN-LSTM, ANN, ARIMA, XGBoost\n\n"predict AAPL" அல்லது "predict TCS using GRU" என தட்டச்சு செய்யவும்.`
          : `Stocks I can predict:\n\n🇺🇸 US Stocks:\nAAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, NFLX\nAMD, INTC, JPM, V, MA, BAC, BA, CRM, CSCO\nDIS, JNJ, KO, MCD, NKE, ORCL, PEP, PG, PYPL\n\n🇮🇳 Indian Stocks (NSE):\nRELIANCE, TCS, INFY, HDFCBANK, ICICIBANK\nWIPRO, LTIM, BAJFINANCE, KOTAKBANK, SBIN\n\n🤖 Algorithms: LSTM, GRU, CNN-LSTM, ANN, ARIMA, XGBoost\n\nType "predict AAPL" or "predict TCS using GRU" to get started!`;
        return res.json({ reply: stockList });
      }

      const symbol = nlpSymbols[0] || session.getContext("lastStock");
      if (!symbol) {
        return res.json({
          reply: lang === "ta"
            ? `📈 எந்த பங்கை கணிக்க வேண்டும்? எ.கா: "predict AAPL" அல்லது "TCS கணிப்பு"`
            : `📈 Which stock should I predict? e.g. "predict AAPL" or "predict TCS"`
        });
      }
      
      try {
        const requestAlgo = detectedAlgo || "lstm";
        
        const response = await mlPost('/predict', {
          ticker: symbol,
          input_days: 60,
          algorithm: requestAlgo
        });

        const { ticker, predicted_price, current_price, algorithm } = response.data;
        const change = ((predicted_price - current_price) / current_price * 100).toFixed(2);
        const direction = parseFloat(change) > 0 ? "📈 increase" : "📉 decrease";
        const currency = symbol.includes(".NS") ? "₹" : "$";

        session.setContext("lastStock", symbol);
        const suggestions = generateSuggestions(nlpContext, lang);

        const reply = lang === "ta"
            ? `${ticker} பங்கு முன்னறிவிப்பு:\n📊 தற்போதைய விலை: ${currency}${current_price}\n🎯 கணிக்கப்பட்ட விலை: ${currency}${predicted_price}\n📈 மாற்றம்: ${Math.abs(change)}% ${direction}\n🤖 மாடல்: ${algorithm.toUpperCase()}\n⚠️ இது நிதி ஆலோசனை அல்ல.`
            : `Stock Prediction for ${ticker}:\n📊 Current Price: ${currency}${current_price}\n🎯 Predicted Price: ${currency}${predicted_price}\n📈 Change: ${change}% ${direction}\n🤖 Model: ${algorithm.toUpperCase()}\n⚠️ Not financial advice.`;

        await saveMessage({ userId, role: 'bot', message: reply, language: lang, intent: 'predict', stockSymbol: ticker }).catch(() => {});
        return res.json({ reply, suggestion: suggestions[0] });
      } catch (err) {
        console.error("Predict error:", err.message);
        const detail = err?.response?.data?.detail || "";

        // Fallback: show live price even when prediction model is down
        const priceData = await fetchLivePrice(symbol);
        if (priceData?.price) {
          const currency = priceData.currency === "INR" ? "₹" : "$";
          const fallbackReply = lang === "ta"
            ? `${symbol} ML முன்னறிவிப்பு தற்காலிகமாக கிடைக்கவில்லை.\n\n💰 நேரடி விலை: ${currency}${priceData.price}\n\nML சேவை இயங்கும்போது முன்னறிவிப்பு கிடைக்கும்.\nதற்போது: "analyze ${symbol}" என தட்டச்சு செய்யவும்.`
            : `ML prediction for ${symbol} is temporarily unavailable.\n\n💰 Live Price: ${currency}${priceData.price}\n\nPrediction will work when the ML service is running.\nFor now, try: "analyze ${symbol}"`;
          return res.json({ reply: fallbackReply });
        }

        const errorMsg = detail || err.message || "ML service unavailable";
        return res.json({
          reply: lang === "ta"
            ? `முன்னறிவிப்பு தோல்வி: ${errorMsg}\n\nML சேவை கிடைக்க சிறிது நேரம் ஆகலாம். பின்னர் மீண்டும் முயற்சிக்கவும்.`
            : `Prediction unavailable: ${errorMsg}\n\nThe ML service may be starting up. Please try again in a moment.`,
          suggestion: lang === "ta" ? `${symbol} பகுப்பாய்வு முயற்சிக்கவும்: "analyze ${symbol}"` : `Try analyzing instead: "analyze ${symbol}"`
        });
      }
    }


    // -----------------------------
    // GENERAL INVEST / FINANCE QUESTION  (no specific symbol)
    // e.g. "stock epdi invest pannurathu", "how to start investing", "SIP vs lump sum"
    // Route these to LLM so they get a rich, intelligent answer.
    // -----------------------------
    const isGeneralFinance = (
      detectedIntent === 'invest' ||
      text.match(/\b(invest|pannurathu|pannanum|pannarathu|epdi.*invest|how.*invest|start.*invest|beginner|portfolio|mutual.?fund|sip|lump.?sum|etf|diversif)/i) ||
      (text.match(/\b(epdi|yeppadi|eppadi|how)\b/i) && text.match(/\b(invest|stock|share|market|vangura|angiku|panam|pairam)\b/i))
    ) && nlpSymbols.length === 0;

    if (isGeneralFinance) {
      try {
        const convHistory = await buildConversationContext(userId, message, 4);
        const llmResult = await askLLM({ userMessage: message, conversationHistory: convHistory.slice(0, -1), lang });
        if (llmResult.success && llmResult.text) {
          await saveMessage({ userId, role: 'bot', message: llmResult.text, language: lang, intent: 'invest', isLLM: true }).catch(() => {});
          return res.json({ reply: llmResult.text, source: llmResult.source, model: llmResult.model });
        }
      } catch (llmErr) { console.warn('LLM invest fallback error:', llmErr.message); }

      // LLM unavailable — built-in fallback
      const fallback = lang === 'ta'
        ? `பங்கு சந்தையில் முதலீடு செய்வது எப்படி:\n\n📌 படி 1: Demat + Trading Account திறக்கவும் (Zerodha, Groww, Upstox)\n📌 படி 2: KYC + PAN Card தயாராக வையுங்கள்\n📌 படி 3: சிறிய தொகையிலிருந்து தொடங்குங்கள் (₹500 SIP போதும்)\n📌 படி 4: Blue-chip பங்குகளை தேர்வு செய்யுங்கள் (TCS, HDFC, INFY)\n📌 படி 5: நீண்ட காலத்திற்கு முதலீடு செய்யுங்கள் (5+ ஆண்டுகள்)\n\n💡 SIP = மாதந்தோறும் ஒரு குறிப்பிட்ட தொகை முதலீடு\n💡 Mutual Fund = நிபுணர்கள் நிர்வகிக்கும் பங்கு கூடை\n\n⚠️ இது நிதி ஆலோசனை அல்ல. SEBI பதிவுசெய்த ஆலோசகரை அணுகவும்.\n\nகுறிப்பிட்ட பங்கை பகுப்பாய்வு செய்ய: "analyze TCS" என தட்டச்சு செய்யவும்.`
        : `How to invest in the stock market:\n\n📌 Step 1: Open a Demat + Trading account (Zerodha, Groww, Upstox, Angel One)\n📌 Step 2: Complete KYC with PAN Card\n📌 Step 3: Start small — even ₹500/month via SIP works\n📌 Step 4: Pick blue-chip stocks (TCS, HDFC, Infosys, Reliance)\n📌 Step 5: Stay invested long-term (5+ years for best results)\n\n💡 SIP = Systematic Investment Plan (fixed monthly investment)\n💡 Mutual Fund = Basket of stocks managed by experts\n💡 Index Fund = Tracks Nifty/Sensex — low cost, reliable\n\n⚠️ This is not financial advice. Consult a SEBI-registered advisor.\n\nTo analyze a specific stock, type: "analyze TCS" or "predict AAPL"`;

      await saveMessage({ userId, role: 'bot', message: fallback, language: lang, intent: 'invest' }).catch(() => {});
      return res.json({ reply: fallback });
    }

    // -----------------------------
    // STOCK ANALYSIS (Enhanced with NLP)
    // -----------------------------
    // Also catch Tanglish: "tcs stock sollu", "reliance pathi", "enna vilarang" etc.
    const isTanglishAnalyze = nlpSymbols.length > 0 && text.match(/\b(sollu|pathi|patri|vilarang|epdi|irukku)\b/i);
    if (detectedIntent === 'analyze' || text.match(/analyz|analysis|detail|info|about/) || isTanglishAnalyze) {
      const symbol = nlpSymbols[0] || session.getContext("lastStock");
      if (!symbol) {
        return res.json({
          reply: lang === "ta"
            ? `📊 எந்த பங்கை பகுப்பாய்வு செய்ய வேண்டும்? எ.கா: "analyze TCS" அல்லது "RELIANCE pathi sollu"`
            : `📊 Which stock should I analyze? e.g. "analyze TCS" or "details about AAPL"`
        });
      }
      session.setContext("lastStock", symbol);

      try {
        const response = await mlGet(`/analyze/${symbol}`);
        const data = response.data;

        const currency = symbol.includes(".NS") ? "₹" : "$";
        const suggestions = generateSuggestions(nlpContext, lang);

        const changeDir = data.price_change_pct_1d >= 0 ? "▲" : "▼";
        const reply = lang === "ta"
            ? `${data.company_name} (${data.symbol}) பகுப்பாய்வு:\n💰 தற்போதைய விலை: ${currency}${data.current_price}\n${changeDir} 1-நாள் மாற்றம்: ${data.price_change_pct_1d}%\n📈 52-வார உயர்வு: ${currency}${data.high_52w}\n📉 52-வார குறைவு: ${currency}${data.low_52w}\n📐 MA(20): ${currency}${data.ma_20}\n📐 MA(50): ${currency}${data.ma_50}\n⚡ மாறுபாடு: ${data.volatility}%\n${data.pe_ratio ? `📌 P/E விகிதம்: ${data.pe_ratio.toFixed(2)}` : ""}\n⚠️ இது நிதி ஆலோசனை அல்ல.`
            : `Analysis for ${data.company_name} (${data.symbol}):\n💰 Current Price: ${currency}${data.current_price}\n${changeDir} 1-Day Change: ${data.price_change_pct_1d}%\n📈 52w High: ${currency}${data.high_52w}\n📉 52w Low: ${currency}${data.low_52w}\n📐 MA(20): ${currency}${data.ma_20}\n📐 MA(50): ${currency}${data.ma_50}\n⚡ Volatility: ${data.volatility}%\n${data.pe_ratio ? `📌 P/E Ratio: ${data.pe_ratio.toFixed(2)}` : ""}\n⚠️ Not financial advice.`;

        await saveMessage({ userId, role: 'bot', message: reply, language: lang, intent: 'analyze', stockSymbol: symbol }).catch(() => {});
        return res.json({ reply, suggestion: suggestions[0] });
      } catch (err) {
        console.error("Analyze error:", err.message);
        // Fallback: at least show live price when full analysis fails
        const priceData = await fetchLivePrice(symbol);
        if (priceData?.price) {
          const fallbackReply = buildBasicAnalysis(symbol, priceData, lang);
          await saveMessage({ userId, role: 'bot', message: fallbackReply, language: lang, intent: 'analyze', stockSymbol: symbol }).catch(() => {});
          return res.json({ reply: fallbackReply });
        }
        return res.json({
          reply: lang === "ta"
            ? `பகுப்பாய்வு தோல்வி: ${symbol} தகவல் கிடைக்கவில்லை. சரியான சின்னம் பயன்படுத்துங்கள் (எ.கா: TCS, RELIANCE, AAPL, TSLA).`
            : `Analysis unavailable for ${symbol}. Check that the symbol is valid (e.g. TCS, RELIANCE, AAPL, TSLA).\nThe ML service may be sleeping — please try again in 30 seconds.`
        });
      }
    }

    // -----------------------------
    // MODEL TRAINING (Enhanced with NLP)
    // -----------------------------
    if (detectedIntent === 'train' || text.match(/train|training|create model/)) {
      const symbols = nlpSymbols.length > 0 ? nlpSymbols : ["AAPL"];
      
      // Determine algorithm from NLP or text
      let algorithms = ["lstm"];
      if (detectedAlgo) {
        algorithms = [detectedAlgo];
      } else if (text.includes("all")) {
        algorithms = ["lstm", "ann", "gru", "cnn_lstm"];
      } else if (text.includes("ann")) {
        algorithms = ["ann"];
      } else if (text.includes("arima")) {
        algorithms = ["arima"];
      } else if (text.includes("gru")) {
        algorithms = ["gru"];
      } else if (text.includes("cnn")) {
        algorithms = ["cnn_lstm"];
      } else if (text.includes("xgboost")) {
        algorithms = ["xgboost"];
      } else if (text.includes("prophet")) {
        algorithms = ["prophet"];
      }

      try {
        session.setContext("trainingStatus", "in_progress");
        
        const response = await mlPost('/train', {
          tickers: symbols,
          algorithms: algorithms,
          epochs: text.includes("quick") ? 3 : 5,
        });

        session.setContext("trainingStatus", "completed");

        return res.json({
          reply: lang === "ta"
            ? `மாடல் பயிற்சி முடிந்தது! ✅\n🎯 பயிற்சி பெற்ற பங்குகள்: ${symbols.join(", ")}\n🤖 அல்காரிதம்கள்: ${algorithms.join(", ")}\n✨ வெற்றிகரமாக பயிற்சி பெற்றது: ${response.data.trained_count}\n\nஇப்போது முன்னறிவிப்புகளை முயற்சி செய்யுங்கள்!`
            : `Model training completed! ✅\n🎯 Trained stocks: ${symbols.join(", ")}\n🤖 Algorithms: ${algorithms.join(", ")}\n✨ Successfully trained: ${response.data.trained_count}\n\nNow try making predictions!`
        });
      } catch (err) {
        session.setContext("trainingStatus", "failed");
        return res.json({
          reply: lang === "ta"
            ? `பயிற்சி தோல்வி: ${err?.response?.data?.detail || err.message}`
            : `Training failed: ${err?.response?.data?.detail || err.message}`
        });
      }
    }

    // -----------------------------
    // STOCK COMPARISON (Enhanced with NLP)
    // -----------------------------
    if (detectedIntent === 'compare' || text.match(/compare|comparison|versus|vs/)) {
      const symbols = nlpSymbols;

      if (symbols.length < 2) {
        return res.json({
          reply: lang === "ta"
            ? "இரண்டு அல்லது அதற்கு மேற்பட்ட பங்குகளை ஒப்பிட குறிப்பிடவும்.\nஉதாரணம்: 'compare AAPL vs TSLA' அல்லது 'compare MSFT GOOGL AMZN'"
            : "Please specify two or more stocks to compare.\nExample: 'compare AAPL vs TSLA' or 'compare MSFT GOOGL AMZN'"
        });
      }

      try {
        const response = await mlPost('/compare', {
          symbols: symbols,
          period: "1y"
        });

        const { comparisons, best_performer_1d, most_volatile } = response.data;
        
        let compText = "";
        for (const comp of comparisons) {
          compText += `\n${comp.symbol}: ₹${comp.current_price} (${comp.price_change_pct_1d > 0 ? '+' : ''}${comp.price_change_pct_1d}%)`;
        }

        return res.json({
          reply: lang === "ta"
            ? `பங்கு ஒப்பீடு:${compText}\n\n🏆 சிறந்த செயல்திறன்: ${best_performer_1d}\n⚡ அதிக மாறுபாடு: ${most_volatile}`
            : `Stock Comparison:${compText}\n\n🏆 Best Performer: ${best_performer_1d}\n⚡ Most Volatile: ${most_volatile}`
        });
      } catch (err) {
        return res.json({
          reply: lang === "ta"
            ? `ஒப்பீடு தோல்வி: ${err?.response?.data?.detail || err.message}`
            : `Comparison failed: ${err?.response?.data?.detail || err.message}`
        });
      }
    }

    // -----------------------------
    // AVAILABLE MODELS
    // -----------------------------
    if (text.includes("available") && text.includes("model")) {
      try {
        const response = await mlGet('/models');
        const available = response.data.available;
        
        let modelList = "";
        for (const [algo, tickers] of Object.entries(available)) {
          if (tickers.length > 0) {
            modelList += `\n${algo.toUpperCase()}: ${tickers.slice(0, 5).join(", ")}${tickers.length > 5 ? "..." : ""}`;
          }
        }

        return res.json({
          reply: lang === "ta"
            ? `கிடைக்கும் மாடல்கள்:${modelList || "\nஇன்னும் எந்த மாடல்களும் பயிற்சி பெறவில்லை."}`
            : `Available Models:${modelList || "\nNo models trained yet."}`
        });
      } catch (err) {
        return res.json({
          reply: lang === "ta"
            ? "மாடல் பட்டியலை பெற முடியவில்லை"
            : "Could not fetch models list"
        });
      }
    }

    // -----------------------------
    // GOLD QUERY (live price from yfinance)
    // -----------------------------
    const normalizedLower = normalizedMessage.toLowerCase();
    if (text.includes("gold") || normalizedLower.includes("gold") ||
        text.includes("thangam") || text.includes("\u0ba4\u0b99\u0bcd\u0b95\u0bae\u0bcd")) {
      let gd = null;
      // Try chains: remote ML → local ML → local price API → GoldAPI route
      for (const base of (IS_RENDER ? [ML_SERVICE] : [ML_SERVICE, LOCAL_ML, LOCAL_PRICE])) {
        try {
          const r = await axios.get(`${base}/gold`, { timeout: 8000 });
          if (r.data?.price) { gd = r.data; break; }
        } catch (_) { /* next */ }
      }
      if (!gd) {
        // Try our own GoldAPI route
        try {
          const selfBase = process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${port}`;
          const r = await axios.get(`${selfBase}/api/gold-price`, { timeout: 8000 });
          if (r.data?.price) gd = r.data;
        } catch (_) { /* fall through */ }
      }
      if (gd) {
          const per_gram_24k = Math.round(gd.price / 10);
          const per_gram_22k = Math.round(per_gram_24k * 0.9167);
          const dir = gd.chp != null ? (gd.chp >= 0 ? `▲ +${gd.chp.toFixed(2)}%` : `▼ ${gd.chp.toFixed(2)}%`) : '';
          return res.json({
            reply: lang === "ta"
              ? `இன்றைய தங்க விலை (இந்தியா) 🥇\n24K: ₹${per_gram_24k.toLocaleString('en-IN')} / கிராம்\n22K: ₹${per_gram_22k.toLocaleString('en-IN')} / கிராம்\n10 கிராம்: ₹${gd.price.toLocaleString('en-IN')} ${dir}\n(நகரம் மற்றும் நகைக்கடைக்கு ஏற்ப விலை மாறலாம்)`
              : `Today's Gold Rate (India) 🥇\n24K: ₹${per_gram_24k.toLocaleString('en-IN')} / gram\n22K: ₹${per_gram_22k.toLocaleString('en-IN')} / gram\n10g price: ₹${gd.price.toLocaleString('en-IN')} ${dir}\n(Rates may vary by city and jeweller)`
          });
      }
      // None of the sources returned a valid price
      return res.json({
        reply: lang === "ta"
          ? `இன்றைய தங்க விலை (இந்தியா):\n24K: ₹9,500 / கிராம் (தோராயம்)\n22K: ₹8,700 / கிராம் (தோராயம்)\n(நேரடி விலை கிடைக்கவில்லை)`
          : `Today's Gold Rate (India):\n24K: ₹9,500 / gram (approx)\n22K: ₹8,700 / gram (approx)\n(Live price unavailable)`
      });
    }

    // -----------------------------
    // INVESTMENT QUERY
    // -----------------------------
    if (
      text.includes("invest") ||
      text.includes("investment") ||
      text.includes("sip")
    ) {
      return res.json({
        reply:
          lang === "ta"
            ? `முதலீட்டு செயல்முறை:
1️⃣ முதலீட்டு இலக்கை நிர்ணயிக்கவும்
2️⃣ மாத வருமானம் மற்றும் செலவுகளை கணக்கிடவும்
3️⃣ SIP அல்லது Mutual Fund தேர்வு செய்யவும்
4️⃣ நீண்டகாலத்திற்கு முறையாக முதலீடு செய்யவும்
5️⃣ ஆபத்தை குறைக்க முதலீடுகளை பரவலாக்கவும்`
            : `Investment Process:
1️⃣ Set financial goals
2️⃣ Analyze income and expenses
3️⃣ Choose SIP or Mutual Funds
4️⃣ Invest regularly for long-term
5️⃣ Diversify investments to reduce risk`
      });
    }

    // -----------------------------
    // HELP COMMAND (Enhanced)
    // -----------------------------
    if (detectedIntent === 'help' || text.includes("help") || text.includes("what can you do")) {
      return res.json({
        reply:
          lang === "ta"
            ? `நான் உங்களுக்கு உதவ முடியும்:

📈 பங்கு முன்னறிவிப்பு:
• "predict AAPL"
• "forecast TSLA stock"
• "predict MSFT using GRU"

📊 பங்கு பகுப்பாய்வு:
• "analyze MSFT"
• "details about GOOGL"

🤖 மாடல் பயிற்சி:
• "train AAPL model"
• "train TSLA with CNN-LSTM"
• "train MSFT with all algorithms"

⚖️ பங்கு ஒப்பீடு:
• "compare AAPL vs TSLA"
• "MSFT versus GOOGL"

📋 மாடல் பட்டியல்:
• "available models"

💰 பிற சேவைகள்:
• தங்க விலை
• முதலீட்டு வழிகாட்டுதல்

🤖 கிடைக்கும் மாடல்கள்:
• LSTM, GRU, CNN-LSTM, ANN
• ARIMA, XGBoost, Prophet`
            : `I can help you with:

📈 Stock Predictions:
• "predict AAPL"
• "forecast TSLA stock"
• "predict MSFT using GRU"

📊 Stock Analysis:
• "analyze MSFT"
• "details about GOOGL"

🤖 Model Training:
• "train AAPL model"
• "train TSLA with CNN-LSTM"
• "train MSFT with all algorithms"

⚖️ Stock Comparison:
• "compare AAPL vs TSLA"
• "MSFT versus GOOGL"

📋 Model List:
• "available models"

💰 Other Services:
• Gold prices
• Investment guidance

🤖 Available Models:
• LSTM, GRU, CNN-LSTM, ANN
• ARIMA, XGBoost, Prophet`
      });
    }

    // -----------------------------
    // STOCK PRICE QUERY (Enhanced with NLP)
    // -----------------------------
    if (detectedIntent === 'price' || text.match(/\bprice\b|price of|current price/)) {
      const symbol = nlpSymbols[0] || "AAPL";

      // Match the same symbol rules used by /api/price
      let finalSymbol = symbol;
      if (
        !symbol.includes(".") &&
        !["AAPL", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "NVDA"].includes(symbol)
      ) {
        finalSymbol = symbol + ".NS";
      }

      try {
        const priceInfo = await fetchLivePrice(finalSymbol);

        if (!priceInfo || typeof priceInfo.price !== "number") {
          throw new Error("Price not available");
        }

        const currency = priceInfo.currency === "INR" ? "₹" : "$";
        return res.json({
          reply:
            lang === "ta"
              ? `${symbol} இன் தற்போதைய விலை ${currency}${priceInfo.price}`
              : `The current price of ${symbol} is ${currency}${priceInfo.price}`
        });
      } catch (priceErr) {
        return res.json({
          reply:
            lang === "ta"
              ? `${symbol} விலை பெற முடியவில்லை. சந்தை மூடப்பட்டிருக்கலாம் அல்லது சின்னம் தவறானது.`
              : `Could not fetch price for ${symbol}. Market may be closed or symbol is invalid.`
        });
      }
    }

    // -----------------------------
    // DEFAULT RESPONSE (with NLP-based suggestions)
    // -----------------------------
    // =============================
    // FAQ DATABASE CHECK
    // =============================
    if (detectedIntent === 'faq' || text.match(/what is|explain|define|how does|what are/)) {
      const faqResult = await searchFAQ(message, lang);
      if (faqResult.found) {
        await saveMessage({ userId, role: 'bot', message: faqResult.answer, language: lang, intent: 'faq' }).catch(() => {});
        return res.json({
          reply: faqResult.answer,
          source: 'faq',
          suggestion: lang === 'ta' ? 'மேலும் கேள்விகள் இருந்தால் கேளுங்கள்!' : 'Ask me anything else about stocks!'
        });
      }
    }

    // =============================
    // GREETING HANDLER
    // =============================
    if (detectedIntent === 'greeting') {
      const greetReply = lang === 'ta'
        ? `வணக்கம்! 👋 நான் FinTechIQ — உங்கள் AI பங்கு சந்தை உதவியாளர்.\n\nநான் உதவக்கூடியவை:\n📈 பங்கு முன்னறிவிப்பு\n📊 பகுப்பாய்வு\n💰 நேரடி விலை\n⚖️ ஒப்பீடு\n🤖 ML பயிற்சி\n\n'உதவி' என தட்டச்சு செய்யவும்.`
        : `Hello! 👋 I'm FinTechIQ — your AI stock market assistant.\n\nI can help with:\n📈 Stock predictions\n📊 Stock analysis\n💰 Live prices\n⚖️ Stock comparisons\n🤖 ML model training\n\nType 'help' to see all commands.`;
      return res.json({ reply: greetReply });
    }

    // =============================
    // LLM FALLBACK (Gemini → Ollama) for complex queries
    // =============================
    const isStructuredIntent = ['predict', 'analyze', 'train', 'compare', 'price', 'buy_sell'].includes(detectedIntent);
    const isHelpOnly         = ['help'].includes(detectedIntent);

    // Use LLM for unknown/conversational/faq-miss/complex queries
    if (!isStructuredIntent && !isHelpOnly) {
      try {
        const convHistory = await buildConversationContext(userId, message, 5);
        // Remove last item (current message already added by buildConversationContext)
        const historyForLLM = convHistory.slice(0, -1);

        const llmResult = await askLLM({
          userMessage: message,
          conversationHistory: historyForLLM,
          lang,
        });

        if (llmResult.success && llmResult.text) {
          const reply = llmResult.text;
          await saveMessage({ userId, role: 'bot', message: reply, language: lang, intent: 'llm', isLLM: true }).catch(() => {});
          return res.json({
            reply,
            source: llmResult.source,
            model: llmResult.model,
            suggestion: generateSuggestions(nlpContext, lang)[0],
          });
        }
      } catch (llmErr) {
        console.warn('LLM error:', llmErr.message);
      }
    }

    // Default structured fallback
    const suggestions = generateSuggestions(nlpContext, lang);
    const defaultReply = lang === 'ta'
      ? 'நான் பங்கு முன்னறிவிப்பு, பகுப்பாய்வு, விலை, ஒப்பீடு மற்றும் முதலீடு பற்றி உதவ முடியும். "உதவி" என தட்டச்சு செய்யவும்.'
      : 'I can help with stock predictions, analysis, live prices, comparisons, and investment guidance. Type "help" for commands.';

    await saveMessage({ userId, role: 'bot', message: defaultReply, language: lang, intent: 'default' }).catch(() => {});
    return res.json({
      reply: defaultReply,
      suggestion: suggestions[0] || (lang === 'ta' ? 'முயற்சி: "AAPL முன்னறிவிப்பு"' : 'Try: "predict AAPL" or "analyze TSLA"'),
    });

  } catch (err) {
    console.error("CHATBOT ERROR:", err.message);
    res.status(500).json({
      reply:
        lang === "ta"
          ? "தொழில்நுட்ப பிழை ஏற்பட்டுள்ளது. மீண்டும் முயற்சிக்கவும்."
          : "A technical error occurred. Please try again."
    });
  }
});

// =================================================
// ML PREDICTION SERVICE
// =================================================
app.post("/api/predict", async (req, res) => {
  const { ticker, input_days = 60, userId = null } = req.body;

  try {
    const resp = await mlPost('/predict', {
      ticker,
      input_days,
    });

    const { predicted_price } = resp.data;

    if (userId) {
      await Prediction.create({
        ticker,
        input_days,
        predicted_price,
        requested_at: new Date(),
        UserId: userId,
      });
    }

    res.json({ ticker, predicted_price });
  } catch (err) {
    const status = err?.response?.status || 500;
    const data = err?.response?.data;

    // Log the most useful details for debugging
    if (data) {
      console.error("Prediction error:", status, JSON.stringify(data));
    } else {
      console.error("Prediction error:", err.message);
    }

    // Forward ML error details when available (e.g., missing model => 400)
    res.status(status).json(data || { error: "Prediction failed", message: err.message });
  }
});
// =================================================
// LEARN MODULES API
// =================================================
app.get("/api/learn/modules", (req, res) => {
  const lang = req.query.lang || "en";

  const modules = [
    {
      id: 1,
      icon: "📚",
      title: lang === "en" ? "Budgeting Basics" : "பட்ஜெட் அடிப்படைகள்",
      desc:
        lang === "en"
          ? "Learn how to create and manage your monthly budget effectively for financial stability"
          : "நிதி நிலைத்தன்மைக்காக உங்கள் மாதாந்திர பட்ஜெட்டை திறம்பட உருவாக்க மற்றும் நிர்வகிக்க கற்றுக்கொள்ளுங்கள்",
      duration: "15 min",
      level: lang === "en" ? "Beginner" : "தொடக்கநிலை",
      color: "#667eea",
    },
    {
      id: 2,
      icon: "📈",
      title: lang === "en" ? "Investment 101" : "முதலீடு 101",
      desc:
        lang === "en"
          ? "Introduction to stocks, bonds, mutual funds and market basics"
          : "பங்குகள், பத்திரங்கள், மியூச்சுவல் ஃபண்டுகள் மற்றும் சந்தை அடிப்படைகள்",
      duration: "30 min",
      level: lang === "en" ? "Beginner" : "தொடக்கநிலை",
      color: "#764ba2",
    },
    {
      id: 3,
      icon: "🏦",
      title: lang === "en" ? "Banking Essentials" : "வங்கி அத்தியாவசியங்கள்",
      desc:
        lang === "en"
          ? "Understand accounts, loans, credit scores and digital banking"
          : "கணக்குகள், கடன்கள், கடன் மதிப்பெண்கள் மற்றும் டிஜிட்டல் வங்கி சேவைகள்",
      duration: "25 min",
      level: lang === "en" ? "Beginner" : "தொடக்கநிலை",
      color: "#f093fb",
    },
    {
      id: 4,
      icon: "💹",
      title: lang === "en" ? "Technical Analysis" : "தொழில்நுட்ப பகுப்பாய்வு",
      desc:
        lang === "en"
          ? "Read stock charts, patterns and indicators"
          : "பங்கு விளக்கப்படங்கள், வடிவங்கள் மற்றும் குறியீடுகளைப் புரிந்துகொள்ளுங்கள்",
      duration: "45 min",
      level: lang === "en" ? "Intermediate" : "இடைநிலை",
      color: "#4facfe",
    },
    {
      id: 5,
      icon: "🎯",
      title: lang === "en" ? "Risk Management" : "இடர் மேலாண்மை",
      desc:
        lang === "en"
          ? "Protect investments and minimize losses"
          : "முதலீடுகளை பாதுகாத்து இழப்புகளை குறைக்கவும்",
      duration: "35 min",
      level: lang === "en" ? "Advanced" : "மேம்பட்ட",
      color: "#43e97b",
    },
    {
      id: 6,
      icon: "🌐",
      title: lang === "en" ? "Global Markets" : "உலகச் சந்தைகள்",
      desc:
        lang === "en"
          ? "Learn about international markets and forex"
          : "சர்வதேச சந்தைகள் மற்றும் அந்நிய செலாவணி பற்றி கற்றுக்கொள்ளுங்கள்",
      duration: "40 min",
      level: lang === "en" ? "Advanced" : "மேம்பட்ட",
      color: "#fa709a",
    },
  ];

  res.json({ modules });
});
// =================================================
// START LEARNING
// =================================================
app.post("/api/learn/start", (req, res) => {
  const { userId, moduleId } = req.body;

  res.json({
    message: "Learning session started",
    moduleId,
    startedAt: new Date(),
  });
});
// =================================================
// LEARNING PROGRESS
// =================================================
app.post("/api/learn/progress", async (req, res) => {
  const { userId, moduleId, progress } = req.body;

  res.json({
    status: "saved",
    moduleId,
    progress, // example: 40%
  });
});

// =============================
//  ML metrics proxy 
app.get("/api/metrics", async (req, res) => {
  try {
    const r = await mlGet("/metrics");
    res.json(r.data);
  } catch (err) {
    res.status(503).json({ error: "ML service unavailable", detail: err.message });
  }
});

// START SERVER
// =============================
const port = process.env.PORT || 10000;
app.listen(port, () => {
  const publicUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  console.log(`Backend listening on ${publicUrl}`);
});
