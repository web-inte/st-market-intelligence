import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYMBOLS = [
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

const MIN_PREMIUM_VALUE = 250_000;
const MIN_WHALE_SCORE = 70;
const MAX_RESULTS_PER_SYMBOL = 180;
const MAX_APPROVED_CONTRACT_PRICE = 3;
const MAX_APPROVED_SPREAD_PCT = 15;


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
    return null;
  }

  if (
    row.contract_price <= 0 ||
    row.contract_price >
      MAX_APPROVED_CONTRACT_PRICE
  ) {
    return null;
  }

  if (
    row.spread_pct === null ||
    row.spread_pct >
      MAX_APPROVED_SPREAD_PCT
  ) {
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

      const rawSymbolRows =
        contracts
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

  const savedRows =
    await saveWhaleTrades(
      uniqueRows,
      supabaseUrl.replace(
        /\/+$/,
        ""
      ),
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
    failures,
    results: uniqueRows,
    capturedAt:
      new Date().toISOString(),
  });
}