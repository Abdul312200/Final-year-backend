import React, { useState, useMemo, useEffect, useRef } from "react";
import axios from "axios";
import { useLanguage } from "../context/LanguageContext";

/* ─── Alpha Vantage live price ─── */
const AV_KEY = import.meta.env.VITE_ALPHA_API || 'VH8S26GRAKQ9UPTL';
const AV_BASE = 'https://www.alphavantage.co/query';

// Map internal symbol → Alpha Vantage symbol
const toAVSymbol = (sym) => {
  if (sym.endsWith('_NS')) return sym.replace('_NS', '.NSE');
  return sym;
};

// Module-level cache: { [symbol]: { price, change, changePct, ts } }
const _priceCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

const fetchQuote = async (avSym) => {
  const res  = await fetch(`${AV_BASE}?function=GLOBAL_QUOTE&symbol=${avSym}&apikey=${AV_KEY}`);
  const data = await res.json();
  const q    = data['Global Quote'];
  if (!q || !q['05. price']) throw new Error('No data');
  return {
    price:     parseFloat(q['05. price']),
    change:    parseFloat(q['09. change']),
    changePct: parseFloat(q['10. change percent']),
  };
};

const fetchLivePrice = async (symbol) => {
  const cached = _priceCache[symbol];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  const primary   = toAVSymbol(symbol);
  const fallbackSym = symbol.endsWith('_NS') ? symbol.replace('_NS', '.BSE') : null;

  let quote;
  try {
    quote = await fetchQuote(primary);
  } catch {
    if (fallbackSym) {
      quote = await fetchQuote(fallbackSym);
    } else {
      throw new Error('No data');
    }
  }

  const mockRef = MOCK_PRICES[symbol];
  if (mockRef && (quote.price > mockRef * 10 || quote.price < mockRef * 0.1)) {
    throw new Error(`Suspicious price ${quote.price} vs mock ${mockRef}`);
  }

  const result = { ...quote, ts: Date.now() };
  _priceCache[symbol] = result;
  return result;
};

import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "https://api.fintechiq.me";

/* ─── Mock prices (used when backend is offline) ─── */
const MOCK_PRICES = {
  AAPL: 159.5, ADBE: 475.0, AMD: 105.0, AMZN: 178.0, BA: 190.0,
  BAC: 38.5, CRM: 285.0, CSCO: 49.0, DIS: 112.0, GOOGL: 140.0,
  INTC: 32.0, JNJ: 158.0, JPM: 197.0, KO: 62.5, MA: 452.0,
  MCD: 295.0, META: 510.0, MSFT: 415.0, NFLX: 625.0, NKE: 94.0,
  NVDA: 875.0, ORCL: 122.0, PEP: 173.0, PG: 165.0, PYPL: 65.0,
  TSLA: 175.0, V: 278.0,
  ADANIENT_NS: 2350, ADANIPORTS_NS: 1280, ASIANPAINT_NS: 2850,
  AXISBANK_NS: 1050, BAJFINANCE_NS: 6900, BHARTIARTL_NS: 1350,
  BPCL_NS: 610, CIPLA_NS: 1420, DRREDDY_NS: 1280,
  HCLTECH_NS: 1600, HDFCBANK_NS: 1680, HINDUNILVR_NS: 2350,
  ICICIBANK_NS: 1090, INDUSINDBK_NS: 1050, INFY_NS: 1570,
  ITC_NS: 456, KOTAKBANK_NS: 1750, LT_NS: 3600,
  MARUTI_NS: 11200, NESTLEIND_NS: 2500, ONGC_NS: 275,
  RELIANCE_NS: 2870, SBIN_NS: 765, SUNPHARMA_NS: 1680,
  TCS_NS: 3900, TECHM_NS: 1540, TITAN_NS: 3450,
  ULTRACEMCO_NS: 10800, WIPRO_NS: 480,
};

