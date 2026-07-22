import {
  calculateGammaScore,
  type AnalysisResponse,
  type OptionContract,
  type Side,
} from "./analysis-engine";

type DecisionSide = Exclude<Side, "NEUTRAL">;

export type DecisionActiveTradeResult = {
  qualifies: boolean;
  symbol: string;
  gexSide: Side;
  radarSide: Side;
  score: number;
  baseScore: number;
  gammaSupportBonus: number;
  gammaSupportRatio: number;
  entry: number | null;
  stop: number | null;
  selectedContract: OptionContract | null;
  rejectionReasons: string[];
};

const MIN_SCORE = 6;
const MIN_CONTRACT_PRICE = 1;
const MAX_CONTRACT_PRICE = 2.7;
const MAX_ENTRY_DISTANCE_PCT = 5;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getGexSide(analysis: AnalysisResponse): Side {
  const netGex =
    Number(analysis.options.estimatedNetGex) || 0;

  if (netGex > 0) return "CALL";
  if (netGex < 0) return "PUT";

  return "NEUTRAL";
}

function getRadarSide(analysis: AnalysisResponse): Side {
  const side = analysis.options.volumeBias;

  return side === "CALL" || side === "PUT"
    ? side
    : "NEUTRAL";
}

function buildAutoStop(
  entry: number,
  side: DecisionSide
) {
  if (side === "CALL") {
    return round(entry * 0.985, 4);
  }

  return round(entry * 1.015, 4);
}

function calculateGammaSupportBonus(
  analysis: AnalysisResponse,
  side: DecisionSide
) {
  const gamma =
    analysis.options.gammaStructure;

  if (side === "CALL") {
    const supports = [
      gamma.nearestSupport,
      gamma.strongestSupport,
      gamma.putWall,
    ]
      .map((level) =>
        Math.abs(Number(level?.totalGex) || 0)
      )
      .filter((value) => value > 0);

    const resistance = Math.abs(
      Number(
        (
          gamma.nearestResistance ||
          gamma.strongestResistance ||
          gamma.callWall
        )?.totalGex
      ) || 0
    );

    if (!supports.length || !resistance) {
      return {
        bonus: 0,
        ratio: 0,
      };
    }

    const ratio =
      Math.max(...supports) / resistance;

    if (ratio >= 10) {
      return {
        bonus: 2,
        ratio,
      };
    }

    if (ratio >= 5) {
      return {
        bonus: 1,
        ratio,
      };
    }

    return {
      bonus: 0,
      ratio,
    };
  }

  const resistances = [
    gamma.nearestResistance,
    gamma.strongestResistance,
    gamma.callWall,
  ]
    .map((level) =>
      Math.abs(Number(level?.totalGex) || 0)
    )
    .filter((value) => value > 0);

  const support = Math.abs(
    Number(
      (
        gamma.nearestSupport ||
        gamma.strongestSupport ||
        gamma.putWall
      )?.totalGex
    ) || 0
  );

  if (!resistances.length || !support) {
    return {
      bonus: 0,
      ratio: 0,
    };
  }

  const ratio =
    Math.max(...resistances) / support;

  if (ratio >= 10) {
    return {
      bonus: 2,
      ratio,
    };
  }

  if (ratio >= 5) {
    return {
      bonus: 1,
      ratio,
    };
  }

  return {
    bonus: 0,
    ratio,
  };
}

function getStrikeStep(price: number) {
  if (price >= 1000) return 10;
  if (price >= 500) return 5;
  if (price >= 100) return 2.5;

  return 1;
}

function getPreferredStrike(
  entry: number,
  side: DecisionSide
) {
  const step = getStrikeStep(entry);

  if (side === "CALL") {
    return Math.ceil(entry / step) * step;
  }

  return Math.floor(entry / step) * step;
}

/*
  نفس طريقة نقاط عقد بوت القرار:
  Volume + OI + Delta
  - عقوبة بعد السترايك
  - عقوبة السبريد.
*/
function scoreOptionContract(
  contract: OptionContract,
  preferredStrike: number,
  side: DecisionSide
) {
  const distance = Math.abs(
    Number(contract.strike) -
      preferredStrike
  );

  const volumeScore = Math.min(
    (Number(contract.volume) || 0) / 1000,
    3
  );

  const oiScore = Math.min(
    (Number(contract.openInterest) || 0) /
      3000,
    3
  );

  const delta =
    Number(contract.delta);

  let deltaScore = 0;

  if (Number.isFinite(delta)) {
    if (side === "CALL") {
      if (delta >= 0.25 && delta <= 0.65) {
        deltaScore = 3;
      } else if (
        delta >= 0.15 &&
        delta <= 0.75
      ) {
        deltaScore = 1.5;
      }
    } else {
      if (
        delta <= -0.25 &&
        delta >= -0.65
      ) {
        deltaScore = 3;
      } else if (
        delta <= -0.15 &&
        delta >= -0.75
      ) {
        deltaScore = 1.5;
      }
    }
  }

  const bid = Number(contract.bid) || 0;
  const ask = Number(contract.ask) || 0;
  const spread = ask - bid;

  const spreadPenalty =
    bid > 0 && ask > 0
      ? Math.min(spread / 0.2, 2)
      : 0;

  const distancePenalty =
    distance * 0.1;

  return (
    volumeScore +
    oiScore +
    deltaScore -
    distancePenalty -
    spreadPenalty
  );
}

