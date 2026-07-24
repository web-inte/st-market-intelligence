export type InstitutionalTrade = {
  price: number;
  size: number;
  timestampNs: bigint;
  exchange?: number;
};

export type InstitutionalContractContext = {
  optionTicker: string;
  contractType: "call" | "put";
  bid: number;
  ask: number;
  historicalExecutionSide?: InstitutionalExecutionSide;
  dayVolume: number;
  openInterest: number;
  gamma: number;
  spreadPct: number | null;
};

export type InstitutionalActivityType =
  | "SWEEP"
  | "BLOCK";

export type InstitutionalExecutionSide =
  | "ASK"
  | "BID"
  | "MID"
  | "UNKNOWN";

export type InstitutionalOpeningStatus =
  | "STRONG_OPENING_LIKELY"
  | "OPENING_LIKELY"
  | "UNCLEAR";

export type InstitutionalFlowResult = {
  optionTicker: string;
  activityType: InstitutionalActivityType;
  executionSide: InstitutionalExecutionSide;
  openingStatus: InstitutionalOpeningStatus;

  tradeCount: number;
  totalSize: number;
  averagePrice: number;
  totalPremium: number;
  durationMs: number;
  exchangeCount: number;

  sizeOiRatio: number | null;
  volumeOiRatio: number | null;

  score: number;
  reasons: string[];
};

const SWEEP_WINDOW_MS = 3_000;
const SWEEP_MIN_TRADES = 2;
const SWEEP_MIN_PREMIUM = 150_000;
const BLOCK_MIN_PREMIUM = 250_000;

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

function getExecutionSide(
  averagePrice: number,
  bid: number,
  ask: number
): InstitutionalExecutionSide {
  if (
    averagePrice <= 0 ||
    bid <= 0 ||
    ask <= bid
  ) {
    return "UNKNOWN";
  }

  const position =
    ((averagePrice - bid) /
      (ask - bid)) *
    100;

  if (position >= 55) {
    return "ASK";
  }

  if (position <= 35) {
    return "BID";
  }

  return "MID";
}

function getOpeningStatus(
  totalSize: number,
  dayVolume: number,
  openInterest: number
): InstitutionalOpeningStatus {
  if (openInterest <= 0) {
    return "UNCLEAR";
  }

  const sizeOiRatio =
    totalSize / openInterest;

  const volumeOiRatio =
    dayVolume / openInterest;

  if (
    sizeOiRatio >= 1 ||
    volumeOiRatio >= 2
  ) {
    return "STRONG_OPENING_LIKELY";
  }

  if (
    sizeOiRatio >= 0.25 ||
    volumeOiRatio >= 1
  ) {
    return "OPENING_LIKELY";
  }

  return "UNCLEAR";
}

