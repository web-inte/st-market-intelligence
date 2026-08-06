import { NextRequest, NextResponse } from "next/server";

import {
  detectInstitutionalFlow,
  type InstitutionalFlowResult,
  type InstitutionalTrade,
} from "@/lib/institutional-flow-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FALLBACK_SYMBOLS = [
  "SPY",
  "QQQ",
  "IWM",
  "NVDA",
  "TSLA",
  "AAPL",
  "MSFT",
  "META",
  "AMD",
  "AMZN",
  "GOOG",
  "GOOGL",
  "AVGO",
  "PLTR",
  "MSTR",
  "NFLX",
  "COIN",
  "SMCI",
  "MU",
  "ARM",
  "INTC",
  "QCOM",
  "CRM",
  "ORCL",
  "UBER",
  "SNOW",
  "SHOP",
  "BA",
  "JPM",
  "BAC",
  "XOM",
];

async function loadScanSymbols() {
  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !supabaseUrl ||
    !supabaseKey
  ) {
    console.warn(
      "متغيرات Supabase غير مكتملة، سيتم استخدام القائمة الاحتياطية."
    );

    return FALLBACK_SYMBOLS;
  }

  try {
    const url =
      new URL(
        `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/whale_scan_symbols`
      );

    url.searchParams.set(
      "select",
      "symbol"
    );

    url.searchParams.set(
      "is_active",
      "eq.true"
    );

    url.searchParams.set(
      "order",
      "symbol.asc"
    );

    const response =
      await fetch(
        url,
        {
          headers: {
            apikey:
              supabaseKey,
            Authorization:
              `Bearer ${supabaseKey}`,
            Accept:
              "application/json",
          },
          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      throw new Error(
        await response.text()
      );
    }

    const rows =
      await response.json();

    const symbols =
      Array.isArray(rows)
        ? rows
            .map((row) =>
              String(
                row?.symbol || ""
              )
                .trim()
                .toUpperCase()
            )
            .filter(
              (symbol) =>
                /^[A-Z0-9.-]{1,10}$/.test(
                  symbol
                )
            )
        : [];

    const uniqueSymbols =
      Array.from(
        new Set(symbols)
      );

    if (
      uniqueSymbols.length === 0
    ) {
      console.warn(
        "جدول whale_scan_symbols فارغ، سيتم استخدام القائمة الاحتياطية."
      );

      return FALLBACK_SYMBOLS;
    }

    return uniqueSymbols;
  } catch (error) {
    console.error(
      "تعذر تحميل رموز فحص الحيتان:",
      error
    );

    return FALLBACK_SYMBOLS;
  }
}

const MIN_PREMIUM_VALUE = 250_000;
const MIN_WHALE_SCORE = 70;
const MAX_RESULTS_PER_SYMBOL = 180;
const MAX_APPROVED_CONTRACT_PRICE = 3;
const MAX_APPROVED_SPREAD_PCT = 15;

/*
 * نجلب تداولات فعلية لعدد محدود جدًا من العقود
 * حتى لا نستهلك عددًا كبيرًا من طلبات Massive.
 */
const MAX_TRADE_CANDIDATES_PER_SYMBOL = 5;
const TRADE_LOOKBACK_MINUTES = 10;
const MAX_TRADES_PER_CONTRACT = 200;

const whaleRejectStats = {
  invalidBasics: 0,
  strikeOrDte: 0,
  invalidExecutionData: 0,
  premiumTooLow: 0,
  whaleScoreTooLow: 0,
  executionNotBuy: 0,
  contractPriceRejected: 0,
  spreadRejected: 0,
  gammaDirectionRejected: 0,
  compositeScoreTooLow: 0,
  tradeCandidatesSelected: 0,
  tradeRequestsSent: 0,
  tradeResponsesWithResults: 0,
  tradeResponsesEmpty: 0,
};


type MassiveContract = {
  details?: {
    ticker?: string;
    contract_type?: "call" | "put";
    expiration_date?: string;
    strike_price?: number;
  };

  underlying_asset?: {
    price?: number;
    ticker?: string;
  };

  last_quote?: {
    bid?: number;
    ask?: number;
    bid_size?: number;
    ask_size?: number;
  };

  last_trade?: {
    price?: number;
    size?: number;
  };

  day?: {
    volume?: number;
    close?: number;
    open?: number;
    high?: number;
    low?: number;
  };

  open_interest?: number;

  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };

  implied_volatility?: number;
};

type MassiveChainResponse = {
  results?: MassiveContract[];
  next_url?: string;
  status?: string;
  error?: string;
};

type MassiveOptionTrade = {
  price?: number;
  size?: number;
  sip_timestamp?: number | string;
  sequence_number?: number;
  conditions?: number[];
  exchange?: number;
};

type MassiveTradesResponse = {
  results?: MassiveOptionTrade[];
  next_url?: string;
  status?: string;
  error?: string;
};

type MassiveOptionQuote = {
  bid_price?: number;
  ask_price?: number;
  sip_timestamp?: number | string;
};

type MassiveQuotesResponse = {
  results?: MassiveOptionQuote[];
  next_url?: string;
  status?: string;
  error?: string;
};

type WhaleTradeRow = {
  symbol: string;
  option_ticker: string;
  contract_type: "call" | "put";
  strike: number;
  expiration: string;

  stock_price: number;
  contract_price: number;

  premium_value: number;
  volume: number;
  open_interest: number;
  volume_change: number;

  bid: number;
  ask: number;
  spread_pct: number | null;

  trade_price: number;
  execution_side: "BUY" | "SELL" | "UNKNOWN";
  execution_confidence: number;
  execution_position_pct: number | null;
  market_bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  execution_reason: string;

  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;

  whale_score: number;
  classification: string;

  money_position: string;
  direction_status: string;
  gamma_status: string;

  reason: string;
  first_seen_at?: string;
  last_seen_at: string;
  is_active: boolean;
  raw?: Record<string, unknown>;

  /*
   * حقول تعتمد عليها صفحة صفقات الحيتان
   * لتصنيف وعرض Sweep / Block.
   */
  is_sweep?: boolean;
  is_block?: boolean;
  estimated_side?: "BUY" | "SELL" | "UNKNOWN";
  execution_location?: "ASK" | "BID" | "MID" | "UNKNOWN";
  estimated_premium?: number;
  sweep_count?: number;
  repeat_count?: number;
};

function safeNumber(
  value: unknown,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

function getRiyadhMarketState() {
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Riyadh",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ])
  );

  const weekday = values.weekday;
  const hour = safeNumber(values.hour);
  const minute = safeNumber(values.minute);
  const currentMinutes =
    hour * 60 + minute;

  const isTradingDay = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
  ].includes(weekday);

  const startMinutes =
    14 * 60 + 30;

  const endMinutes =
    23 * 60 + 15;

  const isOpen =
    isTradingDay &&
    currentMinutes >= startMinutes &&
    currentMinutes <= endMinutes;

  return {
    isOpen,
    weekday,
    currentMinutes,
  };
}

function calculateSpreadPct(
  bid: number,
  ask: number
) {
  if (
    bid <= 0 ||
    ask <= 0 ||
    ask < bid
  ) {
    return null;
  }

  const midpoint =
    (bid + ask) / 2;

  if (midpoint <= 0) {
    return null;
  }

  return (
    ((ask - bid) / midpoint) *
    100
  );
}

type ExecutionSide =
  | "BUY"
  | "SELL"
  | "UNKNOWN";

type MarketBias =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL";

type ExecutionAnalysis = {
  side: ExecutionSide;
  confidence: number;
  positionPct: number | null;
  marketBias: MarketBias;
  reason: string;
};

