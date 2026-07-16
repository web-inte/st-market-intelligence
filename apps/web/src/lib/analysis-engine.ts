import { buildDecision } from "./decision-engine";

export type Side = "CALL" | "PUT" | "NEUTRAL";

export type AnalysisTradePlanTarget = {
  index: number;
  price: number;
  movePct: number;
  probability: number;
  strength: number;
  level: string;
  source: "GAMMA" | "ESTIMATED";
};

export type AnalysisTradePlanStatus =
  | "ACTIVE"
  | "TARGET_1"
  | "TARGET_2"
  | "TARGET_3"
  | "STOPPED";

export type AnalysisTradePlan = {
  id: string;
  symbol: string;
  side: Exclude<Side, "NEUTRAL">;
  contractTicker: string;
  entryPrice: number;
  entryScore: number;
  stopPrice: number | null;
  targets: AnalysisTradePlanTarget[];
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
  currentPrice: number;
  rawMovePct: number;
  currentProfitPct: number;
  ageMinutes: number;
  lifecycleStatus: AnalysisTradePlanStatus;
  lifecycleLabel: string;
  highestTargetHit: number;
  isNew: boolean;
};

export type OptionContract = {
  ticker: string;
  type: "call" | "put";
  expiration: string;
  strike: number;

  bid: number;
  ask: number;
  midpoint: number;
  spreadPct: number | null;

  volume: number;
  openInterest: number;
  volumeOiRatio: number | null;

  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;

  lastTradePrice: number;
  lastTradeSize: number;

  quoteTimeframe: string | null;
  tradeTimeframe: string | null;
};

export type AnalysisResponse = {
  symbol: string;

  quote: {
    price: number;
    change: number;
    changePct: number;
    open: number;
    high: number;
    low: number;
    previousClose: number;
    timestamp: number;
  };

  options: {
    contractsReturned: number;
    pagesFetched?: number;
    chainIsPartial: boolean;

    callsCount: number;
    putsCount: number;

    callVolume: number;
    putVolume: number;
    totalVolume: number;

    callVolumePct: number;
    putVolumePct: number;
    volumeBias: Side;

    callOpenInterest: number;
    putOpenInterest: number;

    estimatedNetGex: number;

    gammaStructure: {
  estimatedFlip: number | null;

  magnet: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;

  callWall: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;

  putWall: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;

  nearestSupport: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;

  nearestResistance: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;

  strongestSupport: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;

  strongestResistance: {
    strike: number;
    callGex: number;
    putGex: number;
    netGex: number;
    totalGex: number;
    distancePct: number;
  } | null;
};

    eligibleContractsCount?: number;

    bestCall: OptionContract | null;
    bestPut: OptionContract | null;

   recommendedCalls: OptionContract[];
   recommendedPuts: OptionContract[];
  };

  dataQuality: {
    finnhubConnected: boolean;
    massiveConnected: boolean;
    massiveStatus: string;
    pagesFetched?: number;
    chainComplete?: boolean;
    note: string;
  };

  tradePlan?: AnalysisTradePlan | null;

  capturedAt?: string;
};

export type AnalysisError = {
  error?: string;
  details?: string;
};

export type Opportunity = {
  symbol: string;
  price: number;
  changePct: number;
  side: Side;
  score: number;
  status: string;
  confidence: string;

  contract: OptionContract | null;
  contractScore: number;
  contractQuality: string;

  consensusStatus: ConsensusResult["status"];
  consensusLabel: string;

  gammaRiskScore: number;
  gammaRiskLevel: GammaRiskResult["riskLevel"];

  tradePlan: AnalysisTradePlan | null;
};

export type MarketAnalysis = {
  decision: ReturnType<typeof buildDecision>;
  consensus: ConsensusResult;
  gammaRisk: GammaRiskResult;
  selectedContract: OptionContract | null;

  flowScore: number;
  contractScore: number;
  momentumScore: number;
  gammaScore: number;

  gammaStatus: string;
  summary: string;
  contractQuality: string;
};
export function calculateFlowScore(
  callVolumePct: number,
  putVolumePct: number
) {
  const safeCall = Number.isFinite(callVolumePct)
    ? callVolumePct
    : 0;

  const safePut = Number.isFinite(putVolumePct)
    ? putVolumePct
    : 0;

  const dominance = Math.abs(safeCall - safePut);

  return Math.max(
    0,
    Math.min(100, Math.round(50 + dominance))
  );
}

