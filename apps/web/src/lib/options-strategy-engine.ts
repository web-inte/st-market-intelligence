export type OptionTradeRecord = {
  id: number | string;
  symbol?: string | null;
  contract_type?: string | null;
  strike?: number | string | null;
  expiration?: string | null;
  contract_price?: number | string | null;
  premium_value?: number | string | null;
  trade_size?: number | string | null;
  volume?: number | string | null;
  volume_change?: number | string | null;
  bid?: number | string | null;
  ask?: number | string | null;
  estimated_side?: string | null;
  classification?: string | null;
  is_block?: boolean | null;
  is_sweep?: boolean | null;
  trade_timestamp?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
};

type TradeSide = "BUY" | "SELL";
type ContractType = "call" | "put";

type NormalizedLeg<T extends OptionTradeRecord> = {
  index: number;
  trade: T;
  id: string;
  symbol: string;
  contractType: ContractType;
  side: TradeSide;
  strike: number;
  expiration: string;
  size: number;
  price: number;
  premiumValue: number;
  timeMs: number;
  timeIso: string;
};

export type DetectedStrategyLeg = {
  id: string;
  action: "شراء" | "بيع";
  role: "ساق الشراء" | "ساق البيع";
  contractLabel: "كول" | "بوت";
  strike: number;
  price: number;
  size: number;
  premiumValue: number;
  executionTime: string;
};

export type DetectedOptionStrategy = {
  id: string;
  symbol: string;
  expiration: string;
  name: string;
  direction: "صعودي" | "هبوطي";
  cashFlowType: "ائتماني" | "مدين";
  confidence: number;
  buyLeg: DetectedStrategyLeg;
  sellLeg: DetectedStrategyLeg;
  netPremium: number | null;
  breakeven: number | null;
  maxProfit: number | null;
  maxLoss: number | null;
  rewardRiskRatio: number | null;
  width: number;
  explanation: string;
  detectionReason: string;
  timeDifferenceSeconds: number;
  rawTradeIds: string[];
};

export type StrategyDetectionResult<T extends OptionTradeRecord> = {
  strategies: DetectedOptionStrategy[];
  unmatchedTrades: T[];
};

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeSide(value: unknown): TradeSide | null {
  const side = String(value ?? "").trim().toUpperCase();
  if (side === "BUY") return "BUY";
  if (side === "SELL") return "SELL";
  return null;
}

function normalizeContractType(value: unknown): ContractType | null {
  const type = String(value ?? "").trim().toLowerCase();
  if (type === "call") return "call";
  if (type === "put") return "put";
  return null;
}

function getTimeValue(trade: OptionTradeRecord) {
  return (
    trade.trade_timestamp ||
    trade.last_seen_at ||
    trade.created_at ||
    trade.first_seen_at ||
    null
  );
}

function getTradePrice(trade: OptionTradeRecord, side: TradeSide) {
  const contractPrice = numberValue(trade.contract_price);
  if (contractPrice > 0) return contractPrice;

  const bid = numberValue(trade.bid);
  const ask = numberValue(trade.ask);

  if (side === "BUY" && ask > 0) return ask;
  if (side === "SELL" && bid > 0) return bid;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;

  return Math.max(bid, ask, 0);
}

function normalizeTrade<T extends OptionTradeRecord>(
  trade: T,
  index: number
): NormalizedLeg<T> | null {
  const symbol = String(trade.symbol ?? "").trim().toUpperCase();
  const contractType = normalizeContractType(trade.contract_type);
  const side = normalizeSide(trade.estimated_side);
  const strike = numberValue(trade.strike);
  const expiration = String(trade.expiration ?? "").trim();
  const size =
    numberValue(trade.trade_size) ||
    numberValue(trade.volume_change) ||
    numberValue(trade.volume);

  const timeValue = getTimeValue(trade);
  const timeMs = timeValue ? new Date(timeValue).getTime() : Number.NaN;
  const price = side ? getTradePrice(trade, side) : 0;

  if (
    !symbol ||
    !contractType ||
    !side ||
    strike <= 0 ||
    !expiration ||
    size <= 0 ||
    price <= 0 ||
    !Number.isFinite(timeMs)
  ) {
    return null;
  }

  return {
    index,
    trade,
    id: String(trade.id),
    symbol,
    contractType,
    side,
    strike,
    expiration,
    size,
    price,
    premiumValue: numberValue(trade.premium_value),
    timeMs,
    timeIso: new Date(timeMs).toISOString(),
  };
}