function detectExecutionSide(
  contractType: "call" | "put",
  tradePrice: number,
  bid: number,
  ask: number
): ExecutionAnalysis {
  if (
    tradePrice <= 0 ||
    bid <= 0 ||
    ask <= 0 ||
    ask <= bid
  ) {
    return {
      side: "UNKNOWN",
      confidence: 0,
      positionPct: null,
      marketBias: "NEUTRAL",
      reason:
        "تعذر تحديد اتجاه التنفيذ لعدم اكتمال Bid/Ask أو سعر التنفيذ",
    };
  }

  const rawPosition =
    ((tradePrice - bid) /
      (ask - bid)) *
    100;

  /*
    التنفيذ خارج السبريد بشكل كبير يعني غالبًا
    أن توقيت آخر Trade لا يطابق توقيت آخر Quote.
  */
  if (
    rawPosition < -10 ||
    rawPosition > 110
  ) {
    return {
      side: "UNKNOWN",
      confidence: 0,
      positionPct:
        Math.round(rawPosition * 100) /
        100,
      marketBias: "NEUTRAL",
      reason:
        "سعر التنفيذ خارج نطاق Bid/Ask المتاح؛ لا يمكن تأكيد الشراء أو البيع",
    };
  }

  const position =
    clamp(rawPosition, 0, 100);

  let side: ExecutionSide =
    "UNKNOWN";

  let confidence = 0;

  let reason =
    "التنفيذ قريب من منتصف السبريد؛ اتجاه التنفيذ غير محسوم";

  if (position >= 80) {
    side = "BUY";
    confidence =
      Math.round(position);
    reason =
      "التنفيذ قريب جدًا من Ask؛ شراء العقد مرجح بقوة";
  } else if (position >= 55) {
    side = "BUY";
    confidence =
      Math.round(position);
    reason =
      "التنفيذ يميل إلى Ask؛ شراء العقد مرجح";
  } else if (position <= 20) {
    side = "SELL";
    confidence =
      Math.round(
        100 - position
      );
    reason =
      "التنفيذ قريب جدًا من Bid؛ بيع العقد مرجح بقوة";
  } else if (position <= 35) {
    side = "SELL";
    confidence =
      Math.round(
        100 - position
      );
    reason =
      "التنفيذ أقرب إلى Bid؛ بيع العقد مرجح";
  } else {
    confidence =
      Math.round(
        clamp(
          100 -
            Math.abs(
              position - 50
            ) *
              2,
          0,
          100
        )
      );
  }

  let marketBias: MarketBias =
    "NEUTRAL";

  if (
    side === "BUY" &&
    contractType === "call"
  ) {
    marketBias = "BULLISH";
  } else if (
    side === "BUY" &&
    contractType === "put"
  ) {
    marketBias = "BEARISH";
  } else if (
    side === "SELL" &&
    contractType === "call"
  ) {
    marketBias = "BEARISH";
  } else if (
    side === "SELL" &&
    contractType === "put"
  ) {
    marketBias = "BULLISH";
  }

  return {
    side,
    confidence,
    positionPct:
      Math.round(position * 100) /
      100,
    marketBias,
    reason,
  };
}

function getMoneyPosition(
  contractType: "call" | "put",
  strike: number,
  stockPrice: number
) {
  if (
    strike <= 0 ||
    stockPrice <= 0
  ) {
    return "غير محدد";
  }

  const distancePct =
    Math.abs(
      strike - stockPrice
    ) / stockPrice * 100;

  if (distancePct <= 0.75) {
    return "قريب من سعر السهم";
  }

  const isInMoney =
    contractType === "call"
      ? strike < stockPrice
      : strike > stockPrice;

  return isInMoney
    ? "داخل نطاق السعر"
    : "خارج نطاق السعر";
}

function getDirectionStatus(
  contractType: "call" | "put",
  delta: number,
  gamma: number
) {
  const expectedDelta =
    contractType === "call"
      ? delta > 0
      : delta < 0;

  const gammaSupportive =
    Math.abs(gamma) >= 0.005;

  if (
    expectedDelta &&
    gammaSupportive
  ) {
    return "الاتجاه والقاما داعمان";
  }

  if (!expectedDelta) {
    return "عكس الاتجاه";
  }

  return "الاتجاه واضح والقاما ضعيفة";
}

function getGammaStatus(
  gamma: number
) {
  const absoluteGamma =
    Math.abs(gamma);

  if (absoluteGamma >= 0.02) {
    return "قاما قوية";
  }

  if (absoluteGamma >= 0.005) {
    return "قاما داعمة";
  }

  return "قاما ضعيفة";
}

function calculateWhaleScore(input: {
  premiumValue: number;
  volume: number;
  openInterest: number;
  lastTradeSize: number;
  spreadPct: number | null;
  delta: number;
  gamma: number;
  moneyPosition: string;
}) {
  let score = 35;

  if (
    input.premiumValue >=
    10_000_000
  ) {
    score += 25;
  } else if (
    input.premiumValue >=
    5_000_000
  ) {
    score += 20;
  } else if (
    input.premiumValue >=
    2_000_000
  ) {
    score += 14;
  } else {
    score += 8;
  }

  if (
    input.lastTradeSize >= 1000
  ) {
    score += 14;
  } else if (
    input.lastTradeSize >= 500
  ) {
    score += 10;
  } else if (
    input.lastTradeSize >= 100
  ) {
    score += 6;
  }

  if (
    input.openInterest > 0 &&
    input.volume >
      input.openInterest
  ) {
    score += 12;
  } else if (
    input.openInterest > 0 &&
    input.volume /
      input.openInterest >=
      0.5
  ) {
    score += 7;
  }

  if (
    input.spreadPct !== null
  ) {
    if (input.spreadPct <= 5) {
      score += 10;
    } else if (
      input.spreadPct <= 10
    ) {
      score += 6;
    } else if (
      input.spreadPct > 20
    ) {
      score -= 10;
    }
  }

  const absoluteDelta =
    Math.abs(input.delta);

  if (
    absoluteDelta >= 0.25 &&
    absoluteDelta <= 0.65
  ) {
    score += 8;
  } else if (
    absoluteDelta < 0.1
  ) {
    score -= 5;
  }

  if (
    Math.abs(input.gamma) >=
    0.005
  ) {
    score += 7;
  }

  if (
    input.moneyPosition ===
    "خارج نطاق السعر"
  ) {
    score += 4;
  }

  return clamp(
    Math.round(score),
    0,
    100
  );
}

function classifyWhale(
  score: number,
  moneyPosition: string,
  directionStatus: string
) {
  if (
    score >= 88 &&
    directionStatus ===
      "الاتجاه والقاما داعمان"
  ) {
    return "حوت مؤكد";
  }

  if (
    score >= 78 &&
    moneyPosition ===
      "خارج نطاق السعر"
  ) {
    return "حوت شجاع";
  }

  if (
    score >= 65 &&
    (
      directionStatus ===
        "عكس الاتجاه" ||
      directionStatus ===
        "الاتجاه واضح والقاما ضعيفة"
    )
  ) {
    return "حوت مغامر";
  }

  return "حوت محايد";
}

function buildReason(input: {
  classification: string;
  premiumValue: number;
  volume: number;
  openInterest: number;
  spreadPct: number | null;
  moneyPosition: string;
  directionStatus: string;
  gammaStatus: string;
}) {
  const reasons = [
    `قيمة التداول التقديرية ${(input.premiumValue / 1_000_000).toFixed(2)} مليون دولار`,
    `موضع العقد: ${input.moneyPosition}`,
    input.directionStatus,
    input.gammaStatus,
  ];

  if (
    input.openInterest > 0 &&
    input.volume >
      input.openInterest
  ) {
    reasons.push(
      "حجم اليوم أعلى من العقود المفتوحة"
    );
  }

  if (
    input.spreadPct !== null
  ) {
    reasons.push(
      `السبريد ${input.spreadPct.toFixed(2)}%`
    );
  }

  if (
    input.classification ===
    "حوت مغامر"
  ) {
    reasons.push(
      "الصفقة كبيرة لكن عوامل المخاطرة مرتفعة"
    );
  }

  return reasons.join(" • ");
}