/* ─── Seeded pseudo-random (deterministic per symbol) ─── */
function seededRnd(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

/* ─── Generate 60-day history with realistic noise ─── */
function generateMockHistory(symbol) {
  const base = MOCK_PRICES[symbol] || 100;
  const rnd = seededRnd(symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const data = [];
  let price = base * (0.88 + rnd() * 0.08);
  const today = new Date();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const skip = d.getDay();
    if (skip === 0 || skip === 6) continue;
    price += price * (rnd() - 0.49) * 0.018;
    data.push({
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      price: +price.toFixed(2),
    });
  }
  return data;
}

/* ─── Generate full mock result ─── */
function generateMockData(symbol, days) {
  const base = MOCK_PRICES[symbol] || 100;
  const rnd = seededRnd(symbol.length * days + (MOCK_PRICES[symbol] || 1));
  const trend = (rnd() - 0.46) * 0.18 * (days / 60);
  const currentPrice = +(base * (0.97 + rnd() * 0.06)).toFixed(2);
  const predictedPrice = +(currentPrice * (1 + trend)).toFixed(2);
  const changePct = +((trend) * 100).toFixed(2);
  return {
    current_price: currentPrice,
    predicted_price: predictedPrice,
    history: generateMockHistory(symbol),
    advice: changePct >= 3
      ? `The statistical trend for ${symbol} shows positive momentum over the ${days}-day period.`
      : changePct <= -3
        ? `The statistical model indicates potential downward pressure on ${symbol} for this period.`
        : `${symbol} is showing neutral momentum. The projected change is within normal variance.`,
    change_pct: changePct,
    volatility: +(2 + rnd() * 4).toFixed(2),
  };
}

/* ─── Stock Lists ─── */
const usStocks = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Tech" },
  { symbol: "ADBE", name: "Adobe Inc.", sector: "Tech" },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Tech" },
  { symbol: "AMZN", name: "Amazon", sector: "E-commerce" },
  { symbol: "BA", name: "Boeing", sector: "Aerospace" },
  { symbol: "BAC", name: "Bank of America", sector: "Finance" },
  { symbol: "CRM", name: "Salesforce", sector: "Tech" },
  { symbol: "CSCO", name: "Cisco", sector: "Tech" },
  { symbol: "DIS", name: "Disney", sector: "Media" },
  { symbol: "GOOGL", name: "Alphabet (Google)", sector: "Tech" },
  { symbol: "INTC", name: "Intel Corporation", sector: "Tech" },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Finance" },
  { symbol: "KO", name: "Coca-Cola", sector: "Consumer" },
  { symbol: "MA", name: "Mastercard", sector: "Finance" },
  { symbol: "MCD", name: "McDonald's", sector: "Consumer" },
  { symbol: "META", name: "Meta Platforms", sector: "Tech" },
  { symbol: "MSFT", name: "Microsoft", sector: "Tech" },
  { symbol: "NFLX", name: "Netflix", sector: "Media" },
  { symbol: "NKE", name: "Nike", sector: "Consumer" },
  { symbol: "NVDA", name: "NVIDIA", sector: "Tech" },
  { symbol: "ORCL", name: "Oracle", sector: "Tech" },
  { symbol: "PEP", name: "PepsiCo", sector: "Consumer" },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumer" },
  { symbol: "PYPL", name: "PayPal", sector: "Finance" },
  { symbol: "TSLA", name: "Tesla", sector: "Auto/EV" },
  { symbol: "V", name: "Visa", sector: "Finance" },
];

