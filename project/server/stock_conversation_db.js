/**
 * Stock Conversation Database
 * Stores chat history + pre-built stock FAQ responses
 * Powers contextual memory and templated answers
 */

import { Sequelize, DataTypes, Op } from 'sequelize';

// ─── Database Connection ────────────────────────────────────────────────────────
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './stock_conversations.sqlite',
  logging: false,
});

// ─── ChatMessage Model ──────────────────────────────────────────────────────────
const ChatMessage = sequelize.define('ChatMessage', {
  userId:      { type: DataTypes.STRING, defaultValue: 'guest' },
  role:        { type: DataTypes.ENUM('user', 'bot'), allowNull: false },
  message:     { type: DataTypes.TEXT, allowNull: false },
  language:    { type: DataTypes.STRING, defaultValue: 'en' },
  intent:      { type: DataTypes.STRING },
  stockSymbol: { type: DataTypes.STRING },
  sentiment:   { type: DataTypes.STRING },
  isLLM:       { type: DataTypes.BOOLEAN, defaultValue: false },
}, { timestamps: true });

// ─── StockFAQ Model ─────────────────────────────────────────────────────────────
const StockFAQ = sequelize.define('StockFAQ', {
  question:    { type: DataTypes.TEXT },
  answer_en:   { type: DataTypes.TEXT },
  answer_ta:   { type: DataTypes.TEXT },
  category:    { type: DataTypes.STRING },
  tags:        { type: DataTypes.TEXT }, // comma-separated
}, { timestamps: false });

// ─── Initialize DB ──────────────────────────────────────────────────────────────
async function initConversationDB() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await seedFAQs();
    console.log('✅ Stock Conversation DB ready');
  } catch (err) {
    console.error('❌ Conversation DB error:', err.message);
  }
}

