/**
 * FinTechIQ Chatbot Conversation Test
 * Tests English, Tamil (Unicode), and Tanglish messages
 */

const BASE_URL = 'http://localhost:5000/api/chatbot';
const userId   = 'test_user_001';

// ── colour helpers ────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  gray:   '\x1b[90m',
};

function header(title) {
  console.log('\n' + c.cyan + c.bold + '═'.repeat(60) + c.reset);
  console.log(c.cyan + c.bold + '  ' + title + c.reset);
  console.log(c.cyan + '═'.repeat(60) + c.reset);
}

function printTest(num, label, lang, message) {
  console.log(`\n${c.bold}${c.blue}[Test ${num}]${c.reset} ${c.bold}${label}${c.reset} ${c.gray}(${lang})${c.reset}`);
  console.log(`${c.yellow}You:${c.reset} ${message}`);
}

function printReply(data, ms) {
  const src = data.source ? ` ${c.gray}[via ${data.source}]${c.reset}` : '';
  console.log(`${c.green}Bot:${c.reset}${src} ${data.reply}`);
  if (data.suggestion) console.log(`${c.gray}  >> Suggestion: ${data.suggestion}${c.reset}`);
  console.log(`${c.gray}  (${ms}ms)${c.reset}`);
}

function printBlocked(data) {
  console.log(`${c.red}[BLOCKED]${c.reset} ${data.reply}`);
}

async function chat(message) {
  const t0  = Date.now();
  const res = await fetch(BASE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, userId }),
  });
  const data = await res.json();
  return { data, ms: Date.now() - t0 };
}

// ── test cases ────────────────────────────────────────────────────────────────
const TESTS = [

  // ── SECTION 1: English ──────────────────────────────────────────────────────
  { section: 'ENGLISH CONVERSATIONS', tests: [
    { label: 'Greeting',              msg: 'Hello!' },
    { label: 'Price query - US',      msg: 'What is the current price of AAPL?' },
    { label: 'Prediction - US stock', msg: 'predict TSLA stock' },
    { label: 'Analysis query',        msg: 'analyze MSFT' },
    { label: 'Compare stocks',        msg: 'compare AAPL vs TSLA vs NVDA' },
    { label: 'Buy/Sell advice',       msg: 'Should I buy Reliance stock now?' },
    { label: 'FAQ - What is RSI',     msg: 'What is RSI in stock trading?' },
    { label: 'FAQ - Bull Bear',       msg: 'What is a bull market and bear market?' },
    { label: 'FAQ - PE Ratio',        msg: 'Explain PE ratio to me' },
    { label: 'FAQ - SIP',             msg: 'What is SIP investment?' },
    { label: 'Help command',          msg: 'help' },
    { label: 'Indian stock price',    msg: 'What is the price of TCS.NS?' },
    { label: 'Available models',      msg: 'show available models' },
  ]},

  // ── SECTION 2: Tamil (Unicode) ──────────────────────────────────────────────
  { section: 'TAMIL (UNICODE) CONVERSATIONS', tests: [
    { label: 'Tamil greeting',        msg: 'வணக்கம்!' },
    { label: 'Stock price - Tamil',   msg: 'AAPL பங்கு விலை என்ன?' },
    { label: 'Prediction - Tamil',    msg: 'TCS பங்கு முன்னறிவிப்பு கூறுங்கள்' },
    { label: 'Analysis - Tamil',      msg: 'Reliance பங்கு பகுப்பாய்வு காட்டுங்கள்' },
    { label: 'Buy advice - Tamil',    msg: 'HDFC பங்கு வாங்கலாமா?' },
    { label: 'Compare - Tamil',       msg: 'TCS மற்றும் Infosys ஒப்பிடு' },
    { label: 'Market basics - Tamil', msg: 'பங்கு சந்தை என்னவது?' },
    { label: 'Help - Tamil',          msg: 'உதவி' },
  ]},

  // ── SECTION 3: Tanglish (Tamil in English script) ───────────────────────────
  { section: 'TANGLISH CONVERSATIONS', tests: [
    { label: 'Tanglish greeting',        msg: 'Vanakkam da!' },
    { label: 'Price - Tanglish',         msg: 'AAPL vilaiya sollu da' },
    { label: 'Price - Tanglish 2',       msg: 'TCS enna rate irukku?' },
    { label: 'Prediction - Tanglish',    msg: 'TSLA future epdi pogudu?' },
    { label: 'Analysis - Tanglish',      msg: 'Reliance pathi vilarang sollu' },
    { label: 'Buy advice - Tanglish',    msg: 'HDFC vangalama da?' },
    { label: 'Sell advice - Tanglish',   msg: 'Infosys vidalama illa hold pannanuma?' },
    { label: 'Compare - Tanglish',       msg: 'TCS vs Infosys yedhu nalla da?' },
    { label: 'Market question',          msg: 'Nifty yeppadi irukku?' },
    { label: 'What is - Tanglish',       msg: 'RSI yenna da, explain pannu' },
    { label: 'Invest advice - Tanglish', msg: 'NVDA buy panlama romba nalla stock ah?' },
    { label: 'Help - Tanglish',          msg: 'enna panlam solluda' },
  ]},

  // ── SECTION 4: Off-topic (should be blocked) ────────────────────────────────
  { section: 'OFF-TOPIC BLOCK TESTS (should be rejected)', tests: [
    { label: 'Weather query',       msg: 'What is the weather in Chennai today?' },
    { label: 'Cricket score',       msg: 'India cricket match score today' },
    { label: 'Movie question',      msg: 'What is a good movie to watch?' },
    { label: 'Cooking question',    msg: 'How to make biryani?' },
    { label: 'Tamil off-topic',     msg: 'இன்று தமிழ்நாட்டில் வானிலை எப்படி?' },
    { label: 'Tanglish off-topic',  msg: 'Cricket match result sollu da' },
    { label: 'Health question',     msg: 'What medicine should I take for fever?' },
  ]},

  // ── SECTION 5: Edge cases ────────────────────────────────────────────────────
  { section: 'EDGE CASES', tests: [
    { label: 'Mixed Tamil-English',   msg: 'AAPL stock inniki nalla irukka? பங்கு ஏறுமா?' },
    { label: 'Company name Tanglish', msg: 'Apple stock vangalam? AAPL future epdi?' },
    { label: 'Gold price English',    msg: 'What is the gold price today?' },
    { label: 'Gold - Tanglish',       msg: 'Thangam vilaiya sollu da' },
    { label: 'Investment guidance',   msg: 'How to start investing in NSE stocks?' },
    { label: 'LLM status check',      msg: 'what models are available for AI?' },
  ]},
];