function findBestOptionContract(
  analysis: AnalysisResponse,
  side: DecisionSide,
  preferredStrike: number
) {
  const candidates =
    side === "CALL"
      ? analysis.options.recommendedCalls
      : analysis.options.recommendedPuts;

  return (
    candidates
      .filter((contract) => {
        const mid =
          Number(contract.midpoint) || 0;

        return (
          Boolean(contract.ticker) &&
          mid >= MIN_CONTRACT_PRICE &&
          mid <= MAX_CONTRACT_PRICE
        );
      })
      .sort((first, second) => {
        const scoreDifference =
          scoreOptionContract(
            second,
            preferredStrike,
            side
          ) -
          scoreOptionContract(
            first,
            preferredStrike,
            side
          );

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return (
          Math.abs(
            first.strike -
              preferredStrike
          ) -
          Math.abs(
            second.strike -
              preferredStrike
          )
        );
      })[0] ?? null
  );
}

export function evaluateDecisionActiveTrade(
  analysis: AnalysisResponse
): DecisionActiveTradeResult {
  const rejectionReasons: string[] = [];

  const symbol =
    analysis.symbol
      .trim()
      .toUpperCase();

  const gexSide =
    getGexSide(analysis);

  const radarSide =
    getRadarSide(analysis);

  if (
    gexSide === "NEUTRAL" ||
    radarSide === "NEUTRAL"
  ) {
    rejectionReasons.push(
      gexSide === "NEUTRAL"
        ? "القاما لا تعطي اتجاهًا واضحًا"
        : "الرادار لا يعطي اتجاهًا واضحًا"
    );

    return {
      qualifies: false,
      symbol,
      gexSide,
      radarSide,
      score: 0,
      baseScore: 0,
      gammaSupportBonus: 0,
      gammaSupportRatio: 0,
      entry: null,
      stop: null,
      selectedContract: null,
      rejectionReasons,
    };
  }

  if (gexSide !== radarSide) {
    rejectionReasons.push(
      `تعارض الاتجاه: GEX=${gexSide}, RADAR=${radarSide}`
    );

    return {
      qualifies: false,
      symbol,
      gexSide,
      radarSide,
      score: 0,
      baseScore: 0,
      gammaSupportBonus: 0,
      gammaSupportRatio: 0,
      entry: null,
      stop: null,
      selectedContract: null,
      rejectionReasons,
    };
  }

  const side =
    gexSide as DecisionSide;

  /*
    تحويل Gamma Score المتوفر في المنصة
    من مقياس 100 إلى مقياس 10.
  */
  const gammaScore100 =
    calculateGammaScore(
      side,
      Number(
        analysis.options.estimatedNetGex
      ) || 0
    );

  const baseScore =
    round(gammaScore100 / 10, 2);

  const gammaSupport =
    calculateGammaSupportBonus(
      analysis,
      side
    );

  const score =
    round(
      clamp(
        baseScore +
          gammaSupport.bonus,
        0,
        10
      ),
      2
    );

  if (score < MIN_SCORE) {
    rejectionReasons.push(
      `Score ضعيف: ${score}/10`
    );
  }

  /*
    الفحص التلقائي يعادل Ready Now:
    الدخول هو السعر الحالي، ولذلك مسافة
    الدخول عن السعر الحالي تساوي صفرًا.
  */
  const entry =
    Number(analysis.quote.price) || 0;

  if (!entry) {
    rejectionReasons.push(
      "لا يوجد سعر حالي صالح للدخول"
    );
  }

  const currentPrice =
    Number(analysis.quote.price) || 0;

  const distancePct =
    entry > 0 && currentPrice > 0
      ? Math.abs(
          currentPrice - entry
        ) /
        currentPrice *
        100
      : 100;

  if (
    distancePct >
    MAX_ENTRY_DISTANCE_PCT
  ) {
    rejectionReasons.push(
      `الدخول بعيد عن السعر الحالي: ${round(
        distancePct,
        2
      )}%`
    );
  }

  const preferredStrike =
    entry > 0
      ? getPreferredStrike(
          entry,
          side
        )
      : 0;

  const selectedContract =
    preferredStrike > 0
      ? findBestOptionContract(
          analysis,
          side,
          preferredStrike
        )
      : null;

  if (!selectedContract) {
    rejectionReasons.push(
      `لا يوجد عقد داخل النطاق ${MIN_CONTRACT_PRICE} - ${MAX_CONTRACT_PRICE}`
    );
  }

  const stop =
    entry > 0
      ? buildAutoStop(
          entry,
          side
        )
      : null;

  if (!stop) {
    rejectionReasons.push(
      "لا يوجد وقف ولا يمكن حساب وقف تلقائي"
    );
  }

  return {
    qualifies:
      rejectionReasons.length === 0,
    symbol,
    gexSide,
    radarSide,
    score,
    baseScore,
    gammaSupportBonus:
      gammaSupport.bonus,
    gammaSupportRatio:
      round(
        gammaSupport.ratio,
        2
      ),
    entry:
      entry || null,
    stop,
    selectedContract,
    rejectionReasons,
  };
}