// ─── FAQ Seed Data ──────────────────────────────────────────────────────────────
const FAQ_DATA = [
  // Basics
  {
    question: 'What is a stock?',
    answer_en: '📖 A *stock* (or share) is a unit of ownership in a company.\nWhen you buy stocks, you become a partial owner and may benefit from:\n• Price appreciation (stock price going up)\n• Dividends (company profits shared with shareholders)\n\nStocks are traded on exchanges like NSE, BSE (India) or NYSE, NASDAQ (US).',
    answer_ta: '📖 *பங்கு* என்பது ஒரு நிறுவனத்தின் உரிமையின் ஒரு அலகு ஆகும்.\nபங்கு வாங்கும்போது நீங்கள் நிறுவனத்தின் பகுதி உரிமையாளராகிறீர்கள்.\n• விலை உயர்வால் லாபம் பெறலாம்\n• டிவிடெண்ட் (லாப பங்கு) பெறலாம்\n\nபங்குகள் NSE, BSE (இந்தியா) அல்லது NYSE, NASDAQ (அமெரிக்கா) போன்ற பங்குச்சந்தையில் வர்த்தகம் செய்யப்படுகின்றன.',
    category: 'basics',
    tags: 'stock,share,ownership,basics',
  },
  {
    question: 'What is NSE and BSE?',
    answer_en: '🏦 *NSE* (National Stock Exchange) and *BSE* (Bombay Stock Exchange) are India\'s two primary stock exchanges.\n\n• *NSE* — Nifty 50 index, ~1800+ companies\n• *BSE* — Sensex index, ~5500+ companies\n\nBoth are regulated by SEBI (Securities and Exchange Board of India).',
    answer_ta: '🏦 *NSE* (தேசிய பங்குச்சந்தை) மற்றும் *BSE* (பம்பாய் பங்குச்சந்தை) இந்தியாவின் இரண்டு முக்கிய பங்குச்சந்தைகள்.\n\n• *NSE* — நிஃப்டி 50 குறியீடு, ~1800+ நிறுவனங்கள்\n• *BSE* — சென்செக்ஸ் குறியீடு, ~5500+ நிறுவனங்கள்\n\nஇரண்டும் SEBI (பத்திரங்கள் மற்றும் பரிமாற்ற வாரியம்) ஆல் ஒழுங்குபடுத்தப்படுகின்றன.',
    category: 'basics',
    tags: 'nse,bse,exchange,india,nifty,sensex',
  },
  {
    question: 'What is LSTM in stock prediction?',
    answer_en: '🤖 *LSTM* (Long Short-Term Memory) is a type of neural network used for stock prediction.\n\nIt excels at:\n• Remembering long-term patterns in price data\n• Capturing seasonal trends\n• Sequence-based time series forecasting\n\nIn FinTechIQ, LSTM analyzes 60 days of historical price data to predict future prices.\n\nTry: *"predict AAPL using LSTM"*',
    answer_ta: '🤖 *LSTM* (நீண்ட குறுகிய கால நினைவகம்) என்பது பங்கு கணிப்புக்கு பயன்படுத்தப்படும் ஒரு வகை நரம்பியல் நெட்வொர்க்.\n\nசிறப்புகள்:\n• விலை தரவில் நீண்டகால வடிவங்களை நினைவில் வைத்திருக்கும்\n• பருவகால போக்குகளை கண்டறியும்\n• வரிசை அடிப்படையிலான நேர தொடர் கணிப்பு\n\nமுயற்சி: *"AAPL LSTM முன்னறிவிப்பு"*',
    category: 'ml',
    tags: 'lstm,model,prediction,neural network,ai',
  },
  {
    question: 'How to read RSI?',
    answer_en: '📊 *RSI* (Relative Strength Index) measures price momentum (0–100):\n\n• **RSI > 70** → Overbought (may fall soon, possibly SELL)\n• **RSI < 30** → Oversold (may rise soon, possibly BUY)\n• **RSI 40-60** → Neutral zone\n\nRSI is a lagging indicator — always confirm with other indicators like MACD, Bollinger Bands.',
    answer_ta: '📊 *RSI* (சார்பு ஆற்றல் குறியீடு) விலை வேகத்தை அளவிடுகிறது (0–100):\n\n• **RSI > 70** → அதிக வாங்கல் (விரைவில் விழலாம், SELL பரிசீலிக்கவும்)\n• **RSI < 30** → அதிக விற்பனை (விரைவில் உயரலாம், BUY பரிசீலிக்கவும்)\n• **RSI 40-60** → நடுநிலை\n\nRSI ஒரு தாமதமான குறியீடு — MACD, Bollinger பட்டைகளுடன் உறுதிப்படுத்தவும்.',
    category: 'technical',
    tags: 'rsi,technical analysis,indicator,buy,sell',
  },
  {
    question: 'What is PE ratio?',
    answer_en: '💹 *P/E Ratio* (Price-to-Earnings) shows how much investors pay per ₹1 of earnings:\n\n**Formula:** P/E = Stock Price ÷ Earnings Per Share (EPS)\n\n• **Low P/E (<15)** → Potentially undervalued (cheap)\n• **High P/E (>30)** → Potentially overvalued (expensive)\n• Compare P/E within the same industry\n\nExample: Nifty 50 average P/E is ~20–22.',
    answer_ta: '💹 *P/E விகிதம்* (விலை-வருவாய்) முதலீட்டாளர்கள் ₹1 வருவாய்க்கு எவ்வளவு செலுத்துகிறார்கள் என்பதைக் காட்டுகிறது:\n\n**சூத்திரம்:** P/E = பங்கு விலை ÷ பங்குக்கான வருவாய் (EPS)\n\n• **குறைந்த P/E (<15)** → குறைவாக மதிப்பிடப்பட்டிருக்கலாம்\n• **அதிக P/E (>30)** → அதிகமாக மதிப்பிடப்பட்டிருக்கலாம்\n• ஒரே தொழில்துறையில் P/E ஐ ஒப்பிடவும்',
    category: 'fundamental',
    tags: 'pe ratio,valuation,fundamental,eps',
  },
  {
    question: 'What is SIP?',
    answer_en: '💰 *SIP* (Systematic Investment Plan) is a disciplined investment method:\n\n• Invest a fixed amount every month (e.g., ₹500/month)\n• Automatically buys units at current NAV\n• Benefits: Rupee cost averaging, compounding\n• Reduces risk of timing the market\n\nBest for: Long-term wealth building (5–10+ years)\n\nExample SIPs: Nifty 50 Index Fund, HDFC Flexi Cap Fund',
    answer_ta: '💰 *SIP* (முறையான முதலீட்டு திட்டம்) ஒரு ஒழுக்கமான முதலீட்டு முறை:\n\n• ஒவ்வொரு மாதமும் நிர்ணயிக்கப்பட்ட தொகை முதலீடு (எ.கா ₹500/மாதம்)\n• நடப்பு NAV இல் தானாக யூனிட்கள் வாங்கப்படும்\n• நன்மைகள்: ரூபாய் செலவு சராசரி, கூட்டு வட்டி\n• சந்தை நேரத்தை கணிக்கும் அபாயத்தை குறைக்கிறது',
    category: 'investment',
    tags: 'sip,mutual fund,investment,monthly',
  },
  {
    question: 'What is a bull and bear market?',
    answer_en: '🐂🐻 *Bull vs Bear Market:*\n\n🐂 **Bull Market:**\n• Prices rising 20%+ from recent lows\n• Investor confidence is high\n• Economy growing\n• Good time to BUY and HOLD\n\n🐻 **Bear Market:**\n• Prices falling 20%+ from recent highs\n• Investor fear/pessimism\n• Economic slowdown\n• Defensive strategies needed',
    answer_ta: '🐂🐻 *Bull vs Bear சந்தை:*\n\n🐂 **Bull சந்தை:**\n• விலைகள் 20%+ உயர்கின்றன\n• முதலீட்டாளர் நம்பிக்கை அதிகம்\n• பொருளாதாரம் வளர்கிறது\n• வாங்க மற்றும் வைத்திருக்க நல்ல நேரம்\n\n🐻 **Bear சந்தை:**\n• விலைகள் 20%+ குறைகின்றன\n• முதலீட்டாளர் பயம்/நம்பிக்கையின்மை\n• பொருளாதார மந்தநிலை',
    category: 'basics',
    tags: 'bull,bear,market,trend',
  },
  {
    question: 'How to start investing in stocks?',
    answer_en: '🚀 *Steps to Start Investing in Indian Stocks:*\n\n1️⃣ **Open a Demat + Trading Account** (Zerodha, Groww, Upstox)\n2️⃣ **Complete KYC** (Aadhaar + PAN)\n3️⃣ **Link your bank account**\n4️⃣ **Start with index funds** (Nifty 50) if new\n5️⃣ **Research stocks** — Use our prediction & analysis tools!\n6️⃣ **Diversify** across sectors\n7️⃣ **Never invest borrowed money**\n\n💡 Use FinTechIQ to analyze stocks before investing!',
    answer_ta: '🚀 *இந்திய பங்குகளில் முதலீடு தொடங்க படிகள்:*\n\n1️⃣ **டீமேட் + வர்த்தக கணக்கு திறக்கவும்** (Zerodha, Groww, Upstox)\n2️⃣ **KYC முடித்துக்கொள்ளுங்கள்** (ஆதார் + PAN)\n3️⃣ **வங்கி கணக்கை இணைக்கவும்**\n4️⃣ **புதியவர்கள்: Nifty 50 Index Fund இல் தொடங்கவும்**\n5️⃣ **ஆராய்ச்சி** — FinTechIQ கணிப்பு & பகுப்பாய்வு கருவிகளை பயன்படுத்துங்கள்!\n6️⃣ **பல துறைகளில் பரவலாக முதலீடு செய்யுங்கள்**',
    category: 'investment',
    tags: 'beginner,how to invest,demat,zerodha,groww',
  },
  {
    question: 'What is MACD?',
    answer_en: '📈 *MACD* (Moving Average Convergence Divergence) is a trend-following indicator:\n\n• Uses 12-day EMA and 26-day EMA\n• **MACD crosses above signal line** → Bullish (BUY signal)\n• **MACD crosses below signal line** → Bearish (SELL signal)\n• **Histogram** shows strength of trend\n\nBest used alongside RSI for confirmation.',
    answer_ta: '📈 *MACD* சராசரி ஒன்றிணைவு வேறுபாடு ஒரு போக்கு குறியீடு:\n\n• 12-நாள் EMA மற்றும் 26-நாள் EMA பயன்படுத்துகிறது\n• **MACD சிக்னல் கோட்டை கடக்கும்போது** → கரடி (BUY சமிக்ஞை)\n• **MACD கீழே செல்லும்போது** → கீழிறங்கல் (SELL சமிக்ஞை)\n• **ஹிஸ்டோகிராம்** போக்கின் வலிமையைக் காட்டுகிறது',
    category: 'technical',
    tags: 'macd,ema,indicator,technical analysis',
  },
  {
    question: 'What is market capitalization?',
    answer_en: '💰 *Market Cap* = Stock Price × Total Shares Outstanding\n\nCategories:\n• **Large Cap** (>₹20,000 Cr) — Stable companies (TCS, Reliance, HDFC)\n• **Mid Cap** (₹5,000–20,000 Cr) — Growth potential + moderate risk\n• **Small Cap** (<₹5,000 Cr) — High growth potential + high risk\n\n💡 Large cap stocks are generally safer for beginners.',
    answer_ta: '💰 *மார்க்கெட் கேப்* = பங்கு விலை × மொத்த பங்குகள்\n\nவகைகள்:\n• **பெரிய கேப்** (>₹20,000 கோடி) — நிலையான நிறுவனங்கள் (TCS, Reliance)\n• **நடுத்தர கேப்** (₹5,000–20,000 கோடி) — வளர்ச்சி சாத்தியம் + மிதமான ஆபத்து\n• **சிறிய கேப்** (<₹5,000 கோடி) — அதிக வளர்ச்சி + அதிக ஆபத்து',
    category: 'basics',
    tags: 'market cap,large cap,mid cap,small cap,valuation',
  },
];

