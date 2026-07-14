require("dotenv").config();


function toSafeWhaleDbRow(input) {
  if (Array.isArray(input)) {
    return input.map(toSafeWhaleDbRow);
  }

  const row =
    input && typeof input === "object"
      ? input
      : {};

  return {
    symbol: row.symbol ?? null,
    option_ticker: row.option_ticker ?? null,
    contract_type: row.contract_type ?? null,
    premium_value: row.premium_value ?? null,
    created_at:
      row.created_at ??
      new Date().toISOString(),

    // جميع البيانات الإضافية محفوظة هنا
    raw:
      row.raw &&
      typeof row.raw === "object"
        ? {
            ...row.raw,
            full_processed_row: row,
          }
        : {
            full_processed_row: row,
          },
  };
}

const http = require("http");
const WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");

/* =========================================================
   الإعدادات
========================================================= */

const CFG = {
  massiveApiKey: process.env.MASSIVE_API_KEY,

  supabaseUrl: process.env.SUPABASE_URL,

  supabaseKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY,

  websocketUrl:
    process.env.MASSIVE_WS_URL ||
    "wss://socket.massive.com/options",

  port: Number(process.env.PORT || 8080),

  minPremium: Number(
    process.env.MIN_WHALE_PREMIUM || 250_000,
  ),

  minTradeSize: Number(
    process.env.MIN_WHALE_TRADE_SIZE || 10,
  ),

  blockMinPremium: Number(
    process.env.BLOCK_MIN_PREMIUM || 1_000_000,
  ),

  blockMinSize: Number(
    process.env.BLOCK_MIN_SIZE || 100,
  ),

  sweepMinPremium: Number(
    process.env.SWEEP_MIN_PREMIUM || 500_000,
  ),

  sweepMinTrades: Number(
    process.env.SWEEP_MIN_TRADES || 3,
  ),

  sweepWindowMs: Number(
    process.env.SWEEP_WINDOW_MS || 3_000,
  ),

  repeatWindowMs: Number(
    process.env.REPEAT_WINDOW_MS || 10 * 60_000,
  ),

  quoteSubscriptionLimit: Math.min(
    Number(process.env.QUOTE_SUBSCRIPTION_LIMIT || 900),
    1_000,
  ),

  snapshotConcurrency: Number(
    process.env.SNAPSHOT_CONCURRENCY || 5,
  ),

  activeHours: Number(
    process.env.WHALE_ACTIVE_HOURS || 24,
  ),

  underlyings: (
    process.env.WHALE_UNDERLYINGS || "*"
  )
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean),
};

const missingVariables = [];

if (!CFG.massiveApiKey) {
  missingVariables.push("MASSIVE_API_KEY");
}

if (!CFG.supabaseUrl) {
  missingVariables.push("SUPABASE_URL");
}

if (!CFG.supabaseKey) {
  missingVariables.push(
    "SUPABASE_SERVICE_ROLE_KEY أو SUPABASE_SECRET_KEY",
  );
}

if (missingVariables.length > 0) {
  console.error(
    `❌ متغيرات ناقصة: ${missingVariables.join(", ")}`,
  );

  process.exit(1);
}

/* =========================================================
   Supabase
========================================================= */