async function fetchOptionChain(
  symbol: string,
  apiKey: string
) {
  const contracts: MassiveContract[] =
    [];

  let url =
    `https://api.massive.com/v3/snapshot/options/${encodeURIComponent(
      symbol
    )}` +
    `?limit=${MAX_RESULTS_PER_SYMBOL}` +
    `&apiKey=${encodeURIComponent(
      apiKey
    )}`;

  let pageCount = 0;

  while (
    url &&
    pageCount < 3
  ) {
    const response = await fetch(url, {
      cache: "no-store",
    });

    const responseText =
      await response.text();

    if (!responseText.trim()) {
      throw new Error(
        `رد Massive فارغ للرمز ${symbol}`
      );
    }

    const data = JSON.parse(
      responseText
    ) as MassiveChainResponse;

    if (!response.ok) {
      throw new Error(
        data.error ||
          `فشل جلب عقود ${symbol}`
      );
    }

    contracts.push(
      ...(data.results || [])
    );

    if (!data.next_url) {
      break;
    }

    url = data.next_url.includes(
      "apiKey="
    )
      ? data.next_url
      : `${data.next_url}${
          data.next_url.includes("?")
            ? "&"
            : "?"
        }apiKey=${encodeURIComponent(
          apiKey
        )}`;

    pageCount += 1;
  }

  return contracts;
}


function getContractCandidateScore(
  contract: MassiveContract
) {
  const ticker =
    contract.details?.ticker || "";

  const expiration =
    contract.details?.expiration_date || "";

  const strike = safeNumber(
    contract.details?.strike_price
  );

  const stockPrice = safeNumber(
    contract.underlying_asset?.price
  );

  const bid = safeNumber(
    contract.last_quote?.bid
  );

  const ask = safeNumber(
    contract.last_quote?.ask
  );

  const midpoint =
    bid > 0 && ask > 0
      ? (bid + ask) / 2
      : safeNumber(
          contract.last_trade?.price
        );

  const spreadPct =
    calculateSpreadPct(
      bid,
      ask
    );

  const volume = safeNumber(
    contract.day?.volume
  );

  const openInterest =
    safeNumber(
      contract.open_interest
    );

  const expirationTime =
    new Date(
      `${expiration}T23:59:59Z`
    ).getTime();

  const daysToExpiration =
    Number.isFinite(expirationTime)
      ? Math.ceil(
          (expirationTime - Date.now()) /
            86_400_000
        )
      : -1;

  const strikeDistancePct =
    stockPrice > 0
      ? (
          Math.abs(
            strike - stockPrice
          ) /
          stockPrice
        ) * 100
      : Number.POSITIVE_INFINITY;

  const eligible =
    Boolean(ticker) &&
    strike > 0 &&
    stockPrice > 0 &&
    daysToExpiration >= 1 &&
    daysToExpiration <= 45 &&
    strikeDistancePct <= 12 &&
    midpoint > 0 &&
    midpoint <=
      MAX_APPROVED_CONTRACT_PRICE &&
    spreadPct !== null &&
    spreadPct <=
      MAX_APPROVED_SPREAD_PCT &&
    volume > 0;

  return {
    eligible,
    score:
      volume * 10 +
      openInterest -
      strikeDistancePct * 100,
  };
}

function selectTradeCandidates(
  contracts: MassiveContract[]
) {
  return contracts
    .map((contract) => ({
      contract,
      candidate:
        getContractCandidateScore(
          contract
        ),
    }))
    .filter(
      ({ candidate }) =>
        candidate.eligible
    )
    .sort(
      (a, b) =>
        b.candidate.score -
        a.candidate.score
    )
    .slice(
      0,
      MAX_TRADE_CANDIDATES_PER_SYMBOL
    )
    .map(({ contract }) => contract);
}

async function fetchRecentOptionTrades(
  optionTicker: string,
  apiKey: string
) {
  const lookbackMilliseconds =
    Date.now() -
    TRADE_LOOKBACK_MINUTES *
      60_000;

  /*
   * Massive يقبل timestamp بالنانوثانية.
   * نستخدم BigInt لتجنب فقدان الدقة.
   */
  const timestampGte =
    (
      BigInt(lookbackMilliseconds) *
      BigInt(1_000_000)
    ).toString();

  const url =
    `https://api.massive.com/v3/trades/${encodeURIComponent(
      optionTicker
    )}` +
    `?timestamp.gte=${timestampGte}` +
    `&sort=timestamp` +
    `&order=desc` +
    `&limit=${MAX_TRADES_PER_CONTRACT}` +
    `&apiKey=${encodeURIComponent(
      apiKey
    )}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  const responseText =
    await response.text();

  if (!responseText.trim()) {
    return [];
  }

  const data = JSON.parse(
    responseText
  ) as MassiveTradesResponse;

  if (!response.ok) {
    throw new Error(
      data.error ||
        `فشل جلب تداولات ${optionTicker}`
    );
  }

  return data.results || [];
}

async function fetchRecentOptionQuotes(
  optionTicker: string,
  apiKey: string
) {
  const lookbackMilliseconds =
    Date.now() -
    TRADE_LOOKBACK_MINUTES *
      60_000;

  const timestampGte =
    (
      BigInt(lookbackMilliseconds) *
      BigInt(1_000_000)
    ).toString();

  const url =
    `https://api.massive.com/v3/quotes/${encodeURIComponent(
      optionTicker
    )}` +
    `?timestamp.gte=${timestampGte}` +
    `&sort=timestamp` +
    `&order=desc` +
    `&limit=250` +
    `&apiKey=${encodeURIComponent(
      apiKey
    )}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  const responseText =
    await response.text();

  if (!responseText.trim()) {
    return [];
  }

  const data = JSON.parse(
    responseText
  ) as MassiveQuotesResponse;

  if (!response.ok) {
    throw new Error(
      data.error ||
        `فشل جلب Quotes التاريخية للعقد ${optionTicker}`
    );
  }

  return data.results || [];
}

function determineTradeHistoricalSide(
  trade: InstitutionalTrade,
  quotes: MassiveOptionQuote[]
):
  | "ASK"
  | "BID"
  | "MID"
  | "UNKNOWN" {
  let nearest:
    | MassiveOptionQuote
    | null = null;

  let nearestDistance:
    | bigint
    | null = null;

  for (const quote of quotes) {
    const rawTimestamp =
      quote.sip_timestamp;

    if (
      rawTimestamp === undefined ||
      rawTimestamp === null
    ) {
      continue;
    }

    let quoteTimestamp: bigint;

    try {
      quoteTimestamp =
        BigInt(
          String(rawTimestamp)
        );
    } catch {
      continue;
    }

    const distance =
      quoteTimestamp >=
      trade.timestampNs
        ? quoteTimestamp -
          trade.timestampNs
        : trade.timestampNs -
          quoteTimestamp;

    if (
      nearestDistance === null ||
      distance < nearestDistance
    ) {
      nearest = quote;
      nearestDistance =
        distance;
    }
  }

  if (!nearest) {
    return "UNKNOWN";
  }

  const bid =
    safeNumber(
      nearest.bid_price
    );

  const ask =
    safeNumber(
      nearest.ask_price
    );

  if (
    bid <= 0 ||
    ask <= bid
  ) {
    return "UNKNOWN";
  }

  const position =
    (
      (trade.price - bid) /
      (ask - bid)
    ) * 100;

  if (position >= 55) {
    return "ASK";
  }

  if (position <= 35) {
    return "BID";
  }

  return "MID";
}