export function calculateContractScore(
  contract: OptionContract | null
) {
  if (!contract) return 0;

  const volume = Math.max(
    0,
    Number(contract.volume) || 0
  );

  const openInterest = Math.max(
    0,
    Number(contract.openInterest) || 0
  );

  const spreadPct =
    contract.spreadPct !== null &&
    Number.isFinite(contract.spreadPct)
      ? Math.max(0, contract.spreadPct)
      : 100;

  const absoluteDelta = Math.abs(
    Number(contract.delta) || 0
  );

  const volumeOiRatio =
    contract.volumeOiRatio !== null &&
    Number.isFinite(contract.volumeOiRatio)
      ? Math.max(0, contract.volumeOiRatio)
      : 0;

  const volumeScore = Math.min(
    25,
    Math.log10(volume + 1) * 5.5
  );

  const openInterestScore = Math.min(
    20,
    Math.log10(openInterest + 1) * 4.5
  );

  let spreadScore = 0;

  if (spreadPct <= 2) {
    spreadScore = 25;
  } else if (spreadPct <= 5) {
    spreadScore = 22;
  } else if (spreadPct <= 8) {
    spreadScore = 18;
  } else if (spreadPct <= 12) {
    spreadScore = 14;
  } else if (spreadPct <= 18) {
    spreadScore = 8;
  } else if (spreadPct <= 25) {
    spreadScore = 4;
  }

  const deltaDistance = Math.abs(
    absoluteDelta - 0.45
  );

  const deltaScore = Math.max(
    0,
    20 - deltaDistance * 65
  );

  const volumeOiScore = Math.min(
    10,
    volumeOiRatio * 2.5
  );

  const rawScore =
    volumeScore +
    openInterestScore +
    spreadScore +
    deltaScore +
    volumeOiScore;

  return Math.max(
    0,
    Math.min(100, Math.round(rawScore))
  );
}

export function calculateMomentumScore(
  changePct: number
) {
  const absoluteChange = Math.abs(
    Number(changePct) || 0
  );

  if (absoluteChange >= 4) return 95;
  if (absoluteChange >= 3) return 88;
  if (absoluteChange >= 2) return 80;
  if (absoluteChange >= 1) return 70;
  if (absoluteChange >= 0.5) return 60;

  return 50;
}
export function calculateOpportunityScore(
  flowScore: number,
  contractScore: number,
  momentumScore: number,
  side: Side,
  changePct: number
) {
  const momentumSupportsSide =
    (side === "CALL" && changePct > 0) ||
    (side === "PUT" && changePct < 0);

  const alignmentScore =
    side === "NEUTRAL"
      ? 40
      : momentumSupportsSide
        ? 100
        : 35;

  const score =
    flowScore * 0.30 +
    contractScore * 0.40 +
    momentumScore * 0.20 +
    alignmentScore * 0.10;

  const roundedScore = Math.max(
    0,
    Math.min(100, Math.round(score))
  );

  /*
    لا نسمح لتدفق قوي أو زخم مرتفع أن يخفي عقدًا ضعيفًا.
    أفضل الفرص يجب أن تبدأ من عقد قابل للتنفيذ فعليًا.
  */
  if (contractScore < 60) {
    return Math.min(roundedScore, 54);
  }

  if (contractScore < 70) {
    return Math.min(roundedScore, 64);
  }

  if (contractScore < 75) {
    return Math.min(roundedScore, 69);
  }

  return roundedScore;
}

