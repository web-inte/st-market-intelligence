"use client";

import {
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useLiveStockPrice,
} from "../lib/live-market";

type TargetLevel = {
  index: number;
  price: number;
};

type StockSmartChartProps = {
  symbol: string;
  currentPrice: number;
  entry: number;
  stop: number;
  targets: TargetLevel[];
  side: "CALL" | "PUT" | "NEUTRAL";
  gammaData?: unknown;
};

type ChartLevel = {
  key: string;
  title: string;
  price: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: 1 | 2 | 3 | 4;
  axisLabelVisible: boolean;
};

type GammaLevel = {
  price: number;
  strength: number;
};

type TechnicalLevels = {
  support: number[];
  resistance: number[];
};

type ChartCandle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

const INLINE_GAMMA_LABEL_KEYS =
  new Set([
    "gamma-support",
    "gamma-resistance",
    "gamma-flip",
    "zero-gamma",
    "magnet",
  ]);

function toRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

function safeNumber(
  value: unknown
): number | null {
  const number = Number(value);

  return Number.isFinite(number) &&
    number > 0
    ? number
    : null;
}

function extractPrice(
  value: unknown
): number | null {
  const direct = safeNumber(value);

  if (direct !== null) {
    return direct;
  }

  const object = toRecord(value);

  if (!object) {
    return null;
  }

  const keys = [
    "strike",
    "price",
    "level",
    "value",
    "stockPrice",
    "underlyingPrice",
  ];

  for (const key of keys) {
    const price =
      safeNumber(object[key]);

    if (price !== null) {
      return price;
    }
  }

  return null;
}

function firstValue(
  ...values: unknown[]
) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined
    ) {
      return value;
    }
  }

  return null;
}

function readMetric(
  row: Record<string, unknown>,
  side: "CALL" | "PUT"
) {
  const directKeys =
    side === "CALL"
      ? [
          "callGex",
          "callGamma",
          "callExposure",
          "callGammaExposure",
          "call_gex",
        ]
      : [
          "putGex",
          "putGamma",
          "putExposure",
          "putGammaExposure",
          "put_gex",
        ];

  for (const key of directKeys) {
    const value = Number(row[key]);

    if (Number.isFinite(value)) {
      return Math.abs(value);
    }
  }

  const nestedKeys =
    side === "CALL"
      ? ["call", "calls"]
      : ["put", "puts"];

  for (const nestedKey of nestedKeys) {
    const nested =
      toRecord(row[nestedKey]);

    if (!nested) {
      continue;
    }

    for (const key of [
      "gex",
      "gamma",
      "exposure",
      "gammaExposure",
    ]) {
      const value =
        Number(nested[key]);

      if (Number.isFinite(value)) {
        return Math.abs(value);
      }
    }
  }

  return 0;
}

function collectGammaRows(
  value: unknown,
  rows: Record<string, unknown>[],
  depth = 0
) {
  if (depth > 4 || !value) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectGammaRows(
        item,
        rows,
        depth + 1
      )
    );

    return;
  }

  const object = toRecord(value);

  if (!object) {
    return;
  }

  if (extractPrice(object) !== null) {
    rows.push(object);
  }

  for (const key of [
    "rows",
    "items",
    "data",
    "results",
    "levels",
    "gammaLevels",
    "gammaByStrike",
    "strikes",
  ]) {
    if (object[key]) {
      collectGammaRows(
        object[key],
        rows,
        depth + 1
      );
    }
  }
}

function uniqueGammaLevels(
  levels: GammaLevel[]
) {
  const result: GammaLevel[] = [];

  for (const level of levels) {
    const existing = result.find(
      (item) =>
        Math.abs(
          item.price - level.price
        ) < 0.01
    );

    if (!existing) {
      result.push(level);
      continue;
    }

    existing.strength = Math.max(
      existing.strength,
      level.strength
    );
  }

  return result;
}

function extractGammaView(
  gammaData: unknown,
  currentPrice: number
) {
  const root =
    toRecord(gammaData) || {};

  const structure =
    toRecord(root.gammaStructure) ||
    toRecord(root.gamma) ||
    root;

  const walls =
    toRecord(root.walls) ||
    toRecord(structure.walls) ||
    {};

  const callWall = firstValue(
    structure.callWall,
    walls.callWall,
    root.callWall
  );

  const putWall = firstValue(
    structure.putWall,
    walls.putWall,
    root.putWall
  );

  const support = firstValue(
    structure.nearestSupport,
    structure.support,
    root.nearestSupport,
    root.support,
    root.gammaSupport
  );

  const resistance = firstValue(
    structure.nearestResistance,
    structure.resistance,
    root.nearestResistance,
    root.resistance,
    root.gammaResistance
  );

  const magnet = firstValue(
    structure.magnet,
    root.magnet
  );

  const gammaFlip = firstValue(
    structure.estimatedFlip,
    structure.gammaFlip,
    root.gammaFlip,
    root.gammaFlipLevel,
    root.flip
  );

  const zeroGamma = firstValue(
    structure.zeroGamma,
    root.zeroGamma,
    root.zeroGammaLevel
  );

  const rows:
    Record<string, unknown>[] = [];

  [
    root.gammaByStrike,
    root.gammaLevels,
    root.levels,
    structure.gammaByStrike,
    structure.gammaLevels,
    structure.levels,
    structure.nearestSupport,
    structure.nearestResistance,
    structure.strongestSupport,
    structure.strongestResistance,
    root.nearestSupport,
    root.nearestResistance,
    root.strongestSupport,
    root.strongestResistance,
  ].forEach((value) =>
    collectGammaRows(value, rows)
  );

  const callLevels: GammaLevel[] = [];
  const putLevels: GammaLevel[] = [];

  rows.forEach((row) => {
    const price =
      extractPrice(row);

    if (price === null) {
      return;
    }

    const callStrength =
      readMetric(row, "CALL");

    const putStrength =
      readMetric(row, "PUT");

    if (
      callStrength <= 0 &&
      putStrength <= 0
    ) {
      return;
    }

    if (
      callStrength >
      putStrength * 1.05
    ) {
      callLevels.push({
        price,
        strength: callStrength,
      });

      return;
    }

    if (
      putStrength >
      callStrength * 1.05
    ) {
      putLevels.push({
        price,
        strength: putStrength,
      });
    }
  });

  const candidateToLevel = (
    value: unknown,
    levelSide: "CALL" | "PUT"
  ): GammaLevel | null => {
    const price =
      extractPrice(value);

    if (price === null) {
      return null;
    }

    const row =
      toRecord(value);

    const sideStrength =
      row
        ? readMetric(
            row,
            levelSide
          )
        : 0;

    const rawTotal =
      row
        ? Number(
            row.totalGex ??
              row.netGex ??
              row.gex ??
              0
          )
        : 0;

    const totalStrength =
      Number.isFinite(rawTotal)
        ? Math.abs(rawTotal)
        : 0;

    return {
      price,
      strength: Math.max(
        sideStrength,
        totalStrength,
        1
      ),
    };
  };

  /*
   * في الاتجاه المحايد:
   * المقاومات تمثل مستويات Gamma CALL.
   * المساند تمثل مستويات Gamma PUT.
   */
  const neutralCallLevels = [
    structure.nearestResistance,
    structure.strongestResistance,
    root.nearestResistance,
    root.strongestResistance,
  ]
    .map((value) =>
      candidateToLevel(
        value,
        "CALL"
      )
    )
    .filter(
      (
        value
      ): value is GammaLevel =>
        value !== null
    );

  const neutralPutLevels = [
    structure.nearestSupport,
    structure.strongestSupport,
    root.nearestSupport,
    root.strongestSupport,
  ]
    .map((value) =>
      candidateToLevel(
        value,
        "PUT"
      )
    )
    .filter(
      (
        value
      ): value is GammaLevel =>
        value !== null
    );

  const sortLevels = (
    values: GammaLevel[]
  ) =>
    uniqueGammaLevels(values)
      .sort((left, right) => {
        const leftDistance =
          Math.abs(
            left.price -
              currentPrice
          );

        const rightDistance =
          Math.abs(
            right.price -
              currentPrice
          );

        if (
          Math.abs(
            leftDistance -
              rightDistance
          ) > 0.01
        ) {
          return (
            leftDistance -
            rightDistance
          );
        }

        return (
          right.strength -
          left.strength
        );
      })
      .slice(0, 4);

  return {
    callWall,
    putWall,
    support,
    resistance,
    magnet,
    gammaFlip,
    zeroGamma,

    callLevels:
      sortLevels(callLevels),

    putLevels:
      sortLevels(putLevels),

    neutralCallLevels:
      sortLevels(
        neutralCallLevels
      ),

    neutralPutLevels:
      sortLevels(
        neutralPutLevels
      ),
  };
}

type PatternDirection =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL";

type PatternStatus =
  | "COMPLETE"
  | "FORMING";

type PatternCategory =
  | "CLASSIC"
  | "CANDLESTICK";

type PatternPoint = {
  price:
    number | null;
  time:
    string | null;
};

type DetectedPattern = {
  id: string;
  name: string;
  label: string;
  category:
    PatternCategory;
  direction:
    PatternDirection;
  status:
    PatternStatus;
  explanation: string;
  confirmation: string;
  invalidation: string;
  detectedAt:
    string | null;
  entry:
    number | null;
  target1:
    number | null;
  target2:
    number | null;
  stopLoss:
    number | null;
  startPrice:
    number | null;
  endPrice:
    number | null;

  startTime:
    string | null;
  endTime:
    string | null;

  points: {
    a: PatternPoint;
    b: PatternPoint;
    c: PatternPoint;
    d: PatternPoint;
    e: PatternPoint;
  };
};

type PatternsResponse = {
  ok: boolean;
  symbol: string;
  requestedInterval: number;
  effectiveInterval: number;
  resolution: string;
  fallback: boolean;
  fallbackMessage:
    string | null;
  classicPatterns:
    DetectedPattern[];
  candlestickPatterns:
    DetectedPattern[];
  counts: {
    classic: number;
    candlestick: number;
    complete: number;
    forming: number;
  };
  updatedAt: string;
  cached: boolean;
  error?: string;
};

type PatternChartCandle =
  ChartCandle & {
    color?: string;
    borderColor?: string;
    wickColor?: string;
  };