function findLargestRecentTrade(
  trades: MassiveOptionTrade[]
) {
  return trades
    .filter((trade) => {
      const price =
        safeNumber(trade.price);

      const size =
        safeNumber(trade.size);

      return (
        price > 0 &&
        size > 0
      );
    })
    .sort((a, b) => {
      const premiumA =
        safeNumber(a.price) *
        safeNumber(a.size) *
        100;

      const premiumB =
        safeNumber(b.price) *
        safeNumber(b.size) *
        100;

      return premiumB - premiumA;
    })[0] || null;
}

type CompositeMarketContext = {
  callVolume: number;
  putVolume: number;
  netGex: number;
};

function buildCompositeMarketContext(
  contracts: MassiveContract[]
): CompositeMarketContext {
  let callVolume = 0;
  let putVolume = 0;
  let callGex = 0;
  let putGex = 0;

  for (const contract of contracts) {
    const side =
      contract.details?.contract_type;

    const volume =
      safeNumber(
        contract.day?.volume
      );

    const openInterest =
      safeNumber(
        contract.open_interest
      );

    const gamma =
      Math.abs(
        safeNumber(
          contract.greeks?.gamma
        )
      );

    const stockPrice =
      safeNumber(
        contract.underlying_asset?.price
      );

    const gex =
      gamma *
      openInterest *
      100 *
      stockPrice *
      stockPrice *
      0.01;

    if (side === "call") {
      callVolume += volume;
      callGex += gex;
    }

    if (side === "put") {
      putVolume += volume;
      putGex += gex;
    }
  }

  return {
    callVolume,
    putVolume,
    netGex:
      callGex - putGex,
  };
}

function calculateCompositeWhaleScore(
  row: WhaleTradeRow,
  contract: MassiveContract,
  context: CompositeMarketContext
) {
  /*
   * لا نعتمد صفقات البيع أو الاتجاه غير المحسوم
   * كتوصيات تنفيذية.
   */
  if (
    row.execution_side !== "BUY"
  ) {
    whaleRejectStats.executionNotBuy++;
    return null;
  }

  if (
    row.contract_price <= 0 ||
    row.contract_price >
      MAX_APPROVED_CONTRACT_PRICE
  ) {
    whaleRejectStats.contractPriceRejected++;
    return null;
  }

  if (
    row.spread_pct === null ||
    row.spread_pct >
      MAX_APPROVED_SPREAD_PCT
  ) {
    whaleRejectStats.spreadRejected++;
    return null;
  }

  const isCall =
    row.contract_type === "call";

  const directionalVolume =
    isCall
      ? context.callVolume
      : context.putVolume;

  const oppositeVolume =
    isCall
      ? context.putVolume
      : context.callVolume;

  const totalDirectionalVolume =
    directionalVolume +
    oppositeVolume;

  const directionalVolumePct =
    totalDirectionalVolume > 0
      ? (
          directionalVolume /
          totalDirectionalVolume
        ) * 100
      : 50;

  /*
   * التدفق المؤسسي: 35 نقطة
   */
  let flowScore = 0;

  if (
    row.premium_value >=
    5_000_000
  ) {
    flowScore += 12;
  } else if (
    row.premium_value >=
    2_000_000
  ) {
    flowScore += 10;
  } else if (
    row.premium_value >=
    1_000_000
  ) {
    flowScore += 8;
  }

  flowScore +=
    Math.min(
      10,
      row.execution_confidence *
        0.1
    );

  if (
    row.open_interest > 0 &&
    row.volume >
      row.open_interest
  ) {
    flowScore += 8;
  } else if (
    row.volume >= 500
  ) {
    flowScore += 5;
  }

  if (
    directionalVolumePct >= 60
  ) {
    flowScore += 5;
  } else if (
    directionalVolumePct >= 52
  ) {
    flowScore += 3;
  }

  flowScore =
    clamp(
      Math.round(flowScore),
      0,
      35
    );

  /*
   * القاما وGEX: 25 نقطة
   */
  let gammaScore = 0;

  const gammaAligned =
    isCall
      ? context.netGex >= 0
      : context.netGex <= 0;

  if (gammaAligned) {
    gammaScore += 12;
  }

  const absoluteGamma =
    Math.abs(
      safeNumber(row.gamma)
    );

  if (
    absoluteGamma >= 0.02
  ) {
    gammaScore += 8;
  } else if (
    absoluteGamma >= 0.005
  ) {
    gammaScore += 5;
  }

  if (
    row.direction_status ===
    "الاتجاه والقاما داعمان"
  ) {
    gammaScore += 5;
  } else if (
    row.direction_status ===
    "عكس الاتجاه"
  ) {
    whaleRejectStats.gammaDirectionRejected++;
    return null;
  }

  gammaScore =
    clamp(
      Math.round(gammaScore),
      0,
      25
    );

  /*
   * الزخم: 20 نقطة
   * يعتمد على حركة العقد اليومية واتساقها
   * مع اتجاه CALL أو PUT.
   */
  const dayOpen =
    safeNumber(
      contract.day?.open
    );

  const dayClose =
    safeNumber(
      contract.day?.close
    );

  const dayLow =
    safeNumber(
      contract.day?.low
    );

  const dayHigh =
    safeNumber(
      contract.day?.high
    );

  const momentumPct =
    dayOpen > 0
      ? (
          (dayClose - dayOpen) /
          dayOpen
        ) * 100
      : 0;

  let momentumScore = 0;

  if (momentumPct >= 15) {
    momentumScore += 12;
  } else if (
    momentumPct >= 7
  ) {
    momentumScore += 9;
  } else if (
    momentumPct >= 2
  ) {
    momentumScore += 6;
  }

  if (
    dayHigh > dayLow &&
    dayClose >=
      dayLow +
        (dayHigh - dayLow) *
          0.65
  ) {
    momentumScore += 5;
  }

  if (
    directionalVolumePct >= 55
  ) {
    momentumScore += 3;
  }

  momentumScore =
    clamp(
      Math.round(momentumScore),
      0,
      20
    );

  /*
   * جودة العقد: 20 نقطة
   */
  let contractScore = 0;

  const absoluteDelta =
    Math.abs(
      safeNumber(row.delta)
    );

  if (
    absoluteDelta >= 0.25 &&
    absoluteDelta <= 0.55
  ) {
    contractScore += 7;
  } else if (
    absoluteDelta >= 0.18 &&
    absoluteDelta <= 0.65
  ) {
    contractScore += 4;
  }

  if (
    row.spread_pct <= 5
  ) {
    contractScore += 6;
  } else if (
    row.spread_pct <= 10
  ) {
    contractScore += 4;
  } else {
    contractScore += 2;
  }

  if (
    row.open_interest >= 1000
  ) {
    contractScore += 4;
  } else if (
    row.open_interest >= 300
  ) {
    contractScore += 2;
  }

  if (
    row.contract_price <= 2
  ) {
    contractScore += 3;
  } else {
    contractScore += 2;
  }

  contractScore =
    clamp(
      Math.round(contractScore),
      0,
      20
    );

  const totalScore =
    flowScore +
    gammaScore +
    momentumScore +
    contractScore;

  if (
    totalScore <
    MIN_WHALE_SCORE
  ) {
    whaleRejectStats.compositeScoreTooLow++;
    return null;
  }

  return {
    score: totalScore,
    flowScore,
    gammaScore,
    momentumScore,
    contractScore,
    reason:
      `التقييم المركب ${totalScore}%` +
      ` • التدفق ${flowScore}/35` +
      ` • القاما وGEX ${gammaScore}/25` +
      ` • الزخم ${momentumScore}/20` +
      ` • جودة العقد ${contractScore}/20`,
  };
}