function relativeDifference(left: number, right: number) {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

function getPairConfidence<T extends OptionTradeRecord>(
  left: NormalizedLeg<T>,
  right: NormalizedLeg<T>
) {
  if (
    left.symbol !== right.symbol ||
    left.expiration !== right.expiration ||
    left.contractType !== right.contractType ||
    left.side === right.side ||
    left.strike === right.strike
  ) {
    return null;
  }

  const sizeDifference = relativeDifference(left.size, right.size);
  if (sizeDifference > 0.02) return null;

  const timeDifferenceSeconds = Math.abs(left.timeMs - right.timeMs) / 1000;
  if (timeDifferenceSeconds > 90) return null;

  const strikeWidth = Math.abs(left.strike - right.strike);
  const strikeWidthPct =
    (strikeWidth / Math.max(Math.min(left.strike, right.strike), 1)) * 100;

  if (strikeWidthPct > 15) return null;

  let confidence = 40;

  if (sizeDifference === 0) confidence += 32;
  else if (sizeDifference <= 0.005) confidence += 28;
  else if (sizeDifference <= 0.01) confidence += 23;
  else confidence += 17;

  if (timeDifferenceSeconds <= 1) confidence += 22;
  else if (timeDifferenceSeconds <= 5) confidence += 20;
  else if (timeDifferenceSeconds <= 15) confidence += 16;
  else if (timeDifferenceSeconds <= 30) confidence += 12;
  else confidence += 7;

  if (
    left.trade.classification &&
    left.trade.classification === right.trade.classification
  ) {
    confidence += 3;
  }

  if (
    Boolean(left.trade.is_block) === Boolean(right.trade.is_block) &&
    Boolean(left.trade.is_sweep) === Boolean(right.trade.is_sweep)
  ) {
    confidence += 3;
  }

  return {
    confidence: Math.min(99, confidence),
    timeDifferenceSeconds,
  };
}

type StrategyDefinition = {
  name: string;
  direction: "صعودي" | "هبوطي";
  cashFlowType: "ائتماني" | "مدين";
  explanation: string;
};

function classifyVerticalSpread<T extends OptionTradeRecord>(
  buyLeg: NormalizedLeg<T>,
  sellLeg: NormalizedLeg<T>
): StrategyDefinition | null {
  if (buyLeg.contractType !== sellLeg.contractType) return null;

  if (buyLeg.contractType === "call") {
    if (buyLeg.strike < sellLeg.strike) {
      return {
        name: "سبريد كول مدين صعودي",
        direction: "صعودي",
        cashFlowType: "مدين",
        explanation:
          "شراء عقد كول بسعر تنفيذ أدنى وبيع عقد كول بسعر تنفيذ أعلى. تعكس الاستراتيجية توقعًا بصعود السهم، بينما تقلل ساق البيع تكلفة الدخول وتحدد أقصى ربح.",
      };
    }

    return {
      name: "سبريد كول ائتماني هبوطي",
      direction: "هبوطي",
      cashFlowType: "ائتماني",
      explanation:
        "بيع عقد كول بسعر تنفيذ أدنى وشراء عقد كول بسعر تنفيذ أعلى للحماية. تعكس الاستراتيجية توقعًا ببقاء السهم أسفل سعر تنفيذ ساق البيع، مع تحصيل ائتمان وتحديد أقصى خسارة.",
    };
  }

  if (buyLeg.strike > sellLeg.strike) {
    return {
      name: "سبريد بوت مدين هبوطي",
      direction: "هبوطي",
      cashFlowType: "مدين",
      explanation:
        "شراء عقد بوت بسعر تنفيذ أعلى وبيع عقد بوت بسعر تنفيذ أدنى. تعكس الاستراتيجية توقعًا بهبوط السهم، بينما تقلل ساق البيع تكلفة الدخول وتحدد أقصى ربح.",
    };
  }

  return {
    name: "سبريد بوت ائتماني صعودي",
    direction: "صعودي",
    cashFlowType: "ائتماني",
    explanation:
      "بيع عقد بوت بسعر تنفيذ أعلى وشراء عقد بوت بسعر تنفيذ أدنى للحماية. تعكس الاستراتيجية توقعًا ببقاء السهم أعلى سعر تنفيذ ساق البيع، مع تحصيل ائتمان وتحديد أقصى خسارة.",
  };
}

function createDetectedLeg<T extends OptionTradeRecord>(
  leg: NormalizedLeg<T>
): DetectedStrategyLeg {
  return {
    id: leg.id,
    action: leg.side === "BUY" ? "شراء" : "بيع",
    role: leg.side === "BUY" ? "ساق الشراء" : "ساق البيع",
    contractLabel: leg.contractType === "call" ? "كول" : "بوت",
    strike: round(leg.strike, 2),
    price: round(leg.price, 2),
    size: Math.round(leg.size),
    premiumValue: round(leg.premiumValue, 2),
    executionTime: leg.timeIso,
  };
}

function calculateMetrics<T extends OptionTradeRecord>(
  definition: StrategyDefinition,
  buyLeg: NormalizedLeg<T>,
  sellLeg: NormalizedLeg<T>
) {
  const width = Math.abs(buyLeg.strike - sellLeg.strike);
  const rawNet =
    definition.cashFlowType === "ائتماني"
      ? sellLeg.price - buyLeg.price
      : buyLeg.price - sellLeg.price;

  const netPremium = rawNet > 0 ? round(rawNet, 2) : null;

  if (netPremium === null || width <= 0 || netPremium >= width) {
    return {
      width: round(width, 2),
      netPremium,
      breakeven: null,
      maxProfit: null,
      maxLoss: null,
      rewardRiskRatio: null,
    };
  }

  let breakeven: number;

  if (definition.name === "سبريد كول مدين صعودي") {
    breakeven = buyLeg.strike + netPremium;
  } else if (definition.name === "سبريد كول ائتماني هبوطي") {
    breakeven = sellLeg.strike + netPremium;
  } else if (definition.name === "سبريد بوت مدين هبوطي") {
    breakeven = buyLeg.strike - netPremium;
  } else {
    breakeven = sellLeg.strike - netPremium;
  }

  const maxProfit =
    definition.cashFlowType === "ائتماني"
      ? netPremium * 100
      : (width - netPremium) * 100;

  const maxLoss =
    definition.cashFlowType === "ائتماني"
      ? (width - netPremium) * 100
      : netPremium * 100;

  return {
    width: round(width, 2),
    netPremium,
    breakeven: round(breakeven, 2),
    maxProfit: round(maxProfit, 2),
    maxLoss: round(maxLoss, 2),
    rewardRiskRatio: maxLoss > 0 ? round(maxProfit / maxLoss, 2) : null,
  };
}

function buildStrategy<T extends OptionTradeRecord>(
  first: NormalizedLeg<T>,
  second: NormalizedLeg<T>,
  confidence: number,
  timeDifferenceSeconds: number
): DetectedOptionStrategy | null {
  const buyLeg = first.side === "BUY" ? first : second;
  const sellLeg = first.side === "SELL" ? first : second;
  const definition = classifyVerticalSpread(buyLeg, sellLeg);

  if (!definition) return null;

  const metrics = calculateMetrics(definition, buyLeg, sellLeg);
  const sizeText = Math.round(Math.min(buyLeg.size, sellLeg.size)).toLocaleString(
    "en-US"
  );

  return {
    id: ["strategy", first.symbol, first.expiration, first.id, second.id].join(
      ":"
    ),
    symbol: first.symbol,
    expiration: first.expiration,
    name: definition.name,
    direction: definition.direction,
    cashFlowType: definition.cashFlowType,
    confidence,
    buyLeg: createDetectedLeg(buyLeg),
    sellLeg: createDetectedLeg(sellLeg),
    ...metrics,
    explanation: definition.explanation,
    detectionReason:
      `تم ربط ساقي الصفقة بسبب تطابق الرمز وتاريخ الانتهاء ونوع العقد، ` +
      `وتقارب وقت التنفيذ بفارق ${round(
        timeDifferenceSeconds,
        1
      )} ثانية، وتقارب حجم التنفيذ عند ${sizeText} عقدًا.`,
    timeDifferenceSeconds: round(timeDifferenceSeconds, 1),
    rawTradeIds: [first.id, second.id],
  };
}

export function detectOptionStrategies<T extends OptionTradeRecord>(
  trades: T[]
): StrategyDetectionResult<T> {
  const normalized = trades
    .map((trade, index) => normalizeTrade(trade, index))
    .filter((item): item is NormalizedLeg<T> => item !== null);

  const candidates: Array<{
    left: NormalizedLeg<T>;
    right: NormalizedLeg<T>;
    confidence: number;
    timeDifferenceSeconds: number;
  }> = [];

  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < normalized.length;
      rightIndex += 1
    ) {
      const left = normalized[leftIndex];
      const right = normalized[rightIndex];
      const pair = getPairConfidence(left, right);

      if (!pair || pair.confidence < 72) continue;

      const buyLeg = left.side === "BUY" ? left : right;
      const sellLeg = left.side === "SELL" ? left : right;

      if (!classifyVerticalSpread(buyLeg, sellLeg)) continue;

      candidates.push({
        left,
        right,
        confidence: pair.confidence,
        timeDifferenceSeconds: pair.timeDifferenceSeconds,
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return left.timeDifferenceSeconds - right.timeDifferenceSeconds;
  });

  const usedIndexes = new Set<number>();
  const strategies: DetectedOptionStrategy[] = [];

  for (const candidate of candidates) {
    if (
      usedIndexes.has(candidate.left.index) ||
      usedIndexes.has(candidate.right.index)
    ) {
      continue;
    }

    const strategy = buildStrategy(
      candidate.left,
      candidate.right,
      candidate.confidence,
      candidate.timeDifferenceSeconds
    );

    if (!strategy) continue;

    strategies.push(strategy);
    usedIndexes.add(candidate.left.index);
    usedIndexes.add(candidate.right.index);
  }

  strategies.sort((left, right) => {
    const leftTime = Math.max(
      new Date(left.buyLeg.executionTime).getTime(),
      new Date(left.sellLeg.executionTime).getTime()
    );
    const rightTime = Math.max(
      new Date(right.buyLeg.executionTime).getTime(),
      new Date(right.sellLeg.executionTime).getTime()
    );
    return rightTime - leftTime;
  });

  return {
    strategies,
    unmatchedTrades: trades.filter((_, index) => !usedIndexes.has(index)),
  };
}