function isoTimeToSeconds(
  value:
    string | null
) {
  if (!value) {
    return null;
  }

  const milliseconds =
    new Date(value).getTime();

  if (
    !Number.isFinite(
      milliseconds
    )
  ) {
    return null;
  }

  return Math.floor(
    milliseconds / 1000
  );
}

/*
 * تلوين شموع نماذج الشموع فقط.
 *
 * لا نلوّن النماذج الكلاسيكية هنا؛
 * لأنها ستُرسم لاحقًا بخطوط وحدود مستقلة.
 */
function highlightCandlestickPatternCandles(
  candles:
    ChartCandle[],
  patternsData:
    PatternsResponse | null,
  enabled:
    boolean,
  fallbackIntervalMinutes:
    number
): PatternChartCandle[] {
  if (
    !enabled ||
    !patternsData ||
    candles.length === 0
  ) {
    return candles.map(
      (candle) => ({
        ...candle,
      })
    );
  }

  const highlightedTimes =
    new Set<number>();

  const fallbackSeconds =
    Math.max(
      60,
      fallbackIntervalMinutes *
        60
    );

  /*
   * نعتمد نماذج Finnhub مباشرة.
   * استجابة API مرتبة من الأحدث للأقدم،
   * لذلك نلوّن أحدث نموذج فقط.
   */
  const latestFinnhubPatterns =
    patternsData
      .candlestickPatterns
      .slice(0, 1);

  for (
    const pattern of
      latestFinnhubPatterns
  ) {
    let start =
      isoTimeToSeconds(
        pattern.startTime
      );

    let end =
      isoTimeToSeconds(
        pattern.endTime
      );

    const detected =
      isoTimeToSeconds(
        pattern.detectedAt
      );

    if (
      start === null &&
      detected !== null
    ) {
      /*
       * عند غياب بداية النموذج نلوّن
       * شمعة الاكتشاف فقط، ولا نرجع
       * تلقائيًا إلى شمعة أقدم.
       */
      start = detected;
    }

    if (
      end === null &&
      detected !== null
    ) {
      end = detected;
    }

    if (
      start === null ||
      end === null
    ) {
      continue;
    }

    /*
     * نحول أوقات المزود إلى بداية شمعة
     * الفريم نفسها؛ وبذلك لا نلوّن شمعة
     * أقدم أو أحدث بالخطأ.
     */
    const rangeStart =
      Math.floor(
        Math.min(
          start,
          end
        ) /
          fallbackSeconds
      ) *
      fallbackSeconds;

    const rangeEnd =
      Math.floor(
        Math.max(
          start,
          end
        ) /
          fallbackSeconds
      ) *
      fallbackSeconds;

    for (
      const candle of candles
    ) {
      const candleTime =
        Number(candle.time);

      if (
        candleTime >=
          rangeStart &&
        candleTime <=
          rangeEnd
      ) {
        highlightedTimes.add(
          candleTime
        );
      }
    }
  }

  return candles.map(
    (candle) => {
      if (
        !highlightedTimes.has(
          Number(candle.time)
        )
      ) {
        return {
          ...candle,
        };
      }

      return {
        ...candle,

        /*
         * لون ذهبي واضح للنموذج المكتشف.
         */
        color:
          "#facc15",
        borderColor:
          "#fde047",
        wickColor:
          "#fef08a",
      };
    }
  );
}

function nearestChartCandleTime(
  timestamp:
    number,
  candles:
    ChartCandle[],
  toleranceSeconds:
    number
): UTCTimestamp | null {
  let nearest:
    ChartCandle | null = null;

  let nearestDistance =
    Number.POSITIVE_INFINITY;

  for (
    const candle of candles
  ) {
    const distance =
      Math.abs(
        Number(candle.time) -
          timestamp
      );

    if (
      distance <
      nearestDistance
    ) {
      nearest = candle;
      nearestDistance =
        distance;
    }
  }

  if (
    !nearest ||
    nearestDistance >
      toleranceSeconds
  ) {
    return null;
  }

  return nearest.time;
}

const CLASSIC_PATTERNS_STORAGE_KEY =
  "st_market_show_classic_patterns";

const CANDLE_PATTERNS_STORAGE_KEY =
  "st_market_show_candle_patterns";

function patternDirectionLabel(
  direction:
    PatternDirection
) {
  if (
    direction === "BULLISH"
  ) {
    return "صاعد محتمل";
  }

  if (
    direction === "BEARISH"
  ) {
    return "هابط محتمل";
  }

  return "محايد";
}

function patternDirectionClasses(
  direction:
    PatternDirection
) {
  if (
    direction === "BULLISH"
  ) {
    return "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300";
  }

  if (
    direction === "BEARISH"
  ) {
    return "border-rose-400/25 bg-rose-400/[0.08] text-rose-300";
  }

  return "border-amber-400/25 bg-amber-400/[0.08] text-amber-300";
}

type PatternLifecycleStatus =
  | "WAITING"
  | "ACTIVE"
  | "TARGET_1"
  | "TARGET_2"
  | "FAILED";

function patternLifecycleLabel(
  status:
    PatternLifecycleStatus
) {
  if (
    status === "ACTIVE"
  ) {
    return "تم تفعيل النموذج";
  }

  if (
    status === "TARGET_1"
  ) {
    return "تم تحقيق الهدف الأول";
  }

  if (
    status === "TARGET_2"
  ) {
    return "تم تحقيق جميع الأهداف";
  }

  if (
    status === "FAILED"
  ) {
    return "فشل النموذج";
  }

  return "بانتظار الاختراق";
}

function patternLifecycleClasses(
  status:
    PatternLifecycleStatus
) {
  if (
    status === "ACTIVE"
  ) {
    return "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300";
  }

  if (
    status === "TARGET_1"
  ) {
    return "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300";
  }

  if (
    status === "TARGET_2"
  ) {
    return "border-green-300/30 bg-green-300/[0.1] text-green-200";
  }

  if (
    status === "FAILED"
  ) {
    return "border-rose-400/30 bg-rose-400/[0.1] text-rose-300";
  }

  return "border-amber-400/25 bg-amber-400/[0.08] text-amber-300";
}

/*
 * حساب دورة حياة النموذج من الشموع الفعلية.
 *
 * التفعيل يعتمد على إغلاق شمعة بعد
 * مستوى الدخول، وليس مجرد لمس لحظي.
 *
 * لا نعتبر ضرب الإلغاء فشلًا إلا بعد
 * تفعيل النموذج.
 */
function derivePatternLifecycle(
  pattern:
    DetectedPattern,
  candles:
    ChartCandle[]
): PatternLifecycleStatus {
  const entry =
    pattern.entry;

  if (
    entry === null ||
    !Number.isFinite(
      entry
    ) ||
    entry <= 0
  ) {
    return "WAITING";
  }

  const patternEnd =
    isoTimeToSeconds(
      pattern.endTime ||
      pattern.detectedAt
    );

  const relevantCandles =
    candles.filter(
      (candle) =>
        patternEnd === null ||
        Number(candle.time) >=
          patternEnd
    );

  if (
    relevantCandles.length === 0
  ) {
    return "WAITING";
  }

  let activated = false;
  let target1Reached = false;
  let target2Reached = false;

  for (
    const candle of
      relevantCandles
  ) {
    /*
     * لا يبدأ تتبع الهدف أو الفشل
     * إلا بعد إغلاق شمعة عبر الدخول.
     */
    if (!activated) {
      if (
        pattern.direction ===
          "BULLISH" &&
        candle.close >= entry
      ) {
        activated = true;
      } else if (
        pattern.direction ===
          "BEARISH" &&
        candle.close <= entry
      ) {
        activated = true;
      } else if (
        pattern.direction ===
          "NEUTRAL" &&
        (
          candle.high >= entry ||
          candle.low <= entry
        )
      ) {
        activated = true;
      }

      if (!activated) {
        continue;
      }
    }

    const target1Hit =
      pattern.target1 !== null &&
      (
        pattern.direction ===
          "BEARISH"
          ? candle.low <=
            pattern.target1
          : candle.high >=
            pattern.target1
      );

    const target2Hit =
      pattern.target2 !== null &&
      (
        pattern.direction ===
          "BEARISH"
          ? candle.low <=
            pattern.target2
          : candle.high >=
            pattern.target2
      );

    const stopHit =
      pattern.stopLoss !== null &&
      (
        pattern.direction ===
          "BEARISH"
          ? candle.high >=
            pattern.stopLoss
          : candle.low <=
            pattern.stopLoss
      );

    /*
     * إذا لامست الشمعة الوقف والهدف
     * في الشمعة نفسها ولا نعرف الترتيب
     * اللحظي، نعتمد النتيجة المحافظة:
     * الفشل ما لم يكن هدف سابق قد تحقق.
     */
    if (
      stopHit &&
      !target1Reached &&
      !target2Reached &&
      !target1Hit &&
      !target2Hit
    ) {
      return "FAILED";
    }

    if (target2Hit) {
      target2Reached = true;
      target1Reached = true;
    } else if (target1Hit) {
      target1Reached = true;
    }

    /*
     * إذا تحقق هدف سابق ثم عاد السعر
     * إلى الإلغاء، نحافظ على إنجاز الهدف
     * بدل تحويل النتيجة إلى فشل كامل.
     */
    if (
      stopHit &&
      !target1Reached &&
      !target2Reached
    ) {
      return "FAILED";
    }
  }

  if (target2Reached) {
    return "TARGET_2";
  }

  if (target1Reached) {
    return "TARGET_1";
  }

  if (activated) {
    return "ACTIVE";
  }

  return "WAITING";
}

function formatPatternTime(
  value:
    string | null
) {
  if (!value) {
    return "وقت غير معروف";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "وقت غير معروف";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }
  ).format(date);
}

function priceFormat(
  value: number
) {
  return Number(value || 0).toFixed(2);
}