function applyCompositeWhaleEngine(
  rows: WhaleTradeRow[],
  contracts: MassiveContract[]
) {
  const context =
    buildCompositeMarketContext(
      contracts
    );

  const contractsByTicker =
    new Map(
      contracts.map((contract) => [
        contract.details?.ticker || "",
        contract,
      ])
    );

  return rows
    .map((row) => {
      const contract =
        contractsByTicker.get(
          row.option_ticker
        );

      if (!contract) {
        return null;
      }

      const composite =
        calculateCompositeWhaleScore(
          row,
          contract,
          context
        );

      if (!composite) {
        return null;
      }

      return {
        ...row,
        whale_score:
          composite.score,
        classification:
          composite.score >= 90
            ? "فرصة مؤسسية قوية"
            : "فرصة مؤسسية مؤهلة",
        reason:
          `${composite.reason} • ${row.reason}`,
      };
    })
    .filter(
      (
        row
      ): row is WhaleTradeRow =>
        row !== null
    );
}

function analyzeContract(
  symbol: string,
  contract: MassiveContract,
  actualTrade?: MassiveOptionTrade
): WhaleTradeRow | null {
  const optionTicker =
    contract.details?.ticker || "";

  const contractType =
    contract.details?.contract_type;

  const expiration =
    contract.details?.expiration_date ||
    "";

  const strike = safeNumber(
    contract.details?.strike_price
  );

  const stockPrice = safeNumber(
    contract.underlying_asset?.price
  );

  const strikeDistancePct =
  Math.abs(strike - stockPrice) /
  stockPrice *
  100;

const expirationTime =
  new Date(
    `${expiration}T23:59:59Z`
  ).getTime();

const daysToExpiration =
  Math.ceil(
    (expirationTime - Date.now()) /
    86_400_000
  );

if (
  strikeDistancePct > 12 ||
  daysToExpiration < 1 ||
  daysToExpiration > 45
) {
  whaleRejectStats.strikeOrDte++;
  return null;
}

  if (
    !optionTicker ||
    !contractType ||
    !expiration ||
    strike <= 0 ||
    stockPrice <= 0
  ) {
    whaleRejectStats.invalidBasics++;
    return null;
  }

  const bid = safeNumber(
    contract.last_quote?.bid
  );

  const ask = safeNumber(
    contract.last_quote?.ask
  );

  const lastTradePrice =
    safeNumber(
      actualTrade?.price ??
        contract.last_trade?.price
    );

  const midpoint =
    bid > 0 && ask > 0
      ? (bid + ask) / 2
      : lastTradePrice;

  const executionPrice =
    lastTradePrice > 0
      ? lastTradePrice
      : midpoint;

  const execution =
    detectExecutionSide(
      contractType,
      executionPrice,
      bid,
      ask
    );

  const lastTradeSize =
    safeNumber(
      actualTrade?.size ??
        contract.last_trade?.size
    );

  const volume = safeNumber(
    contract.day?.volume
  );

  const openInterest =
    safeNumber(
      contract.open_interest
    );

  if (
    executionPrice <= 0 ||
    lastTradeSize <= 0
  ) {
    whaleRejectStats.invalidExecutionData++;
    return null;
  }

  const premiumValue =
    executionPrice *
    lastTradeSize *
    100;

  if (
    premiumValue <
    MIN_PREMIUM_VALUE
  ) {
    whaleRejectStats.premiumTooLow++;
    return null;
  }

  const spreadPct =
    calculateSpreadPct(
      bid,
      ask
    );

  const delta = safeNumber(
    contract.greeks?.delta
  );

  const gamma = safeNumber(
    contract.greeks?.gamma
  );

  const theta = safeNumber(
    contract.greeks?.theta
  );

  const vega = safeNumber(
    contract.greeks?.vega
  );

  const iv = safeNumber(
    contract.implied_volatility
  );

  const moneyPosition =
    getMoneyPosition(
      contractType,
      strike,
      stockPrice
    );

  const directionStatus =
    getDirectionStatus(
      contractType,
      delta,
      gamma
    );

  const gammaStatus =
    getGammaStatus(gamma);

  const whaleScore =
    calculateWhaleScore({
      premiumValue,
      volume,
      openInterest,
      lastTradeSize,
      spreadPct,
      delta,
      gamma,
      moneyPosition,
    });

  if (
    whaleScore <
    MIN_WHALE_SCORE
  ) {
    whaleRejectStats.whaleScoreTooLow++;
    return null;
  }

  const classification =
    classifyWhale(
      whaleScore,
      moneyPosition,
      directionStatus
    );

  const reason = buildReason({
    classification,
    premiumValue,
    volume,
    openInterest,
    spreadPct,
    moneyPosition,
    directionStatus,
    gammaStatus,
  });

  return {
    symbol,
    option_ticker: optionTicker,
    contract_type: contractType,
    strike,
    expiration,

    stock_price: stockPrice,
    contract_price:
      executionPrice,

    premium_value: premiumValue,
    volume,
    open_interest: openInterest,
    volume_change: lastTradeSize,

    bid,
    ask,
    spread_pct: spreadPct,

    trade_price:
      executionPrice,

    execution_side:
      execution.side,

    execution_confidence:
      execution.confidence,

    execution_position_pct:
      execution.positionPct,

    market_bias:
      execution.marketBias,

    execution_reason:
      execution.reason,

    delta,
    gamma,
    theta,
    vega,
    iv,

    whale_score: whaleScore,
    classification,

    money_position: moneyPosition,
    direction_status:
      directionStatus,
    gamma_status: gammaStatus,

    reason:
      `${reason} • ${execution.reason}`,
    last_seen_at:
      new Date().toISOString(),
    is_active: true,
  };
}

type PreviousWhaleTradeRow = {
  option_ticker?: string | null;
  premium_value?: number | string | null;
  volume_change?: number | string | null;
  repeat_count?: number | string | null;
  estimated_side?: string | null;
  execution_location?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  expiration?: string | null;
  raw?: Record<string, unknown> | null;
};

type WhaleActivityTracking = {
  status:
    | "NEW"
    | "INCREASING"
    | "CONTINUING"
    | "STABLE"
    | "WEAKENING"
    | "OPPOSITE_FLOW"
    | "EXPIRED";

  status_label: string;
  status_reason: string;

  first_seen_at: string;
  last_activity_at: string;
  last_scan_at: string;

  scan_count: number;

  initial_premium: number;
  previous_premium: number;
  current_premium: number;
  premium_change: number;
  premium_change_from_start: number;

  initial_size: number;
  previous_size: number;
  current_size: number;
  size_change: number;
  size_change_from_start: number;

  initial_trade_count: number;
  previous_trade_count: number;
  current_trade_count: number;
  trade_count_change: number;
  trade_count_change_from_start: number;

  previous_side: string;
  current_side: string;
  previous_location: string;
  current_location: string;

  minutes_since_growth: number;
};

function getObjectRecord(
  value: unknown
): Record<string, unknown> {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : {};
}

function getPreviousTracking(
  value: unknown
): Partial<WhaleActivityTracking> {
  const raw =
    getObjectRecord(value);

  return getObjectRecord(
    raw.activity_tracking
  ) as Partial<WhaleActivityTracking>;
}

function isExpirationFinished(
  expiration: string | null | undefined,
  now: Date
) {
  if (!expiration) {
    return false;
  }

  const expirationDate =
    new Date(
      `${expiration}T23:59:59-04:00`
    );

  return (
    Number.isFinite(
      expirationDate.getTime()
    ) &&
    expirationDate.getTime() <
      now.getTime()
  );
}