export async function syncDecisionActiveTrade(
  analysis: AnalysisResponse,
  result: DecisionActiveTradeResult
) {
  if (
    !result.qualifies ||
    !result.selectedContract ||
    result.gexSide === "NEUTRAL"
  ) {
    return null;
  }

  const { createClient } =
    await import("@supabase/supabase-js");

  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  const supabase = createClient(
    url,
    secret,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const nowIso =
    new Date().toISOString();

  const expiresAt =
    new Date(
      Date.now() +
        3 * 60 * 60 * 1000
    ).toISOString();

  const side =
    result.gexSide as DecisionSide;

  const contract =
    result.selectedContract;

  const contractTicker =
    contract.ticker;

  const existingQuery =
    await supabase
      .from("stock_trade_setups")
      .select("*")
      .eq("symbol", result.symbol)
      .eq("status", "active")
      .order("created_at", {
        ascending: false,
      });

  if (existingQuery.error) {
    throw existingQuery.error;
  }

  const blockingTrade =
    (existingQuery.data || []).find(
      (row) => {
        const rowStatus = String(
          row.status || ""
        ).toUpperCase();

        const contractStatus = String(
          row.contract_status || ""
        ).toUpperCase();

        return (
          rowStatus !== "STOPPED" &&
          contractStatus !== "STOPPED"
        );
      }
    );

  if (blockingTrade) {
    return blockingTrade;
  }

  const entryPrice =
    Number(result.entry) || 0;

  const stopPrice =
    Number(result.stop) || null;

  const optionEntry =
    Number(contract.midpoint) ||
    Number(contract.ask) ||
    Number(contract.lastTradePrice) ||
    0;

  const optionStop =
    optionEntry > 0
      ? Math.max(
          optionEntry - 0.65,
          0.01
        )
      : null;

  const insertResult =
    await supabase
      .from("stock_trade_setups")
      .insert({
        symbol: result.symbol,
        side,
        contract_ticker:
          contractTicker,
        entry_price:
          entryPrice,
        entry_score:
          Math.round(
            result.score * 10
          ),
        stop_price:
          stopPrice,
        gamma_targets: [],
        gamma_snapshot: {
          source:
            "decision.activeTradeEngine",
          capturedAt:
            analysis.capturedAt ||
            nowIso,
          decisionScore:
            result.score,
          baseScore:
            result.baseScore,
          gammaSupportBonus:
            result.gammaSupportBonus,
          gammaSupportRatio:
            result.gammaSupportRatio,
          gexSide:
            result.gexSide,
          radarSide:
            result.radarSide,
          selectedContract: {
            ticker:
              contract.ticker,
            type:
              contract.type,
            expiration:
              contract.expiration,
            strike:
              contract.strike,
            bid:
              contract.bid,
            ask:
              contract.ask,
            midpoint:
              contract.midpoint,
            spreadPct:
              contract.spreadPct,
            volume:
              contract.volume,
            openInterest:
              contract.openInterest,
            volumeOiRatio:
              contract.volumeOiRatio,
            delta:
              contract.delta,
            gamma:
              contract.gamma,
          },
          optionStop,
        },
        first_seen_at:
          nowIso,
        last_seen_at:
          nowIso,
        expires_at:
          expiresAt,
        current_price:
          entryPrice,
        best_price:
          entryPrice,
        best_price_at:
          nowIso,
        status:
          "active",
        invalidated_at:
          null,
        invalidation_reason:
          null,
        contract_entry_price:
          optionEntry,
        contract_current_price:
          optionEntry,
        contract_best_price:
          optionEntry,
        contract_best_price_at:
          nowIso,
        contract_bid:
          Number(contract.bid) || 0,
        contract_ask:
          Number(contract.ask) || 0,
        contract_profit_dollars:
          0,
        contract_profit_pct:
          0,
        contract_quote_at:
          nowIso,
        last_profit_step:
          0,
      })
      .select("*")
      .single();

  if (
    insertResult.error ||
    !insertResult.data
  ) {
    throw (
      insertResult.error ||
      new Error(
        "تعذر حفظ صفقة محرك القرار"
      )
    );
  }

  return insertResult.data;
}
