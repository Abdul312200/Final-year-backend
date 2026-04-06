/**
 * Rate Limiter Middleware
 * Prevents 429 errors by limiting requests per user and endpoint
 */

import rateLimit from 'express-rate-limit';

// ─── Global rate limiter ───────────────────────────────────────────
// Limit: 30 requests per 15 minutes across all users
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 30,
  message: '⚠️ Too many requests from this IP. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.SKIP_RATE_LIMIT === 'true',  // dev bypass
});

// ─── Chatbot-specific limiter ───────────────────────────────────────
// Stricter for chatbot: 20 requests per 10 minutes per user
export const chatbotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 20,
  keyGenerator: (req) => req.body?.userId || req.ip,  // per-user limit
  message: '⚠️ Too many chat requests. Please wait a moment before sending another message.',
  skip: (req) => !req.body?.userId,  // only limit authenticated users
});

// ─── Stock prediction limiter ──────────────────────────────────────
// Slightly relaxed for predictions: 15 requests per 5 minutes
export const predictionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: 15,
  keyGenerator: (req) => req.body?.userId || req.ip,
  message: '⚠️ Prediction limit reached. Please wait before requesting another prediction.',
  skip: (req) => !req.body?.userId,
});

// ─── Price API limiter ────────────────────────────────────────────
// Strict for price calls due to yfinance limits: 10 per 2 minutes
export const priceLimiter = rateLimit({
  windowMs: 2 * 60 * 1000,   // 2 minutes
  max: 10,
  keyGenerator: (req) => req.body?.userId || req.ip,
  message: '⚠️ Too many price requests. Try again later.',
  skip: (req) => !req.body?.userId,
});