async function addWhaleActivityTracking(
  rows: WhaleTradeRow[],
  supabaseUrl: string,
  supabaseSecret: string
): Promise<WhaleTradeRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const optionTickers =
    Array.from(
      new Set(
        rows
          .map(
            (row) =>
              String(
                row.option_ticker || ""
              ).trim()
          )
          .filter(Boolean)
      )
    );

  const previousByTicker =
    new Map<
      string,
      PreviousWhaleTradeRow
    >();

  if (optionTickers.length > 0) {
    const inFilter =
      optionTickers
        .map(
          (ticker) =>
            `"${ticker.replaceAll(
              '"',
              ""
            )}"`
        )
        .join(",");

    const previousUrl =
      `${supabaseUrl}/rest/v1/whale_trades` +
      "?select=" +
      [
        "option_ticker",
        "premium_value",
        "volume_change",
        "repeat_count",
        "estimated_side",
        "execution_location",
        "first_seen_at",
        "last_seen_at",
        "expiration",
        "raw",
      ].join(",") +
      `&option_ticker=in.(${encodeURIComponent(
        inFilter
      )})`;

    const previousResponse =
      await fetch(
        previousUrl,
        {
          headers: {
            apikey:
              supabaseSecret,
            Authorization:
              `Bearer ${supabaseSecret}`,
          },
          cache: "no-store",
        }
      );

    if (previousResponse.ok) {
      const previousRows =
        await previousResponse.json();

      if (Array.isArray(previousRows)) {
        for (
          const previousRow
          of previousRows
        ) {
          const ticker =
            String(
              previousRow
                ?.option_ticker ||
              ""
            );

          if (ticker) {
            previousByTicker.set(
              ticker,
              previousRow
            );
          }
        }
      }
    } else {
      console.error(
        "تعذر جلب دورة حياة عقود الحيتان:",
        previousResponse.status,
        await previousResponse.text()
      );
    }
  }

  const now =
    new Date();

  const nowIso =
    now.toISOString();

  return rows.map((row) => {
    const previous =
      previousByTicker.get(
        row.option_ticker
      );

    const previousRaw =
      getObjectRecord(
        previous?.raw
      );

    const previousTracking =
      getPreviousTracking(
        previous?.raw
      );

    const currentPremium =
      safeNumber(
        row.premium_value
      );

    const currentSize =
      safeNumber(
        row.volume_change
      );

    const currentTradeCount =
      safeNumber(
        row.repeat_count
      );

    const previousPremium =
      previous
        ? safeNumber(
            previous.premium_value
          )
        : currentPremium;

    const previousSize =
      previous
        ? safeNumber(
            previous.volume_change
          )
        : currentSize;

    const previousTradeCount =
      previous
        ? safeNumber(
            previous.repeat_count
          )
        : currentTradeCount;

    const initialPremium =
      safeNumber(
        previousTracking
          .initial_premium,
        previousPremium
      );

    const initialSize =
      safeNumber(
        previousTracking
          .initial_size,
        previousSize
      );

    const initialTradeCount =
      safeNumber(
        previousTracking
          .initial_trade_count,
        previousTradeCount
      );

    const premiumChange =
      currentPremium -
      previousPremium;

    const sizeChange =
      currentSize -
      previousSize;

    const tradeCountChange =
      currentTradeCount -
      previousTradeCount;

    const hasGrowth =
      premiumChange > 0 ||
      sizeChange > 0 ||
      tradeCountChange > 0;

    const currentSide =
      String(
        row.estimated_side ||
        row.execution_side ||
        "UNKNOWN"
      ).toUpperCase();

    const previousSide =
      String(
        previous?.estimated_side ||
        previousTracking
          .current_side ||
        "UNKNOWN"
      ).toUpperCase();

    const currentLocation =
      String(
        row.execution_location ||
        "UNKNOWN"
      ).toUpperCase();

    const previousLocation =
      String(
        previous
          ?.execution_location ||
        previousTracking
          .current_location ||
        "UNKNOWN"
      ).toUpperCase();

    const hasOppositeFlow =
      Boolean(previous) &&
      previousSide !== "UNKNOWN" &&
      currentSide !== "UNKNOWN" &&
      previousSide !== currentSide;

    const firstSeenAt =
      String(
        previous
          ?.first_seen_at ||
        previousTracking
          .first_seen_at ||
        nowIso
      );

    const previousActivityAt =
      String(
        previousTracking
          .last_activity_at ||
        previous?.last_seen_at ||
        firstSeenAt
      );

    const lastActivityAt =
      (
        !previous ||
        hasGrowth ||
        hasOppositeFlow
      )
        ? nowIso
        : previousActivityAt;

    const lastActivityMs =
      new Date(
        lastActivityAt
      ).getTime();

    const minutesSinceGrowth =
      Number.isFinite(
        lastActivityMs
      )
        ? Math.max(
            0,
            Math.floor(
              (
                now.getTime() -
                lastActivityMs
              ) /
                60_000
            )
          )
        : 0;

    const expired =
      isExpirationFinished(
        row.expiration,
        now
      );

    let status:
      WhaleActivityTracking["status"];

    let statusLabel:
      string;

    let statusReason:
      string;

    if (expired) {
      status =
        "EXPIRED";
      statusLabel =
        "الرصد منتهي";
      statusReason =
        "انتهى تاريخ العقد.";
    } else if (hasOppositeFlow) {
      status =
        "OPPOSITE_FLOW";
      statusLabel =
        "ظهر تدفق معاكس";
      statusReason =
        `تغيرت جهة التنفيذ من ${previousSide} إلى ${currentSide}.`;
    } else if (!previous) {
      status =
        "NEW";
      statusLabel =
        currentSide === "BUY"
          ? "شراء مؤسسي جديد"
          : currentSide === "SELL"
            ? "بيع مؤسسي جديد"
            : "نشاط مؤسسي جديد";
      statusReason =
        "هذه أول قراءة مؤهلة للعقد.";
    } else if (hasGrowth) {
      status =
        "INCREASING";
      statusLabel =
        currentSide === "BUY"
          ? "الشراء المؤسسي يتزايد"
          : currentSide === "SELL"
            ? "البيع المؤسسي يتزايد"
            : "النشاط المؤسسي يتزايد";
      statusReason =
        "زادت القيمة أو الكمية أو عدد التنفيذات مقارنة بالقراءة السابقة.";
    } else if (
      minutesSinceGrowth <= 30
    ) {
      status =
        "CONTINUING";
      statusLabel =
        currentSide === "BUY"
          ? "الشراء المؤسسي مستمر"
          : currentSide === "SELL"
            ? "البيع المؤسسي مستمر"
            : "النشاط المؤسسي مستمر";
      statusReason =
        "العقد ما زال يظهر بنفس جهة التنفيذ دون تدفق معاكس.";
    } else if (
      minutesSinceGrowth <= 120
    ) {
      status =
        "STABLE";
      statusLabel =
        "النشاط مستقر";
      statusReason =
        "لا توجد زيادة جديدة حاليًا، ولم يظهر تدفق معاكس.";
    } else {
      status =
        "WEAKENING";
      statusLabel =
        "النشاط يضعف";
      statusReason =
        "لم ترتفع القيمة أو الكمية أو عدد التنفيذات منذ فترة.";
    }

    const scanCount =
      Math.max(
        0,
        safeNumber(
          previousTracking
            .scan_count
        )
      ) + 1;

    const tracking:
      WhaleActivityTracking = {
        status,
        status_label:
          statusLabel,
        status_reason:
          statusReason,

        first_seen_at:
          firstSeenAt,
        last_activity_at:
          lastActivityAt,
        last_scan_at:
          nowIso,

        scan_count:
          scanCount,

        initial_premium:
          initialPremium,
        previous_premium:
          previousPremium,
        current_premium:
          currentPremium,
        premium_change:
          premiumChange,
        premium_change_from_start:
          currentPremium -
          initialPremium,

        initial_size:
          initialSize,
        previous_size:
          previousSize,
        current_size:
          currentSize,
        size_change:
          sizeChange,
        size_change_from_start:
          currentSize -
          initialSize,

        initial_trade_count:
          initialTradeCount,
        previous_trade_count:
          previousTradeCount,
        current_trade_count:
          currentTradeCount,
        trade_count_change:
          tradeCountChange,
        trade_count_change_from_start:
          currentTradeCount -
          initialTradeCount,

        previous_side:
          previousSide,
        current_side:
          currentSide,
        previous_location:
          previousLocation,
        current_location:
          currentLocation,

        minutes_since_growth:
          minutesSinceGrowth,
      };

    return {
      ...row,
      first_seen_at:
        firstSeenAt,

      /*
       * last_seen_at هنا يمثل آخر مرة
       * تغير فيها النشاط فعليًا،
       * وليس مجرد وقت تشغيل الماسح.
       */
      last_seen_at:
        lastActivityAt,

      raw: {
        ...previousRaw,
        activity_tracking:
          tracking,
      },
    };
  });
}

