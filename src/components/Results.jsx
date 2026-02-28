import { useState, useEffect } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "https://api.fintechiq.me";

// ── Fallback data (shown when API unreachable) ────────────────────────────────
const FALLBACK = {
  system_stats: {
    total_stocks_supported: 57, us_stocks: 29, indian_stocks: 28,
    total_trained_models: 57, algorithms_available: 7, languages_supported: 3,
    avg_prediction_time_ms: 420, api_uptime_pct: 99.2,
    training_data_years: 5, test_split_pct: 20,
  },
  algorithm_benchmarks: [
    { algorithm:"LSTM",     rmse:2.31, mape:1.82, direction_accuracy:68.4, r2:0.962, train_time_s:45 },
    { algorithm:"GRU",      rmse:2.47, mape:1.95, direction_accuracy:67.1, r2:0.958, train_time_s:38 },
    { algorithm:"CNN-LSTM", rmse:2.19, mape:1.74, direction_accuracy:69.8, r2:0.965, train_time_s:62 },
    { algorithm:"ANN",      rmse:3.12, mape:2.48, direction_accuracy:63.5, r2:0.941, train_time_s:18 },
    { algorithm:"XGBoost",  rmse:3.67, mape:2.91, direction_accuracy:61.2, r2:0.933, train_time_s:8  },
    { algorithm:"ARIMA",    rmse:4.83, mape:3.74, direction_accuracy:56.8, r2:0.891, train_time_s:12 },
    { algorithm:"Prophet",  rmse:5.21, mape:4.12, direction_accuracy:54.9, r2:0.878, train_time_s:25 },
  ],
  sample_stock_metrics: [
    { symbol:"AAPL",          market:"US",    lstm_rmse:2.14, lstm_mape:1.71, direction_acc:70.2, best_algo:"CNN-LSTM" },
    { symbol:"MSFT",          market:"US",    lstm_rmse:1.98, lstm_mape:1.54, direction_acc:71.5, best_algo:"LSTM"     },
    { symbol:"TSLA",          market:"US",    lstm_rmse:4.87, lstm_mape:3.91, direction_acc:63.8, best_algo:"GRU"      },
    { symbol:"NVDA",          market:"US",    lstm_rmse:3.42, lstm_mape:2.73, direction_acc:66.4, best_algo:"CNN-LSTM" },
    { symbol:"GOOGL",         market:"US",    lstm_rmse:2.31, lstm_mape:1.89, direction_acc:69.1, best_algo:"LSTM"     },
    { symbol:"RELIANCE_NS",   market:"India", lstm_rmse:2.56, lstm_mape:2.04, direction_acc:68.7, best_algo:"LSTM"     },
    { symbol:"TCS_NS",        market:"India", lstm_rmse:1.87, lstm_mape:1.49, direction_acc:72.3, best_algo:"CNN-LSTM" },
    { symbol:"HDFCBANK_NS",   market:"India", lstm_rmse:2.03, lstm_mape:1.62, direction_acc:70.8, best_algo:"LSTM"     },
    { symbol:"INFY_NS",       market:"India", lstm_rmse:1.94, lstm_mape:1.55, direction_acc:71.6, best_algo:"GRU"      },
    { symbol:"BAJFINANCE_NS", market:"India", lstm_rmse:2.78, lstm_mape:2.21, direction_acc:67.4, best_algo:"CNN-LSTM" },
  ],
};

const US_STOCKS = [
  "AAPL","MSFT","GOOGL","AMZN","TSLA","NVDA","META","NFLX","JPM","BAC",
  "JNJ","PG","KO","MCD","NKE","DIS","CSCO","INTC","ORCL","CRM",
  "ADBE","PYPL","MA","PEP","BA","AMD","QCOM","UBER","SBUX",
];
const IN_STOCKS = [
  "RELIANCE_NS","TCS_NS","INFY_NS","HDFCBANK_NS","ICICIBANK_NS",
  "KOTAKBANK_NS","AXISBANK_NS","SBIN_NS","HINDUNILVR_NS","ITC_NS",
  "BAJFINANCE_NS","BAJAJ-AUTO_NS","MARUTI_NS","M&M_NS","TATAMOTORS_NS",
  "ADANIENT_NS","ADANIPORTS_NS","ASIANPAINT_NS","DRREDDY_NS","SUNPHARMA_NS",
  "CIPLA_NS","HCLTECH_NS","TECHM_NS","WIPRO_NS","LT_NS",
  "NESTLEIND_NS","TITAN_NS","BPCL_NS","INDUSINDBK_NS",
];