export function calculateGammaScore(
  side: Side,
  estimatedNetGex: number
) {
  if (!Number.isFinite(estimatedNetGex)) {
    return 50;
  }

  if (estimatedNetGex === 0) {
    return 50;
  }

  if (
    (side === "CALL" && estimatedNetGex > 0) ||
    (side === "PUT" && estimatedNetGex < 0)
  ) {
    return 85;
  }

  if (side === "NEUTRAL") {
    return 55;
  }

  return 60;
}

export function gammaStatusLabel(
  estimatedNetGex: number
) {
  if (estimatedNetGex > 0) {
    return "صافي GEX موجب";
  }

  if (estimatedNetGex < 0) {
    return "صافي GEX سالب";
  }

  return "صافي GEX متعادل";
}

export function contractQualityLabel(
  score: number
) {
  if (score >= 90) return "جودة ممتازة";
  if (score >= 80) return "جودة قوية";
  if (score >= 70) return "جودة جيدة";
  if (score >= 60) return "جودة متوسطة";

  return "جودة ضعيفة";
}
export function selectContract(
  analysis: AnalysisResponse
) {
  const side = analysis.options.volumeBias;

  if (side === "CALL") {
    return analysis.options.bestCall;
  }

  if (side === "PUT") {
    return analysis.options.bestPut;
  }

  const call = analysis.options.bestCall;
  const put = analysis.options.bestPut;

  if (!call) return put;
  if (!put) return call;

  const callScore =
    calculateContractScore(call);

  const putScore =
    calculateContractScore(put);

  return callScore >= putScore
    ? call
    : put;
}

export function buildSummary(
  side: Side,
  callVolumePct: number,
  putVolumePct: number,
  changePct: number,
  contract: OptionContract | null
) {
  const flowText =
    side === "CALL"
      ? `حجم عقود الشراء يسيطر بنسبة ${callVolumePct.toFixed(
          2
        )}%.`
      : side === "PUT"
        ? `حجم عقود البيع يسيطر بنسبة ${putVolumePct.toFixed(
            2
          )}%.`
        : "أحجام عقود الشراء والبيع متقاربة ولا توجد سيطرة واضحة.";

  const momentumText =
    changePct > 0
      ? `السهم مرتفع حاليًا بنسبة ${changePct.toFixed(
          2
        )}%.`
      : changePct < 0
        ? `السهم منخفض حاليًا بنسبة ${Math.abs(
            changePct
          ).toFixed(2)}%.`
        : "السهم دون تغير سعري واضح.";

  const contractText = contract
    ? `أفضل عقد متاح وفق السيولة الحالية هو ${contract.ticker}.`
    : "لم يتم العثور على عقد يطابق شروط السيولة والسبريد الحالية.";

  return `${flowText} ${momentumText} ${contractText}`;
}
export function buildAnalysis(
  analysis: AnalysisResponse
) {
  const selectedContract =
    selectContract(analysis);

  const flowScore = calculateFlowScore(
    analysis.options.callVolumePct,
    analysis.options.putVolumePct
  );

  const contractScore =
    calculateContractScore(
      selectedContract
    );

  const momentumScore =
    calculateMomentumScore(
      analysis.quote.changePct
    );

  const opportunityScore =
    calculateOpportunityScore(
      flowScore,
      contractScore,
      momentumScore,
      analysis.options.volumeBias,
      analysis.quote.changePct
    );

  const preliminaryDecision = buildDecision(
  opportunityScore,
  analysis.options.volumeBias
);

const gammaScore = calculateGammaScore(
  preliminaryDecision.side,
  analysis.options.estimatedNetGex
);

const consensus = calculateConsensus(
  preliminaryDecision.side,
  flowScore,
  gammaScore,
  momentumScore,
  contractScore,
  analysis.quote.changePct,
  analysis.options.estimatedNetGex
);

const adjustedOpportunityScore = Math.max(
  0,
  Math.min(
    100,
    Math.round(
      opportunityScore * 0.8 +
        consensus.score * 0.2
    )
  )
);

const decision = buildDecision(
  adjustedOpportunityScore,
  analysis.options.volumeBias
);

const gammaRisk = calculateGammaRisk(
  decision.side,
  analysis.quote.price,
  analysis.options.gammaStructure
);

  return {
    decision,
    consensus,
    gammaRisk,
    selectedContract,
    flowScore,
    contractScore,
    momentumScore,
    gammaScore,

    summary: buildSummary(
      decision.side,
      analysis.options.callVolumePct,
      analysis.options.putVolumePct,
      analysis.quote.changePct,
      selectedContract
    ),

    gammaStatus: gammaStatusLabel(
      analysis.options.estimatedNetGex
    ),
  };
}