const supabase = createClient(
  CFG.supabaseUrl,
  CFG.supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

/* =========================================================
   الحالة الداخلية
========================================================= */

let websocket = null;
let authenticated = false;
let reconnectAttempt = 0;
let reconnectTimer = null;
let heartbeatTimer = null;

const quoteCache = new Map();
const quoteSubscriptions = new Map();
const recentTrades = new Map();
const seenTradeKeys = new Map();
const snapshotCache = new Map();

const processingQueue = [];
let activeProcessingJobs = 0;

const metrics = {
  startedAt: new Date().toISOString(),
  websocketConnected: false,
  authenticated: false,
  messagesReceived: 0,
  tradesReceived: 0,
  candidateTrades: 0,
  savedTrades: 0,
  duplicateTrades: 0,
  rejectedTrades: 0,
  snapshotErrors: 0,
  databaseErrors: 0,
  quoteSubscriptions: 0,
  lastTradeAt: null,
  lastSavedAt: null,
  lastError: null,
};

/* =========================================================
   أدوات مساعدة
========================================================= */

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function nullableNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

function round(value, digits = 2) {
  const factor = 10 ** digits;

  return (
    Math.round(
      (safeNumber(value) + Number.EPSILON) * factor,
    ) / factor
  );
}

function nowIso() {
  return new Date().toISOString();
}

function log(message, details) {
  const time = new Date().toISOString();

  if (details === undefined) {
    console.log(`[${time}] ${message}`);
    return;
  }

  console.log(`[${time}] ${message}`, details);
}

function logError(message, error) {
  const details =
    error instanceof Error
      ? error.message
      : String(error);

  metrics.lastError = `${message}: ${details}`;

  console.error(
    `[${new Date().toISOString()}] ❌ ${message}`,
    details,
  );
}

function isUnderlyingAllowed(symbol) {
  return (
    CFG.underlyings.includes("*") ||
    CFG.underlyings.includes(symbol)
  );
}

function parseOptionTicker(optionTicker) {
  const normalized = String(optionTicker || "")
    .trim()
    .toUpperCase();

  const match = normalized.match(
    /^O:([A-Z0-9.]+)(\d{6})([CP])(\d{8})$/,
  );

  if (!match) {
    return null;
  }

  const underlying = match[1];
  const expirationCode = match[2];
  const contractCode = match[3];
  const strikeCode = match[4];

  const year = `20${expirationCode.slice(0, 2)}`;
  const month = expirationCode.slice(2, 4);
  const day = expirationCode.slice(4, 6);

  return {
    optionTicker: normalized,
    underlying,
    contractType:
      contractCode === "C" ? "call" : "put",
    expiration: `${year}-${month}-${day}`,
    strike: safeNumber(strikeCode) / 1_000,
  };
}

function buildTradeKey(event) {
  const ticker = String(event.sym || "");
  const sequence = safeNumber(event.q);
  const timestamp = safeNumber(event.t);
  const exchange = safeNumber(event.x);
  const price = safeNumber(event.p);
  const size = safeNumber(event.s);

  return [
    ticker,
    sequence || timestamp,
    exchange,
    price,
    size,
  ].join(":");
}

function calculatePremium(price, size) {
  return round(
    safeNumber(price) *
      safeNumber(size) *
      100,
    2,
  );
}

function calculateSpreadPct(bid, ask) {
  const safeBid = safeNumber(bid);
  const safeAsk = safeNumber(ask);

  if (
    safeBid < 0 ||
    safeAsk <= 0 ||
    safeAsk < safeBid
  ) {
    return null;
  }

  const midpoint =
    (safeBid + safeAsk) / 2;

  if (midpoint <= 0) {
    return null;
  }

  return round(
    ((safeAsk - safeBid) / midpoint) * 100,
    2,
  );
}

/* =========================================================
   تصنيف مكان التنفيذ
========================================================= */

function classifyExecution(price, bid, ask) {
  const safePrice = safeNumber(price);
  const safeBid = nullableNumber(bid);
  const safeAsk = nullableNumber(ask);

  if (
    safeBid === null ||
    safeAsk === null ||
    safeAsk <= 0 ||
    safeAsk < safeBid
  ) {
    return {
      location: "UNKNOWN",
      estimatedSide: "UNKNOWN",
      confidence: 0,
    };
  }

  const midpoint =
    (safeBid + safeAsk) / 2;

  const spread =
    safeAsk - safeBid;

  const tolerance = Math.max(
    0.01,
    spread * 0.12,
  );

  if (safePrice >= safeAsk - tolerance) {
    return {
      location: "AT_ASK",
      estimatedSide: "BUY",
      confidence: 95,
    };
  }

  if (safePrice <= safeBid + tolerance) {
    return {
      location: "AT_BID",
      estimatedSide: "SELL",
      confidence: 95,
    };
  }

  if (safePrice > midpoint + tolerance / 2) {
    return {
      location: "ABOVE_MID",
      estimatedSide: "BUY",
      confidence: 70,
    };
  }

  if (safePrice < midpoint - tolerance / 2) {
    return {
      location: "BELOW_MID",
      estimatedSide: "SELL",
      confidence: 70,
    };
  }

  return {
    location: "MID",
    estimatedSide: "UNKNOWN",
    confidence: 35,
  };
}

/* =========================================================
   تصنيف ITM / ATM / OTM
========================================================= */

function getMoneyPosition({
  contractType,
  strike,
  stockPrice,
}) {
  const safeStrike = safeNumber(strike);
  const safeStockPrice = safeNumber(stockPrice);

  if (
    safeStrike <= 0 ||
    safeStockPrice <= 0
  ) {
    return "غير متاح";
  }

  const distancePct =
    Math.abs(
      (safeStockPrice - safeStrike) /
        safeStockPrice,
    ) * 100;

  if (distancePct <= 1) {
    return "ATM قريب من السعر";
  }

  if (contractType === "call") {
    return safeStockPrice > safeStrike
      ? "ITM داخل السعر"
      : "OTM خارج السعر";
  }

  return safeStockPrice < safeStrike
    ? "ITM داخل السعر"
    : "OTM خارج السعر";
}

/* =========================================================
   اتجاه الصفقة التقديري
========================================================= */

function getDirectionStatus(
  contractType,
  estimatedSide,
) {
  if (estimatedSide === "UNKNOWN") {
    return "اتجاه التنفيذ غير محسوم";
  }

  if (
    contractType === "call" &&
    estimatedSide === "BUY"
  ) {
    return "تنفيذ صعودي محتمل";
  }

  if (
    contractType === "put" &&
    estimatedSide === "BUY"
  ) {
    return "تنفيذ هبوطي محتمل";
  }

  if (
    contractType === "call" &&
    estimatedSide === "SELL"
  ) {
    return "بيع CALL أو تحوط محتمل";
  }

  if (
    contractType === "put" &&
    estimatedSide === "SELL"
  ) {
    return "بيع PUT أو اتجاه صعودي محتمل";
  }

  return "اتجاه التنفيذ غير محسوم";
}

/* =========================================================
   تصنيف القاما
========================================================= */

function getGammaStatus(gamma) {
  const safeGamma =
    Math.abs(safeNumber(gamma));

  if (safeGamma >= 0.05) {
    return "Gamma مرتفعة";
  }

  if (safeGamma >= 0.02) {
    return "Gamma متوسطة";
  }

  if (safeGamma > 0) {
    return "Gamma منخفضة";
  }

  return "Gamma غير متاحة";
}

/* =========================================================
   WebSocket Quotes
========================================================= */

function updateQuoteCache(event) {
  const ticker = String(event.sym || "");

  if (!ticker) {
    return;
  }

  quoteCache.set(ticker, {
    bid: nullableNumber(event.bp),
    ask: nullableNumber(event.ap),
    bidSize: nullableNumber(event.bs),
    askSize: nullableNumber(event.as),
    timestamp: safeNumber(event.t, Date.now()),
    receivedAt: Date.now(),
  });

  if (quoteSubscriptions.has(ticker)) {
    quoteSubscriptions.delete(ticker);

    quoteSubscriptions.set(
      ticker,
      Date.now(),
    );
  }
}

function sendWebSocketMessage(payload) {
  if (
    !websocket ||
    websocket.readyState !== WebSocket.OPEN
  ) {
    return false;
  }

  websocket.send(
    JSON.stringify(payload),
  );

  return true;
}

function unsubscribeOldestQuote() {
  const oldest =
    quoteSubscriptions.keys().next().value;

  if (!oldest) {
    return;
  }

  sendWebSocketMessage({
    action: "unsubscribe",
    params: `Q.${oldest}`,
  });

  quoteSubscriptions.delete(oldest);
  quoteCache.delete(oldest);
}

function subscribeToQuote(optionTicker) {
  if (!authenticated) {
    return;
  }

  if (
    quoteSubscriptions.has(optionTicker)
  ) {
    quoteSubscriptions.delete(optionTicker);

    quoteSubscriptions.set(
      optionTicker,
      Date.now(),
    );

    return;
  }

  while (
    quoteSubscriptions.size >=
    CFG.quoteSubscriptionLimit
  ) {
    unsubscribeOldestQuote();
  }

  const sent =
    sendWebSocketMessage({
      action: "subscribe",
      params: `Q.${optionTicker}`,
    });

  if (!sent) {
    return;
  }

  quoteSubscriptions.set(
    optionTicker,
    Date.now(),
  );

  metrics.quoteSubscriptions =
    quoteSubscriptions.size;
}

/* =========================================================
   Option Contract Snapshot
========================================================= */

async function fetchContractSnapshot(
  underlying,
  optionTicker,
) {
  const cacheKey = optionTicker;
  const cached = snapshotCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.fetchedAt < 3_000
  ) {
    return cached.data;
  }

  const url =
    `https://api.massive.com/v3/snapshot/options/` +
    `${encodeURIComponent(underlying)}/` +
    `${encodeURIComponent(optionTicker)}` +
    `?apiKey=${encodeURIComponent(CFG.massiveApiKey)}`;

  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 10_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(
        body?.error ||
          body?.message ||
          `Massive snapshot HTTP ${response.status}`,
      );
    }

    const result =
      body?.results || {};

    const data = {
      openInterest: nullableNumber(
        result.open_interest,
      ),

      volume: nullableNumber(
        result.day?.volume,
      ),

      impliedVolatility: nullableNumber(
        result.implied_volatility,
      ),

      delta: nullableNumber(
        result.greeks?.delta,
      ),

      gamma: nullableNumber(
        result.greeks?.gamma,
      ),

      theta: nullableNumber(
        result.greeks?.theta,
      ),

      vega: nullableNumber(
        result.greeks?.vega,
      ),

      bid: nullableNumber(
        result.last_quote?.bid,
      ),

      ask: nullableNumber(
        result.last_quote?.ask,
      ),

      bidSize: nullableNumber(
        result.last_quote?.bid_size,
      ),

      askSize: nullableNumber(
        result.last_quote?.ask_size,
      ),

      stockPrice: nullableNumber(
        result.underlying_asset?.price,
      ),

      quoteTimeframe:
        result.last_quote?.timeframe || null,

      tradeTimeframe:
        result.last_trade?.timeframe || null,

      raw: result,
    };

    snapshotCache.set(cacheKey, {
      fetchedAt: Date.now(),
      data,
    });

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   Sweep والتكرار
========================================================= */

