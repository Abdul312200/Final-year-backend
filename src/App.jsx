import { useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import StockPrediction from "./components/StockPrediction";
import Results from "./components/Results";
import Chatbot from "./components/Chatbot";

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Top Nav ── */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0.75rem 2rem", background: "#fff",
        borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        <Link to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontWeight: 800, fontSize: "1.2rem", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            📈 FinTechIQ
          </span>
        </Link>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <Link to="/" style={{ textDecoration: "none", color: location.pathname === "/" ? "#6366f1" : "#64748b", fontWeight: location.pathname === "/" ? 700 : 500, fontSize: "0.9rem" }}>
            Predict
          </Link>
          <Link to="/results" style={{ textDecoration: "none", color: location.pathname === "/results" ? "#6366f1" : "#64748b", fontWeight: location.pathname === "/results" ? 700 : 500, fontSize: "0.9rem" }}>
            Results
          </Link>
          <button
            onClick={() => setChatOpen(o => !o)}
            style={{
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff",
              border: "none", borderRadius: "20px", padding: "0.4rem 1.1rem",
              cursor: "pointer", fontWeight: 600, fontSize: "0.85rem",
            }}>
            💬 AI Chat
          </button>
        </div>
      </nav>

      {/* ── Page Routes ── */}
      <main>
        <Routes>
          <Route path="/" element={<StockPrediction />} />
          <Route path="/results" element={<Results />} />
          <Route path="*" element={<StockPrediction />} />
        </Routes>
      </main>

      {/* ── Floating Chatbot ── */}
      <Chatbot open={chatOpen} onToggle={() => setChatOpen(o => !o)} />

      {/* ── Chat FAB (when closed) ── */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Open AI Chat"
          style={{
            position: "fixed", bottom: "2rem", right: "2rem", zIndex: 200,
            width: "56px", height: "56px", borderRadius: "50%",
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
            color: "#fff", border: "none", cursor: "pointer",
            fontSize: "1.5rem", boxShadow: "0 4px 20px rgba(99,102,241,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          💬
        </button>
      )}
    </div>
  );
}