function PatternEducationCard({
  pattern,
  lifecycleStatus,
}: {
  pattern:
    DetectedPattern;
  lifecycleStatus:
    PatternLifecycleStatus;
}) {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={[
            "rounded-xl border px-3 py-1.5 text-xs font-black",
            patternDirectionClasses(
              pattern.direction
            ),
          ].join(" ")}
        >
          {patternDirectionLabel(
            pattern.direction
          )}
        </span>

        <span
          className={[
            "rounded-xl border px-3 py-1.5 text-xs font-black",
            patternLifecycleClasses(
              lifecycleStatus
            ),
          ].join(" ")}
        >
          {patternLifecycleLabel(
            lifecycleStatus
          )}
        </span>

        <span className="mr-auto text-xs text-slate-600">
          {formatPatternTime(
            pattern.detectedAt
          )}
        </span>
      </div>

      <h5 className="mt-4 text-lg font-black text-white">
        {pattern.label}
      </h5>

      <div className="mt-4 space-y-3 text-sm leading-7">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <p className="text-xs font-black text-violet-300">
            ماذا يعني؟
          </p>

          <p className="mt-1 text-slate-300">
            {pattern.explanation}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
          <p className="text-xs font-black text-emerald-300">
            كيف يتأكد؟
          </p>

          <p className="mt-1 text-slate-300">
            {pattern.confirmation}
          </p>
        </div>

        <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.04] p-3">
          <p className="text-xs font-black text-rose-300">
            متى يُلغى؟
          </p>

          <p className="mt-1 text-slate-300">
            {pattern.invalidation}
          </p>
        </div>
      </div>

      {pattern.entry ||
      pattern.target1 ||
      pattern.target2 ||
      pattern.stopLoss ? (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {pattern.entry ? (
            <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/[0.04] p-3">
              <p className="text-slate-500">
                دخول
              </p>

              <p className="mt-1 font-black text-cyan-300">
                $
                {priceFormat(
                  pattern.entry
                )}
              </p>
            </div>
          ) : null}

          {pattern.target1 ? (
            <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
              <p className="text-slate-500">
                الهدف 1
              </p>

              <p className="mt-1 font-black text-emerald-300">
                $
                {priceFormat(
                  pattern.target1
                )}
              </p>
            </div>
          ) : null}

          {pattern.target2 ? (
            <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
              <p className="text-slate-500">
                الهدف 2
              </p>

              <p className="mt-1 font-black text-emerald-300">
                $
                {priceFormat(
                  pattern.target2
                )}
              </p>
            </div>
          ) : null}

          {pattern.stopLoss ? (
            <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.04] p-3">
              <p className="text-slate-500">
                إلغاء النموذج
              </p>

              <p className="mt-1 font-black text-rose-300">
                $
                {priceFormat(
                  pattern.stopLoss
                )}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function StockSmartChart({
  symbol,
  currentPrice,
  entry,
  stop,
  targets,
  side,
  gammaData,
}: StockSmartChartProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const chartRef =
    useRef<IChartApi | null>(null);

  /*
   * يتحكم في عرض وتباعد الشموع أفقيًا.
   * القيمة الأكبر تعني شموعًا أعرض.
   */
  const candleBarSpacingRef =
    useRef(8);

  /*
   * نستخدم هذه المراجع حتى نحافظ على
   * تكبير الشموع وموضع الشارت عند تغيير الفريم،
   * بينما يبدأ رمز الشركة الجديد بعرض طبيعي.
   */
  const hasLoadedCandlesRef =
    useRef(false);

  const lastLoadedSymbolRef =
    useRef<string | null>(null);

  function setCandleBarSpacing(
    nextSpacing: number
  ) {
    const chart =
      chartRef.current;

    if (!chart) {
      return;
    }

    const spacing = Math.min(
      40,
      Math.max(
        2,
        nextSpacing
      )
    );

    candleBarSpacingRef.current =
      spacing;

    chart
      .timeScale()
      .applyOptions({
        barSpacing: spacing,
      });
  }

  function zoomCandlesIn() {
    setCandleBarSpacing(
      candleBarSpacingRef.current *
        1.2
    );
  }

  function zoomCandlesOut() {
    setCandleBarSpacing(
      candleBarSpacingRef.current /
        1.2
    );
  }

  function moveChartLeft() {
    const chart =
      chartRef.current;

    if (!chart) {
      return;
    }

    const timeScale =
      chart.timeScale();

    timeScale.scrollToPosition(
      timeScale.scrollPosition() + 5,
      false
    );
  }

  function moveChartRight() {
    const chart =
      chartRef.current;

    if (!chart) {
      return;
    }

    const timeScale =
      chart.timeScale();

    timeScale.scrollToPosition(
      timeScale.scrollPosition() - 5,
      false
    );
  }

  const seriesRef =
    useRef<
      ISeriesApi<"Candlestick"> | null
    >(
      null
    );

  /*
   * نحتفظ بنسخة الشموع الأصلية حتى نستطيع
   * إضافة أو إزالة تلوين النماذج دون
   * إعادة طلب بيانات الشموع.
   */
  const chartCandlesRef =
    useRef<
      ChartCandle[]
    >([]);

  /*
   * سلاسل مستقلة لرسم أحدث نموذج
   * كلاسيكي على الشارت.
   */
  const classicPatternSeriesRef =
    useRef<
      ISeriesApi<"Line">[]
    >([]);

  const [
    isExpanded,
    setIsExpanded,
  ] = useState(false);

  /*
   * نحفظ موضع الصفحة قبل فتح الشارت
   * حتى لا يعود المستخدم إلى أعلى الصفحة
   * عند إغلاق وضع التكبير.
   */
  const expandedScrollYRef =
    useRef(0);

  function openExpandedChart() {
    expandedScrollYRef.current =
      window.scrollY;

    setIsExpanded(true);
  }

  function closeExpandedChart() {
    setIsExpanded(false);

    window.requestAnimationFrame(
      () => {
        window.scrollTo({
          top:
            expandedScrollYRef.current,
          left: 0,
          behavior: "auto",
        });
      }
    );
  }

  function toggleExpandedChart() {
    if (isExpanded) {
      closeExpandedChart();
      return;
    }

    openExpandedChart();
  }

  const [
    isPriceScaleManual,
    setIsPriceScaleManual,
  ] = useState(false);

  const [
    clockNow,
    setClockNow,
  ] = useState(
    () => Date.now()
  );

  const [
    candlesLoading,
    setCandlesLoading,
  ] = useState(true);

  const [
    candlesError,
    setCandlesError,
  ] = useState("");

  /*
   * refs لا تسبب إعادة تشغيل Effects.
   * لذلك نستخدم هذا العداد لإعادة رسم
   * النماذج بعد اكتمال تحميل الشموع.
   */
  const [
    chartCandlesVersion,
    setChartCandlesVersion,
  ] = useState(0);

  const [
    showClassicPatterns,
    setShowClassicPatterns,
  ] = useState(true);

  const [
    showCandlePatterns,
    setShowCandlePatterns,
  ] = useState(true);

  /*
   * فتح وإغلاق محتوى بطاقات النماذج.
   * هذه الحالات لا توقف اكتشاف النماذج،
   * بل تتحكم فقط في المساحة المعروضة للمستخدم.
   */
  const [
    classicPatternsPanelOpen,
    setClassicPatternsPanelOpen,
  ] = useState(false);

  const [
    candlePatternsPanelOpen,
    setCandlePatternsPanelOpen,
  ] = useState(false);

  const [
    patternPreferencesLoaded,
    setPatternPreferencesLoaded,
  ] = useState(false);

  const [
    patternInterval,
    setPatternInterval,
  ] = useState<
    15 | 30 | 60 | 1440
  >(30);

  const [
    patternsData,
    setPatternsData,
  ] =
    useState<PatternsResponse | null>(
      null
    );

  const [
    patternsLoading,
    setPatternsLoading,
  ] = useState(false);

  const [
    patternsError,
    setPatternsError,
  ] = useState("");

  const [
    interval,
    setIntervalValue,
  ] = useState<
    5 | 15 | 30 | 60 | 240 | 1440
  >(15);

  useEffect(() => {
    intervalRef.current =
      interval;
  }, [interval]);

  useEffect(() => {
    try {
      const classicStored =
        window.localStorage.getItem(
          CLASSIC_PATTERNS_STORAGE_KEY
        );

      const candleStored =
        window.localStorage.getItem(
          CANDLE_PATTERNS_STORAGE_KEY
        );

      if (
        classicStored === "false"
      ) {
        setShowClassicPatterns(
          false
        );
      }

      if (
        candleStored === "false"
      ) {
        setShowCandlePatterns(
          false
        );
      }
    } catch {
      /*
       * يبقى العرض مفعّلًا افتراضيًا.
       */
    } finally {
      setPatternPreferencesLoaded(
        true
      );
    }
  }, []);

  useEffect(() => {
    if (
      !patternPreferencesLoaded
    ) {
      return;
    }

    try {
      window.localStorage.setItem(
        CLASSIC_PATTERNS_STORAGE_KEY,
        String(
          showClassicPatterns
        )
      );

      window.localStorage.setItem(
        CANDLE_PATTERNS_STORAGE_KEY,
        String(
          showCandlePatterns
        )
      );
    } catch {
      /*
       * فشل حفظ الاختيار لا يمنع العرض.
       */
    }
  }, [
    showClassicPatterns,
    showCandlePatterns,
    patternPreferencesLoaded,
  ]);

  useEffect(() => {
    if (
      !patternPreferencesLoaded ||
      (
        !showClassicPatterns &&
        !showCandlePatterns
      )
    ) {
      setPatternsLoading(
        false
      );
      setPatternsError("");
      setPatternsData(null);
      return;
    }

    let cancelled = false;

    async function loadPatterns() {
      setPatternsLoading(
        true
      );
      setPatternsError("");

      try {
        const response =
          await fetch(
            `/api/stocks/${encodeURIComponent(
              symbol
            )}/patterns?interval=${patternInterval}`,
            {
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as
            PatternsResponse;

        if (
          !response.ok ||
          result.ok === false
        ) {
          throw new Error(
            result.error ||
              "تعذر تحميل النماذج."
          );
        }

        if (cancelled) {
          return;
        }

        setPatternsData(
          result
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPatternsData(null);

        setPatternsError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل النماذج."
        );
      } finally {
        if (!cancelled) {
          setPatternsLoading(
            false
          );
        }
      }
    }

    void loadPatterns();

    const timer =
      window.setInterval(
        () => {
          void loadPatterns();
        },
        60_000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        timer
      );
    };
  }, [
    symbol,
    patternInterval,
    showClassicPatterns,
    showCandlePatterns,
    patternPreferencesLoaded,
  ]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setClockNow(
            Date.now()
          );
        },
        1_000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        setIsExpanded(false);

        window.requestAnimationFrame(
          () => {
            window.scrollTo({
              top:
                expandedScrollYRef.current,
              left: 0,
              behavior: "auto",
            });
          }
        );

        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        zoomCandlesIn();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        zoomCandlesOut();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveChartLeft();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveChartRight();
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [isExpanded]);

  const {
    price: livePrice,
    quote: liveQuote,
  } =
    useLiveStockPrice(symbol);

  const effectiveCurrentPrice =
    livePrice ??
    currentPrice;

  const [
    rawTechnicalLevels,
    setRawTechnicalLevels,
  ] =
    useState<number[]>([]);

  const [
    supportResistanceRefresh,
    setSupportResistanceRefresh,
  ] = useState(0);

  const priceLinesRef =
    useRef<IPriceLine[]>([]);

  const lastCandleRef =
    useRef<ChartCandle | null>(
      null
    );

  const intervalRef =
    useRef<
      5 | 15 | 30 | 60 | 240 | 1440
    >(15);

  const gammaLabelsLayerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  useEffect(() => {
    let cancelled = false;

    /*
     * الدعم والمقاومة يُطلبان من
     * نفس فريم الشارت، بما في ذلك 4H.
     */
    async function loadSupportResistance() {
      try {
        const response =
          await fetch(
            `/api/stocks/${encodeURIComponent(
              symbol
            )}/support-resistance?interval=${encodeURIComponent(
              interval
            )}`,
            {
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as {
            levels?: unknown[];
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            result.error ||
              "تعذر جلب الدعم والمقاومة"
          );
        }

        if (cancelled) {
          return;
        }

        const levels =
          Array.isArray(
            result.levels
          )
            ? result.levels
                .map(Number)
                .filter(
                  (level) =>
                    Number.isFinite(
                      level
                    ) &&
                    level > 0
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    first -
                    second
                )
            : [];

        setRawTechnicalLevels(
          levels
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Failed to load support/resistance:",
            error
          );

          setRawTechnicalLevels(
            []
          );
        }
      }
    }

    void loadSupportResistance();

    const refreshTimer =
      window.setInterval(
        () => {
          void loadSupportResistance();
        },
        5 * 60_000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        refreshTimer
      );
    };
  }, [
    symbol,
    interval,
    supportResistanceRefresh,
  ]);

  const technicalLevels =
    useMemo<TechnicalLevels>(
      () => {
        const supports =
          rawTechnicalLevels
            .filter(
              (level) =>
                level <
                effectiveCurrentPrice
            )
            .sort(
              (
                first,
                second
              ) =>
                second -
                first
            )
            .slice(0, 2);

        const resistances =
          rawTechnicalLevels
            .filter(
              (level) =>
                level >
                effectiveCurrentPrice
            )
            .sort(
              (
                first,
                second
              ) =>
                first -
                second
            )
            .slice(0, 2);

        return {
          support: supports,
          resistance:
            resistances,
        };
      },
      [
        rawTechnicalLevels,
        effectiveCurrentPrice,
      ]
    );

  useEffect(() => {
    if (
      rawTechnicalLevels.length ===
      0
    ) {
      return;
    }

    if (
      technicalLevels.support
        .length < 2 ||
      technicalLevels.resistance
        .length < 2
    ) {
      const timer =
        window.setTimeout(
          () => {
            setSupportResistanceRefresh(
              (value) =>
                value + 1
            );
          },
          10_000
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    }
  }, [
    rawTechnicalLevels,
    technicalLevels,
  ]);

  const levels = useMemo(() => {
    const result: ChartLevel[] = [];

    const gamma =
      extractGammaView(
        gammaData,
        currentPrice
      );

    const addLevel = (
      key: string,
      title: string,
      rawPrice: unknown,
      color: string,
      lineStyle:
        LineStyle = LineStyle.Solid,
      lineWidth:
        | 1
        | 2
        | 3
        | 4 = 1,
      axisLabelVisible = true
    ) => {
      const price =
        extractPrice(rawPrice);

      if (price === null) {
        return;
      }

      const incomingIsWall =
        key === "call-wall" ||
        key === "put-wall";

      const existing =
        result.find(
          (level) =>
            Math.abs(
              level.price -
                price
            ) < 0.01
        );

      if (existing) {
        const existingIsWall =
          existing.key.includes(
            "wall"
          ) ||
          existing.color ===
            "#fbbf24";

        /*
         * إذا اجتمع جدار CALL وPUT
         * على السعر نفسه، يظهران كجدار
         * ذهبي واحد باسم واضح.
         */
        if (incomingIsWall) {
          const hasCall =
            existing.key.includes(
              "call-wall"
            ) ||
            key === "call-wall";

          const hasPut =
            existing.key.includes(
              "put-wall"
            ) ||
            key === "put-wall";

          existing.key =
            `${existing.key}+${key}`;

          existing.title =
            hasCall && hasPut
              ? "مغناطيس القاما"
              : hasCall
                ? "جدار قاما الكول"
                : "جدار قاما البوت";

          existing.color =
            "#fbbf24";

          existing.lineWidth = 3;

          existing.lineStyle =
            LineStyle.Solid;

          existing.axisLabelVisible =
            true;

          return;
        }

        /*
         * لا نضيف Gamma CALL أو PUT
         * إلى اسم الجدار الذهبي.
         */
        if (existingIsWall) {
          return;
        }

        if (
          !existing.title.includes(
            title
          )
        ) {
          existing.title =
            `${existing.title} / ${title}`;
        }

        return;
      }

      result.push({
        key,
        title,
        price,
        color,
        lineStyle,
        lineWidth,
        axisLabelVisible,
      });
    };

    /*
     * لا توجد صفقة عند الحياد.
     */
    if (side !== "NEUTRAL") {
      addLevel(
        "entry",
        "الدخول",
        entry,
        "#22d3ee",
        LineStyle.Solid,
        2
      );

      addLevel(
        "stop",
        "الوقف",
        stop,
        "#fb7185",
        LineStyle.Solid,
        2
      );

      targets.forEach(
        (
          target,
          targetIndex
        ) => {
          addLevel(
            `target-${target.index}`,
            `الهدف ${
              targetIndex + 1
            }`,
            target.price,
            "#34d399",
            LineStyle.Dashed,
            1
          );
        }
      );
    }

    /*
     * جدارا القاما يظهران بالذهبي
     * في CALL وPUT وNEUTRAL.
     */
    addLevel(
      "call-wall",
      "جدار قاما الكول",
      gamma.callWall,
      "#fbbf24",
      LineStyle.Solid,
      3,
      true
    );

    addLevel(
      "put-wall",
      "جدار قاما البوت",
      gamma.putWall,
      "#fbbf24",
      LineStyle.Solid,
      3,
      true
    );

    if (side === "NEUTRAL") {
      /*
       * عند الاتجاه المحايد:
       * CALL سماوي وPUT وردي.
       */
      gamma.neutralCallLevels.forEach(
        (level, index) => {
          addLevel(
            `neutral-call-${index}`,
            "Gamma CALL",
            level.price,
            "#22d3ee",
            LineStyle.Dashed,
            2,
            true
          );
        }
      );

      gamma.neutralPutLevels.forEach(
        (level, index) => {
          addLevel(
            `neutral-put-${index}`,
            "Gamma PUT",
            level.price,
            "#fb7185",
            LineStyle.Dashed,
            2,
            true
          );
        }
      );
    } else {
      addLevel(
        "gamma-support",
        "دعم Gamma",
        gamma.support,
        "#a78bfa",
        LineStyle.Dashed,
        2,
        true
      );

      addLevel(
        "gamma-resistance",
        "مقاومة Gamma",
        gamma.resistance,
        "#f59e0b",
        LineStyle.Dashed,
        2,
        true
      );

      addLevel(
        "magnet",
        "مغناطيس القاما",
        gamma.magnet,
        "#facc15",
        LineStyle.Dotted,
        2,
        true
      );

      addLevel(
        "gamma-flip",
        "Gamma Flip",
        gamma.gammaFlip,
        "#c084fc",
        LineStyle.SparseDotted,
        2,
        true
      );

      addLevel(
        "zero-gamma",
        "Zero Gamma",
        gamma.zeroGamma,
        "#94a3b8",
        LineStyle.Dotted,
        1,
        true
      );
    }

    technicalLevels.support.forEach(
      (price, index) => {
        addLevel(
          `technical-support-${index + 1}`,
          `دعم ${index + 1}`,
          price,
          index === 0
            ? "#38bdf8"
            : "#7dd3fc",
          LineStyle.Dashed,
          index === 0
            ? 2
            : 1,
          true
        );
      }
    );

    technicalLevels.resistance.forEach(
      (price, index) => {
        addLevel(
          `technical-resistance-${index + 1}`,
          `مقاومة ${index + 1}`,
          price,
          index === 0
            ? "#f97316"
            : "#fdba74",
          LineStyle.Dashed,
          index === 0
            ? 2
            : 1,
          true
        );
      }
    );

    /*
     * وضع النماذج الكلاسيكية النظيف:
     *
     * عند تشغيل النماذج الكلاسيكية
     * نخفي جميع مستويات الصفقة والقاما
     * حتى لا يزدحم الشارت.
     *
     * يبقى فقط:
     * - دعم 1
     * - دعم 2
     * - مقاومة 1
     * - مقاومة 2
     */
    if (
      showClassicPatterns
    ) {
      return result.filter(
        (level) =>
          level.key ===
            "technical-support-1" ||
          level.key ===
            "technical-support-2" ||
          level.key ===
            "technical-resistance-1" ||
          level.key ===
            "technical-resistance-2"
      );
    }

    return result;
  }, [
    effectiveCurrentPrice,
    currentPrice,
    entry,
    stop,
    targets,
    side,
    gammaData,
    technicalLevels,
    showClassicPatterns,
  ]);

  const inlineGammaLevels =
    useMemo(
      () =>
        levels.filter((level) =>
          INLINE_GAMMA_LABEL_KEYS.has(
            level.key
          )
        ),
      [levels]
    );

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(
      container,
      {
        width:
          container.clientWidth,
        height: 480,
        layout: {
          background: {
            type: ColorType.Solid,
            color: "#020617",
          },
          textColor: "#94a3b8",
          fontFamily:
            "Arial, sans-serif",
        },
        grid: {
          vertLines: {
            color:
              "rgba(148, 163, 184, 0.08)",
          },
          horzLines: {
            color:
              "rgba(148, 163, 184, 0.08)",
          },
        },
        crosshair: {
          mode:
            CrosshairMode.Normal,
        },

        handleScroll: {
          /*
           * التحكم بعجلة الماوس تتم
           * معالجته يدويًا أسفل هذا Effect.
           */
          mouseWheel: false,
          pressedMouseMove: true,
          horzTouchDrag: true,

          /*
            داخل الشارت يسمح بتحريك
            النطاق السعري للأعلى والأسفل.
          */
          vertTouchDrag: true,
        },

        handleScale: {
          axisPressedMouseMove: {
            time: true,
            price: true,
          },

          /*
           * عجلة الماوس لها معالجة مخصصة
           * حتى تكبر وتصغر عرض الشموع فقط.
           */
          mouseWheel: false,
          pinch: true,
        },

        kineticScroll: {
          mouse: true,
          touch: true,
        },

        rightPriceScale: {
          visible: true,
          borderVisible: true,
          borderColor:
            "rgba(148, 163, 184, 0.28)",

          autoScale: true,

          /*
            فراغ أعلى وأسفل حتى لا تلتصق
            الشموع والمستويات بالحواف.
          */
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },

          /*
            إبقاء علامات السعر ظاهرة
            بوضوح عند أطراف المقياس.
          */
          ensureEdgeTickMarksVisible:
            true,
        },
        timeScale: {
          borderColor:
            "rgba(148, 163, 184, 0.18)",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: 8,
        },
        localization: {
          locale: "en-US",
          priceFormatter:
            priceFormat,
        },
      }
    );

    const series =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor:
            "#22c55e",
          borderDownColor:
            "#ef4444",
          wickUpColor:
            "#22c55e",
          wickDownColor:
            "#ef4444",
          priceLineVisible: false,
          lastValueVisible: true,
        }
      );

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver =
      new ResizeObserver(() => {
        chart.applyOptions({
          width:
            container.clientWidth,
          height:
            container.clientHeight,
        });
      });

    resizeObserver.observe(
      container
    );

    function markPriceScaleManual() {
      setIsPriceScaleManual(
        true
      );
    }

    /*
      أي سحب أو لمس داخل منطقة
      مقياس السعر يعتبر تحكمًا يدويًا.
    */
    container.addEventListener(
      "pointerdown",
      markPriceScaleManual
    );

    function handleCandleWheel(
      event: WheelEvent
    ) {
      /*
       * منع تمرير الصفحة أثناء وجود
       * المؤشر داخل الشارت.
       */
      event.preventDefault();
      event.stopPropagation();

      const multiplier =
        event.deltaY < 0
          ? 1.12
          : 1 / 1.12;

      setCandleBarSpacing(
        candleBarSpacingRef.current *
          multiplier
      );
    }

    container.addEventListener(
      "wheel",
      handleCandleWheel,
      {
        passive: false,
      }
    );

    return () => {
      container.removeEventListener(
        "pointerdown",
        markPriceScaleManual
      );

      container.removeEventListener(
        "wheel",
        handleCandleWheel
      );
      resizeObserver.disconnect();

      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
      lastCandleRef.current = null;
      chartCandlesRef.current = [];
      classicPatternSeriesRef.current = [];
      priceLinesRef.current = [];
      hasLoadedCandlesRef.current = false;
      lastLoadedSymbolRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart =
      chartRef.current;

    const series =
      seriesRef.current;

    if (!chart || !series) {
      return;
    }

    const candleSeries = series;
    const activeChart = chart;

    let cancelled = false;

    async function loadCandles() {
      setCandlesLoading(true);
      setCandlesError("");

      /*
       * عند تغيير الفريم لنفس الرمز نحفظ
       * موضع الشارت الحالي قبل استبدال البيانات.
       */
      const timeScale =
        activeChart.timeScale();

      const shouldPreserveView =
        hasLoadedCandlesRef.current &&
        lastLoadedSymbolRef.current ===
          symbol;

      const previousScrollPosition =
        shouldPreserveView
          ? timeScale.scrollPosition()
          : 0;

      try {
        const response =
          await fetch(
            `/api/stocks/${encodeURIComponent(
              symbol
            )}/candles?interval=${interval}`,
            {
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as {
            candles?: Array<{
              time: number;
              open: number;
              high: number;
              low: number;
              close: number;
              volume: number;
            }>;
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            result.error ||
              "تعذر جلب الشموع"
          );
        }

        const candles =
          Array.isArray(
            result.candles
          )
            ? result.candles
            : [];

        if (cancelled) {
          return;
        }

        const chartCandles =
          candles.map(
            (candle) => ({
              time:
                candle.time as UTCTimestamp,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            })
          );

        chartCandlesRef.current =
          chartCandles;

        /*
         * إجبار Effects الخاصة برسومات
         * النماذج على العمل بعد وصول الشموع.
         */
        setChartCandlesVersion(
          (current) =>
            current + 1
        );

        candleSeries.setData(
          highlightCandlestickPatternCandles(
            chartCandles,
            patternsData,
            showCandlePatterns,
            patternInterval
          )
        );

        lastCandleRef.current =
          chartCandles.length > 0
            ? chartCandles[
                chartCandles.length - 1
              ]
            : null;

        if (
          shouldPreserveView
        ) {
          /*
           * إعادة نفس عرض الشموع ونفس
           * المسافة من آخر شمعة بعد تغيير الفريم.
           */
          timeScale.applyOptions({
            barSpacing:
              candleBarSpacingRef.current,
          });

          timeScale.scrollToPosition(
            previousScrollPosition,
            false
          );
        } else {
          /*
           * أول تحميل أو الانتقال إلى رمز
           * جديد يبدأ بعرض جميع البيانات.
           */
          timeScale.fitContent();
        }

        hasLoadedCandlesRef.current =
          true;

        lastLoadedSymbolRef.current =
          symbol;
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCandlesError(
          error instanceof Error
            ? error.message
            : "تعذر جلب الشموع"
        );
      } finally {
        if (!cancelled) {
          setCandlesLoading(false);
        }
      }
    }

    void loadCandles();

    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  /*
   * رسم أحدث نموذج كلاسيكي على الشارت
   * باستخدام نقاط A / B / C / D / E
   * القادمة من مزود بيانات النماذج.
   */
  useEffect(() => {
    const chart =
      chartRef.current;

    if (!chart) {
      return;
    }

    /*
     * حذف أي رسم قديم قبل إنشاء
     * الرسم الجديد أو عند الإخفاء.
     */
    for (
      const existingSeries of
        classicPatternSeriesRef.current
    ) {
      try {
        chart.removeSeries(
          existingSeries
        );
      } catch {
        /*
         * قد تكون السلسلة أزيلت
         * أثناء إعادة إنشاء الشارت.
         */
      }
    }

    classicPatternSeriesRef.current =
      [];

    if (
      !showClassicPatterns ||
      !patternsData ||
      patternsData
        .classicPatterns
        .length === 0
    ) {
      return;
    }

    const candles =
      chartCandlesRef.current;

    if (
      candles.length === 0
    ) {
      return;
    }

    /*
     * استجابة API مرتبة من الأحدث
     * إلى الأقدم، لذلك نرسم الأول فقط.
     */
    const pattern =
      patternsData
        .classicPatterns[0];

    const toleranceSeconds =
      Math.max(
        patternInterval,
        interval
      ) *
      60 *
      2;

    const sourcePoints = [
      pattern.points.a,
      pattern.points.b,
      pattern.points.c,
      pattern.points.d,
      pattern.points.e,
    ];

    const chartPoints:
      Array<{
        time: UTCTimestamp;
        value: number;
      }> = [];

    for (
      const point of sourcePoints
    ) {
      if (
        point.price === null ||
        !Number.isFinite(
          point.price
        ) ||
        !point.time
      ) {
        continue;
      }

      const timestamp =
        isoTimeToSeconds(
          point.time
        );

      if (
        timestamp === null
      ) {
        continue;
      }

      const candleTime =
        nearestChartCandleTime(
          timestamp,
          candles,
          toleranceSeconds
        );

      if (
        candleTime === null
      ) {
        continue;
      }

      chartPoints.push({
        time: candleTime,
        value: point.price,
      });
    }

    /*
     * بعض النماذج قد لا ترجع جميع
     * نقاط A-E؛ نستخدم البداية والنهاية
     * كخيار احتياطي.
     */
    if (
      chartPoints.length < 2
    ) {
      const fallbackPoints = [
        {
          time:
            pattern.startTime,
          price:
            pattern.startPrice,
        },
        {
          time:
            pattern.endTime ||
            pattern.detectedAt,
          price:
            pattern.endPrice,
        },
      ];

      for (
        const point of
          fallbackPoints
      ) {
        if (
          point.price === null ||
          !Number.isFinite(
            point.price
          ) ||
          !point.time
        ) {
          continue;
        }

        const timestamp =
          isoTimeToSeconds(
            point.time
          );

        if (
          timestamp === null
        ) {
          continue;
        }

        const candleTime =
          nearestChartCandleTime(
            timestamp,
            candles,
            toleranceSeconds
          );

        if (
          candleTime === null
        ) {
          continue;
        }

        chartPoints.push({
          time: candleTime,
          value: point.price,
        });
      }
    }

    /*
     * ترتيب النقاط زمنيًا وحذف أي
     * وقت مكرر؛ LineSeries يشترط
     * أن تكون البيانات مرتبة.
     */
    const uniquePoints =
      Array.from(
        new Map(
          chartPoints
            .sort(
              (
                first,
                second
              ) =>
                Number(
                  first.time
                ) -
                Number(
                  second.time
                )
            )
            .map(
              (point) => [
                Number(
                  point.time
                ),
                point,
              ]
            )
        ).values()
      );

    if (
      uniquePoints.length < 2
    ) {
      return;
    }

    const patternColor =
      pattern.direction ===
      "BULLISH"
        ? "#22d3ee"
        : pattern.direction ===
            "BEARISH"
          ? "#fb7185"
          : "#facc15";

    const patternSeries =
      chart.addSeries(
        LineSeries,
        {
          color:
            patternColor,
          lineWidth: 3,
          lineStyle:
            LineStyle.Solid,
          priceLineVisible:
            false,
          lastValueVisible:
            false,
          crosshairMarkerVisible:
            true,
          crosshairMarkerRadius:
            5,
          crosshairMarkerBorderColor:
            patternColor,
          crosshairMarkerBackgroundColor:
            "#020617",
        }
      );

    patternSeries.setData(
      uniquePoints
    );

    const createdSeries:
      ISeriesApi<"Line">[] = [
        patternSeries,
      ];

    type ResolvedPatternPoint = {
      time: UTCTimestamp;
      value: number;
    };

    /*
     * تحويل نقطة النموذج الخام إلى نقطة
     * مرتبطة بأقرب شمعة فعلية على الشارت.
     */
    const resolvePatternPoint = (
      point:
        PatternPoint
    ): ResolvedPatternPoint | null => {
      if (
        point.price === null ||
        !Number.isFinite(
          point.price
        ) ||
        !point.time
      ) {
        return null;
      }

      const timestamp =
        isoTimeToSeconds(
          point.time
        );

      if (
        timestamp === null
      ) {
        return null;
      }

      const candleTime =
        nearestChartCandleTime(
          timestamp,
          candles,
          toleranceSeconds
        );

      if (
        candleTime === null
      ) {
        return null;
      }

      return {
        time:
          candleTime,
        value:
          point.price,
      };
    };

    const resolved = {
      a:
        resolvePatternPoint(
          pattern.points.a
        ),
      b:
        resolvePatternPoint(
          pattern.points.b
        ),
      c:
        resolvePatternPoint(
          pattern.points.c
        ),
      d:
        resolvePatternPoint(
          pattern.points.d
        ),
      e:
        resolvePatternPoint(
          pattern.points.e
        ),
    };

    /*
     * إضافة خط مكوّن من نقطتين أو أكثر.
     */
    const addPatternPath = (
      points:
        Array<
          ResolvedPatternPoint | null
        >,
      color:
        string,
      lineStyle:
        LineStyle,
      lineWidth:
        1 | 2 | 3 | 4
    ) => {
      const validPoints =
        points
          .filter(
            (
              point
            ): point is
              ResolvedPatternPoint =>
              point !== null
          )
          .sort(
            (
              first,
              second
            ) =>
              Number(
                first.time
              ) -
              Number(
                second.time
              )
          );

      const unique =
        Array.from(
          new Map(
            validPoints.map(
              (point) => [
                Number(
                  point.time
                ),
                point,
              ]
            )
          ).values()
        );

      if (
        unique.length < 2
      ) {
        return;
      }

      const lineSeries =
        chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth,
            lineStyle,
            priceLineVisible:
              false,
            lastValueVisible:
              false,
            crosshairMarkerVisible:
              true,
            crosshairMarkerRadius:
              4,
            crosshairMarkerBorderColor:
              color,
            crosshairMarkerBackgroundColor:
              "#020617",
          }
        );

      lineSeries.setData(
        unique
      );

      createdSeries.push(
        lineSeries
      );
    };

    /*
     * تحديد نهاية نطاق النموذج لرسم
     * خطوط العنق والاختراق والأهداف.
     */
    const firstPatternTime =
      uniquePoints[0]?.time;

    const lastPatternTime =
      uniquePoints[
        uniquePoints.length - 1
      ]?.time;

    const rawPatternEnd =
      isoTimeToSeconds(
        pattern.endTime ||
        pattern.detectedAt
      );

    const matchedPatternEnd =
      rawPatternEnd !== null
        ? nearestChartCandleTime(
            rawPatternEnd,
            candles,
            toleranceSeconds
          )
        : null;

    const patternRangeEnd =
      matchedPatternEnd ||
      lastPatternTime;

    /*
     * خط أفقي محصور داخل المدة الزمنية
     * الخاصة بالنموذج فقط.
     */
    const addPatternLevel = (
      price:
        number | null,
      color:
        string,
      lineStyle:
        LineStyle,
      lineWidth:
        1 | 2 | 3 | 4
    ) => {
      if (
        price === null ||
        !Number.isFinite(
          price
        ) ||
        price <= 0 ||
        firstPatternTime ===
          undefined ||
        patternRangeEnd ===
          undefined ||
        Number(
          patternRangeEnd
        ) <
          Number(
            firstPatternTime
          )
      ) {
        return;
      }

      const levelSeries =
        chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth,
            lineStyle,
            priceLineVisible:
              false,
            lastValueVisible:
              false,
            crosshairMarkerVisible:
              false,
          }
        );

      levelSeries.setData([
        {
          time:
            firstPatternTime,
          value:
            price,
        },
        {
          time:
            patternRangeEnd,
          value:
            price,
        },
      ]);

      createdSeries.push(
        levelSeries
      );
    };

    const name =
      pattern.name;

    const bullishColor =
      "#22d3ee";

    const bearishColor =
      "#fb7185";

    const boundaryColor =
      pattern.direction ===
      "BULLISH"
        ? bullishColor
        : pattern.direction ===
            "BEARISH"
          ? bearishColor
          : "#facc15";

    /*
     * =====================================================
     * القمة والقاع المزدوجان
     * A/C = القمتان أو القاعان
     * B = خط العنق
     * =====================================================
     */
    if (
      name === "double top" ||
      name === "double bottom"
    ) {
      addPatternPath(
        [
          resolved.a,
          resolved.b,
          resolved.c,
        ],
        boundaryColor,
        LineStyle.Solid,
        4
      );

      addPatternLevel(
        pattern.points.b.price,
        "#facc15",
        LineStyle.Dashed,
        3
      );
    }

    /*
     * =====================================================
     * الرأس والكتفان والعكسي
     * المسار الكامل للرأس والكتفين
     * وخط العنق بين B وD.
     * =====================================================
     */
    else if (
      name ===
        "head and shoulders" ||
      name ===
        "inverse head and shoulders"
    ) {
      /*
       * لا نرسم الرأس والكتفين إلا إذا
       * كانت النقاط الخمس مكتملة.
       *
       * توصيل نقاط ناقصة يعطي شكلًا
       * مضللًا وغير مطابق للنموذج.
       */
      const hasCompleteHeadShoulders =
        resolved.a !== null &&
        resolved.b !== null &&
        resolved.c !== null &&
        resolved.d !== null &&
        resolved.e !== null;

      if (
        hasCompleteHeadShoulders
      ) {
        addPatternPath(
          [
            resolved.a,
            resolved.b,
            resolved.c,
            resolved.d,
            resolved.e,
          ],
          boundaryColor,
          LineStyle.Solid,
          4
        );

        /*
         * خط العنق بين B و D.
         */
        addPatternPath(
          [
            resolved.b,
            resolved.d,
          ],
          "#facc15",
          LineStyle.Dashed,
          3
        );
      }
    }

    /*
     * =====================================================
     * المثلثات
     * نقاط A/C/E ضلع، ونقاط B/D ضلع آخر.
     * =====================================================
     */
    else if (
      name ===
        "ascending triangle" ||
      name ===
        "descending triangle" ||
      name ===
        "symmetrical triangle"
    ) {
      addPatternPath(
        [
          resolved.a,
          resolved.c,
          resolved.e,
        ],
        boundaryColor,
        LineStyle.Solid,
        3
      );

      addPatternPath(
        [
          resolved.b,
          resolved.d,
        ],
        "#facc15",
        LineStyle.Solid,
        3
      );
    }

    /*
     * =====================================================
     * الأوتاد
     * حد علوي وحد سفلي متقاربان.
     * =====================================================
     */
    else if (
      name ===
        "falling wedge" ||
      name ===
        "rising wedge"
    ) {
      addPatternPath(
        [
          resolved.a,
          resolved.c,
          resolved.e,
        ],
        boundaryColor,
        LineStyle.Solid,
        3
      );

      addPatternPath(
        [
          resolved.b,
          resolved.d,
        ],
        boundaryColor,
        LineStyle.Solid,
        3
      );
    }

    /*
     * =====================================================
     * العلم الصاعد والهابط
     * A-B تمثل السارية، وبقية النقاط
     * تمثل قناة العلم القصيرة.
     * =====================================================
     */
    else if (
      name === "bull flag" ||
      name === "bear flag"
    ) {
      addPatternPath(
        [
          resolved.a,
          resolved.b,
        ],
        boundaryColor,
        LineStyle.Solid,
        4
      );

      addPatternPath(
        [
          resolved.b,
          resolved.d,
        ],
        "#facc15",
        LineStyle.Solid,
        3
      );

      addPatternPath(
        [
          resolved.c,
          resolved.e,
        ],
        "#facc15",
        LineStyle.Solid,
        3
      );
    }

    /*
     * =====================================================
     * القنوات الصاعدة والهابطة
     * حد علوي وحد سفلي متوازيان.
     * =====================================================
     */
    else if (
      name === "channel up" ||
      name === "channel down"
    ) {
      addPatternPath(
        [
          resolved.a,
          resolved.c,
          resolved.e,
        ],
        boundaryColor,
        LineStyle.Solid,
        3
      );

      addPatternPath(
        [
          resolved.b,
          resolved.d,
        ],
        boundaryColor,
        LineStyle.Solid,
        3
      );
    }

    /*
     * أي نموذج كلاسيكي معروف مستقبلًا
     * يُرسم بحدين متعاقبين بدل تجاهله.
     */
    else {
      addPatternPath(
        [
          resolved.a,
          resolved.c,
          resolved.e,
        ],
        boundaryColor,
        LineStyle.Solid,
        3
      );

      addPatternPath(
        [
          resolved.b,
          resolved.d,
        ],
        "#facc15",
        LineStyle.Dashed,
        3
      );
    }

    /*
     * مستويات المدرسة المشتركة لكل
     * النماذج الكلاسيكية.
     */
    addPatternLevel(
      pattern.entry,
      "#22d3ee",
      LineStyle.Solid,
      2
    );

    addPatternLevel(
      pattern.target1,
      "#34d399",
      LineStyle.Dashed,
      2
    );

    addPatternLevel(
      pattern.target2,
      "#10b981",
      LineStyle.Dotted,
      2
    );

    addPatternLevel(
      pattern.stopLoss,
      "#fb7185",
      LineStyle.Dotted,
      2
    );

    classicPatternSeriesRef.current =
      createdSeries;
  }, [
    patternsData,
    showClassicPatterns,
    patternInterval,
    interval,
    chartCandlesVersion,
  ]);

  /*
   * بيانات الشموع تصل عادة قبل بيانات النماذج.
   * عند وصول النماذج نعيد تعيين نفس الشموع
   * مع تلوين شموع النموذج فقط.
   */
  useEffect(() => {
    const series =
      seriesRef.current;

    const candles =
      chartCandlesRef.current;

    if (
      !series ||
      candles.length === 0
    ) {
      return;
    }

    series.setData(
      highlightCandlestickPatternCandles(
        candles,
        patternsData,
        showCandlePatterns,
        patternInterval
      )
    );
  }, [
    patternsData,
    showCandlePatterns,
    patternInterval,
  ]);

  useEffect(() => {
    const series =
      seriesRef.current;

    const price =
      Number(livePrice);

    if (
      !series ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return;
    }

    const timestampSeconds =
      Math.floor(
        Number(
          liveQuote?.timestamp ||
            Date.now()
        ) / 1000
      );

    const currentInterval =
      intervalRef.current;

    const intervalSeconds =
      currentInterval * 60;

    const previous =
      lastCandleRef.current;

    let nextCandle: ChartCandle;

    /*
      إذا كان التحديث داخل نفس شمعة الفريم،
      نعدّل الإغلاق والأعلى والأدنى فقط.
    */
    if (
      previous &&
      timestampSeconds >=
        Number(previous.time) &&
      timestampSeconds <
        Number(previous.time) +
          intervalSeconds
    ) {
      nextCandle = {
        ...previous,
        high: Math.max(
          previous.high,
          price
        ),
        low: Math.min(
          previous.low,
          price
        ),
        close: price,
      };
    } else {
      /*
        عند بدء فريم جديد ننشئ شمعة جديدة
        بدون إعادة تحميل الصفحة أو التحليل.
      */
      const bucketTime =
        Math.floor(
          timestampSeconds /
            intervalSeconds
        ) * intervalSeconds;

      nextCandle = {
        time:
          bucketTime as UTCTimestamp,
        open: price,
        high: price,
        low: price,
        close: price,
      };
    }

    series.update(
      nextCandle
    );

    lastCandleRef.current =
      nextCandle;
  }, [
    livePrice,
    liveQuote?.timestamp,
  ]);

  useEffect(() => {
    const series =
      seriesRef.current;

    if (!series) {
      return;
    }

    priceLinesRef.current.forEach(
      (priceLine) => {
        series.removePriceLine(
          priceLine
        );
      }
    );

    priceLinesRef.current =
      levels.map((level) =>
        series.createPriceLine({
          price: level.price,
          color: level.color,
          lineWidth:
            level.lineWidth,
          lineStyle:
            level.lineStyle,
          axisLabelVisible:
            level.axisLabelVisible,
          title:
            INLINE_GAMMA_LABEL_KEYS.has(
              level.key
            )
              ? ""
              : level.title,
        })
      );
  }, [levels]);

  useEffect(() => {
    const layer =
      gammaLabelsLayerRef.current;

    const series =
      seriesRef.current;

    if (!layer || !series) {
      return;
    }

    let animationFrame = 0;
    let active = true;

    function syncGammaLabels() {
      const currentLayer =
        gammaLabelsLayerRef.current;

      const currentSeries =
        seriesRef.current;

      if (
        !currentLayer ||
        !currentSeries
      ) {
        return;
      }

      inlineGammaLevels.forEach(
        (level) => {
          const label =
            currentLayer.querySelector<HTMLElement>(
              `[data-gamma-label="${level.key}"]`
            );

          if (!label) {
            return;
          }

          const coordinate =
            currentSeries.priceToCoordinate(
              level.price
            );

          if (
            coordinate === null ||
            coordinate < 8 ||
            coordinate >
              currentLayer.clientHeight - 8
          ) {
            label.style.display =
              "none";

            return;
          }

          label.style.display =
            "block";

          const labelHeight =
            label.offsetHeight || 12;

          label.style.transform =
            `translate3d(0, ${
              Math.round(
                coordinate -
                  labelHeight / 2
              )
            }px, 0)`;
        }
      );
    }

    function animate() {
      if (!active) {
        return;
      }

      syncGammaLabels();

      animationFrame =
        window.requestAnimationFrame(
          animate
        );
    }

    animationFrame =
      window.requestAnimationFrame(
        animate
      );

    return () => {
      active = false;

      window.cancelAnimationFrame(
        animationFrame
      );
    };
  }, [inlineGammaLevels]);

  useEffect(() => {
    const chart =
      chartRef.current;

    const container =
      containerRef.current;

    if (!chart || !container) {
      return;
    }

    const frame =
      window.requestAnimationFrame(
        () => {
          chart.applyOptions({
            width:
              container.clientWidth,
            height:
              container.clientHeight,
          });
        }
      );

    return () => {
      window.cancelAnimationFrame(
        frame
      );
    };
  }, [isExpanded]);

  function fitChartContent() {
    chartRef.current
      ?.timeScale()
      .fitContent();
  }

  function scrollToLatestCandle() {
    chartRef.current
      ?.timeScale()
      .scrollToRealTime();
  }

  function resetPriceScale() {
    const chart =
      chartRef.current;

    if (!chart) {
      return;
    }

    chart
      .priceScale("right")
      .setAutoScale(true);

    setIsPriceScaleManual(
      false
    );
  }

  function enableManualPriceScale() {
    const chart =
      chartRef.current;

    if (!chart) {
      return;
    }

    chart
      .priceScale("right")
      .setAutoScale(false);

    setIsPriceScaleManual(
      true
    );
  }

  const intervalSeconds =
    interval * 60;

  const nowSeconds =
    Math.floor(
      clockNow / 1000
    );

  const currentBucketStart =
    Math.floor(
      nowSeconds /
        intervalSeconds
    ) * intervalSeconds;

  const candleCloseTime =
    currentBucketStart +
    intervalSeconds;

  const secondsRemaining =
    Math.max(
      0,
      candleCloseTime -
        nowSeconds
    );

  const countdownHours =
    Math.floor(
      secondsRemaining /
        3_600
    );

  const countdownMinutes =
    Math.floor(
      (
        secondsRemaining %
        3_600
      ) / 60
    );

  const countdownSeconds =
    secondsRemaining % 60;

  const candleCountdown =
    countdownHours > 0
      ? [
          countdownHours,
          countdownMinutes,
          countdownSeconds,
        ]
          .map((value) =>
            String(value).padStart(
              2,
              "0"
            )
          )
          .join(":")
      : [
          countdownMinutes,
          countdownSeconds,
        ]
          .map((value) =>
            String(value).padStart(
              2,
              "0"
            )
          )
          .join(":");

  const intervalLabel =
    interval === 1440
      ? "1D"
      : interval === 240
        ? "4H"
        : interval === 60
          ? "1H"
          : `${interval}m`;

  const displayedLivePrice =
    livePrice ??
    currentPrice;

  useEffect(() => {
    const series =
      seriesRef.current;

    if (!series) {
      return;
    }

    /*
      يظهر عداد إغلاق الشمعة ملاصقًا
      لعلامة آخر سعر في يمين الشارت.
    */
    series.applyOptions({
      title: candleCountdown,
      lastValueVisible: true,
    });
  }, [candleCountdown]);

  const directionLabel =
    side === "CALL"
      ? "سيناريو صاعد — صفقة CALL"
      : side === "PUT"
        ? "سيناريو هابط — صفقة PUT"
        : "اتجاه محايد — لا توجد صفقة حتى يتحول الاتجاه إلى CALL أو PUT";

  return (
    <section
      className={[
        "overflow-hidden border border-cyan-400/15 bg-slate-950 shadow-2xl shadow-cyan-950/10",
        isExpanded
          ? "fixed inset-0 z-[100] m-0 rounded-none"
          : "mb-5 rounded-3xl",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold text-cyan-400">
            الشارت الذكي
          </p>

          <h2 className="mt-2 text-2xl font-black text-white">
            {symbol} — حركة السعر والمستويات
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1.5 text-sm font-black text-emerald-300">
              مباشر $
              {priceFormat(
                displayedLivePrice
              )}
            </span>

            <span className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-xs font-black text-cyan-300">
              فريم {intervalLabel}
            </span>

          </div>

          <p
            className={[
              "mt-2 text-sm font-bold",
              side === "NEUTRAL"
                ? "text-amber-300"
                : "text-slate-400",
            ].join(" ")}
          >
            {directionLabel}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            [5, "5m"],
            [15, "15m"],
            [30, "30m"],
            [60, "1H"],
            [240, "4H"],
            [1440, "1D"],
          ].map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setIntervalValue(
                    value as
                      | 5
                      | 15
                      | 30
                      | 60
                      | 240
                      | 1440
                  )
                }
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-black transition",
                  interval === value
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                    : "border-white/[0.07] bg-slate-900/70 text-slate-400 hover:text-white",
                ].join(" ")}
              >
                {label}
              </button>
            )
          )}

          <span className="mx-1 hidden h-8 w-px bg-white/[0.08] sm:block" />

          <button
            type="button"
            onClick={zoomCandlesIn}
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            title="تكبير عرض الشموع"
          >
            شموع +
          </button>

          <button
            type="button"
            onClick={zoomCandlesOut}
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            title="تصغير عرض الشموع"
          >
            شموع −
          </button>

          <button
            type="button"
            onClick={fitChartContent}
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            title="إظهار جميع الشموع"
          >
            ملاءمة
          </button>

          <button
            type="button"
            onClick={
              scrollToLatestCandle
            }
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            title="العودة إلى آخر شمعة"
          >
            آخر شمعة
          </button>

          <button
            type="button"
            onClick={
              enableManualPriceScale
            }
            className={[
              "rounded-xl border px-3 py-2 text-xs font-black transition",
              isPriceScaleManual
                ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                : "border-white/[0.08] bg-slate-900/70 text-slate-300 hover:border-amber-400/30 hover:text-amber-300",
            ].join(" ")}
            title="تفعيل التحكم اليدوي في نطاق الأسعار"
          >
            تحكم السعر
          </button>

          <button
            type="button"
            onClick={resetPriceScale}
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-emerald-400/30 hover:text-emerald-300"
            title="إعادة مقياس السعر للوضع التلقائي"
          >
            ضبط السعر
          </button>

          <button
            type="button"
            onClick={
              toggleExpandedChart
            }
            className={[
              "rounded-xl border px-3 py-2 text-xs font-black transition",
              isExpanded
                ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                : "border-white/[0.08] bg-slate-900/70 text-slate-300 hover:border-cyan-400/30 hover:text-cyan-300",
            ].join(" ")}
            title={
              isExpanded
                ? "إغلاق وضع الشاشة الكاملة"
                : "تكبير الشارت"
            }
          >
            {isExpanded
              ? "إغلاق"
              : "تكبير"}
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.05] px-5 py-2 text-right text-[11px] font-bold leading-5 text-slate-500 sm:px-6">
        استخدم عجلة الماوس أو زري شموع + و− لتكبير وتصغير عرض الشموع، واسحب الشارت لتحريكه، واسحب تدريج الأسعار يمين الشارت للتحكم بالنطاق السعري.
      </div>

      {side === "NEUTRAL" ? (
        <div className="mx-5 mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm font-bold leading-7 text-amber-200">
          الاتجاه محايد حاليًا. تظهر مستويات Gamma CALL وGamma PUT للمراقبة فقط، ولا يوجد دخول أو وقف أو أهداف حتى يتحول الاتجاه.
        </div>
      ) : null}

      <div className="relative">
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-white/[0.06] bg-slate-950/80 px-4 py-3">
          <button
            type="button"
            onClick={moveChartLeft}
            className="flex h-10 min-w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-slate-900/80 px-4 text-lg font-black text-slate-200 transition active:scale-95 hover:border-cyan-400/30 hover:text-cyan-300"
            title="تحريك الشارت لليسار"
            aria-label="تحريك الشارت لليسار"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                d="M15 6L9 12L15 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={zoomCandlesIn}
            className="flex h-10 min-w-12 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 text-lg font-black text-cyan-300 transition active:scale-95"
            title="تكبير عرض الشموع"
            aria-label="تكبير عرض الشموع"
          >
            ▲
          </button>

          <button
            type="button"
            onClick={zoomCandlesOut}
            className="flex h-10 min-w-12 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 text-lg font-black text-cyan-300 transition active:scale-95"
            title="تصغير عرض الشموع"
            aria-label="تصغير عرض الشموع"
          >
            ▼
          </button>

          <button
            type="button"
            onClick={moveChartRight}
            className="flex h-10 min-w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-slate-900/80 px-4 text-lg font-black text-slate-200 transition active:scale-95 hover:border-cyan-400/30 hover:text-cyan-300"
            title="تحريك الشارت لليمين"
            aria-label="تحريك الشارت لليمين"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                d="M9 6L15 12L9 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <span className="w-full text-center text-[11px] font-bold text-slate-500 sm:w-auto">
            الأسهم: تحريك وتكبير الشموع
          </span>
        </div>

        <div
          className={[
            "relative w-full",
            isExpanded
              ? "h-[calc(100dvh-250px)] min-h-[420px]"
              : "h-[420px] sm:h-[480px] lg:h-[560px]",
          ].join(" ")}
        >
          {candlesLoading ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/35 text-sm font-bold text-slate-300">
              جارٍ تحميل الشموع...
            </div>
          ) : null}

          {candlesError ? (
            <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-300">
              {candlesError}
            </div>
          ) : null}

          <div
            ref={containerRef}
            onDoubleClick={(
              event
            ) => {
              event.preventDefault();
              event.stopPropagation();

              toggleExpandedChart();
            }}
            className={[
              "h-full w-full select-none",
              isExpanded
                ? "cursor-zoom-out"
                : "cursor-zoom-in",
            ].join(" ")}
            dir="ltr"
            title={
              isExpanded
                ? "اضغط مرتين لإغلاق التكبير"
                : "اضغط مرتين لتكبير الشارت"
            }
          />

          <div
            ref={gammaLabelsLayerRef}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            aria-hidden="true"
          >
            {inlineGammaLevels.map(
              (level) => (
                <span
                  key={`inline-${level.key}-${level.price}`}
                  data-gamma-label={
                    level.key
                  }
                  dir="rtl"
                  className="absolute right-[86px] top-0 hidden whitespace-nowrap text-[10px] font-black leading-none [will-change:transform] sm:right-[96px] sm:text-xs"
                  style={{
                    color: level.color,
                    textShadow:
                      "0 1px 3px #020617, 0 -1px 3px #020617",
                  }}
                >
                  {level.title}
                </span>
              )
            )}
          </div>

        </div>
      </div>

      <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
        <div className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.07] via-slate-950/75 to-cyan-500/[0.05] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black text-violet-300">
                تحليل النماذج الفنية
              </p>

              <h3 className="mt-2 text-xl font-black text-white">
                النماذج الكلاسيكية ونماذج الشموع
              </h3>

              <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
                أداة تعليمية ومساندة للمراقبة فقط، ولا تدخل حاليًا في قرار الصفقة أو درجة التحليل.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setShowClassicPatterns(
                    (current) =>
                      !current
                  )
                }
                className={[
                  "rounded-xl border px-4 py-2 text-xs font-black transition",
                  showClassicPatterns
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border-white/[0.08] bg-slate-900/70 text-slate-500 hover:text-white",
                ].join(" ")}
              >
                {showClassicPatterns
                  ? "إخفاء النماذج الكلاسيكية"
                  : "إظهار النماذج الكلاسيكية"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowCandlePatterns(
                    (current) =>
                      !current
                  )
                }
                className={[
                  "rounded-xl border px-4 py-2 text-xs font-black transition",
                  showCandlePatterns
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border-white/[0.08] bg-slate-900/70 text-slate-500 hover:text-white",
                ].join(" ")}
              >
                {showCandlePatterns
                  ? "إخفاء نماذج الشموع"
                  : "إظهار نماذج الشموع"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              [15, "15m"],
              [30, "30m"],
              [60, "1H"],
              [1440, "1D"],
            ].map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setPatternInterval(
                      value as
                        | 15
                        | 30
                        | 60
                        | 1440
                    )
                  }
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-black transition",
                    patternInterval ===
                    value
                      ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
                      : "border-white/[0.07] bg-slate-900/65 text-slate-400 hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              )
            )}
          </div>

          {!showClassicPatterns &&
          !showCandlePatterns ? (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-slate-950/50 p-4 text-center">
              <p className="text-sm font-bold text-slate-400">
                تم إخفاء النوعين.
              </p>

              <p className="mt-2 text-xs text-slate-600">
                لن يتم إرسال طلبات تحديث حتى تُظهر أحدهما.
              </p>
            </div>
          ) : null}

          {(showClassicPatterns ||
            showCandlePatterns) &&
          patternsLoading ? (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-slate-950/50 p-4 text-center text-sm font-bold text-slate-400">
              جارٍ اكتشاف النماذج...
            </div>
          ) : null}

          {(showClassicPatterns ||
            showCandlePatterns) &&
          !patternsLoading &&
          patternsError ? (
            <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm font-bold text-rose-300">
              {patternsError}
            </div>
          ) : null}

          {(showClassicPatterns ||
            showCandlePatterns) &&
          !patternsLoading &&
          patternsData ? (
            <>
              {patternsData
                .fallbackMessage ? (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs font-bold leading-6 text-amber-200">
                  {
                    patternsData
                      .fallbackMessage
                  }
                </div>
              ) : null}

              {showClassicPatterns ? (
                <section className="mt-5 overflow-hidden rounded-2xl border border-cyan-400/15 bg-slate-950/45">
                  <button
                    type="button"
                    onClick={() =>
                      setClassicPatternsPanelOpen(
                        (current) =>
                          !current
                      )
                    }
                    aria-expanded={
                      classicPatternsPanelOpen
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-right transition hover:bg-cyan-400/[0.04]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] text-lg font-black text-cyan-300 transition-transform",
                          classicPatternsPanelOpen
                            ? "rotate-180"
                            : "",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        ⌄
                      </span>

                      <div className="min-w-0">
                        <h4 className="font-black text-cyan-300">
                          النماذج الكلاسيكية
                        </h4>

                        <p className="mt-1 text-xs text-slate-600">
                          اضغط لعرض أو إغلاق تفاصيل النماذج
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1 text-xs font-black text-cyan-300">
                      {
                        Math.min(
                          patternsData
                            .classicPatterns
                            .length,
                          1
                        )
                      }
                    </span>
                  </button>

                  {classicPatternsPanelOpen ? (
                    <div className="border-t border-white/[0.06] px-4 pb-4">
                      {patternsData
                    .classicPatterns
                    .length === 0 ? (
                    <div className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/45 p-4 text-sm text-slate-500">
                      لا يوجد نموذج كلاسيكي مهم على الفريم المختار حاليًا.
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      {patternsData
                        .classicPatterns
                        .slice(0, 1)
                        .map(
                          (
                            pattern
                          ) => (
                            <PatternEducationCard
                              key={
                                pattern.id
                              }
                              pattern={
                                pattern
                              }
                              lifecycleStatus={
                                derivePatternLifecycle(
                                  pattern,
                                  chartCandlesRef.current
                                )
                              }
                            />
                          )
                        )}
                    </div>
                  )}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {showCandlePatterns ? (
                <section className="mt-6 overflow-hidden rounded-2xl border border-amber-400/15 bg-slate-950/45">
                  <button
                    type="button"
                    onClick={() =>
                      setCandlePatternsPanelOpen(
                        (current) =>
                          !current
                      )
                    }
                    aria-expanded={
                      candlePatternsPanelOpen
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-right transition hover:bg-amber-400/[0.04]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/[0.06] text-lg font-black text-amber-300 transition-transform",
                          candlePatternsPanelOpen
                            ? "rotate-180"
                            : "",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        ⌄
                      </span>

                      <div className="min-w-0">
                        <h4 className="font-black text-amber-300">
                          نماذج الشموع المهمة
                        </h4>

                        <p className="mt-1 text-xs text-slate-600">
                          اضغط لعرض أو إغلاق تفاصيل الشموع
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1 text-xs font-black text-amber-300">
                      {
                        Math.min(
                          patternsData
                            .candlestickPatterns
                            .length,
                          1
                        )
                      }
                    </span>
                  </button>

                  {candlePatternsPanelOpen ? (
                    <div className="border-t border-white/[0.06] px-4 pb-4">
                      {patternsData
                    .candlestickPatterns
                    .length === 0 ? (
                    <div className="mt-3 rounded-xl border border-white/[0.06] bg-slate-950/45 p-4 text-sm text-slate-500">
                      لا يوجد نموذج شموع مهم على الفريم المختار حاليًا.
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      {patternsData
                        .candlestickPatterns
                        .slice(0, 1)
                        .map(
                          (
                            pattern
                          ) => (
                            <PatternEducationCard
                              key={
                                pattern.id
                              }
                              pattern={
                                pattern
                              }
                              lifecycleStatus={
                                derivePatternLifecycle(
                                  pattern,
                                  chartCandlesRef.current
                                )
                              }
                            />
                          )
                        )}
                    </div>
                  )}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] p-4">
        {levels.map((level) => (
          <span
            key={`${level.key}-${level.price}`}
            className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-xs text-slate-300"
          >
            {level.title}: $
            {priceFormat(level.price)}
          </span>
        ))}
      </div>
    </section>
  );
}