function registerRecentTrade({
  optionTicker,
  timestamp,
  premium,
  estimatedSide,
  exchangeId,
}) {
  const currentTime =
    safeNumber(timestamp, Date.now());

  const history =
    recentTrades.get(optionTicker) || [];

  const freshHistory =
    history.filter(
      (item) =>
        currentTime - item.timestamp <=
        CFG.repeatWindowMs,
    );

  freshHistory.push({
    timestamp: currentTime,
    premium,
    estimatedSide,
    exchangeId,
  });

  recentTrades.set(
    optionTicker,
    freshHistory,
  );

  const repeatCount =
    freshHistory.length;

  const sweepTrades =
    freshHistory.filter(
      (item) =>
        currentTime - item.timestamp <=
          CFG.sweepWindowMs &&
        item.estimatedSide ===
          estimatedSide,
    );

  const sweepPremium =
    sweepTrades.reduce(
      (sum, item) =>
        sum + item.premium,
      0,
    );

  const distinctExchanges =
    new Set(
      sweepTrades
        .map((item) => item.exchangeId)
        .filter(Boolean),
    ).size;

  const isSweep =
    estimatedSide !== "UNKNOWN" &&
    sweepTrades.length >=
      CFG.sweepMinTrades &&
    sweepPremium >=
      CFG.sweepMinPremium &&
    distinctExchanges >= 2;

  return {
    repeatCount,
    isSweep,
    sweepCount:
      isSweep
        ? sweepTrades.length
        : 0,
    sweepPremium,
    distinctExchanges,
  };
}