async function saveWhaleTrades(
  rows: WhaleTradeRow[],
  supabaseUrl: string,
  supabaseSecret: string
) {
  if (rows.length === 0) {
    return [];
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/whale_trades?on_conflict=option_ticker`,
    {
      method: "POST",
      headers: {
        apikey: supabaseSecret,
        Authorization:
          `Bearer ${supabaseSecret}`,
        "Content-Type":
          "application/json",
        Prefer:
          "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(rows),
      cache: "no-store",
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `فشل الحفظ في Supabase: ${responseText}`
    );
  }

  if (!responseText.trim()) {
    return rows;
  }

  return JSON.parse(responseText);
}

function authorizeRequest(
  request: NextRequest
) {
  const cronSecret =
    process.env.WHALE_CRON_SECRET ||
    process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  const authorization =
    request.headers.get(
      "authorization"
    );

  return (
    authorization ===
    `Bearer ${cronSecret}`
  );
}

export async function GET(
  request: NextRequest
) {
  if (!authorizeRequest(request)) {
    return NextResponse.json(
      {
        error:
          "غير مصرح بتنفيذ الفحص.",
      },
      {
        status: 401,
      }
    );
  }

  const massiveApiKey =
    process.env.MASSIVE_API_KEY;

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseSecret =
    process.env
      .SUPABASE_SECRET_KEY ||
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (
    !massiveApiKey ||
    !supabaseUrl ||
    !supabaseSecret
  ) {
    return NextResponse.json(
      {
        error:
          "متغيرات البيئة الخاصة بـ Massive أو Supabase ناقصة.",
      },
      {
        status: 500,
      }
    );
  }

  const force =
    request.nextUrl.searchParams.get(
      "force"
    ) === "1";

  const marketState =
    getRiyadhMarketState();

  const symbols =
    await loadScanSymbols();

  console.log(
    `WHALE SCAN SYMBOLS: ${symbols.length}`
  );

  if (
    !marketState.isOpen &&
    !force
  ) {
    return NextResponse.json({
      ok: true,
      symbolsScanned:
        symbols.length,
      scanned: false,
      marketOpen: false,
      message:
        "السوق مغلق، لم يتم تنفيذ الفحص.",
    });
  }

  for (
    const key of Object.keys(
      whaleRejectStats
    ) as Array<
      keyof typeof whaleRejectStats
    >
  ) {
    whaleRejectStats[key] = 0;
  }

  const detectedRows: WhaleTradeRow[] =
    [];

  /*
   * نتائج محرك النشاط المؤسسي V2.
   * تشخيصية فقط ولا يتم حفظها في قاعدة البيانات.
   */
  const institutionalV2Results:
    InstitutionalFlowResult[] = [];

  /*
   * نتائج V2 المؤهلة للحفظ والعرض في صفحة صفقات الحيتان.
   */
  const institutionalV2Rows:
    WhaleTradeRow[] = [];

  const institutionalV2Stats = {
    contractsAnalyzed: 0,
    sweepsDetected: 0,
    blocksDetected: 0,
    askSideDetected: 0,
    openingLikelyDetected: 0,
    qualifiedScore65: 0,
    qualifiedScore75: 0,
  };

  const failures: Array<{
    symbol: string;
    error: string;
  }> = [];

  for (const symbol of symbols) {
    try {
      const contracts =
        await fetchOptionChain(
          symbol,
          massiveApiKey
        );

      const candidates =
        selectTradeCandidates(
          contracts
        );

      whaleRejectStats.tradeCandidatesSelected +=
        candidates.length;

      const candidateRows =
        await Promise.all(
          candidates.map(
            async (contract) => {
              const optionTicker =
                contract.details?.ticker ||
                "";

              if (!optionTicker) {
                return null;
              }

              whaleRejectStats.tradeRequestsSent++;

              const trades =
                await fetchRecentOptionTrades(
                  optionTicker,
                  massiveApiKey
                );

              if (trades.length > 0) {
                whaleRejectStats.tradeResponsesWithResults++;
              } else {
                whaleRejectStats.tradeResponsesEmpty++;
              }

              /*
               * تشغيل V2 للتشخيص فقط.
               * لا يحفظ أي فرصة ولا يغيّر نتائج المحرك الحالي.
               */
              const institutionalTrades:
                InstitutionalTrade[] = [];

              for (const trade of trades) {
                const price =
                  safeNumber(
                    trade.price
                  );

                const size =
                  safeNumber(
                    trade.size
                  );

                const rawTimestamp =
                  trade.sip_timestamp;

                if (
                  price <= 0 ||
                  size <= 0 ||
                  rawTimestamp ===
                    undefined ||
                  rawTimestamp === null
                ) {
                  continue;
                }

                try {
                  institutionalTrades.push({
                    price,
                    size,
                    timestampNs:
                      BigInt(
                        String(
                          rawTimestamp
                        )
                      ),
                    exchange:
                      Number.isFinite(
                        Number(
                          trade.exchange
                        )
                      )
                        ? Number(
                            trade.exchange
                          )
                        : undefined,
                  });
                } catch {
                  continue;
                }
              }

              if (
                institutionalTrades.length >
                0
              ) {
                const bid =
                  safeNumber(
                    contract.last_quote?.bid
                  );

                const ask =
                  safeNumber(
                    contract.last_quote?.ask
                  );

                const spreadPct =
                  calculateSpreadPct(
                    bid,
                    ask
                  );

                const historicalQuotes =
                  await fetchRecentOptionQuotes(
                    optionTicker,
                    massiveApiKey
                  );

                const historicalInstitutionalTrades =
                  institutionalTrades.map(
                    (trade) => ({
                      ...trade,
                      historicalSide:
                        determineTradeHistoricalSide(
                          trade,
                          historicalQuotes
                        ),
                    })
                  );

                const v2Results =
                  detectInstitutionalFlow(
                    historicalInstitutionalTrades,
                    {
                      optionTicker,
                      contractType:
                        contract.details
                          ?.contract_type ||
                        "call",
                      bid,
                      ask,
                      dayVolume:
                        safeNumber(
                          contract.day?.volume
                        ),
                      openInterest:
                        safeNumber(
                          contract.open_interest
                        ),
                      gamma:
                        safeNumber(
                          contract.greeks?.gamma
                        ),
                      spreadPct,
                    }
                  );

                institutionalV2Stats
                  .contractsAnalyzed++;

                for (
                  const result of v2Results
                ) {
                  institutionalV2Results.push(
                    result
                  );

                  if (
                    result.activityType ===
                    "SWEEP"
                  ) {
                    institutionalV2Stats
                      .sweepsDetected++;
                  }

                  if (
                    result.activityType ===
                    "BLOCK"
                  ) {
                    institutionalV2Stats
                      .blocksDetected++;
                  }

                  if (
                    result.executionSide ===
                    "ASK"
                  ) {
                    institutionalV2Stats
                      .askSideDetected++;
                  }

                  if (
                    result.openingStatus !==
                    "UNCLEAR"
                  ) {
                    institutionalV2Stats
                      .openingLikelyDetected++;
                  }

                  if (
                    result.score >= 65
                  ) {
                    institutionalV2Stats
                      .qualifiedScore65++;
                  }

                  if (
                    result.score >= 75
                  ) {
                    institutionalV2Stats
                      .qualifiedScore75++;
                  }

                  /*
                   * شروط العرض الجديدة:
                   * Sweep أو Block عند ASK
                   * مع فتح مركز مرجح
                   * وتقييم 75 فأعلى.
                   */
                  if (
                    result.score >= 75 &&
                    result.executionSide ===
                      "ASK" &&
                    result.openingStatus !==
                      "UNCLEAR"
                  ) {
                    const contractType =
                      contract.details
                        ?.contract_type ||
                      "call";

                    const strike =
                      safeNumber(
                        contract.details
                          ?.strike_price
                      );

                    const expiration =
                      contract.details
                        ?.expiration_date ||
                      "";

                    const stockPrice =
                      safeNumber(
                        contract
                          .underlying_asset
                          ?.price
                      );

                    const volume =
                      safeNumber(
                        contract.day?.volume
                      );

                    const openInterest =
                      safeNumber(
                        contract.open_interest
                      );

                    const delta =
                      safeNumber(
                        contract.greeks?.delta
                      );

                    const gamma =
                      safeNumber(
                        contract.greeks?.gamma
                      );

                    const theta =
                      safeNumber(
                        contract.greeks?.theta
                      );

                    const vega =
                      safeNumber(
                        contract.greeks?.vega
                      );

                    const iv =
                      safeNumber(
                        contract
                          .implied_volatility
                      );

                    const moneyPosition =
                      getMoneyPosition(
                        contractType,
                        strike,
                        stockPrice
                      );

                    const directionStatus =
                      getDirectionStatus(
                        contractType,
                        delta,
                        gamma
                      );

                    const gammaStatus =
                      getGammaStatus(
                        gamma
                      );

                    const activityLabel =
                      result.activityType ===
                      "SWEEP"
                        ? "Sweep مؤسسي"
                        : "Block مؤسسي";

                    const openingLabel =
                      result.openingStatus ===
                      "STRONG_OPENING_LIKELY"
                        ? "فتح مركز مرجح بقوة"
                        : "فتح مركز مرجح";

                    institutionalV2Rows.push({
                      symbol,
                      option_ticker:
                        optionTicker,
                      contract_type:
                        contractType,
                      strike,
                      expiration,

                      stock_price:
                        stockPrice,
                      contract_price:
                        result.averagePrice,

                      premium_value:
                        result.totalPremium,
                      volume,
                      open_interest:
                        openInterest,
                      volume_change:
                        result.totalSize,

                      bid,
                      ask,
                      spread_pct:
                        spreadPct,

                      trade_price:
                        result.averagePrice,

                      execution_side:
                        "BUY",
                      execution_confidence:
                        100,
                      execution_position_pct:
                        100,

                      market_bias:
                        contractType === "call"
                          ? "BULLISH"
                          : "BEARISH",

                      execution_reason:
                        `${activityLabel} عند Ask`,

                      delta,
                      gamma,
                      theta,
                      vega,
                      iv,

                      whale_score:
                        result.score,

                      classification:
                        `${activityLabel} — ${openingLabel}`,

                      money_position:
                        moneyPosition,
                      direction_status:
                        directionStatus,
                      gamma_status:
                        gammaStatus,

                      reason:
                        [
                          activityLabel,
                          "التنفيذ عند Ask",
                          openingLabel,
                          `القيمة المجمعة $${Math.round(
                            result.totalPremium
                          ).toLocaleString(
                            "en-US"
                          )}`,
                          `الكمية ${Math.round(
                            result.totalSize
                          ).toLocaleString(
                            "en-US"
                          )}`,
                          `عدد التنفيذات ${result.tradeCount}`,
                          `التقييم ${result.score}%`,
                          ...result.reasons,
                        ].join(" • "),

                      last_seen_at:
                        new Date()
                          .toISOString(),
                      is_active: true,

                      is_sweep:
                        result.activityType ===
                        "SWEEP",
                      is_block:
                        result.activityType ===
                        "BLOCK",

                      estimated_side:
                        "BUY",
                      execution_location:
                        result.executionSide,

                      estimated_premium:
                        result.totalPremium,

                      sweep_count:
                        result.activityType ===
                        "SWEEP"
                          ? result.tradeCount
                          : 0,

                      repeat_count:
                        result.tradeCount,
                    });
                  }
                }
              }

              const largestTrade =
                findLargestRecentTrade(
                  trades
                );

              if (!largestTrade) {
                return null;
              }

              return analyzeContract(
                symbol,
                contract,
                largestTrade
              );
            }
          )
        );

      const rawSymbolRows =
        candidateRows.filter(
          (
            row
          ): row is WhaleTradeRow =>
            row !== null
        );

      const symbolRows =
        applyCompositeWhaleEngine(
          rawSymbolRows,
          contracts
        );

      detectedRows.push(
        ...symbolRows
      );
    } catch (error) {
      failures.push({
        symbol,
        error:
          error instanceof Error
            ? error.message
            : "خطأ غير معروف",
      });
    }
  }

  /*
   * الإنتاج الآن يعتمد على V2 فقط.
   * نتائج V1 لا يتم حفظها أو عرضها.
   */
  const uniqueRows = Array.from(
    new Map(
      institutionalV2Rows.map(
        (row) => [
          row.option_ticker,
          row,
        ]
      )
    ).values()
  )
    .sort(
      (a, b) =>
        b.whale_score -
          a.whale_score ||
        b.premium_value -
          a.premium_value
    )
    .slice(0, 50);

  const normalizedSupabaseUrl =
    supabaseUrl.replace(
      /\/+$/,
      ""
    );

  const trackedRows =
    await addWhaleActivityTracking(
      uniqueRows,
      normalizedSupabaseUrl,
      supabaseSecret
    );

  const savedRows =
    await saveWhaleTrades(
      trackedRows,
      normalizedSupabaseUrl,
      supabaseSecret
    );

  return NextResponse.json({
    ok: true,
    scanned: true,
    marketOpen:
      marketState.isOpen,
    forced: force,
    symbolsScanned:
      symbols.length,
    whalesDetected:
      uniqueRows.length,
    saved:
      Array.isArray(savedRows)
        ? savedRows.length
        : uniqueRows.length,
    failures,
    rejectionStats: whaleRejectStats,

    /*
     * محرك النشاط المؤسسي V2.
     * النتائج المؤهلة منه تُحفظ وتظهر في صفحة صفقات الحيتان.
     */
    institutionalV2: {
      stats: institutionalV2Stats,
      detected:
        institutionalV2Results.length,
      topResults:
        [...institutionalV2Results]
          .sort(
            (a, b) =>
              b.score - a.score ||
              b.totalPremium -
                a.totalPremium
          )
          .slice(0, 20),
    },

    results: trackedRows,
    capturedAt:
      new Date().toISOString(),
  });
}