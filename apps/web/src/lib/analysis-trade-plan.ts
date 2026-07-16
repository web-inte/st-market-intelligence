import { createClient } from "@supabase/supabase-js";

import type {
  AnalysisResponse,
  AnalysisTradePlan,
  AnalysisTradePlanTarget,
  Side,
} from "./analysis-engine";

type ActiveSide = Exclude<Side, "NEUTRAL">;

type SetupRow = {
  id: string;
  symbol: string;
  side: ActiveSide;
  contract_ticker: string;
  entry_price: number | string;
  entry_score: number | null;
  stop_price: number | string | null;
  gamma_targets: unknown;
  gamma_snapshot?: unknown;
  first_seen_at: string;
  last_seen_at: string;
  expires_at: string;
};

type GammaLevel =
  AnalysisResponse["options"]["gammaStructure"]["magnet"];

type SelectedContract = NonNullable<
  AnalysisResponse["options"]["bestCall"]
>;

const SETUP_LIFETIME_MS =
  3 * 60 * 60 * 1000;

function numberValue(
  value: unknown,
  fallback = 0
) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : fallback;
}

function round(
  value: number,
  digits = 2
) {
  const factor = 10 ** digits;

  return (
    Math.round(value * factor) /
    factor
  );
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

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ||
    process.env
      .SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  return createClient(
    url,
    secret,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function fallbackMovePercentages(
  score: number
) {
  const safeScore =
    clamp(score, 0, 100);

  const baseMove =
    0.8 +
    (safeScore / 100) * 0.9;

  return [
    baseMove,
    baseMove * 1.75,
    baseMove * 2.6,
  ];
}

function fallbackStopMove(
  score: number
) {
  const safeScore =
    clamp(score, 0, 100);

  return (
    0.7 +
    ((100 - safeScore) / 100) *
      0.5
  );
}

function gammaStrength(
  level: NonNullable<GammaLevel>,
  maximumStrength: number
) {
  const rawStrength =
    Math.abs(
      numberValue(level.totalGex)
    );

  if (maximumStrength <= 0) {
    return 0;
  }

  return clamp(
    Math.round(
      (rawStrength /
        maximumStrength) *
        100
    ),
    0,
    100
  );
}

function uniqueLevels(
  levels: Array<{
    level: NonNullable<GammaLevel>;
    name: string;
  }>
) {
  const seen = new Set<string>();

  return levels.filter(({ level }) => {
    const key =
      numberValue(level.strike)
        .toFixed(2);

    if (
      numberValue(level.strike) <= 0 ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildTargets(
  analysis: AnalysisResponse,
  side: ActiveSide,
  entryPrice: number,
  stopPrice: number,
  score: number
): AnalysisTradePlanTarget[] {
  const gamma =
    analysis.options.gammaStructure;

  const stopDistancePct =
    entryPrice > 0 && stopPrice > 0
      ? Math.abs(
          ((entryPrice - stopPrice) /
            entryPrice) *
            100
        )
      : fallbackStopMove(score);

  /*
    لا نقبل هدفًا قريبًا لا يبرر المخاطرة.
    الهدف الأول يجب أن يعطي على الأقل 1.35R،
    مع حد أدنى عملي 0.75% على السهم.
  */
  const minimumTargetMovePct =
    Math.max(
      0.75,
      stopDistancePct * 1.35
    );

  const maximumTargetMovePct =
    Math.min(
      5,
      Math.max(
        3,
        stopDistancePct * 3.5
      )
    );

  const gammaCandidates =
    side === "CALL"
      ? [
          {
            level:
              gamma.nearestResistance,
            name:
              "NEAREST_RESISTANCE",
          },
          {
            level:
              gamma.strongestResistance,
            name:
              "STRONGEST_RESISTANCE",
          },
          {
            level: gamma.callWall,
            name: "CALL_WALL",
          },
          {
            level: gamma.magnet,
            name: "MAGNET",
          },
        ]
      : [
          {
            level:
              gamma.nearestSupport,
            name:
              "NEAREST_SUPPORT",
          },
          {
            level:
              gamma.strongestSupport,
            name:
              "STRONGEST_SUPPORT",
          },
          {
            level: gamma.putWall,
            name: "PUT_WALL",
          },
          {
            level: gamma.magnet,
            name: "MAGNET",
          },
        ];

  const usableGammaLevels =
    uniqueLevels(
      gammaCandidates.filter(
        (
          item
        ): item is {
          level: NonNullable<
            GammaLevel
          >;
          name: string;
        } => Boolean(item.level)
      )
    )
      .map(({ level, name }) => {
        const price =
          numberValue(level.strike);

        const movePct =
          Math.abs(
            ((price - entryPrice) /
              entryPrice) *
              100
          );

        return {
          level,
          name,
          price,
          movePct,
        };
      })
      .filter((item) => {
        const correctDirection =
          side === "CALL"
            ? item.price > entryPrice
            : item.price < entryPrice;

        return (
          correctDirection &&
          item.movePct >=
            minimumTargetMovePct &&
          item.movePct <=
            maximumTargetMovePct
        );
      })
      .sort(
        (left, right) =>
          left.movePct -
          right.movePct
      );

  const maximumStrength =
    Math.max(
      0,
      ...usableGammaLevels.map(
        ({ level }) =>
          Math.abs(
            numberValue(
              level.totalGex
            )
          )
      )
    );

  const targets:
    AnalysisTradePlanTarget[] =
    usableGammaLevels
      .slice(0, 3)
      .map(
        (
          {
            level,
            name,
            price,
            movePct,
          },
          index
        ) => {
          const strength =
            gammaStrength(
              level,
              maximumStrength
            );

          return {
            index: index + 1,
            price: round(price, 2),
            movePct:
              round(movePct, 2),
            probability: clamp(
              Math.round(
                score * 0.72 +
                  strength * 0.28 -
                  movePct * 3
              ),
              10,
              95
            ),
            strength,
            level: name,
            source:
              "GAMMA" as const,
          };
        }
      );

  const baseFallbackPercentages =
    fallbackMovePercentages(score);

  const fallbackPercentages = [
    Math.max(
      baseFallbackPercentages[0],
      stopDistancePct * 1.5
    ),
    Math.max(
      baseFallbackPercentages[1],
      stopDistancePct * 2.2
    ),
    Math.max(
      baseFallbackPercentages[2],
      stopDistancePct * 3
    ),
  ].map((value) =>
    Math.min(value, 5)
  );

  for (
    let index = 0;
    targets.length < 3 &&
    index <
      fallbackPercentages.length;
    index += 1
  ) {
    const movePct =
      fallbackPercentages[index];

    const direction =
      side === "PUT" ? -1 : 1;

    const price =
      entryPrice *
      (1 +
        direction *
          (movePct / 100));

    const isDuplicate =
      targets.some(
        (target) =>
          Math.abs(
            target.price - price
          ) < 0.01
      );

    if (isDuplicate) {
      continue;
    }

    targets.push({
      index: targets.length + 1,
      price: round(price, 2),
      movePct:
        round(movePct, 2),
      probability: clamp(
        Math.round(
          score -
            targets.length * 9
        ),
        10,
        99
      ),
      strength: 0,
      level: "ESTIMATED",
      source: "ESTIMATED",
    });
  }

  return targets.map(
    (target, index) => ({
      ...target,
      index: index + 1,
    })
  );
}

function buildStopPrice(
  analysis: AnalysisResponse,
  side: ActiveSide,
  entryPrice: number,
  score: number
) {
  const gamma =
    analysis.options.gammaStructure;

  const candidates =
    side === "CALL"
      ? [
          gamma.nearestSupport,
          gamma.strongestSupport,
          gamma.putWall,
          gamma.magnet,
        ]
      : [
          gamma.nearestResistance,
          gamma.strongestResistance,
          gamma.callWall,
          gamma.magnet,
        ];

  const directionalCandidates =
    candidates
      .filter(
        (
          level
        ): level is NonNullable<
          GammaLevel
        > => Boolean(level)
      )
      .map((level) =>
        numberValue(level.strike)
      )
      .filter((price) => {
        if (price <= 0) {
          return false;
        }

        const correctDirection =
          side === "CALL"
            ? price < entryPrice
            : price > entryPrice;

        const distancePct =
          Math.abs(
            ((price - entryPrice) /
              entryPrice) *
              100
          );

        return (
          correctDirection &&
          distancePct >= 0.45 &&
          distancePct <= 2.8
        );
      })
      .sort((first, second) =>
        Math.abs(
          first - entryPrice
        ) -
        Math.abs(
          second - entryPrice
        )
      );

  const wall =
    directionalCandidates[0];

  if (wall) {
    const bufferedStop =
      side === "CALL"
        ? wall * 0.9985
        : wall * 1.0015;

    const bufferedDistancePct =
      Math.abs(
        ((bufferedStop - entryPrice) /
          entryPrice) *
          100
      );

    if (
      bufferedDistancePct >= 0.55 &&
      bufferedDistancePct <= 3
    ) {
      return round(bufferedStop, 2);
    }
  }

  const stopMove =
    fallbackStopMove(score);

  return round(
    entryPrice *
      (1 -
        (side === "PUT" ? -1 : 1) *
          (stopMove / 100)),
    2
  );
}

function normalizeTargets(
  value: unknown
): AnalysisTradePlanTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        item &&
        typeof item === "object"
    )
    .map((item, index) => {
      const target =
        item as Record<
          string,
          unknown
        >;

      const source:
        AnalysisTradePlanTarget["source"] =
        target.source === "GAMMA"
          ? "GAMMA"
          : "ESTIMATED";

      return {
        index:
          numberValue(
            target.index,
            index + 1
          ),
        price:
          numberValue(target.price),
        movePct:
          numberValue(
            target.movePct
          ),
        probability:
          numberValue(
            target.probability
          ),
        strength:
          numberValue(
            target.strength
          ),
        level: String(
          target.level ||
            "ESTIMATED"
        ),
        source,
      };
    })
    .filter(
      (target) =>
        target.price > 0
    );
}

function planState(
  side: ActiveSide,
  currentPrice: number,
  stopPrice: number | null,
  targets: AnalysisTradePlanTarget[]
) {
  const stopped =
    stopPrice !== null &&
    (
      side === "CALL"
        ? currentPrice <= stopPrice
        : currentPrice >= stopPrice
    );

  if (stopped) {
    return {
      lifecycleStatus:
        "STOPPED" as const,
      lifecycleLabel:
        "ضرب الوقف",
      highestTargetHit: 0,
    };
  }

  const hitTargets =
    targets.filter(
      (target) =>
        side === "CALL"
          ? currentPrice >=
            target.price
          : currentPrice <=
            target.price
    );

  const highestTargetHit =
    hitTargets.reduce(
      (highest, target) =>
        Math.max(
          highest,
          target.index
        ),
      0
    );

  if (highestTargetHit >= 3) {
    return {
      lifecycleStatus:
        "TARGET_3" as const,
      lifecycleLabel:
        "تحقق الهدف الثالث",
      highestTargetHit,
    };
  }

  if (highestTargetHit === 2) {
    return {
      lifecycleStatus:
        "TARGET_2" as const,
      lifecycleLabel:
        "تحقق الهدف الثاني",
      highestTargetHit,
    };
  }

  if (highestTargetHit === 1) {
    return {
      lifecycleStatus:
        "TARGET_1" as const,
      lifecycleLabel:
        "تحقق الهدف الأول",
      highestTargetHit,
    };
  }

  return {
    lifecycleStatus:
      "ACTIVE" as const,
    lifecycleLabel:
      "فرصة نشطة",
    highestTargetHit: 0,
  };
}

function mapPlan(
  row: SetupRow,
  currentPrice: number,
  isNew: boolean
): AnalysisTradePlan {
  const entryPrice =
    numberValue(row.entry_price);

  const stopPrice =
    row.stop_price == null
      ? null
      : numberValue(
          row.stop_price
        );

  const targets =
    normalizeTargets(
      row.gamma_targets
    );

  const rawMovePct =
    entryPrice > 0
      ? ((currentPrice -
          entryPrice) /
          entryPrice) *
        100
      : 0;

  const currentProfitPct =
    row.side === "PUT"
      ? -rawMovePct
      : rawMovePct;

  const firstSeenTime =
    new Date(
      row.first_seen_at
    ).getTime();

  const ageMinutes =
    Number.isFinite(firstSeenTime)
      ? Math.max(
          0,
          Math.floor(
            (Date.now() -
              firstSeenTime) /
              60_000
          )
        )
      : 0;

  const state =
    planState(
      row.side,
      currentPrice,
      stopPrice,
      targets
    );

  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    contractTicker:
      row.contract_ticker,
    entryPrice,
    entryScore:
      numberValue(
        row.entry_score
      ),
    stopPrice,
    targets,
    firstSeenAt:
      row.first_seen_at,
    lastSeenAt:
      row.last_seen_at,
    expiresAt:
      row.expires_at,
    currentPrice:
      round(currentPrice, 2),
    rawMovePct:
      round(rawMovePct, 2),
    currentProfitPct:
      round(
        currentProfitPct,
        2
      ),
    ageMinutes,
    isNew,
    ...state,
  };
}

function selectContractForSide(
  analysis: AnalysisResponse,
  side: ActiveSide
): SelectedContract | null {
  const contract =
    side === "CALL"
      ? analysis.options.bestCall
      : analysis.options.bestPut;

  if (
    !contract ||
    !contract.ticker ||
    numberValue(contract.midpoint) <= 0
  ) {
    return null;
  }

  return contract;
}

function isRealOptionTicker(
  ticker: string
) {
  return (
    typeof ticker === "string" &&
    ticker.startsWith("O:") &&
    ticker.length > 8
  );
}

function isAnalysisPlan(
  row: SetupRow
) {
  if (
    !row.gamma_snapshot ||
    typeof row.gamma_snapshot !==
      "object"
  ) {
    return false;
  }

  return (
    (
      row.gamma_snapshot as Record<
        string,
        unknown
      >
    ).source ===
    "analysis.gammaStructure"
  );
}

export async function syncAnalysisTradePlan(
  analysis: AnalysisResponse,
  side: Side,
  score: number
): Promise<AnalysisTradePlan | null> {
  const symbol =
    analysis.symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z.-]/g, "");

  const currentPrice =
    numberValue(
      analysis.quote.price
    );

  if (!symbol || currentPrice <= 0) {
    return null;
  }

  const supabase =
    createAdminClient();

  const now = new Date();
  const nowIso =
    now.toISOString();

  const expiresAt =
    new Date(
      now.getTime() +
        SETUP_LIFETIME_MS
    ).toISOString();

  await supabase
    .from("stock_trade_setups")
    .update({
      status: "expired",
      invalidated_at: nowIso,
      invalidation_reason:
        "انتهت مدة الفرصة",
    })
    .eq("symbol", symbol)
    .eq("status", "active")
    .lte("expires_at", nowIso);

  const directionalSide:
    ActiveSide | null =
    side === "CALL" ||
    side === "PUT"
      ? side
      : null;

  const selectedContract =
    directionalSide
      ? selectContractForSide(
          analysis,
          directionalSide
        )
      : null;

  const qualifies =
    directionalSide !== null &&
    score >= 70 &&
    selectedContract !== null;

  if (!qualifies) {
    let invalidationReason =
      "انخفض تقييم الفرصة عن 70";

    if (side === "NEUTRAL") {
      invalidationReason =
        "أصبح اتجاه الفرصة محايدًا";
    } else if (!selectedContract) {
      invalidationReason =
        "لا يوجد عقد أوبشن مؤهل للفرصة";
    }

    await supabase
      .from("stock_trade_setups")
      .update({
        status: "invalidated",
        invalidated_at: nowIso,
        invalidation_reason:
          invalidationReason,
      })
      .eq("symbol", symbol)
      .eq("status", "active");

    return null;
  }

  const activeSide =
    directionalSide as ActiveSide;

  const preferredContract =
    selectedContract as SelectedContract;

  const contractTicker =
    preferredContract.ticker;

  const {
    data: activeRows,
    error: activeRowsError,
  } = await supabase
    .from("stock_trade_setups")
    .select("*")
    .eq("symbol", symbol)
    .eq("status", "active")
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (activeRowsError) {
    throw activeRowsError;
  }

  const rows =
    (activeRows || []) as
      SetupRow[];

  /*
    نتخلص من الخطط القديمة التي كانت تحفظ اسمًا
    شكليًا مثل AAPL:CALL بدل رمز عقد Massive الحقيقي.
  */
  const invalidRows =
    rows.filter(
      (row) =>
        row.side !== activeSide ||
        !isAnalysisPlan(row) ||
        !isRealOptionTicker(
          row.contract_ticker
        )
    );

  if (invalidRows.length > 0) {
    await supabase
      .from("stock_trade_setups")
      .update({
        status: "invalidated",
        invalidated_at: nowIso,
        invalidation_reason:
          "تغير الاتجاه أو ترقية الخطة إلى عقد أوبشن حقيقي",
      })
      .in(
        "id",
        invalidRows.map(
          (row) => row.id
        )
      );
  }

  /*
    نحافظ على العقد الذي اختير عند أول ظهور للفرصة
    طوال عمر الخطة، بدل تغيير العقد وإعادة الدخول
    كلما تغير ترتيب العقود في التحديثات اللحظية.
  */
  const existing =
    rows.find(
      (row) =>
        row.side === activeSide &&
        isAnalysisPlan(row) &&
        isRealOptionTicker(
          row.contract_ticker
        )
    );

  if (existing) {
    const {
      data: updated,
      error: updateError,
    } = await supabase
      .from("stock_trade_setups")
      .update({
        last_seen_at: nowIso,
        expires_at: expiresAt,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (
      updateError ||
      !updated
    ) {
      throw (
        updateError ||
        new Error(
          "تعذر تحديث متابعة الفرصة"
        )
      );
    }

    return mapPlan(
      updated as SetupRow,
      currentPrice,
      false
    );
  }

  const stopPrice =
    buildStopPrice(
      analysis,
      activeSide,
      currentPrice,
      score
    );

  const targets =
    buildTargets(
      analysis,
      activeSide,
      currentPrice,
      stopPrice,
      score
    );

  const {
    data: inserted,
    error: insertError,
  } = await supabase
    .from("stock_trade_setups")
    .insert({
      symbol,
      side: activeSide,
      contract_ticker:
        contractTicker,
      entry_price:
        round(currentPrice, 4),
      entry_score:
        Math.round(score),
      stop_price: stopPrice,
      gamma_targets: targets,
      gamma_snapshot: {
        source:
          "analysis.gammaStructure",
        capturedAt:
          analysis.capturedAt ||
          nowIso,

        /* سعر السهم هو مرجع الأهداف والوقف. */
        stockEntryPrice:
          currentPrice,
        stopPrice,
        selectedTargets:
          targets,

        /* العقد الحقيقي المختار وقت ظهور الفرصة. */
        selectedContract: {
          ticker:
            preferredContract.ticker,
          type:
            preferredContract.type,
          expiration:
            preferredContract.expiration,
          strike:
            preferredContract.strike,
          bid:
            preferredContract.bid,
          ask:
            preferredContract.ask,
          midpoint:
            preferredContract.midpoint,
          spreadPct:
            preferredContract.spreadPct,
          volume:
            preferredContract.volume,
          openInterest:
            preferredContract.openInterest,
          volumeOiRatio:
            preferredContract.volumeOiRatio,
          delta:
            preferredContract.delta,
          gamma:
            preferredContract.gamma,
          theta:
            preferredContract.theta,
          vega:
            preferredContract.vega,
          iv:
            preferredContract.iv,
          lastTradePrice:
            preferredContract.lastTradePrice,
          lastTradeSize:
            preferredContract.lastTradeSize,
        },

        gammaStructure:
          analysis.options
            .gammaStructure,
      },
      status: "active",
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (
    insertError ||
    !inserted
  ) {
    const {
      data: concurrent,
    } = await supabase
      .from("stock_trade_setups")
      .select("*")
      .eq("symbol", symbol)
      .eq("side", activeSide)
      .eq(
        "contract_ticker",
        contractTicker
      )
      .eq("status", "active")
      .gt(
        "expires_at",
        nowIso
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (
      concurrent &&
      isAnalysisPlan(
        concurrent as SetupRow
      )
    ) {
      return mapPlan(
        concurrent as SetupRow,
        currentPrice,
        false
      );
    }

    throw (
      insertError ||
      new Error(
        "تعذر حفظ خطة الفرصة"
      )
    );
  }

  return mapPlan(
    inserted as SetupRow,
    currentPrice,
    true
  );
}