/* =========================================================
   تقييم قوة الحوت
========================================================= */

function calculateWhaleScore({
  premium,
  tradeSize,
  openInterest,
  spreadPct,
  executionConfidence,
  isBlock,
  isSweep,
  repeatCount,
}) {
  let score = 30;

  if (premium >= 5_000_000) {
    score += 28;
  } else if (premium >= 2_000_000) {
    score += 23;
  } else if (premium >= 1_000_000) {
    score += 18;
  } else if (premium >= 500_000) {
    score += 12;
  } else {
    score += 6;
  }

  if (tradeSize >= 1_000) {
    score += 15;
  } else if (tradeSize >= 500) {
    score += 12;
  } else if (tradeSize >= 100) {
    score += 8;
  } else if (tradeSize >= 50) {
    score += 4;
  }

  if (executionConfidence >= 90) {
    score += 8;
  } else if (executionConfidence >= 65) {
    score += 5;
  }

  if (isBlock) {
    score += 8;
  }

  if (isSweep) {
    score += 14;
  }

  if (repeatCount >= 5) {
    score += 8;
  } else if (repeatCount >= 3) {
    score += 5;
  }

  const volumeOi =
    openInterest > 0
      ? tradeSize / openInterest
      : null;

  if (
    volumeOi !== null &&
    volumeOi >= 1
  ) {
    score += 8;
  } else if (
    volumeOi !== null &&
    volumeOi >= 0.5
  ) {
    score += 5;
  }

  if (
    spreadPct !== null &&
    spreadPct <= 10
  ) {
    score += 5;
  } else if (
    spreadPct !== null &&
    spreadPct >= 30
  ) {
    score -= 5;
  }

  return clamp(
    Math.round(score),
    1,
    100,
  );
}

function getClassification({
  isSweep,
  isBlock,
  repeatCount,
  premium,
}) {
  if (isSweep && isBlock) {
    return "SWEEP محتمل + BLOCK";
  }

  if (isSweep) {
    return "SWEEP محتمل";
  }

  if (isBlock) {
    return "BLOCK";
  }

  if (repeatCount >= 3) {
    return "تكرار مؤسسي محتمل";
  }

  if (premium >= 1_000_000) {
    return "صفقة مليونية";
  }

  return "صفقة كبيرة";
}

/* =========================================================
   بناء سبب الصفقة
========================================================= */

