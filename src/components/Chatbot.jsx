import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

// ── Backend URL ─────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://api.fintechiq.me';

// ── Persistent user ID (survives page refresh) ───────────────────────
const USER_ID = (() => {
  let id = localStorage.getItem('fintechiq_uid');
  if (!id) {
    id = 'ui_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('fintechiq_uid', id);
  }
  return id;
})();

const formatTime = (d) =>
  d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── Language config ──────────────────────────────────────────────────
// 'en' = English UI + English backend replies
// 'ta' = Tamil UI  + Tamil backend replies
// 'tl' = Tanglish UI + Tamil backend replies (backend auto-detects Tanglish)
const LANG_CYCLE = ['en', 'ta', 'tl'];   // toggle order

const UI = {
  // Header / chrome
  online:       { en: 'Online',                  ta: 'இணைய நிலை',          tl: 'Online ah irukku' },
  close:        { en: 'Close chat',              ta: 'மூடு',                tl: 'Close pannu' },
  home:         { en: 'Home',                    ta: 'முகப்பு',             tl: 'Home' },
  learn:        { en: 'Learn',                   ta: 'கற்று',               tl: 'Learn pannu' },
  predict:      { en: 'Predict',                 ta: 'கணிப்பு',             tl: 'Predict pannu' },
  langBtn:      { en: 'தமிழ்',                   ta: 'Tanglish',            tl: 'English' },
  langLabel:    { en: 'EN',                      ta: 'TA',                  tl: 'TL' },

  // Welcome
  welcomeTitle: { en: 'FinTechIQ AI Assistant',
                  ta: 'FinTechIQ AI உதவியாளர்',
                  tl: 'FinTechIQ AI Assistant da!' },
  welcomeText:  { en: 'Ask me to predict stocks, analyze trends, compare companies, or get live prices!',
                  ta: 'பங்கு கணிப்பு, பகுப்பாய்வு, ஒப்பீடு அல்லது நேரடி விலை கேளுங்கள்!',
                  tl: 'Stock predict pannu, analyze pannu, compare pannu, illa price kelu da!' },

  // Input placeholder
  placeholder:  { en: 'Ask about stocks, predict AAPL, compare TSLA vs NVDA…',
                  ta: 'பங்குகள் பற்றி கேளுங்கள்…',
                  tl: 'Stock pathi kelu, AAPL predict sollu, TSLA vs NVDA compare pannu…' },

  // Typing indicator
  typing:       { en: 'typing…',                ta: 'தட்டச்சு…',           tl: 'type pannurathu…' },

  // Sender labels
  you:          { en: '👤 You',                  ta: '👤 நீங்கள்',          tl: '👤 Nee' },

  // Error messages
  offline:      { en: '📡 You appear to be offline. Please check your internet connection.',
                  ta: '📡 இணையத் தொடர்பு இல்லை. மறுபடியும் முயலவும்.',
                  tl: '📡 Internet illama irukku da. Check pannu.' },
  noResponse:   { en: 'No response received.',
                  ta: 'பதில் எதுவும் இல்லை.',
                  tl: 'Response eidhuvum varalai da.' },
  serverDown:   { en: `❌ Could not reach the server. Make sure the backend is running.`,
                  ta: '❌ சர்வர் இணைப்பு தோல்வி. பின்னணி சேவையகம் இயங்குகிறதா என சரிபார்க்கவும்.',
                  tl: '❌ Server-ae reach panna mudiyala da. Backend running-ah check pannu.' },
  unknownErr:   { en: '❌ An unexpected error occurred. Please try again.',
                  ta: '❌ எதிர்பாரா பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
                  tl: '❌ Ayyo, enna error-o therinala. Maarum try pannu.' },
};

const t = (key, lang) => UI[key]?.[lang] ?? UI[key]?.en ?? key;

// ── Default suggestions per language ────────────────────────────────
const DEFAULT_SUGGESTIONS = {
  en: ['predict AAPL', 'analyze TSLA', 'compare AAPL vs MSFT', 'gold price', 'what stocks can you predict?'],
  ta: ['AAPL கணிப்பு', 'TSLA பகுப்பாய்வு', 'தங்க விலை', 'RELIANCE விலை', 'உதவி'],
  tl: ['AAPL predict sollu', 'TSLA epdi irukku?', 'gold price sollu', 'AAPL vs TSLA compare pannu', 'RELIANCE price sollu'],
};

