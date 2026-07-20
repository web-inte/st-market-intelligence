import { NextRequest, NextResponse } from "next/server";

import {
  buildGammaStructure,
  type GammaInputContract,
} from "@/lib/gamma-structure";

import {
  buildGammaStopPrice,
  buildGammaTargets,
} from "@/lib/gamma-trade-levels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYMBOLS = [
  "NVDA",
  "TSLA",
  "AAPL",
  "MSFT",
  "META",
  "AMD",
  "AMZN",
  "AVGO",
  "PLTR",
];

const MIN_PREMIUM_VALUE = 1_000_000;
const MIN_WHALE_SCORE = 65;
const MAX_RESULTS_PER_SYMBOL = 250;

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
  last_seen_at: string;
  is_active: boolean;
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
  } else if (position >= 65) {
    side = "BUY";
    confidence =
      Math.round(position);
    reason =
      "التنفيذ أقرب إلى Ask؛ شراء العقد مرجح";
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

function analyzeContract(
  symbol: string,
  contract: MassiveContract
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
  return null;
}

  if (
    !optionTicker ||
    !contractType ||
    !expiration ||
    strike <= 0 ||
    stockPrice <= 0
  ) {
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


type SavedWhaleTrade = WhaleTradeRow & {
  id?: number | string;
};

function daysUntilExpiration(
  expiration: string
) {
  const expirationTime =
    new Date(
      `${expiration}T23:59:59Z`
    ).getTime();

  if (!Number.isFinite(expirationTime)) {
    return null;
  }

  return Math.ceil(
    (expirationTime - Date.now()) /
      86_400_000
  );
}

async function syncWhaleTradeSetups(
  savedRows: SavedWhaleTrade[],
  contractsBySymbol: Map<
    string,
    MassiveContract[]
  >,
  supabaseUrl: string,
  supabaseSecret: string
) {
  const eligibleRows = savedRows
    .filter((row) => {
      const whaleTradeId =
        Number(row.id);

      const daysToExpiration =
        daysUntilExpiration(
          row.expiration
        );

      return (
        Number.isFinite(whaleTradeId) &&
        whaleTradeId > 0 &&
        row.whale_score >= 80 &&
        row.execution_side === "BUY" &&
        row.execution_confidence >= 65 &&
        row.market_bias !== "NEUTRAL" &&
        daysToExpiration !== null &&
        daysToExpiration >= 1 &&
        daysToExpiration <= 14
      );
    })
    .map((row) => {
      const symbolContracts =
        contractsBySymbol.get(
          row.symbol
        ) || [];

      const gammaContracts:
        GammaInputContract[] =
        symbolContracts
          .map((contract) => ({
            type:
              contract.details?.contract_type ===
              "put"
                ? "put" as const
                : "call" as const,

            strike:
              safeNumber(
                contract.details?.strike_price
              ),

            openInterest:
              safeNumber(
                contract.open_interest
              ),

            gamma:
              safeNumber(
                contract.greeks?.gamma
              ),
          }))
          .filter(
            (contract) =>
              contract.strike > 0 &&
              contract.openInterest > 0 &&
              contract.gamma !== 0
          );

      const gammaStructure =
        buildGammaStructure(
          gammaContracts,
          row.stock_price
        );

      const side =
        row.contract_type === "put"
          ? "PUT" as const
          : "CALL" as const;

      const stopPrice =
        buildGammaStopPrice(
          gammaStructure,
          side,
          row.stock_price,
          row.whale_score
        );

      const gammaTargets =
        buildGammaTargets(
          gammaStructure,
          side,
          row.stock_price,
          stopPrice,
          row.whale_score
        );

      return {
        whale_trade_id:
          Number(row.id),

        symbol:
          row.symbol,

        original_option_ticker:
          row.option_ticker,

        original_contract_type:
          row.contract_type.toUpperCase(),

        original_strike:
          row.strike,

        original_expiration:
          row.expiration,

        original_contract_price:
          row.contract_price,

        premium_value:
          row.premium_value,

        stock_entry_price:
          row.stock_price,

        stop_price:
          stopPrice,

        gamma_targets:
          gammaTargets,

        gamma_snapshot:
          gammaStructure,

        source_snapshot: {
          source:
            "whale-trades-scan",
          captured_at:
            new Date().toISOString(),
          raw: {
            full_processed_row:
              row,
          },
        },

        status:
          "PENDING_CONTRACT",

        contract_status:
          "PENDING",
      };
    });

  if (eligibleRows.length === 0) {
    return {
      eligible: 0,
      inserted: 0,
    };
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/whale_trade_setups?on_conflict=whale_trade_id`,
    {
      method: "POST",
      headers: {
        apikey:
          supabaseSecret,
        Authorization:
          `Bearer ${supabaseSecret}`,
        "Content-Type":
          "application/json",
        Prefer:
          "resolution=ignore-duplicates,return=representation",
      },
      body:
        JSON.stringify(
          eligibleRows
        ),
      cache:
        "no-store",
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `فشل ربط صفقات الحيتان بالمتابعة: ${responseText}`
    );
  }

  const insertedRows =
    responseText.trim()
      ? JSON.parse(responseText)
      : [];

  return {
    eligible:
      eligibleRows.length,
    inserted:
      Array.isArray(insertedRows)
        ? insertedRows.length
        : 0,
  };
}

function authorizeRequest(
  request: NextRequest
) {
  const cronSecret =
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

  if (
    !marketState.isOpen &&
    !force
  ) {
    return NextResponse.json({
      ok: true,
      scanned: false,
      marketOpen: false,
      message:
        "السوق مغلق، لم يتم تنفيذ الفحص.",
    });
  }

  const detectedRows: WhaleTradeRow[] =
    [];

  const contractsBySymbol =
    new Map<
      string,
      MassiveContract[]
    >();

  const failures: Array<{
    symbol: string;
    error: string;
  }> = [];

  for (const symbol of SYMBOLS) {
    try {
      const contracts =
        await fetchOptionChain(
          symbol,
          massiveApiKey
        );

      contractsBySymbol.set(
        symbol,
        contracts
      );

      const symbolRows = contracts
        .map((contract) =>
          analyzeContract(
            symbol,
            contract
          )
        )
        .filter(
          (
            row
          ): row is WhaleTradeRow =>
            row !== null
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

  const uniqueRows = Array.from(
    new Map(
      detectedRows.map((row) => [
        row.option_ticker,
        row,
      ])
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

  const cleanSupabaseUrl =
    supabaseUrl.replace(
      /\/+$/,
      ""
    );

  const savedRows =
    await saveWhaleTrades(
      uniqueRows,
      cleanSupabaseUrl,
      supabaseSecret
    );

  const trackingSync =
    await syncWhaleTradeSetups(
      Array.isArray(savedRows)
        ? savedRows
        : [],
      contractsBySymbol,
      cleanSupabaseUrl,
      supabaseSecret
    );

  return NextResponse.json({
    ok: true,
    scanned: true,
    marketOpen:
      marketState.isOpen,
    forced: force,
    symbolsScanned:
      SYMBOLS.length,
    whalesDetected:
      uniqueRows.length,
    saved:
      Array.isArray(savedRows)
        ? savedRows.length
        : uniqueRows.length,

    trackingEligible:
      trackingSync.eligible,

    trackingInserted:
      trackingSync.inserted,

    failures,
    results: uniqueRows,
    capturedAt:
      new Date().toISOString(),
  });
}