function buildReason({
  premium,
  tradeSize,
  openInterest,
  execution,
  isBlock,
  isSweep,
  sweepCount,
  repeatCount,
  spreadPct,
  estimatedSide,
}) {
  const reasons = [];

  reasons.push(
    `قيمة التنفيذ ${Math.round(
      premium,
    ).toLocaleString("en-US")} دولار`,
  );

  reasons.push(
    `حجم الصفقة ${Math.round(
      tradeSize,
    ).toLocaleString("en-US")} عقد`,
  );

  if (openInterest > 0) {
    reasons.push(
      `الاهتمام المفتوح ${Math.round(
        openInterest,
      ).toLocaleString("en-US")}`,
    );
  }

  if (
    execution.location === "AT_ASK"
  ) {
    reasons.push(
      "تم التنفيذ قرب Ask؛ شراء محتمل",
    );
  } else if (
    execution.location === "AT_BID"
  ) {
    reasons.push(
      "تم التنفيذ قرب Bid؛ بيع محتمل",
    );
  } else if (
    execution.location === "ABOVE_MID"
  ) {
    reasons.push(
      "التنفيذ أعلى منتصف السبريد",
    );
  } else if (
    execution.location === "BELOW_MID"
  ) {
    reasons.push(
      "التنفيذ أدنى منتصف السبريد",
    );
  } else {
    reasons.push(
      "اتجاه التنفيذ غير محسوم",
    );
  }

  if (isBlock) {
    reasons.push(
      "حجم أو قيمة الصفقة يطابق Block محتمل",
    );
  }

  if (isSweep) {
    reasons.push(
      `رُصد ${sweepCount} تنفيذات متتابعة عبر أكثر من بورصة`,
    );
  }

  if (repeatCount >= 3) {
    reasons.push(
      `تكرر التنفيذ على العقد ${repeatCount} مرات خلال نافذة الرصد`,
    );
  }

  if (spreadPct !== null) {
    reasons.push(
      `السبريد ${spreadPct.toFixed(2)}%`,
    );
  }

  if (estimatedSide === "UNKNOWN") {
    reasons.push(
      "التصنيف لا يؤكد وحده أن الصفقة شراء أو بيع",
    );
  }

  return reasons.join(" • ");
}

/* =========================================================
   قاعدة البيانات
========================================================= */

async function saveWhaleTrade(row) {
  const { error } = await supabase
    .from("whale_trades")
    .insert(toSafeWhaleDbRow(row));

  if (!error) {
    metrics.savedTrades += 1;
    metrics.lastSavedAt = nowIso();

    log(
      `🐋 حوت محفوظ: ${row.symbol} ${row.contract_type.toUpperCase()} ` +
        `${row.strike} | $${Math.round(
          row.premium_value,
        ).toLocaleString("en-US")} | ${row.classification}`,
    );

    return;
  }

  if (
    error.code === "23505" ||
    String(error.message || "")
      .toLowerCase()
      .includes("duplicate")
  ) {
    metrics.duplicateTrades += 1;
    return;
  }

  metrics.databaseErrors += 1;

  throw new Error(
    `${error.code || "DB"}: ${error.message}`,
  );
}

/* =========================================================
   معالجة الصفقة المؤهلة
========================================================= */