const indianStocks = [
  { symbol: "ADANIENT_NS", name: "Adani Enterprises", sector: "Conglomerate" },
  { symbol: "ADANIPORTS_NS", name: "Adani Ports", sector: "Ports" },
  { symbol: "ASIANPAINT_NS", name: "Asian Paints", sector: "Consumer" },
  { symbol: "AXISBANK_NS", name: "Axis Bank", sector: "Finance" },
  { symbol: "BAJFINANCE_NS", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "BHARTIARTL_NS", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "BPCL_NS", name: "Bharat Petroleum", sector: "Energy" },
  { symbol: "CIPLA_NS", name: "Cipla", sector: "Pharma" },
  { symbol: "DRREDDY_NS", name: "Dr. Reddy's", sector: "Pharma" },
  { symbol: "HCLTECH_NS", name: "HCL Technologies", sector: "Tech" },
  { symbol: "HDFCBANK_NS", name: "HDFC Bank", sector: "Finance" },
  { symbol: "HINDUNILVR_NS", name: "Hindustan Unilever", sector: "Consumer" },
  { symbol: "ICICIBANK_NS", name: "ICICI Bank", sector: "Finance" },
  { symbol: "INDUSINDBK_NS", name: "IndusInd Bank", sector: "Finance" },
  { symbol: "INFY_NS", name: "Infosys", sector: "Tech" },
  { symbol: "ITC_NS", name: "ITC", sector: "Consumer" },
  { symbol: "KOTAKBANK_NS", name: "Kotak Mahindra Bank", sector: "Finance" },
  { symbol: "LT_NS", name: "Larsen & Toubro", sector: "Industrial" },
  { symbol: "MARUTI_NS", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "NESTLEIND_NS", name: "Nestle India", sector: "Consumer" },
  { symbol: "ONGC_NS", name: "ONGC", sector: "Energy" },
  { symbol: "RELIANCE_NS", name: "Reliance Industries", sector: "Conglomerate" },
  { symbol: "SBIN_NS", name: "State Bank of India", sector: "Finance" },
  { symbol: "SUNPHARMA_NS", name: "Sun Pharma", sector: "Pharma" },
  { symbol: "TCS_NS", name: "Tata Consultancy", sector: "Tech" },
  { symbol: "TECHM_NS", name: "Tech Mahindra", sector: "Tech" },
  { symbol: "TITAN_NS", name: "Titan Company", sector: "Consumer" },
  { symbol: "ULTRACEMCO_NS", name: "UltraTech Cement", sector: "Industrial" },
  { symbol: "WIPRO_NS", name: "Wipro", sector: "Tech" },
];

const HORIZON_OPTIONS = [
  { days: 30, label_en: "30 Days", label_ta: "30 நாட்கள்" },
  { days: 60, label_en: "60 Days", label_ta: "60 நாட்கள்" },
  { days: 90, label_en: "90 Days", label_ta: "90 நாட்கள்" },
  { days: 120, label_en: "120 Days", label_ta: "120 நாட்கள்" },
  { days: 180, label_en: "6 Months", label_ta: "6 மாதங்கள்" },
  { days: 365, label_en: "1 Year", label_ta: "1 ஆண்டு" },
];