export type ConsensusResult = {
  score: number;
  alignedEngines: number;
  conflictingEngines: number;
  status:
    | "STRONG"
    | "CONFIRMED"
    | "MIXED"
    | "CONFLICTED";
  label: string;
  reasons: string[];
};

export type GammaRiskResult = {
  score: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  label: string;
  reasons: string[];
};

function formatGammaStrength(value: number) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000_000) {
    return `${(absoluteValue / 1_000_000_000).toFixed(2)}B`;
  }

  if (absoluteValue >= 1_000_000) {
    return `${(absoluteValue / 1_000_000).toFixed(2)}M`;
  }

  if (absoluteValue >= 1_000) {
    return `${(absoluteValue / 1_000).toFixed(2)}K`;
  }

  return absoluteValue.toFixed(0);
}

export function calculateGammaRisk(
  side: Side,
  stockPrice: number,
  gammaStructure: AnalysisResponse["options"]["gammaStructure"]
): GammaRiskResult {
  const reasons: string[] = [];

  const {
    estimatedFlip,
    magnet,
    nearestSupport,
    nearestResistance,
  } = gammaStructure;

  if (
    side === "NEUTRAL" ||
    !Number.isFinite(stockPrice) ||
    stockPrice <= 0
  ) {
    return {
      score: 50,
      riskLevel: "MEDIUM",
      label: "بيانات غير كافية لتحديد المخاطرة",
      reasons: [
        "لا يوجد اتجاه واضح أو سعر صالح لإجراء مقارنة دقيقة بين جدران القاما.",
      ],
    };
  }

  const isCall = side === "CALL";

  /*
    في صفقة CALL:
    المقاومة هي الجدار المعاكس.
    الدعم هو الجدار المساند.

    في صفقة PUT:
    الدعم هو الجدار المعاكس.
    المقاومة هي الجدار المساند.
  */
  const adverseWall = isCall
    ? nearestResistance
    : nearestSupport;

  const supportiveWall = isCall
    ? nearestSupport
    : nearestResistance;

  if (!adverseWall || !supportiveWall) {
    return {
      score: 50,
      riskLevel: "MEDIUM",
      label: "بيانات جدران القاما غير مكتملة",
      reasons: [
        "تعذر العثور على دعم ومقاومة Gamma معًا، لذلك لا يمكن حساب نسبة القوة بدقة.",
      ],
    };
  }

  /*
    نستخدم totalGex لقياس القوة الكلية للجدار.
  */
  const adverseStrength = Math.abs(
    Number(adverseWall.totalGex) || 0
  );

  const supportiveStrength = Math.abs(
    Number(supportiveWall.totalGex) || 0
  );

  /*
    المسافة كنسبة مئوية من سعر السهم.
    نمنع الصفر حتى لا يحدث قسمة على صفر.
  */
  const adverseDistance = Math.max(
    Number(adverseWall.distancePct) || 0,
    0.05
  );

  const supportiveDistance = Math.max(
    Number(supportiveWall.distancePct) || 0,
    0.05
  );

  /*
    نسبة القوة الخام:
    كم مرة الجدار المعاكس أقوى من الجدار المساند؟
  */
  const rawStrengthRatio =
    adverseStrength /
    Math.max(supportiveStrength, 1);

  /*
    القوة الفعلية بعد احتساب المسافة:
    الجدار القريب تأثيره أعلى من الجدار البعيد.
  */
  const effectiveAdverseStrength =
    adverseStrength / adverseDistance;

  const effectiveSupportiveStrength =
    supportiveStrength / supportiveDistance;

  const effectiveRiskRatio =
    effectiveAdverseStrength /
    Math.max(effectiveSupportiveStrength, 1);

  /*
    تحويل نسبة القوة الفعلية إلى درجة من 0 إلى 100.

    النسبة 0.5 = 33
    النسبة 1.0 = 50
    النسبة 2.0 = 67
    النسبة 3.0 = 75
    النسبة 9.0 = 90
  */
  const wallRiskScore =
    100 *
    (effectiveRiskRatio /
      (1 + effectiveRiskRatio));

  /*
    خطر Magnet من 0 إلى 100.
  */
  let magnetRiskScore = 50;

  if (magnet) {
    const magnetAgainstTrade =
      (isCall && magnet.strike < stockPrice) ||
      (!isCall && magnet.strike > stockPrice);

    const magnetDistance = Math.max(
      Number(magnet.distancePct) || 0,
      0.05
    );

    const proximityFactor = Math.max(
      0,
      Math.min(1, 1 - magnetDistance / 5)
    );

    magnetRiskScore = magnetAgainstTrade
      ? 50 + proximityFactor * 50
      : 50 - proximityFactor * 50;
  }

  /*
    خطر Gamma Flip من 0 إلى 100.
  */
  let flipRiskScore = 50;

  if (estimatedFlip !== null) {
    const flipDistancePct =
      (Math.abs(estimatedFlip - stockPrice) /
        stockPrice) *
      100;

    const flipAgainstTrade =
      (isCall && stockPrice < estimatedFlip) ||
      (!isCall && stockPrice > estimatedFlip);

    const proximityFactor = Math.max(
      0,
      Math.min(1, 1 - flipDistancePct / 5)
    );

    flipRiskScore = flipAgainstTrade
      ? 50 + proximityFactor * 50
      : 50 - proximityFactor * 50;
  }

  /*
    النتيجة النهائية:

    80% مقارنة قوة الجدارين والمسافة.
    10% Magnet.
    10% Gamma Flip.
  */
  const finalRiskScore = Math.round(
    wallRiskScore * 0.8 +
      magnetRiskScore * 0.1 +
      flipRiskScore * 0.1
  );

  const normalizedRisk = Math.max(
    0,
    Math.min(100, finalRiskScore)
  );

  /*
    هل السعر محصور بين دعم ومقاومة؟
  */
 const support = nearestSupport!;
const resistance = nearestResistance!;
  const priceBetweenWalls =
   support.strike < stockPrice &&
  resistance .strike > stockPrice;

  /*
    نص قوة الجدار المعاكس والمساند.
  */
  const adverseWallName = isCall
    ? "مقاومة Gamma"
    : "دعم Gamma";

  const supportiveWallName = isCall
    ? "دعم Gamma"
    : "مقاومة Gamma";

  reasons.push(
    `${adverseWallName} الأقرب عند ${adverseWall.strike}، بقوة ${formatGammaStrength(
      adverseStrength
    )}، وعلى بُعد ${adverseDistance.toFixed(2)}%.`
  );

  reasons.push(
    `${supportiveWallName} الأقرب عند ${supportiveWall.strike}، بقوة ${formatGammaStrength(
      supportiveStrength
    )}، وعلى بُعد ${supportiveDistance.toFixed(2)}%.`
  );

  /*
    مقارنة القوة الخام.
  */
  if (rawStrengthRatio > 1) {
    reasons.push(
      `${adverseWallName} أقوى من ${supportiveWallName} بمقدار ${rawStrengthRatio.toFixed(
        2
      )} مرة.`
    );
  } else if (rawStrengthRatio < 1) {
    const supportiveRatio =
      supportiveStrength /
      Math.max(adverseStrength, 1);

    reasons.push(
      `${supportiveWallName} أقوى من ${adverseWallName} بمقدار ${supportiveRatio.toFixed(
        2
      )} مرة.`
    );
  } else {
    reasons.push(
      `قوة ${adverseWallName} و${supportiveWallName} متساوية تقريبًا.`
    );
  }

  /*
    مقارنة القوة بعد احتساب المسافة.
  */
  if (effectiveRiskRatio > 1) {
    reasons.push(
      `بعد احتساب المسافة، ضغط الجدار المعاكس أعلى بمقدار ${effectiveRiskRatio.toFixed(
        2
      )} مرة.`
    );
  } else if (effectiveRiskRatio < 1) {
    const effectiveSupportRatio =
      effectiveSupportiveStrength /
      Math.max(effectiveAdverseStrength, 1);

    reasons.push(
      `بعد احتساب المسافة، قوة الجدار المساند أعلى بمقدار ${effectiveSupportRatio.toFixed(
        2
      )} مرة.`
    );
  } else {
    reasons.push(
      "بعد احتساب المسافة، تأثير الجدارين متقارب."
    );
  }

  if (priceBetweenWalls) {
    reasons.push(
      `السعر محصور بين دعم Gamma عند ${support.strike} ومقاومة Gamma عند ${resistance.strike}.`
    );
  }

  if (magnet) {
    const magnetAgainstTrade =
      (isCall && magnet.strike < stockPrice) ||
      (!isCall && magnet.strike > stockPrice);

    reasons.push(
      magnetAgainstTrade
        ? `مغناطيس القاما عند ${magnet.strike} يقع عكس اتجاه الصفقة، وعلى بُعد ${magnet.distancePct.toFixed(
            2
          )}%.`
        : `مغناطيس القاما عند ${magnet.strike} يقع مع اتجاه الصفقة، وعلى بُعد ${magnet.distancePct.toFixed(
            2
          )}%.`
    );
  }

  if (estimatedFlip !== null) {
    const flipDistancePct =
      (Math.abs(estimatedFlip - stockPrice) /
        stockPrice) *
      100;

    const flipAgainstTrade =
      (isCall && stockPrice < estimatedFlip) ||
      (!isCall && stockPrice > estimatedFlip);

    reasons.push(
      flipAgainstTrade
        ? `Gamma Flip عند ${estimatedFlip} يقع في الجهة المعاكسة للصفقة، ويبعد ${flipDistancePct.toFixed(
            2
          )}%.`
        : `Gamma Flip عند ${estimatedFlip} يدعم اتجاه الصفقة، ويبعد ${flipDistancePct.toFixed(
            2
          )}%.`
    );
  }

  /*
    الخلاصة.
  */
  if (normalizedRisk >= 65) {
    reasons.push(
      isCall
        ? "الخلاصة: المساحة الصاعدة محدودة، وتأثير مقاومة Gamma أعلى؛ احتمال التباطؤ أو الانعكاس مرتفع."
        : "الخلاصة: المساحة الهابطة محدودة، وتأثير دعم Gamma أعلى؛ احتمال التباطؤ أو الارتداد مرتفع."
    );
  } else if (normalizedRisk >= 35) {
    reasons.push(
      "الخلاصة: هيكل القاما متوازن نسبيًا، ويحتاج السعر إلى تأكيد قبل الدخول."
    );
  } else {
    reasons.push(
      "الخلاصة: الجدار المساند أقوى فعليًا، ولا يوجد ضغط Gamma معاكس مرتفع حاليًا."
    );
  }

  const riskLevel =
    normalizedRisk >= 65
      ? "HIGH"
      : normalizedRisk >= 35
        ? "MEDIUM"
        : "LOW";

  const label =
    riskLevel === "HIGH"
      ? "مخاطرة قاما مرتفعة 🔴"
      : riskLevel === "MEDIUM"
        ? "مخاطرة قاما متوسطة 🟡"
        : "مخاطرة قاما منخفضة 🟢";

  return {
    score: normalizedRisk,
    riskLevel,
    label,
    reasons,
  };
}