async function processCandidateTrade(
  event,
  parsed,
  tradeKey,
  premium,
) {
  const optionTicker =
    parsed.optionTicker;

  subscribeToQuote(optionTicker);

  let snapshot = null;

  try {
    snapshot =
      await fetchContractSnapshot(
        parsed.underlying,
        optionTicker,
      );
  } catch (error) {
    metrics.snapshotErrors += 1;

    logError(
      `فشل Snapshot للعقد ${optionTicker}`,
      error,
    );
  }

  const websocketQuote =
    quoteCache.get(optionTicker);

  const bid =
    websocketQuote?.bid ??
    snapshot?.bid ??
    null;

  const ask =
    websocketQuote?.ask ??
    snapshot?.ask ??
    null;

  const bidSize =
    websocketQuote?.bidSize ??
    snapshot?.bidSize ??
    null;

  const askSize =
    websocketQuote?.askSize ??
    snapshot?.askSize ??
    null;

  const tradePrice =
    safeNumber(event.p);

  const tradeSize =
    safeNumber(event.s);

  const openInterest =
    safeNumber(
      snapshot?.openInterest,
    );

  const dailyVolume =
    safeNumber(
      snapshot?.volume,
      tradeSize,
    );

  const stockPrice =
    nullableNumber(
      snapshot?.stockPrice,
    );

  const spreadPct =
    calculateSpreadPct(
      bid,
      ask,
    );

  const execution =
    classifyExecution(
      tradePrice,
      bid,
      ask,
    );

  const activity =
    registerRecentTrade({
      optionTicker,
      timestamp: event.t,
      premium,
      estimatedSide:
        execution.estimatedSide,
      exchangeId: safeNumber(event.x),
    });

  const isBlock =
    tradeSize >= CFG.blockMinSize ||
    premium >= CFG.blockMinPremium;

  const absoluteDelta =
    Math.abs(
      safeNumber(snapshot?.delta),
    );

  const hedgeFlag =
    absoluteDelta >= 0.75 &&
    (
      execution.location === "MID" ||
      execution.location === "UNKNOWN"
    );

  const whaleScore =
    calculateWhaleScore({
      premium,
      tradeSize,
      openInterest,
      spreadPct,
      executionConfidence:
        execution.confidence,
      isBlock,
      isSweep: activity.isSweep,
      repeatCount:
        activity.repeatCount,
    });

  const classification =
    getClassification({
      isSweep: activity.isSweep,
      isBlock,
      repeatCount:
        activity.repeatCount,
      premium,
    });

  const moneyPosition =
    getMoneyPosition({
      contractType:
        parsed.contractType,
      strike: parsed.strike,
      stockPrice,
    });

  const directionStatus =
    getDirectionStatus(
      parsed.contractType,
      execution.estimatedSide,
    );

  const gammaStatus =
    getGammaStatus(
      snapshot?.gamma,
    );

  const reason =
    buildReason({
      premium,
      tradeSize,
      openInterest,
      execution,
      isBlock,
      isSweep: activity.isSweep,
      sweepCount:
        activity.sweepCount,
      repeatCount:
        activity.repeatCount,
      spreadPct,
      estimatedSide:
        execution.estimatedSide,
    });

  const tradeTimestamp =
    new Date(
      safeNumber(event.t, Date.now()),
    ).toISOString();

  const row = {
    trade_key: tradeKey,

    symbol:
      parsed.underlying,

    option_ticker:
      optionTicker,

    contract_type:
      parsed.contractType,

    strike:
      parsed.strike,

    expiration:
      parsed.expiration,

    stock_price:
      stockPrice,

    contract_price:
      tradePrice,

    premium_value:
      premium,

    trade_size:
      tradeSize,

    volume:
      dailyVolume,

    open_interest:
      openInterest,

    volume_change:
      tradeSize,

    bid,
    ask,

    bid_size:
      bidSize,

    ask_size:
      askSize,

    spread_pct:
      spreadPct,

    execution_location:
      execution.location,

    estimated_side:
      execution.estimatedSide,

    exchange_id:
      safeNumber(event.x) || null,

    conditions:
      Array.isArray(event.c)
        ? event.c
            .map((value) =>
              safeNumber(value),
            )
            .filter(
              (value) =>
                Number.isInteger(value),
            )
        : [],

    sequence_number:
      safeNumber(event.q) || null,

    trade_timestamp:
      tradeTimestamp,

    delta:
      nullableNumber(
        snapshot?.delta,
      ),

    gamma:
      nullableNumber(
        snapshot?.gamma,
      ),

    theta:
      nullableNumber(
        snapshot?.theta,
      ),

    vega:
      nullableNumber(
        snapshot?.vega,
      ),

    iv:
      nullableNumber(
        snapshot?.impliedVolatility,
      ),

    whale_score:
      whaleScore,

    classification,

    money_position:
      moneyPosition,

    direction_status:
      directionStatus,

    gamma_status:
      gammaStatus,

    reason,

    is_block:
      isBlock,

    is_sweep:
      activity.isSweep,

    sweep_count:
      activity.sweepCount,

    repeat_count:
      activity.repeatCount,

    hedge_flag:
      hedgeFlag,

    first_seen_at:
      tradeTimestamp,

    last_seen_at:
      tradeTimestamp,

    created_at:
      nowIso(),

    is_active:
      true,

    raw: {
      trade: event,

      executionConfidence:
        execution.confidence,

      sweepPremium:
        activity.sweepPremium,

      distinctExchanges:
        activity.distinctExchanges,

      quoteSource:
        websocketQuote
          ? "WEBSOCKET"
          : snapshot
            ? "SNAPSHOT"
            : "NONE",

      quoteTimeframe:
        snapshot?.quoteTimeframe ||
        null,

      tradeTimeframe:
        snapshot?.tradeTimeframe ||
        null,
    },
  };

  await saveWhaleTrade(row);
}

/* =========================================================
   Queue لمنع ضغط Snapshot
========================================================= */

function enqueueProcessing(job) {
  processingQueue.push(job);

  drainProcessingQueue();
}

function drainProcessingQueue() {
  while (
    activeProcessingJobs <
      CFG.snapshotConcurrency &&
    processingQueue.length > 0
  ) {
    const job =
      processingQueue.shift();

    activeProcessingJobs += 1;

    Promise.resolve()
      .then(job)
      .catch((error) => {
        logError(
          "فشل معالجة صفقة الحوت",
          error,
        );
      })
      .finally(() => {
        activeProcessingJobs -= 1;

        drainProcessingQueue();
      });
  }
}