/* ─── Custom chart tooltip ─── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: "10px", padding: "0.65rem 1rem",
      fontSize: "0.82rem", boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
    }}>
      <div style={{ color: "#94a3b8", marginBottom: 4, fontSize: "0.75rem" }}>{label}</div>
      <div style={{ color: "#6366f1", fontWeight: 800, fontSize: "1rem" }}>
        ₹ {Number(payload[0].value).toFixed(2)}
      </div>
    </div>
  );
};

/* ─── Forecast date helper ─── */
function getForecastDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ─── Today's date display ─── */
function todayStr() {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ─── Main component ─── */
export default function StockPrediction() {
  const { lang } = useLanguage();
  const en = lang === "en";

  const [market, setMarket] = useState("us");
  const [symbol, setSymbol] = useState("AAPL");
  const [days, setDays] = useState(60);
  const [roiAmount, setRoiAmount] = useState(10000);

  const [hasPredicted, setHasPredicted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [currentPrice, setCurrentPrice] = useState(null);
  const [predictedPrice, setPredictedPrice] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [investmentAdvice, setInvestmentAdvice] = useState("");
  const [adviceMeta, setAdviceMeta] = useState(null);

  const [livePrice, setLivePrice] = useState(null);
  const [liveFetching, setLiveFetching] = useState(false);
  const liveAbort = useRef(null);

  const stockList = market === "us" ? usStocks : indianStocks;

  const handleMarketChange = (m) => {
    setMarket(m);
    setSymbol(m === "us" ? "AAPL" : "RELIANCE_NS");
    setHasPredicted(false);
    setError(null);
    setLivePrice(null);
  };

  // ── Check backend health on mount and every 60 s ──
  useEffect(() => {
    let cancelled = false;
    const checkBackend = async () => {
      try {
        await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
        if (!cancelled) {
          setBackendStatus('online');
          // Auto-clear demo mode when backend comes back online
          setIsDemoMode(false);
        }
      } catch {
        if (!cancelled) setBackendStatus('offline');
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Fetch live price whenever symbol changes
  useEffect(() => {
    setLivePrice(null);
    setLiveFetching(true);
    let cancelled = false;
    fetchLivePrice(symbol)
      .then(r  => { if (!cancelled) { setLivePrice(r); setLiveFetching(false); } })
      .catch(() => { if (!cancelled) setLiveFetching(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  const selectedStock = stockList.find(s => s.symbol === symbol) || stockList[0];

  const handlePredict = async () => {
    setIsLoading(true);
    setHasPredicted(false);
    setError(null);
    setIsDemoMode(false);
    setHistoryData([]);
    setInvestmentAdvice("");
    setAdviceMeta(null);

    await new Promise(r => setTimeout(r, 900));

    try {
      const pred = await axios.post(`${API_URL}/api/predict`,
        { ticker: symbol, input_days: days, algorithm: "lstm" },
        { timeout: 8000 }
      );
      setCurrentPrice(pred.data.current_price);
      setPredictedPrice(pred.data.predicted_price);

      const analysis = await axios.post(`${API_URL}/api/analyze`,
        { ticker: symbol },
        { timeout: 8000 }
      );
      const aData = analysis.data;
      if (aData.history?.dates) {
        setHistoryData(aData.history.dates.map((date, i) => ({ date, price: aData.history.close[i] })));
      } else if (pred.data.history?.dates) {
        setHistoryData(pred.data.history.dates.map((date, i) => ({ date, price: pred.data.history.close[i] })));
      }
      setInvestmentAdvice(aData.advice ?? aData.recommendation ?? "");
      setAdviceMeta({ change_pct: aData.change_pct ?? pred.data.change_pct, volatility: aData.volatility ?? pred.data.volatility });
      setBackendStatus('online');

    } catch (_) {
      // Backend unavailable — use demo data
      const mock = generateMockData(symbol, days);
      const basePrice = livePrice ? livePrice.price : mock.current_price;
      const trend = (mock.predicted_price - mock.current_price) / mock.current_price;
      const livePredicted = +(basePrice * (1 + trend)).toFixed(2);
      setCurrentPrice(+basePrice.toFixed(2));
      setPredictedPrice(livePredicted);
      setHistoryData(mock.history);
      setInvestmentAdvice(mock.advice);
      setAdviceMeta({ change_pct: mock.change_pct, volatility: mock.volatility });
      setIsDemoMode(true);
      setBackendStatus('offline');
    } finally {
      setIsLoading(false);
      setHasPredicted(true);
    }
  };

  const priceDiff = currentPrice && predictedPrice
    ? ((predictedPrice - currentPrice) / currentPrice) * 100 : null;
  const diffColor = priceDiff == null ? "inherit" : priceDiff >= 0 ? "#22c55e" : "#ef4444";
  const diffArrow = priceDiff == null ? "" : priceDiff >= 0 ? "▲" : "▼";

  const roiProjected = useMemo(() => {
    if (!currentPrice || !predictedPrice) return null;
    return (roiAmount * (predictedPrice / currentPrice)).toFixed(2);
  }, [roiAmount, currentPrice, predictedPrice]);

  const forecastDate = getForecastDate(days);

  return (
    <div className="sp-root">

      {/* ─── Hero header ─── */}
      <div className="sp-hero">
        <div className="sp-hero-glow" />
        <div className="sp-hero-inner">
          <div className="sp-hero-badge">
            <span className="sp-hero-badge-dot" />
            {en ? "Educational Stock Analysis" : "கல்வி பங்கு பகுப்பாய்வு"}
          </div>
          <h1 className="sp-hero-title">
            {en ? <><span className="sp-grad-text">Stock Price</span> Forecast</>
              : <><span className="sp-grad-text">பங்கு விலை</span> கணிப்பு</>}
          </h1>
          <p className="sp-hero-sub">
            {en ? "Explore historical trends and statistical price projections for learning purposes."
              : "கற்றல் நோக்கங்களுக்காக வரலாற்று போக்குகளையும் புள்ளியியல் விலை கணிப்புகளையும் ஆராயுங்கள்."}
          </p>
        </div>
      </div>

      {/* ─── ⚠️ Disclaimer banner ─── */}
      <div className="sp-disclaimer">
        <div className="sp-disclaimer-inner">
          <span className="sp-disclaimer-icon">⚠️</span>
          <div className="sp-disclaimer-text">
            <strong>{en ? "Educational Purpose Only" : "கல்வி நோக்கம் மட்டுமே"}</strong>
            {en
              ? " — The forecasts shown here are statistical estimates for learning and are NOT financial advice. Do not make real investment decisions based on this data. Past performance does not guarantee future results."
              : " — இங்கே காட்டப்படும் கணிப்புகள் கல்வி நோக்கங்களுக்கான புள்ளிவிவர மதிப்பீடுகள் மட்டுமே. இது நிதி ஆலோசனை இல்லை. உண்மையான முதலீட்டு முடிவுகளை இந்த தரவின் அடிப்படையில் எடுக்காதீர்கள்."}
          </div>
        </div>
      </div>

      <div className="sp-body">

        {/* ─── Left: Form Panel ─── */}
        <div className="sp-form-panel">
          <div className="sp-panel-title">
            <span className="sp-panel-icon">🔍</span>
            {en ? "Forecast Parameters" : "கணிப்பு அளவுருக்கள்"}
          </div>

          {/* Market toggle */}
          <div className="sp-field">
            <label className="sp-label">{en ? "Market" : "சந்தை"}</label>
            <div className="sp-market-toggle">
              <button
                className={`sp-market-btn${market === "us" ? " sp-market-btn--active" : ""}`}
                onClick={() => handleMarketChange("us")}>
                {en ? "US Stocks" : "அமெரிக்கா"}
              </button>
              <button
                className={`sp-market-btn${market === "in" ? " sp-market-btn--active" : ""}`}
                onClick={() => handleMarketChange("in")}>
                {en ? "Indian Stocks" : "இந்தியா"}
              </button>
            </div>
          </div>

          {/* Stock selector */}
          <div className="sp-field">
            <label className="sp-label">{en ? "Select Stock" : "பங்கு தேர்வு"}</label>
            <select className="sp-select" value={symbol} onChange={e => setSymbol(e.target.value)} disabled={isLoading}>
              {stockList.map(s => (
                <option key={s.symbol} value={s.symbol}>{s.name} ({s.symbol})</option>
              ))}
            </select>
            {selectedStock && (
              <div className="sp-stock-meta">
                <span className="sp-sector-badge">{selectedStock.sector}</span>
                <span className="sp-stock-sym">{selectedStock.symbol}</span>
              </div>
            )}
            {/* ── Live price chip ── */}
            {liveFetching && (
              <div className="sp-live-chip sp-live-chip--loading">
                <span className="sp-live-spinner" /> {en ? 'Fetching live price…' : 'நேரடி விலை பெறுகிறது…'}
              </div>
            )}
            {!liveFetching && livePrice && (
              <div className="sp-live-chip">
                <span className="sp-live-dot" />
                <strong>₹{livePrice.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                <span style={{ color: livePrice.change >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {livePrice.change >= 0 ? '▲' : '▼'} {Math.abs(livePrice.change).toFixed(2)} ({Math.abs(livePrice.changePct).toFixed(2)}%)
                </span>
                <span className="sp-live-label">{en ? 'Live' : 'நேரடி'}</span>
              </div>
            )}
          </div>

          {/* Forecast horizon */}
          <div className="sp-field">
            <label className="sp-label">{en ? "Forecast Horizon" : "கணிப்பு காலம்"}</label>
            <div className="sp-horizon-grid">
              {HORIZON_OPTIONS.map(h => (
                <button
                  key={h.days}
                  className={`sp-horizon-btn${days === h.days ? " sp-horizon-btn--active" : ""}`}
                  onClick={() => setDays(h.days)}
                  disabled={isLoading}>
                  {en ? h.label_en : h.label_ta}
                </button>
              ))}
            </div>
          </div>

          {/* Forecast dates */}
          <div className="sp-dates-card">
            <div className="sp-date-row">
              <span className="sp-date-icon">📅</span>
              <div>
                <div className="sp-date-label">{en ? "Analysis Date" : "பகுப்பாய்வு தேதி"}</div>
                <div className="sp-date-val">{todayStr()}</div>
              </div>
            </div>
            <div className="sp-date-divider">→</div>
            <div className="sp-date-row">
              <span className="sp-date-icon">🎯</span>
              <div>
                <div className="sp-date-label">{en ? "Forecast Target" : "கணிப்பு இலக்கு"}</div>
                <div className="sp-date-val sp-date-forecast">{forecastDate}</div>
              </div>
            </div>
          </div>

          {/* ── Backend status chip ── */}
          <div className={`sp-backend-status sp-backend-status--${backendStatus}`}>
            <span className="sp-backend-dot" />
            {backendStatus === 'checking'
              ? (en ? 'Checking backend connection…' : 'இணைப்பு சரிபார்க்கிறது…')
              : backendStatus === 'online'
                ? (en ? 'ML Backend: Connected' : 'ML சேவையகம்: இணைக்கப்பட்டது')
                : (en ? 'ML Backend: Offline' : 'ML சேவையகம்: இணைப்பில்லை')}
          </div>

          {/* Run button */}
          <button className="sp-run-btn" onClick={handlePredict} disabled={isLoading}>
            {isLoading ? (
              <><span className="sp-spinner" /> {en ? "Analyzing…" : "கணிக்கப்படுகிறது…"}</>
            ) : (
              <>{en ? "▶  Run Forecast" : "▶ கணிப்பை இயக்கவும்"}</>
            )}
          </button>
        </div>

        {/* ─── Right: Results ─── */}
        <div className="sp-results-panel">

          {/* Skeleton loading */}
          {isLoading && (
            <div className="sp-skeletons">
              <div className="sp-skeleton sp-skeleton--tall" />
              <div className="sp-skeleton sp-skeleton--short" />
              <div className="sp-skeleton sp-skeleton--chart" />
            </div>
          )}

          {/* Empty state */}
          {!hasPredicted && !isLoading && (
            <div className="sp-empty">
              <div className="sp-empty-icon">📊</div>
              <h3 className="sp-empty-title">{en ? "Select a stock to begin" : "பங்கைத் தேர்ந்தெடுக்கவும்"}</h3>
              <p className="sp-empty-sub">
                {en ? "Choose your stock, set the forecast horizon, and click Run Forecast to see analysis."
                  : "பங்கைத் தேர்ந்தெடுத்து, காலத்தை அமைத்து கணிப்பை இயக்கவும்."}
              </p>
              <div className="sp-empty-steps">
                {[en ? "Select Market" : "சந்தை தேர்வு",
                en ? "Pick a Stock" : "பங்கு தேர்வு",
                en ? "Set Horizon" : "காலம் அமைக்கவும்",
                en ? "Run Forecast" : "கணிக்கவும்"].map((s, i) => (
                  <div key={i} className="sp-step">
                    <span className="sp-step-num">{i + 1}</span>
                    <span className="sp-step-label">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {hasPredicted && !isLoading && error && (
            <div className="sp-error">
              <div className="sp-error-icon">⚠️</div>
              <h3>{en ? "Forecast Failed" : "கணிப்பு தோல்வி"}</h3>
              <p>{error}</p>
            </div>
          )}

          {/* Results */}
          {hasPredicted && !isLoading && !error && (
            <>
              {/*
               * ─── Demo Mode notice ───
               * Only rendered when:
               *   1. isDemoMode === true  (last predict call fell back to mock data)
               *   2. backendStatus === 'offline'  (backend is still unreachable)
               * Hidden automatically once the 60-second health-check detects the
               * backend is back online (setIsDemoMode(false) in the health-check effect).
               */}
              {isDemoMode && backendStatus === 'offline' && (
                <div className="sp-demo-notice">
                  <span>🖥️</span>
                  <div>
                    <strong>
                      {en ? 'Demo Mode — Backend Offline' : 'டெமோ பயன்முறை — சேவையகம் இல்லை'}
                    </strong>
                    <span>
                      {en
                        ? ' Showing simulated statistical data. Connect the ML backend server to see live predictions.'
                        : ' சிமுலேட்டட் புள்ளிவிவர தரவு காட்டப்படுகிறது. நேரடி கணிப்புகளுக்கு ML பின்னணி சேவையகத்தை இணைக்கவும்.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Price metrics */}
              <div className="sp-metrics-row">
                <div className="sp-metric sp-metric--current">
                  <div className="sp-metric-label">{en ? "Current Price" : "தற்போதைய விலை"}</div>
                  <div className="sp-metric-val">
                    ₹ {currentPrice != null ? Number(currentPrice).toFixed(2) : "—"}
                  </div>
                  <div className="sp-metric-sub">{en ? "as of today" : "இன்று நிலவரம்"}</div>
                </div>
                <div className="sp-metric-arrow">→</div>
                <div className="sp-metric sp-metric--forecast">
                  <div className="sp-metric-label">{en ? `${days}-Day Forecast` : `${days} நாள் கணிப்பு`}</div>
                  <div className="sp-metric-val" style={{ color: diffColor }}>
                    ₹ {predictedPrice != null ? Number(predictedPrice).toFixed(2) : "—"}
                  </div>
                  {priceDiff != null && (
                    <div className="sp-metric-change" style={{ color: diffColor }}>
                      {diffArrow} {Math.abs(priceDiff).toFixed(2)}%
                      <span className="sp-metric-date">{forecastDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sentiment badge */}
              {priceDiff != null && (
                <div className={`sp-sentiment ${priceDiff >= 0 ? "sp-sentiment--bull" : "sp-sentiment--bear"}`}>
                  <span className="sp-sentiment-icon">{priceDiff >= 0 ? "🐂" : <img src="/assets/bearrr.png" alt="Bearish Outlook" style={{ width: '2.5rem', height: '2.5rem', objectFit: 'contain', verticalAlign: 'middle' }} />}</span>
                  <div>
                    <strong>{priceDiff >= 0 ? (en ? "Bullish Outlook" : "நேர்மறை போக்கு") : (en ? "Bearish Outlook" : "எதிர்மறை போக்கு")}</strong>
                    {investmentAdvice && <p className="sp-sentiment-text">{investmentAdvice}</p>}
                  </div>
                  {adviceMeta && (
                    <div className="sp-advice-pills">
                      <span className="sp-pill">{en ? "Chg" : "மாற்றம்"}: <b style={{ color: adviceMeta.change_pct >= 0 ? "#22c55e" : "#ef4444" }}>{adviceMeta.change_pct >= 0 ? "+" : ""}{adviceMeta.change_pct}%</b></span>
                      <span className="sp-pill">{en ? "Vol" : "ஏற்ற இறக்கம்"}: <b>{adviceMeta.volatility}%</b></span>
                    </div>
                  )}
                </div>
              )}

              {/* ROI Calculator */}
              {currentPrice && predictedPrice && (
                <div className="sp-roi-card">
                  <div className="sp-roi-header">
                    <span>🔮</span>
                    <h4>{en ? "Potential ROI Calculator" : "சாத்தியமான ROI கணக்கீடு"}</h4>
                    <span className="sp-roi-badge">{en ? "Educational only" : "கல்வி மட்டும்"}</span>
                  </div>
                  <div className="sp-roi-body">
                    <div className="sp-roi-field">
                      <label>{en ? "Investment Amount (₹)" : "முதலீட்டுத் தொகை (₹)"}</label>
                      <input
                        type="number" value={roiAmount}
                        onChange={e => setRoiAmount(+e.target.value)}
                        className="sp-roi-input"
                        min={100}
                      />
                    </div>
                    <div className="sp-roi-arrow">→</div>
                    <div className="sp-roi-result">
                      <label>{en ? "Projected Value" : "திட்டமிடப்பட்ட மதிப்பு"}</label>
                      <div className="sp-roi-amount" style={{ color: diffColor }}>
                        ₹ {Number(roiProjected).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </div>
                      <div className="sp-roi-gain" style={{ color: diffColor }}>
                        {priceDiff >= 0 ? "+" : ""}{((roiProjected - roiAmount)).toLocaleString("en-IN", { maximumFractionDigits: 0 })} ({priceDiff?.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Chart */}
              {historyData.length > 0 && (
                <div className="sp-chart-card">
                  <div className="sp-chart-header">
                    <h3>{en ? "📈 Historical Price Trend (Last 60 Days)" : "📈 வரலாற்று விலை போக்கு (கடைசி 60 நாட்கள்)"}</h3>
                    <span className="sp-chart-sym">{symbol}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={historyData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={["dataMin - 5", "dataMax + 5"]} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2.5}
                        fill="url(#spGrad)" dot={false} activeDot={{ r: 5, fill: "#818cf8", strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Bottom disclaimer */}
              <div className="sp-result-disclaimer">
                <span>⚠️</span>
                {en
                  ? "These projections are statistical estimates for educational purposes only and do not constitute financial advice."
                  : "இந்த கணிப்புகள் கல்வி நோக்கங்களுக்கான புள்ளிவிவர மதிப்பீடுகள் மட்டுமே. இது நிதி ஆலோசனை அல்ல."}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