// ── runner ────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log(c.bold + c.cyan + '\n  FinTechIQ Chatbot - Multilingual Test Suite' + c.reset);
  console.log(c.gray + '  Testing: English | Tamil | Tanglish | Off-topic blocks\n' + c.reset);

  let passed = 0, blocked = 0, failed = 0, total = 0;
  const results = [];

  for (const section of TESTS) {
    header(section.section);
    for (let i = 0; i < section.tests.length; i++) {
      const { label, msg } = section.tests[i];
      total++;
      printTest(total, label, section.section.split(' ')[0], msg);
      try {
        const { data, ms } = await chat(msg);
        if (data.reply) {
          const isBlocked = data.reply.includes('🚫') || data.reply.includes('I only') || data.reply.startsWith('🚫');
          if (section.section.includes('OFF-TOPIC')) {
            if (isBlocked) {
              printBlocked(data);
              blocked++;
              results.push({ label, status: 'BLOCKED (correct)' });
            } else {
              console.log(`${c.red}[WARN] Should have been blocked but wasn't!${c.reset}`);
              console.log(`${c.green}Bot:${c.reset} ${data.reply}`);
              failed++;
              results.push({ label, status: 'SHOULD_BLOCK_FAILED' });
            }
          } else {
            printReply(data, ms);
            passed++;
            results.push({ label, status: 'OK' });
          }
        } else {
          console.log(`${c.red}[ERROR] No reply in response: ${JSON.stringify(data)}${c.reset}`);
          failed++;
          results.push({ label, status: 'NO_REPLY' });
        }
      } catch (err) {
        console.log(`${c.red}[ERROR] Request failed: ${err.message}${c.reset}`);
        failed++;
        results.push({ label, status: 'FETCH_ERROR: ' + err.message });
      }
      // Small delay between requests to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + c.cyan + c.bold + '═'.repeat(60) + c.reset);
  console.log(c.cyan + c.bold + '  TEST SUMMARY' + c.reset);
  console.log(c.cyan + '═'.repeat(60) + c.reset);
  console.log(`Total tests  : ${c.bold}${total}${c.reset}`);
  console.log(`Passed       : ${c.green}${c.bold}${passed}${c.reset}`);
  console.log(`Blocked (OK) : ${c.yellow}${c.bold}${blocked}${c.reset}`);
  console.log(`Failed       : ${c.red}${c.bold}${failed}${c.reset}`);
  console.log('');

  // Print any failures
  const failures = results.filter(r => r.status.includes('FAILED') || r.status.includes('ERROR'));
  if (failures.length) {
    console.log(c.red + 'Failed tests:' + c.reset);
    failures.forEach(f => console.log(`  - ${f.label}: ${f.status}`));
  } else {
    console.log(c.green + c.bold + '  All tests passed or correctly blocked!' + c.reset);
  }
  console.log('');
}

// ── Also run LLM status check ─────────────────────────────────────────────────
async function checkLLMStatus() {
  header('LLM STATUS CHECK');
  try {
    const res  = await fetch('http://localhost:5000/api/llm-status');
    const data = await res.json();
    console.log(`\n${c.bold}Gemini:${c.reset}`);
    console.log(`  Status : ${data.gemini?.status}`);
    console.log(`  Model  : ${data.gemini?.model}`);
    console.log(`\n${c.bold}Ollama:${c.reset}`);
    console.log(`  Status : ${data.ollama?.status}`);
    console.log(`  Models : ${(data.ollama?.models || []).join(', ') || 'none'}`);
    console.log(`\n${c.bold}Active LLM: ${c.green}${data.primary}${c.reset}`);
  } catch (err) {
    console.log(`${c.red}LLM status check failed: ${err.message}${c.reset}`);
  }
}

(async () => {
  await checkLLMStatus();
  await runTests();
})();