/* =========================================================
   استقبال Trade
========================================================= */

function handleTradeEvent(event) {
  metrics.tradesReceived += 1;
  metrics.lastTradeAt = nowIso();

  const parsed =
    parseOptionTicker(event.sym);

  if (!parsed) {
    metrics.rejectedTrades += 1;
    return;
  }

  if (
    !isUnderlyingAllowed(
      parsed.underlying,
    )
  ) {
    return;
  }

  const price =
    safeNumber(event.p);

  const size =
    safeNumber(event.s);

  if (
    price <= 0 ||
    size <= 0
  ) {
    metrics.rejectedTrades += 1;
    return;
  }

  const premium =
    calculatePremium(
      price,
      size,
    );

  if (
    premium < CFG.minPremium ||
    size < CFG.minTradeSize
  ) {
    return;
  }

  metrics.candidateTrades += 1;

  const tradeKey =
    buildTradeKey(event);

  if (
    seenTradeKeys.has(tradeKey)
  ) {
    metrics.duplicateTrades += 1;
    return;
  }

  seenTradeKeys.set(
    tradeKey,
    Date.now(),
  );

  enqueueProcessing(() =>
    processCandidateTrade(
      event,
      parsed,
      tradeKey,
      premium,
    ),
  );
}

/* =========================================================
   رسائل WebSocket
========================================================= */

function handleStatusEvent(event) {
  const status =
    String(event.status || "")
      .toLowerCase();

  const message =
    String(event.message || "");

  log(
    `Massive status: ${status || "unknown"} — ${message}`,
  );

  if (
    status === "auth_success" ||
    message
      .toLowerCase()
      .includes("authenticated")
  ) {
    authenticated = true;
    metrics.authenticated = true;

    reconnectAttempt = 0;

    sendWebSocketMessage({
      action: "subscribe",
      params: "T.*",
    });

    log(
      "✅ تم الاشتراك في جميع صفقات الأوبشن T.*",
    );

    return;
  }

  if (
    status.includes("auth_failed") ||
    status.includes("error")
  ) {
    authenticated = false;
    metrics.authenticated = false;

    logError(
      "فشل مصادقة Massive",
      message || status,
    );
  }
}

function handleWebSocketMessage(data) {
  let events;

  try {
    events = JSON.parse(
      data.toString(),
    );
  } catch (error) {
    logError(
      "رسالة WebSocket غير صالحة",
      error,
    );

    return;
  }

  const list =
    Array.isArray(events)
      ? events
      : [events];

  metrics.messagesReceived +=
    list.length;

  for (const event of list) {
    if (!event || typeof event !== "object") {
      continue;
    }

    if (
      event.ev === "status"
    ) {
      handleStatusEvent(event);
      continue;
    }

    if (event.ev === "Q") {
      updateQuoteCache(event);
      continue;
    }

    if (event.ev === "T") {
      handleTradeEvent(event);
    }
  }
}

/* =========================================================
   الاتصال وإعادة الاتصال
========================================================= */

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectAttempt += 1;

  const delay = Math.min(
    30_000,
    1_000 *
      2 **
        Math.min(
          reconnectAttempt - 1,
          5,
        ),
  );

  log(
    `إعادة الاتصال بعد ${Math.round(
      delay / 1_000,
    )} ثانية`,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;

    connectWebSocket();
  }, delay);
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(() => {
    if (
      websocket &&
      websocket.readyState ===
        WebSocket.OPEN
    ) {
      try {
        websocket.ping();
      } catch (error) {
        logError(
          "فشل WebSocket ping",
          error,
        );
      }
    }
  }, 25_000);
}

function connectWebSocket() {
  if (
    websocket &&
    (
      websocket.readyState ===
        WebSocket.OPEN ||
      websocket.readyState ===
        WebSocket.CONNECTING
    )
  ) {
    return;
  }

  authenticated = false;
  metrics.authenticated = false;

  log(
    `الاتصال بـ ${CFG.websocketUrl}`,
  );

  websocket =
    new WebSocket(
      CFG.websocketUrl,
    );

  websocket.on("open", () => {
    metrics.websocketConnected = true;

    log(
      "✅ تم فتح اتصال Massive WebSocket",
    );

    sendWebSocketMessage({
      action: "auth",
      params:
        CFG.massiveApiKey,
    });

    startHeartbeat();
  });

  websocket.on(
    "message",
    handleWebSocketMessage,
  );

  websocket.on("error", (error) => {
    metrics.websocketConnected = false;

    logError(
      "WebSocket error",
      error,
    );
  });

  websocket.on(
    "close",
    (code, reason) => {
      metrics.websocketConnected = false;
      metrics.authenticated = false;

      authenticated = false;

      clearInterval(
        heartbeatTimer,
      );

      log(
        `تم إغلاق WebSocket: ${code} ${reason.toString()}`,
      );

      scheduleReconnect();
    },
  );
}