export function calculateConsensus(
  side: Side,
  flowScore: number,
  gammaScore: number,
  momentumScore: number,
  contractScore: number,
  changePct: number,
  estimatedNetGex: number
): ConsensusResult {
  let alignedEngines = 0;
  let conflictingEngines = 0;

  const reasons: string[] = [];

  const flowSupports =
    side !== "NEUTRAL" && flowScore >= 70;

  if (flowSupports) {
    alignedEngines += 1;
    reasons.push("تدفق العقود يدعم الاتجاه");
  } else if (side !== "NEUTRAL" && flowScore < 60) {
    conflictingEngines += 1;
    reasons.push("تدفق العقود غير حاسم");
  }

  const momentumSupports =
    (side === "CALL" && changePct > 0) ||
    (side === "PUT" && changePct < 0);

  if (momentumSupports && momentumScore >= 60) {
    alignedEngines += 1;
    reasons.push("الزخم السعري متوافق");
  } else if (
    side !== "NEUTRAL" &&
    !momentumSupports &&
    momentumScore >= 60
  ) {
    conflictingEngines += 1;
    reasons.push("الزخم السعري يعاكس الاتجاه");
  }

  const gammaSupports =
    (side === "CALL" && estimatedNetGex > 0) ||
    (side === "PUT" && estimatedNetGex < 0);

  if (gammaSupports && gammaScore >= 70) {
    alignedEngines += 1;
    reasons.push("القاما تدعم الاتجاه");
  } else if (
    side !== "NEUTRAL" &&
    !gammaSupports &&
    Math.abs(estimatedNetGex) > 0
  ) {
    conflictingEngines += 1;
    reasons.push("القاما لا تدعم الاتجاه");
  }

  if (contractScore >= 75) {
    alignedEngines += 1;
    reasons.push("جودة العقد مناسبة");
  } else if (contractScore < 60) {
    conflictingEngines += 1;
    reasons.push("جودة العقد ضعيفة");
  }

  const rawScore =
    alignedEngines * 25 -
    conflictingEngines * 20;

  const score = Math.max(
    0,
    Math.min(100, rawScore)
  );

  if (
    alignedEngines === 4 &&
    conflictingEngines === 0
  ) {
    return {
      score,
      alignedEngines,
      conflictingEngines,
      status: "STRONG",
      label: "توافق كامل",
      reasons,
    };
  }

  if (
    alignedEngines >= 3 &&
    conflictingEngines === 0
  ) {
    return {
      score,
      alignedEngines,
      conflictingEngines,
      status: "CONFIRMED",
      label: "توافق مؤكد",
      reasons,
    };
  }

  if (conflictingEngines >= 2) {
    return {
      score,
      alignedEngines,
      conflictingEngines,
      status: "CONFLICTED",
      label: "تعارض واضح",
      reasons,
    };
  }

  return {
    score,
    alignedEngines,
    conflictingEngines,
    status: "MIXED",
    label: "توافق جزئي",
    reasons,
  };
}