// tryLocalResponse removed — all predict/analyze/compare queries now go straight
// to the backend so the AI can return real predictions and analysis.

// ── Determine backend lang param ─────────────────────────────────────
// Tanglish mode → send 'ta' so backend responds in Tamil (it auto-detects the Tanglish input)
const backendLang = (uiLang) => (uiLang === 'en' ? 'en' : 'ta');

// ── Chat logic hook ──────────────────────────────────────────────────
const useChatLogic = (uiLang) => {
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [isTyping,    setIsTyping]    = useState(false);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS[uiLang]);
  const lastSendTimeRef = useRef(0);  // Track last request time for throttling

  // Reset suggestions on language change
  useEffect(() => {
    setSuggestions(DEFAULT_SUGGESTIONS[uiLang] ?? DEFAULT_SUGGESTIONS.en);
  }, [uiLang]);

  const sendMessage = useCallback(async (msgText) => {
    const text = (msgText || input).trim();
    if (!text || isTyping) return;

    // ── Throttle: Prevent requests faster than 500ms apart ──────────────
    const now = Date.now();
    const timeSinceLastRequest = now - lastSendTimeRef.current;
    if (timeSinceLastRequest < 500) {
      // Silently ignore rapid-fire requests
      return;
    }
    lastSendTimeRef.current = now;

    setMessages(p => [...p, { sender: 'user', text, time: new Date() }]);
    if (!msgText) setInput('');
    setIsTyping(true);

    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/chatbot`, {
        message: text,
        userId:  USER_ID,
        lang:    backendLang(uiLang),   // backend lang param
      });

      const reply = data.reply || data.error || t('noResponse', uiLang);
      setMessages(p => [...p, { sender: 'bot', text: reply, time: new Date() }]);

      if (Array.isArray(data.suggestions) && data.suggestions.length) {
        setSuggestions(data.suggestions);
      }

    } catch (err) {
      let botText;

      if (!navigator.onLine) {
        botText = t('offline', uiLang);
      } else if (err.response) {
        const status = err.response.status;
        const serverMsg = err.response?.data?.reply || err.response?.data?.error;
        
        // Handle rate limit error with user-friendly message
        if (status === 429) {
          botText = uiLang === 'en'
            ? `⚠️ Rate limit reached. Too many requests. Please wait a moment before sending another message.`
            : uiLang === 'ta'
              ? `⚠️ மிக அதிக கோரிக்கைகள். சிறிது நேரம் பிறகு முயற்சிக்கவும்.`
              : `⚠️ Aiyya, neenga kaduppukka spam ah irukku da. Wait pannu.`;
        } else {
          botText = serverMsg || (uiLang === 'en'
            ? `⚠️ Server error (${status}). Please try again.`
            : uiLang === 'ta'
              ? `⚠️ சர்வர் பிழை (${status}). மீண்டும் முயற்சிக்கவும்.`
              : `⚠️ Server error (${status}) aachu da. Try pannu.`);
        }
      } else if (err.request) {
        botText = t('serverDown', uiLang);
      } else {
        botText = t('unknownErr', uiLang);
      }

      setMessages(p => [...p, { sender: 'bot', text: botText, time: new Date() }]);

    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, uiLang]);

  return { messages, input, setInput, isTyping, suggestions, setSuggestions, sendMessage };
};

// ── Component ────────────────────────────────────────────────────────
export default function Chatbot({ open, onToggle }) {
  // 3-way language: 'en' | 'ta' | 'tl'
  const [uiLang, setUiLang] = useState('en');

  const cycleLang = () =>
    setUiLang(cur => LANG_CYCLE[(LANG_CYCLE.indexOf(cur) + 1) % LANG_CYCLE.length]);

  const {
    messages, input, setInput,
    isTyping, suggestions, setSuggestions,
    sendMessage,
  } = useChatLogic(uiLang);

  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 300); }, [open]);

  const handleSuggestion = (s) => { setInput(s); setTimeout(() => sendMessage(s), 50); };
  const handleKeyDown    = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const navItems = [
    { to: '/',                 icon: '🏠', key: 'home'    },
    { to: '/learn',            icon: '📚', key: 'learn'   },
    { to: '/stock-prediction', icon: '📈', key: 'predict' },
  ];

  if (!open) return null;

  return (
    <aside className={`chatbot ${open ? 'open' : ''}`} aria-live="polite">
      <div className="chatbot-window">

        {/* ── Header ── */}
        <header className="chatbot-header">
          <Link to="/" className="chatbot-header-title" onClick={onToggle}>
            <div>
              <div>
                Fin<span className="logo-highlight">Tech</span>IQ{' '}
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>AI</span>
              </div>
              <div className="chatbot-header-status">
                ● {t('online', uiLang)}
              </div>
            </div>
          </Link>

          {/* Language badge pill — shows current mode, click cycles */}
          <button
            className="chatbot-lang-badge"
            onClick={cycleLang}
            title="Switch language / மொழி மாற்று / Language switch pannu"
            style={{
              background: uiLang === 'en' ? '#1d4ed8'
                        : uiLang === 'ta' ? '#7c3aed'
                        : '#0f766e',
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              padding: '3px 12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              marginRight: 6,
              transition: 'background 0.2s',
            }}
          >
            {uiLang === 'en' ? '🇺🇸 EN'
           : uiLang === 'ta' ? '🇮🇳 TA'
           :                   '🤝 TL'}
          </button>

          <button className="chatbot-close" onClick={onToggle} aria-label={t('close', uiLang)}>✕</button>
        </header>

        {/* ── Language toggle row ── */}
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '6px 12px 2px',
          borderBottom: '1px solid var(--border, #1e1e2e)',
        }}>
          {[
            { code: 'en', label: '🇺🇸 English' },
            { code: 'ta', label: '🇮🇳 தமிழ்' },
            { code: 'tl', label: '🤝 Tanglish' },
          ].map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setUiLang(code)}
              style={{
                flex: 1,
                padding: '5px 0',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.72rem',
                fontWeight: uiLang === code ? 700 : 400,
                cursor: 'pointer',
                background: uiLang === code
                  ? (code === 'en' ? '#1d4ed8' : code === 'ta' ? '#7c3aed' : '#0f766e')
                  : 'var(--surface, #16161e)',
                color: uiLang === code ? '#fff' : 'var(--text-muted, #666)',
                transition: 'all 0.15s',
                outline: uiLang === code ? '2px solid transparent' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Nav tabs ── */}
        <nav className="chatbot-nav">
          {navItems.map(item => (
            <Link key={item.to} to={item.to} className="chatbot-nav-link" onClick={onToggle}>
              {item.icon} <span>{t(item.key, uiLang)}</span>
            </Link>
          ))}
        </nav>

        {/* ── Messages ── */}
        <div className="chatbot-messages">

          {/* Welcome / empty state */}
          {messages.length === 0 && !isTyping && (
            <div className="chatbot-welcome">
              <div className="chatbot-welcome-icon">🤖</div>
              <h3>{t('welcomeTitle', uiLang)}</h3>
              <p>{t('welcomeText', uiLang)}</p>

              {/* Language hint chips */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={hintChip('#1d4ed8')}>English</span>
                <span style={hintChip('#7c3aed')}>தமிழ்</span>
                <span style={hintChip('#0f766e')}>Tanglish</span>
              </div>

              <div className="suggestion-tags">
                {suggestions.map((s, i) => (
                  <button key={i} className="suggestion-tag" onClick={() => handleSuggestion(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.sender}`}>
              <div className="msg-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              <div className="msg-meta">
                {msg.sender === 'bot' ? '🤖 FinTechIQ AI' : t('you', uiLang)}
                {' · '}{formatTime(msg.time)}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="msg bot">
              <div className="typing-indicator"><span /><span /><span /></div>
              <div className="msg-meta">
                🤖 FinTechIQ AI · {t('typing', uiLang)}
              </div>
            </div>
          )}

          {/* Inline suggestions after last message */}
          {messages.length > 0 && !isTyping && suggestions.length > 0 && (
            <div className="suggestion-tags" style={{ marginTop: 4 }}>
              {suggestions.map((s, i) => (
                <button key={i} className="suggestion-tag" onClick={() => handleSuggestion(s)}>{s}</button>
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* ── Input ── */}
        <div className="chatbot-input">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('placeholder', uiLang)}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isTyping || !input.trim()}
            title="Send"
          >
            {isTyping ? '⏳' : '➤'}
          </button>
        </div>

      </div>
    </aside>
  );
}

// ── Small helper ─────────────────────────────────────────────────────
function hintChip(bg) {
  return {
    background: bg,
    color: '#fff',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: '0.7rem',
    fontWeight: 600,
  };
}