function buildResult(
  trades: InstitutionalTrade[],
  context: InstitutionalContractContext,
  activityType: InstitutionalActivityType
): InstitutionalFlowResult | null {
  if (trades.length === 0) {
    return null;
  }

  const sortedTrades = [...trades].sort(
    (a, b) =>
      Number(
        a.timestampNs -
          b.timestampNs
      )
  );

  const totalSize =
    sortedTrades.reduce(
      (sum, trade) =>
        sum + trade.size,
      0
    );

  const totalPremium =
    sortedTrades.reduce(
      (sum, trade) =>
        sum +
        trade.price *
          trade.size *
          100,
      0
    );

  if (
    activityType === "SWEEP" &&
    (
      sortedTrades.length <
        SWEEP_MIN_TRADES ||
      totalPremium <
        SWEEP_MIN_PREMIUM
    )
  ) {
    return null;
  }

  if (
    activityType === "BLOCK" &&
    totalPremium <
      BLOCK_MIN_PREMIUM
  ) {
    return null;
  }

  const weightedValue =
    sortedTrades.reduce(
      (sum, trade) =>
        sum +
        trade.price *
          trade.size,
      0
    );

  const averagePrice =
    totalSize > 0
      ? weightedValue /
        totalSize
      : 0;

  const durationMs =
    sortedTrades.length > 1
      ? Number(
          (
            sortedTrades[
              sortedTrades.length - 1
            ].timestampNs -
            sortedTrades[0]
              .timestampNs
          ) /
            BigInt(1_000_000)
        )
      : 0;

  const exchangeCount =
    new Set(
      sortedTrades
        .map((trade) =>
          trade.exchange
        )
        .filter(
          (
            exchange
          ): exchange is number =>
            Number.isFinite(exchange)
        )
    ).size;

  const executionSide =
    context.historicalExecutionSide ??
    getExecutionSide(
      averagePrice,
      context.bid,
      context.ask
    );

  const openingStatus =
    getOpeningStatus(
      totalSize,
      context.dayVolume,
      context.openInterest
    );

  const sizeOiRatio =
    context.openInterest > 0
      ? totalSize /
        context.openInterest
      : null;

  const volumeOiRatio =
    context.openInterest > 0
      ? context.dayVolume /
        context.openInterest
      : null;

  let score = 0;
  const reasons: string[] = [];

  if (activityType === "SWEEP") {
    score += 25;
    reasons.push(
      "تنفيذات متتابعة مرجحة كسويب"
    );
  } else {
    score += 20;
    reasons.push(
      "تنفيذ كبير مرجح كبلوك"
    );
  }

  if (executionSide === "ASK") {
    score += 20;
    reasons.push(
      "التنفيذ قريب من Ask"
    );
  } else if (
    executionSide === "MID"
  ) {
    score += 7;
    reasons.push(
      "التنفيذ قرب منتصف السبريد"
    );
  }

  if (
    totalPremium >= 1_000_000
  ) {
    score += 20;
  } else if (
    totalPremium >= 500_000
  ) {
    score += 17;
  } else if (
    totalPremium >= 250_000
  ) {
    score += 14;
  } else {
    score += 10;
  }

  if (
    openingStatus ===
    "STRONG_OPENING_LIKELY"
  ) {
    score += 15;
    reasons.push(
      "فتح مركز مرجح بقوة"
    );
  } else if (
    openingStatus ===
    "OPENING_LIKELY"
  ) {
    score += 10;
    reasons.push(
      "فتح مركز مرجح"
    );
  }

  if (
    context.spreadPct !== null &&
    context.spreadPct <= 5
  ) {
    score += 10;
  } else if (
    context.spreadPct !== null &&
    context.spreadPct <= 10
  ) {
    score += 7;
  } else if (
    context.spreadPct !== null &&
    context.spreadPct <= 15
  ) {
    score += 4;
  }

  if (
    Math.abs(context.gamma) >=
    0.02
  ) {
    score += 5;
  } else if (
    Math.abs(context.gamma) >=
    0.005
  ) {
    score += 3;
  }

  return {
    optionTicker:
      context.optionTicker,
    activityType,
    executionSide,
    openingStatus,

    tradeCount:
      sortedTrades.length,
    totalSize,
    averagePrice,
    totalPremium,
    durationMs,
    exchangeCount,

    sizeOiRatio,
    volumeOiRatio,

    score: clamp(
      Math.round(score),
      0,
      100
    ),
    reasons,
  };
}

export function detectInstitutionalFlow(
  trades: InstitutionalTrade[],
  context: InstitutionalContractContext
): InstitutionalFlowResult[] {
  const validTrades = trades
    .filter(
      (trade) =>
        trade.price > 0 &&
        trade.size > 0
    )
    .sort(
      (a, b) =>
        Number(
          a.timestampNs -
            b.timestampNs
        )
    );

  if (validTrades.length === 0) {
    return [];
  }

  const results: InstitutionalFlowResult[] =
    [];

  for (
    let index = 0;
    index < validTrades.length;
    index++
  ) {
    const start =
      validTrades[index];

    const grouped = [
      start,
    ];

    for (
      let cursor = index + 1;
      cursor <
      validTrades.length;
      cursor++
    ) {
      const candidate =
        validTrades[cursor];

      const differenceMs =
        Number(
          (
            candidate.timestampNs -
            start.timestampNs
          ) /
            BigInt(1_000_000)
        );

      if (
        differenceMs >
        SWEEP_WINDOW_MS
      ) {
        break;
      }

      const priceDifferencePct =
        start.price > 0
          ? (
              Math.abs(
                candidate.price -
                  start.price
              ) /
              start.price
            ) *
            100
          : 100;

      if (
        priceDifferencePct <= 3
      ) {
        grouped.push(
          candidate
        );
      }
    }

    const sweep =
      buildResult(
        grouped,
        context,
        "SWEEP"
      );

    if (sweep) {
      results.push(sweep);
      index +=
        grouped.length - 1;
      continue;
    }

    const block =
      buildResult(
        [start],
        context,
        "BLOCK"
      );

    if (block) {
      results.push(block);
    }
  }

  return results.sort(
    (a, b) =>
      b.score - a.score ||
      b.totalPremium -
        a.totalPremium
  );
}