export function analyzeMarketData(
  analysis: AnalysisResponse
): MarketAnalysis {
  const result = buildAnalysis(analysis);

  return {
  ...result,
  gammaRisk: result.gammaRisk,
  consensus: result.consensus,
  contractQuality: contractQualityLabel(
    result.contractScore
  ),
};
}

export function createOpportunity(
  analysis: AnalysisResponse
): Opportunity {
  const marketAnalysis =
    analyzeMarketData(analysis);

  return {
    symbol: analysis.symbol,
    price: analysis.quote.price,
    changePct: analysis.quote.changePct,
    side: marketAnalysis.decision.side,
    score: marketAnalysis.decision.score,
    status: marketAnalysis.decision.status,
    confidence:
      marketAnalysis.decision.confidence,

    contract:
      marketAnalysis.selectedContract,
    contractScore:
      marketAnalysis.contractScore,
    contractQuality:
      marketAnalysis.contractQuality,

    consensusStatus:
      marketAnalysis.consensus.status,
    consensusLabel:
      marketAnalysis.consensus.label,

    gammaRiskScore:
      marketAnalysis.gammaRisk.score,
    gammaRiskLevel:
      marketAnalysis.gammaRisk.riskLevel,

    tradePlan:
      analysis.tradePlan ?? null,
  };
}