/* =========================================================
   تنظيف الذاكرة والصفقات القديمة
========================================================= */

function cleanupMemory() {
  const currentTime =
    Date.now();

  for (
    const [key, timestamp]
    of seenTradeKeys
  ) {
    if (
      currentTime - timestamp >
      30 * 60_000
    ) {
      seenTradeKeys.delete(key);
    }
  }

  for (
    const [ticker, quote]
    of quoteCache
  ) {
    if (
      currentTime -
        quote.receivedAt >
      10 * 60_000
    ) {
      quoteCache.delete(ticker);
    }
  }

  for (
    const [ticker, history]
    of recentTrades
  ) {
    const fresh =
      history.filter(
        (item) =>
          currentTime -
            item.timestamp <=
          CFG.repeatWindowMs,
      );

    if (fresh.length === 0) {
      recentTrades.delete(ticker);
    } else {
      recentTrades.set(
        ticker,
        fresh,
      );
    }
  }

  for (
    const [ticker, snapshot]
    of snapshotCache
  ) {
    if (
      currentTime -
        snapshot.fetchedAt >
      60_000
    ) {
      snapshotCache.delete(ticker);
    }
  }

  metrics.quoteSubscriptions =
    quoteSubscriptions.size;
}

async function deactivateOldTrades() {
  const cutoff =
    new Date(
      Date.now() -
        CFG.activeHours *
          60 *
          60 *
          1_000,
    ).toISOString();

  const { error } = await supabase
    .from("whale_trades")
    .update({
      is_active: false,
    })
    .eq("is_active", true)
    .lt("last_seen_at", cutoff);

  if (error) {
    logError(
      "فشل تعطيل الصفقات القديمة",
      error,
    );
  }
}

/* =========================================================
   Health Server لـ Railway
========================================================= */

const healthServer =
  http.createServer(
    (request, response) => {
      response.setHeader(
        "Content-Type",
        "application/json; charset=utf-8",
      );

      if (
        request.url === "/health" ||
        request.url === "/"
      ) {
        response.writeHead(200);

        response.end(
          JSON.stringify(
            {
              ok: true,
              service:
                "ST Whale Stream",

              websocketConnected:
                metrics.websocketConnected,

              authenticated:
                metrics.authenticated,

              queueLength:
                processingQueue.length,

              activeJobs:
                activeProcessingJobs,

              metrics,

              config: {
                minPremium:
                  CFG.minPremium,

                minTradeSize:
                  CFG.minTradeSize,

                blockMinPremium:
                  CFG.blockMinPremium,

                quoteSubscriptionLimit:
                  CFG.quoteSubscriptionLimit,

                underlyings:
                  CFG.underlyings,
              },

              updatedAt:
                nowIso(),
            },
            null,
            2,
          ),
        );

        return;
      }

      response.writeHead(404);

      response.end(
        JSON.stringify({
          ok: false,
          error: "Not found",
        }),
      );
    },
  );

healthServer.listen(
  CFG.port,
  "0.0.0.0",
  () => {
    log(
      `✅ Health server يعمل على المنفذ ${CFG.port}`,
    );
  },
);

/* =========================================================
   التشغيل
========================================================= */

setInterval(
  cleanupMemory,
  60_000,
);

setInterval(
  () => {
    void deactivateOldTrades();
  },
  15 * 60_000,
);

void deactivateOldTrades();

connectWebSocket();

/* =========================================================
   إيقاف آمن
========================================================= */

async function shutdown(signal) {
  log(
    `استقبال ${signal} — إيقاف الخدمة`,
  );

  clearTimeout(
    reconnectTimer,
  );

  clearInterval(
    heartbeatTimer,
  );

  if (
    websocket &&
    websocket.readyState ===
      WebSocket.OPEN
  ) {
    websocket.close(
      1000,
      "Service shutdown",
    );
  }

  healthServer.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 5_000).unref();
}

process.on(
  "SIGINT",
  () => void shutdown("SIGINT"),
);

process.on(
  "SIGTERM",
  () => void shutdown("SIGTERM"),
);

process.on(
  "unhandledRejection",
  (error) => {
    logError(
      "Unhandled rejection",
      error,
    );
  },
);

process.on(
  "uncaughtException",
  (error) => {
    logError(
      "Uncaught exception",
      error,
    );
  },
);