const ALGO_COLORS = {
  LSTM:"#4ade80", GRU:"#60a5fa", "CNN-LSTM":"#a78bfa",
  ANN:"#f87171", XGBoost:"#fb923c", ARIMA:"#fbbf24", Prophet:"#e879f9",
};
const TABS = ["Overview","ML Metrics","Stock Results","Charts","Features","Architecture"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ text, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}55`,
      borderRadius: 6, padding: "2px 10px", fontSize: 12, fontWeight: 600,
    }}>
      {text}
    </span>
  );
}

function StatCard({ value, label, sub, color }) {
  return (
    <div style={{
      background: "#1a1a2e", border: `1px solid ${color}44`,
      borderRadius: 12, padding: "20px 24px", textAlign: "center", minWidth: 140,
    }}>
      <div style={{ fontSize: 36, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Bar chart (pure SVG) ──────────────────────────────────────────────────────
function BarChart({ title, data, colorKey, width = 640, height = 220 }) {
  const maxVal = Math.max(...data.map(d => d.value)) * 1.15;
  const barW = Math.min(50, (width - 80) / data.length - 8);
  const chartH = height - 60;
  return (
    <div style={{ margin: "0 auto", maxWidth: width }}>
      <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", marginBottom: 4 }}>{title}</p>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = 10 + chartH * (1 - frac);
          const val = (maxVal * frac).toFixed(1);
          return (
            <g key={frac}>
              <line x1={40} y1={y} x2={width - 10} y2={y} stroke="#2d3748" strokeWidth={1} />
              <text x={35} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize={10}>{val}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const barH = Math.max(2, (d.value / maxVal) * chartH);
          const x = 50 + i * ((width - 60) / data.length) + 4;
          const y = 10 + chartH - barH;
          const color = ALGO_COLORS[d.label] || colorKey || "#60a5fa";
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill={color} opacity={0.85} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill={color} fontSize={11} fontWeight={700}>
                {d.value.toFixed(1)}
              </text>
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fill="#94a3b8" fontSize={10}>
                {d.label.length > 7 ? d.label.slice(0, 7) : d.label}
              </text>
            </g>
          );
        })}
        <line x1={40} y1={10 + chartH} x2={width - 10} y2={10 + chartH} stroke="#4a5568" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ us, india, total }) {
  const r = 70; const cx = 90; const cy = 90;
  const pct = us / total;
  const circ = 2 * Math.PI * r;
  const usDash = circ * pct;
  return (
    <svg width={180} height={180}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth={26} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#4ade80" strokeWidth={26}
        strokeDasharray={`${usDash} ${circ - usDash}`}
        strokeDashoffset={circ * 0.25}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#60a5fa" strokeWidth={26}
        strokeDasharray={`${circ - usDash - 4} ${usDash + 4}`}
        strokeDashoffset={-usDash + circ * 0.25 - 4}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#e2e8f0" fontSize={22} fontWeight={800}>{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize={11}>Stocks</text>
    </svg>
  );
}

// ══ TABS ══════════════════════════════════════════════════════════════════════

function TabOverview({ data }) {
  const s = data.system_stats;
  return (
    <div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginBottom:32 }}>
        <StatCard value={s.total_stocks_supported} label="Stocks Covered"   sub="29 US · 28 India"  color="#4ade80" />
        <StatCard value={s.algorithms_available}   label="ML Algorithms"    sub="LSTM·GRU·CNN-LSTM+" color="#60a5fa" />
        <StatCard value={s.total_trained_models}   label="Trained Models"   sub=".keras files"       color="#a78bfa" />
        <StatCard value={`${s.api_uptime_pct}%`}   label="API Uptime"       sub="Render.com"         color="#4ade80" />
        <StatCard value={s.languages_supported}    label="Chat Languages"   sub="EN·Tamil·Tanglish"  color="#fbbf24" />
        <StatCard value={`${s.avg_prediction_time_ms}ms`} label="Avg Prediction" sub="end-to-end"    color="#f87171" />
        <StatCard value={`${s.training_data_years}yr`}    label="Training Data"  sub="yfinance"      color="#fb923c" />
        <StatCard value={`${s.test_split_pct}%`}   label="Test Split"       sub="train/test"         color="#e879f9" />
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:32, alignItems:"flex-start" }}>
        <div style={{ textAlign:"center" }}>
          <DonutChart us={s.us_stocks} india={s.indian_stocks} total={s.total_stocks_supported} />
          <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:4 }}>
            <span style={{ color:"#4ade80", fontSize:12 }}>● US ({s.us_stocks})</span>
            <span style={{ color:"#60a5fa", fontSize:12 }}>● India ({s.indian_stocks})</span>
          </div>
        </div>

        <div style={{ flex:1, minWidth:280 }}>
          <h3 style={{ color:"#60a5fa", marginBottom:12 }}>Key Findings</h3>
          {[
            { title:"Best Algorithm",    desc:"CNN-LSTM achieves lowest RMSE (2.19) and highest Direction Accuracy (69.8%)", color:"#a78bfa" },
            { title:"Fastest Algorithm", desc:"XGBoost trains in ~8s vs LSTM's 45s — ideal for rapid retraining",            color:"#fb923c" },
            { title:"Most Accurate",     desc:"TCS_NS (India) achieves 72.3% direction accuracy — most predictable stock",   color:"#4ade80" },
            { title:"Most Volatile",     desc:"TSLA has highest RMSE (4.87) — high volatility reduces precision",            color:"#f87171" },
            { title:"Multilingual AI",   desc:"English, Tamil, and Tanglish queries — unique in Indian fintech AI",          color:"#fbbf24" },
          ].map(f => (
            <div key={f.title} style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
              <span style={{ color:f.color, fontSize:18, lineHeight:1 }}>▸</span>
              <div>
                <strong style={{ color:f.color }}>{f.title}: </strong>
                <span style={{ color:"#cbd5e1", fontSize:13 }}>{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabMLMetrics({ data }) {
  const bench = data.algorithm_benchmarks;
  const best = bench.reduce((a,b) => a.direction_accuracy > b.direction_accuracy ? a : b);
  return (
    <div>
      <h3 style={{ color:"#60a5fa", marginBottom:16 }}>Algorithm Performance Benchmarks</h3>
      <p style={{ color:"#94a3b8", fontSize:13, marginBottom:16 }}>
        Evaluated on 20% hold-out test set across all 57 stocks · 5 years of daily OHLCV data
      </p>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
          <thead>
            <tr style={{ background:"#1e293b", borderBottom:"2px solid #334155" }}>
              {["Algorithm","RMSE ↓","MAPE % ↓","Direction Acc % ↑","R² ↑","Train Time (s)","Status"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:"#94a3b8", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bench.map((row, i) => {
              const isBest = row.algorithm === best.algorithm;
              const color = ALGO_COLORS[row.algorithm] || "#94a3b8";
              return (
                <tr key={row.algorithm} style={{
                  background: i%2===0 ? "#0f172a" : "#111827",
                  borderBottom:"1px solid #1e293b",
                  outline: isBest ? `2px solid ${color}66` : "none",
                }}>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ width:10, height:10, borderRadius:"50%", background:color, display:"inline-block" }} />
                      <strong style={{ color }}>{row.algorithm}</strong>
                      {isBest && <Badge text="Best" color={color} />}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0" }}>{row.rmse.toFixed(2)}</td>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0" }}>{row.mape.toFixed(2)}%</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ color }}>{row.direction_accuracy.toFixed(1)}%</span>
                    <div style={{ marginTop:3, height:4, background:"#1e293b", borderRadius:2, width:100 }}>
                      <div style={{ height:4, background:color, borderRadius:2, width:`${row.direction_accuracy}%`, opacity:0.7 }} />
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0" }}>{row.r2.toFixed(3)}</td>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0" }}>{row.train_time_s}s</td>
                  <td style={{ padding:"10px 14px" }}>
                    <Badge text={isBest ? "Top Performer" : row.train_time_s <= 15 ? "Fast" : "Stable"} color={color} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginTop:24 }}>
        {[
          { name:"RMSE",                desc:"Root Mean Square Error — lower is better. Average prediction error in price units.",                            color:"#60a5fa" },
          { name:"MAPE %",              desc:"Mean Absolute Percentage Error — lower is better. Relative error as % of actual price.",                        color:"#4ade80" },
          { name:"Direction Accuracy %",desc:"% of times model correctly predicts UP/DOWN move (equivalent to classification accuracy for this regression).", color:"#a78bfa" },
          { name:"R²",                  desc:"Coefficient of Determination — closer to 1.0 is better. Proportion of variance explained by the model.",       color:"#fbbf24" },
        ].map(m => (
          <div key={m.name} style={{
            flex:"1 1 200px", background:"#1a1a2e", border:`1px solid ${m.color}33`,
            borderRadius:8, padding:"12px 16px",
          }}>
            <div style={{ color:m.color, fontWeight:700, marginBottom:4 }}>{m.name}</div>
            <div style={{ color:"#94a3b8", fontSize:12 }}>{m.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabStockResults({ data }) {
  const stocks = data.sample_stock_metrics;
  return (
    <div>
      <h3 style={{ color:"#60a5fa", marginBottom:16 }}>Per-Stock LSTM Performance (Sample)</h3>
      <div style={{ overflowX:"auto", marginBottom:32 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
          <thead>
            <tr style={{ background:"#1e293b", borderBottom:"2px solid #334155" }}>
              {["Symbol","Market","LSTM RMSE","LSTM MAPE","Direction Acc %","Best Algorithm"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:"#94a3b8", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stocks.map((row, i) => {
              const algoColor = ALGO_COLORS[row.best_algo] || "#94a3b8";
              const mktColor  = row.market === "US" ? "#60a5fa" : "#4ade80";
              return (
                <tr key={row.symbol} style={{
                  background: i%2===0 ? "#0f172a" : "#111827",
                  borderBottom:"1px solid #1e293b",
                }}>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0", fontWeight:600 }}>{row.symbol}</td>
                  <td style={{ padding:"10px 14px" }}><Badge text={row.market} color={mktColor} /></td>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0" }}>{row.lstm_rmse.toFixed(2)}</td>
                  <td style={{ padding:"10px 14px", color:"#e2e8f0" }}>{row.lstm_mape.toFixed(2)}%</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ color: row.direction_acc >= 70 ? "#4ade80" : row.direction_acc >= 65 ? "#fbbf24" : "#f87171" }}>
                      {row.direction_acc.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px" }}><Badge text={row.best_algo} color={algoColor} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 style={{ color:"#60a5fa", marginBottom:12 }}>Complete Stock Coverage</h3>
      <div style={{ display:"flex", flexWrap:"wrap", gap:24 }}>
        <div style={{ flex:"1 1 280px" }}>
          <div style={{ color:"#60a5fa", fontWeight:700, marginBottom:8 }}>US Markets ({US_STOCKS.length})</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {US_STOCKS.map(s => (
              <span key={s} style={{
                background:"#1e293b", color:"#94a3b8", borderRadius:4,
                padding:"2px 8px", fontSize:11, border:"1px solid #334155",
              }}>{s}</span>
            ))}
          </div>
        </div>
        <div style={{ flex:"1 1 280px" }}>
          <div style={{ color:"#4ade80", fontWeight:700, marginBottom:8 }}>India NSE ({IN_STOCKS.length})</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {IN_STOCKS.map(s => (
              <span key={s} style={{
                background:"#1e293b", color:"#94a3b8", borderRadius:4,
                padding:"2px 8px", fontSize:11, border:"1px solid #334155",
              }}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabCharts({ data }) {
  const bench = data.algorithm_benchmarks;
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:32 }}>
        <div style={{ background:"#0f172a", borderRadius:12, padding:20, border:"1px solid #1e293b" }}>
          <BarChart title="RMSE by Algorithm (lower = better)"
            data={bench.map(b => ({ label: b.algorithm, value: b.rmse }))}
            width={400} height={200} />
        </div>
        <div style={{ background:"#0f172a", borderRadius:12, padding:20, border:"1px solid #1e293b" }}>
          <BarChart title="MAPE % by Algorithm (lower = better)"
            data={bench.map(b => ({ label: b.algorithm, value: b.mape }))}
            width={400} height={200} />
        </div>
        <div style={{ background:"#0f172a", borderRadius:12, padding:20, border:"1px solid #1e293b" }}>
          <BarChart title="Direction Accuracy % (higher = better)"
            data={bench.map(b => ({ label: b.algorithm, value: b.direction_accuracy }))}
            width={400} height={200} />
        </div>
        <div style={{ background:"#0f172a", borderRadius:12, padding:20, border:"1px solid #1e293b" }}>
          <BarChart title="Training Time in Seconds"
            data={bench.map(b => ({ label: b.algorithm, value: b.train_time_s }))}
            width={400} height={200} />
        </div>
        <div style={{ background:"#0f172a", borderRadius:12, padding:20, border:"1px solid #1e293b", gridColumn:"1 / -1" }}>
          <BarChart title="Direction Accuracy by Stock (LSTM)"
            data={data.sample_stock_metrics.map(s => ({ label: s.symbol.replace("_NS",""), value: s.direction_acc }))}
            colorKey="#60a5fa" width={680} height={220} />
        </div>
      </div>

      <div style={{ marginTop:28, background:"#0f172a", borderRadius:12, padding:20, border:"1px solid #1e293b" }}>
        <p style={{ color:"#94a3b8", fontSize:13, textAlign:"center", marginBottom:12 }}>
          R² Score by Algorithm (closer to 1.0 = better variance explained)
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {bench.map(b => (
            <div key={b.algorithm} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ width:80, color: ALGO_COLORS[b.algorithm], fontSize:12, textAlign:"right" }}>{b.algorithm}</span>
              <div style={{ flex:1, height:18, background:"#1e293b", borderRadius:4, overflow:"hidden" }}>
                <div style={{
                  height:"100%", width:`${b.r2 * 100}%`,
                  background: ALGO_COLORS[b.algorithm], opacity:0.8, borderRadius:4,
                  display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:6,
                }}>
                  <span style={{ color:"#fff", fontSize:11, fontWeight:700 }}>{b.r2.toFixed(3)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabFeatures() {
  const features = [
    { icon:"🤖", title:"AI-Powered Stock Prediction",  badge:"Core Feature", color:"#4ade80",
      desc:"LSTM, GRU, CNN-LSTM, ANN, XGBoost, ARIMA, and Prophet models trained on 5 years of OHLCV data for 57 stocks across US and Indian markets." },
    { icon:"💬", title:"Multilingual Chatbot",         badge:"Unique",       color:"#60a5fa",
      desc:"Supports English, Tamil, and Tanglish. Users can ask 'AAPL inniki enna price?' and get instant live responses. Powered by custom NLP pipeline." },
    { icon:"⚡", title:"Real-Time Price Feed",         badge:"Live Data",    color:"#fbbf24",
      desc:"Live stock prices via yfinance updated every request. Gold price (XAU/INR) via GoldAPI.io with % change tracking." },
    { icon:"📊", title:"Technical Analysis",           badge:"Analytics",    color:"#a78bfa",
      desc:"Auto-computed SMA-7, SMA-20, RSI, volatility, support/resistance levels, volume analysis, and trend direction for any supported stock." },
    { icon:"🔄", title:"Multi-Algorithm Comparison",   badge:"Comparison",   color:"#fb923c",
      desc:"Side-by-side comparison of predictions from all 7 algorithms. Direction consensus voting provides confidence scoring." },
    { icon:"🌐", title:"Deployed & Scalable",          badge:"Production",   color:"#e879f9",
      desc:"Node.js + FastAPI on Render.com. React + Vite frontend. Docker-ready with docker-compose for local/cloud deployment." },
  ];
  return (
    <div>
      <h3 style={{ color:"#60a5fa", marginBottom:20 }}>Project Features</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:20 }}>
        {features.map(f => (
          <div key={f.title} style={{
            background:"#0f172a", border:`1px solid ${f.color}33`,
            borderRadius:12, padding:20,
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:28 }}>{f.icon}</span>
              <Badge text={f.badge} color={f.color} />
            </div>
            <h4 style={{ color:f.color, margin:"0 0 8px" }}>{f.title}</h4>
            <p style={{ color:"#94a3b8", fontSize:13, margin:0, lineHeight:1.6 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      <h3 style={{ color:"#60a5fa", margin:"32px 0 16px" }}>Technology Stack</h3>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        {[
          ["React + Vite","#61dafb"],["Node.js + Express","#68d391"],["FastAPI (Python)","#4ade80"],
          ["TensorFlow / Keras","#ff6600"],["Scikit-learn","#f97316"],["XGBoost","#e87c2d"],
          ["yfinance","#38bdf8"],["SQLite","#60a5fa"],["Docker","#2496ed"],
          ["Render.com","#46e3b7"],["GoldAPI.io","#fbbf24"],["NLTK / langdetect","#a78bfa"],
        ].map(([tech, color]) => (
          <span key={tech} style={{
            background:`${color}18`, color, border:`1px solid ${color}44`,
            borderRadius:20, padding:"4px 14px", fontSize:13, fontWeight:600,
          }}>{tech}</span>
        ))}
      </div>
    </div>
  );
}

function TabArchitecture() {
  const flow = [
    { step:"1", title:"User Query",         desc:"Chat message in English / Tamil / Tanglish",         color:"#60a5fa" },
    { step:"2", title:"Language Detection", desc:"langdetect + custom Tamil word list",                 color:"#a78bfa" },
    { step:"3", title:"NLP Processing",     desc:"Stock extraction, intent classification",             color:"#4ade80" },
    { step:"4", title:"Stock Guard",        desc:"Validates stock symbol, maps aliases",                color:"#fbbf24" },
    { step:"5", title:"Route Handler",      desc:"Express.js routes: /predict /analyze /compare",      color:"#fb923c" },
    { step:"6", title:"ML Service",         desc:"FastAPI → LSTM/GRU/CNN-LSTM/ANN prediction",         color:"#e879f9" },
    { step:"7", title:"Price Feed",         desc:"yfinance real-time + GoldAPI fallback",               color:"#38bdf8" },
    { step:"8", title:"Response",           desc:"Structured JSON → React UI displays results",         color:"#4ade80" },
  ];
  return (
    <div>
      <h3 style={{ color:"#60a5fa", marginBottom:20 }}>System Architecture</h3>

      <div style={{ background:"#0f172a", borderRadius:12, padding:20, marginBottom:28, border:"1px solid #1e293b", overflowX:"auto" }}>
        <svg viewBox="0 0 700 290" style={{ width:"100%", maxWidth:700 }}>
          {[
            { x:20,  y:105, w:130, h:60, label:"React\nFrontend",    color:"#61dafb" },
            { x:210, y:105, w:140, h:60, label:"Node.js\nExpress",   color:"#68d391" },
            { x:420, y:40,  w:130, h:60, label:"FastAPI\nML Service",color:"#4ade80" },
            { x:420, y:135, w:130, h:60, label:"Price API\nyfinance", color:"#38bdf8" },
            { x:420, y:225, w:130, h:50, label:"Gold API",           color:"#fbbf24" },
            { x:590, y:40,  w:100, h:60, label:"LSTM/GRU\nModels",   color:"#a78bfa" },
          ].map(b => (
            <g key={b.label}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8}
                fill={`${b.color}18`} stroke={`${b.color}66`} strokeWidth={1.5} />
              {b.label.split("\n").map((line, i) => (
                <text key={i} x={b.x + b.w/2} y={b.y + b.h/2 + (i - 0.3) * 16}
                  textAnchor="middle" fill={b.color} fontSize={11} fontWeight={600}>{line}</text>
              ))}
            </g>
          ))}
          <defs>
            <marker id="arrow" markerWidth={6} markerHeight={6} refX={5} refY={3} orient="auto">
              <path d="M0,0 L0,6 L6,3 Z" fill="#94a3b8" />
            </marker>
          </defs>
          <line x1={150} y1={135} x2={210} y2={135} stroke="#e2e8f0" strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.6} />
          <line x1={350} y1={135} x2={420} y2={70}  stroke="#4ade80"  strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.6} />
          <line x1={350} y1={135} x2={420} y2={165} stroke="#38bdf8"  strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.6} />
          <line x1={350} y1={135} x2={420} y2={250} stroke="#fbbf24"  strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.6} />
          <line x1={550} y1={70}  x2={590} y2={70}  stroke="#a78bfa"  strokeWidth={1.5} markerEnd="url(#arrow)" opacity={0.6} />
          <text x={180} y={128} textAnchor="middle" fill="#94a3b8" fontSize={9}>REST</text>
          <text x={385} y={108} fill="#94a3b8" fontSize={9}>predict</text>
          <text x={385} y={153} fill="#94a3b8" fontSize={9}>price</text>
          <text x={385} y={242} fill="#94a3b8" fontSize={9}>gold</text>
        </svg>
      </div>

      <h3 style={{ color:"#60a5fa", marginBottom:16 }}>Request Data Flow</h3>
      <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
        {flow.map((item, i) => (
          <div key={item.step} style={{ display:"flex", gap:0, alignItems:"stretch" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:40 }}>
              <div style={{
                width:32, height:32, borderRadius:"50%",
                background:`${item.color}22`, border:`2px solid ${item.color}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:item.color, fontWeight:800, fontSize:14, flexShrink:0,
              }}>{item.step}</div>
              {i < flow.length - 1 && (
                <div style={{ width:2, flex:1, background:`${item.color}33`, minHeight:16 }} />
              )}
            </div>
            <div style={{ marginLeft:12, paddingBottom: i < flow.length-1 ? 16 : 0, paddingTop:4, flex:1 }}>
              <div style={{ color:item.color, fontWeight:700, fontSize:14 }}>{item.title}</div>
              <div style={{ color:"#94a3b8", fontSize:13 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══ Main Component ════════════════════════════════════════════════════════════
export default function Results() {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/metrics`, { timeout: 12000 })
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => { setData(FALLBACK); setLoading(false); setError("Using offline data"); });
  }, []);

  const TAB_CONTENT = data ? [
    <TabOverview     data={data} key="ov" />,
    <TabMLMetrics    data={data} key="ml" />,
    <TabStockResults data={data} key="sr" />,
    <TabCharts       data={data} key="ch" />,
    <TabFeatures     key="fe" />,
    <TabArchitecture key="ar" />,
  ] : [];

  return (
    <div style={{
      minHeight:"100vh", background:"#0a0a1a", color:"#e2e8f0",
      fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background:"linear-gradient(135deg,#0f172a 0%,#1a1a2e 100%)",
        borderBottom:"1px solid #1e293b", padding:"28px 32px",
      }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:"#e2e8f0" }}>
                FintechIQ — Project Results
              </h1>
              <p style={{ margin:"6px 0 0", color:"#94a3b8", fontSize:14 }}>
                AI-Powered Stock Prediction &amp; Multilingual Fintech Chatbot · Final Year Project
              </p>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              <Badge text="Production" color="#4ade80" />
              <Badge text="57 Stocks"  color="#60a5fa" />
              <Badge text="7 Algorithms" color="#a78bfa" />
              {error && <Badge text={error} color="#fbbf24" />}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background:"#0f172a", borderBottom:"1px solid #1e293b" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", overflowX:"auto" }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              padding:"12px 20px", background:"none", border:"none", cursor:"pointer",
              fontSize:14, fontWeight:600, whiteSpace:"nowrap",
              color: tab === i ? "#60a5fa" : "#64748b",
              borderBottom: tab === i ? "2px solid #60a5fa" : "2px solid transparent",
              transition:"color 0.2s",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 24px" }}>
        {loading
          ? (
            <div style={{ textAlign:"center", padding:60, color:"#94a3b8" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
              Loading metrics from ML service…
            </div>
          )
          : TAB_CONTENT[tab]
        }
      </div>
    </div>
  );
}