async function seedFAQs() {
  const count = await StockFAQ.count();
  if (count === 0) {
    await StockFAQ.bulkCreate(FAQ_DATA);
    console.log(`📚 Seeded ${FAQ_DATA.length} FAQs into conversation DB`);
  }
}

// ─── Chat History Functions ─────────────────────────────────────────────────────

async function saveMessage({ userId, role, message, language, intent, stockSymbol, sentiment, isLLM }) {
  return ChatMessage.create({ userId, role, message, language, intent, stockSymbol, sentiment, isLLM: isLLM || false });
}

async function getConversationHistory(userId, limit = 10) {
  return ChatMessage.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
  }).then(rows => rows.reverse()); // Chronological order
}

async function clearHistory(userId) {
  return ChatMessage.destroy({ where: { userId } });
}

// ─── FAQ Search ─────────────────────────────────────────────────────────────────

async function searchFAQ(query, lang = 'en') {
  const lower = query.toLowerCase();
  const queryWords = lower.split(/\s+/).filter(w => w.length > 2);
  const faqs = await StockFAQ.findAll();

  // Score each FAQ with smarter matching
  let bestFAQ = null;
  let bestScore = 0;

  for (const faq of faqs) {
    const tags = (faq.tags || '').split(',').map(t => t.trim().toLowerCase());
    const questionLower = (faq.question || '').toLowerCase();
    const questionWords = questionLower.split(/\s+/);

    let score = 0;

    // Multi-word tag exact match — highest weight (avoids short generic tags polluting)
    for (const tag of tags) {
      if (tag.length <= 3) continue; // skip very short tags like "ai", "pe"
      if (lower.includes(tag)) {
        // Multi-word tags score more to prevent single short-word false matches
        score += tag.includes(' ') ? 6 : 4;
      }
    }

    // Question substring match — strong signal
    for (const word of questionWords) {
      if (word.length > 3 && lower.includes(word)) score += 2;
    }

    // Query word matches question — ensure query words appear in the FAQ question
    let queryMatchCount = 0;
    for (const qw of queryWords) {
      if (qw.length > 3 && questionLower.includes(qw)) queryMatchCount++;
    }
    score += queryMatchCount * 3;

    // Penalise if the FAQ question is generic (like "What is a stock?") for specific queries
    // by requiring at least one key query term to appear in question or tags
    const specificKeyInQueryAndFAQ = queryWords.some(qw =>
      qw.length > 3 && (questionLower.includes(qw) || tags.some(t => t.includes(qw)))
    );
    if (!specificKeyInQueryAndFAQ) score = Math.min(score, 2); // cap generic scores

    if (score > bestScore) {
      bestScore = score;
      bestFAQ = faq;
    }
  }

  // Require a meaningful score — raised threshold avoids random poor matches
  if (bestFAQ && bestScore >= 5) {
    return {
      found: true,
      answer: lang === 'ta' ? bestFAQ.answer_ta : bestFAQ.answer_en,
      question: bestFAQ.question,
      category: bestFAQ.category,
    };
  }

  return { found: false };
}

// ─── Conversation Context Builder (for LLM) ────────────────────────────────────

async function buildConversationContext(userId, newMessage, limit = 5) {
  const history = await getConversationHistory(userId, limit);

  const messages = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.message,
  }));

  // Add current message
  messages.push({ role: 'user', content: newMessage });

  return messages;
}

// ─── Stats ──────────────────────────────────────────────────────────────────────

async function getUserStats(userId) {
  const total = await ChatMessage.count({ where: { userId } });
  const stockMentions = await ChatMessage.findAll({
    where: { userId, stockSymbol: { [Op.ne]: null } },
    attributes: ['stockSymbol'],
    group: ['stockSymbol'],
    order: [[sequelize.fn('COUNT', sequelize.col('stockSymbol')), 'DESC']],
    limit: 5,
  });

  return {
    totalMessages: total,
    topStocks: stockMentions.map(m => m.stockSymbol),
  };
}

export {
  initConversationDB,
  saveMessage,
  getConversationHistory,
  clearHistory,
  searchFAQ,
  buildConversationContext,
  getUserStats,
  ChatMessage,
  StockFAQ,
};
