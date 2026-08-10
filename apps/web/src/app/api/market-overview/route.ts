import { getCandles } from "@/lib/candle-engine";
import type { Candle } from "@/lib/candle-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Direction =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL";

type Regime =
  | "TREND_UP"
  | "TREND_DOWN"
  | "RANGE"
  | "TRANSITION"
  | "IMPULSE_UP"
  | "IMPULSE_DOWN";

type IndexAnalysis = {
  symbol: string;
  name: string;

  price: number;

  direction: Direction;

  aboveVwap: boolean;
  vwap: number;
  vwapDistancePct: number;

  ema9: number;
  ema21: number;

  structure:
    | "HIGHER"
    | "LOWER"
    | "MIXED";

  momentum:
    | "STRONG_UP"
    | "UP"
    | "NEUTRAL"
    | "DOWN"
    | "STRONG_DOWN";

  move15mPct: number;
  move30mPct: number;

  volumeState:
    | "STRONG"
    | "NORMAL"
    | "WEAK";

  relativeVolume: number;

  reasons: string[];
};

const INDEXES = [
  {
    symbol: "SPY",
    name: "S&P 500",
    role: "PRIMARY",
  },
  {
    symbol: "QQQ",
    name: "Nasdaq 100",
    role: "PRIMARY",
  },
  {
    symbol: "IWM",
    name: "Russell 2000",
    role: "CONFIRM",
  },
  {
    symbol: "DIA",
    name: "Dow Jones",
    role: "CONFIRM",
  },
] as const;

function round(
  value: number,
  digits = 2,
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor,
    ) / factor
  );
}

function ema(
  values: number[],
  period: number,
) {
  if (values.length === 0) {
    return 0;
  }

  const multiplier =
    2 / (period + 1);

  let result =
    values[0];

  for (
    let index = 1;
    index < values.length;
    index += 1
  ) {
    result =
      values[index] *
        multiplier +
      result *
        (1 - multiplier);
  }

  return result;
}

function getNewYorkParts(
  timeSeconds: number,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
    ).formatToParts(
      new Date(
        timeSeconds * 1000
      ),
    );

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  const hour =
    Number(values.hour) % 24;

  const minute =
    Number(values.minute);

  return {
    date:
      `${values.year}-${values.month}-${values.day}`,

    minutes:
      hour * 60 + minute,
  };
}

function isRegularSessionCandle(
  candle: Candle,
) {
  const { minutes } =
    getNewYorkParts(
      candle.time
    );

  /*
    السوق النظامي:
    09:30 <= الوقت < 16:00
  */
  return (
    minutes >=
      9 * 60 + 30 &&
    minutes <
      16 * 60
  );
}

function sessionCandles(
  candles: Candle[],
) {
  const regularCandles =
    candles.filter(
      isRegularSessionCandle
    );

  if (
    regularCandles.length === 0
  ) {
    return [];
  }

  /*
    نختار آخر تاريخ تداول موجود
    داخل الجلسة النظامية فقط.
  */
  const last =
    regularCandles[
      regularCandles.length - 1
    ];

  const lastDate =
    getNewYorkParts(
      last.time
    ).date;

  return regularCandles.filter(
    (candle) =>
      getNewYorkParts(
        candle.time
      ).date === lastDate,
  );
}

function calculateVwap(
  candles: Candle[],
) {
  let priceVolume = 0;
  let volume = 0;

  for (const candle of candles) {
    const typicalPrice =
      (candle.high +
        candle.low +
        candle.close) /
      3;

    const candleVolume =
      Number(candle.volume) || 0;

    priceVolume +=
      typicalPrice *
      candleVolume;

    volume += candleVolume;
  }

  if (volume <= 0) {
    return (
      candles[
        candles.length - 1
      ]?.close || 0
    );
  }

  return priceVolume / volume;
}

function pctChange(
  current: number,
  previous: number,
) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return 0;
  }

  return (
    ((current - previous) /
      previous) *
    100
  );
}

function analyzeStructure(
  candles: Candle[],
) {
  /*
    نستخدم آخر 6 شموع = 30 دقيقة.
    نقارن نصفها الأخير بالنصف السابق
    بدل الاعتماد على شمعة واحدة.
  */
  const recent =
    candles.slice(-6);

  if (recent.length < 6) {
    return "MIXED" as const;
  }

  const first =
    recent.slice(0, 3);

  const second =
    recent.slice(3);

  const firstHigh =
    Math.max(
      ...first.map(
        (item) => item.high,
      ),
    );

  const firstLow =
    Math.min(
      ...first.map(
        (item) => item.low,
      ),
    );

  const secondHigh =
    Math.max(
      ...second.map(
        (item) => item.high,
      ),
    );

  const secondLow =
    Math.min(
      ...second.map(
        (item) => item.low,
      ),
    );

  if (
    secondHigh > firstHigh &&
    secondLow > firstLow
  ) {
    return "HIGHER" as const;
  }

  if (
    secondHigh < firstHigh &&
    secondLow < firstLow
  ) {
    return "LOWER" as const;
  }

  return "MIXED" as const;
}

function analyzeIndex(
  symbol: string,
  name: string,
  candles: Candle[],
): IndexAnalysis {
  const session =
    sessionCandles(candles);

/*
EMA9 و EMA21 يحتاجان تاريخًا أطول من جلسة اليوم،
خصوصًا في بداية التداول.
نستخدم جميع شموع الجلسات النظامية المتاحة للمتوسطات،
بينما VWAP والحركة والبنية تبقى من جلسة اليوم.
*/
const regularCandles =
candles.filter(
isRegularSessionCandle
);


  const debugDateFormatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    );

  const debugDays =
    new Map<string, number>();

  for (const candle of candles) {
    const date =
      debugDateFormatter.format(
        new Date(
          candle.time * 1000
        ),
      );

    debugDays.set(
      date,
      (debugDays.get(date) || 0) + 1,
    );
  }

/*
نبدأ التشخيص بعد توفر 3 شموع 5 دقائق
من جلسة اليوم.

EMA9 و EMA21 يستخدمان الشموع النظامية
التاريخية المتاحة من Finnhub.
*/
if (session.length < 3) {
throw new Error(
`${symbol}: ننتظر 3 شموع من جلسة اليوم للتحليل.`,
);
}

if (regularCandles.length < 21) {
throw new Error(
`${symbol}: لا توجد شموع تاريخية كافية لحساب EMA21.`,
);
}

const closes =
regularCandles
.slice(-60)
.map(
(item) => item.close,
);

  const latest =
    session[
      session.length - 1
    ];

  const price =
    latest.close;

  const vwap =
    calculateVwap(session);

  const ema9 =
    ema(closes, 9);

  const ema21 =
    ema(closes, 21);

  const aboveVwap =
    price >= vwap;

  const vwapDistancePct =
    pctChange(
      price,
      vwap,
    );

  const structure =
    analyzeStructure(
      session,
    );

  const close15mAgo =
    session[
      Math.max(
        0,
        session.length - 4,
      )
    ]?.close ?? price;

  const close30mAgo =
    session[
      Math.max(
        0,
        session.length - 7,
      )
    ]?.close ?? price;

  const move15mPct =
    pctChange(
      price,
      close15mAgo,
    );

  const move30mPct =
    pctChange(
      price,
      close30mAgo,
    );

  /*
    Relative Volume:
    آخر 3 شموع مقابل متوسط
    الـ 12 شمعة السابقة لها.
  */
  const newYorkDateFormatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    );

  const newYorkTimeFormatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
    );

  const latestSessionDate =
    newYorkDateFormatter.format(
      new Date(latest.time * 1000),
    );

  /*
    Time-of-Day RVOL:
    نقارن آخر 3 شموع بنفس أوقاتها
    في الجلسات التاريخية السابقة.
  */
  const recentBars =
    session.slice(-3);

  const recentVolume =
    recentBars.length > 0
      ? recentBars.reduce(
          (sum, item) =>
            sum +
            (Number(
              item.volume,
            ) || 0),
          0,
        ) /
        recentBars.length
      : 0;

  const targetTimes =
    new Set(
      recentBars.map(
        (item) =>
          newYorkTimeFormatter.format(
            new Date(item.time * 1000),
          ),
      ),
    );

  const historicalByDate =
    new Map<string, number[]>();

  for (const candle of candles) {
    const candleDate =
      newYorkDateFormatter.format(
        new Date(candle.time * 1000),
      );

    if (
      candleDate ===
      latestSessionDate
    ) {
      continue;
    }

    const candleTime =
      newYorkTimeFormatter.format(
        new Date(candle.time * 1000),
      );

    if (
      !targetTimes.has(
        candleTime,
      )
    ) {
      continue;
    }

    const candleVolume =
      Number(candle.volume) || 0;

    if (candleVolume <= 0) {
      continue;
    }

    const volumes =
      historicalByDate.get(
        candleDate,
      ) || [];

    volumes.push(
      candleVolume,
    );

    historicalByDate.set(
      candleDate,
      volumes,
    );
  }

  const historicalSessionVolumes =
    Array.from(
      historicalByDate.values(),
    )
      .filter(
        (volumes) =>
          volumes.length ===
          recentBars.length,
      )
      .map(
        (volumes) =>
          volumes.reduce(
            (sum, volume) =>
              sum + volume,
            0,
          ) /
          volumes.length,
      );

  /*
    لا نعتمد RVOL تاريخي إذا لم تتوفر
    3 جلسات سابقة مكتملة على الأقل.
  */
  const historicalBaselineVolume =
    historicalSessionVolumes.length >= 3
      ? historicalSessionVolumes.reduce(
          (sum, volume) =>
            sum + volume,
          0,
        ) /
        historicalSessionVolumes.length
      : 0;

  const relativeVolume =
    recentVolume > 0 &&
    historicalBaselineVolume > 0
      ? recentVolume /
        historicalBaselineVolume
      : 1;

  const volumeState =
    relativeVolume >= 1.5
      ? "STRONG"
      : relativeVolume <= 0.65
        ? "WEAK"
        : "NORMAL";

  let momentum:
    IndexAnalysis["momentum"] =
      "NEUTRAL";

  if (
    move15mPct >= 0.35 &&
    move30mPct >= 0.5
  ) {
    momentum = "STRONG_UP";
  } else if (
    move15mPct >= 0.12 ||
    move30mPct >= 0.25
  ) {
    momentum = "UP";
  } else if (
    move15mPct <= -0.35 &&
    move30mPct <= -0.5
  ) {
    momentum =
      "STRONG_DOWN";
  } else if (
    move15mPct <= -0.12 ||
    move30mPct <= -0.25
  ) {
    momentum = "DOWN";
  }

  let bullishEvidence = 0;
  let bearishEvidence = 0;

  if (aboveVwap) {
    bullishEvidence += 1;
  } else {
    bearishEvidence += 1;
  }

  if (ema9 > ema21) {
    bullishEvidence += 1;
  } else if (ema9 < ema21) {
    bearishEvidence += 1;
  }

  if (structure === "HIGHER") {
    bullishEvidence += 1;
  } else if (
    structure === "LOWER"
  ) {
    bearishEvidence += 1;
  }

  if (
    momentum === "UP" ||
    momentum === "STRONG_UP"
  ) {
    bullishEvidence += 1;
  }

  if (
    momentum === "DOWN" ||
    momentum ===
      "STRONG_DOWN"
  ) {
    bearishEvidence += 1;
  }

  const direction: Direction =
    bullishEvidence >= 3 &&
    bullishEvidence >
      bearishEvidence
      ? "BULLISH"
      : bearishEvidence >= 3 &&
          bearishEvidence >
            bullishEvidence
        ? "BEARISH"
        : "NEUTRAL";

  const reasons: string[] = [];

  reasons.push(
    aboveVwap
      ? "السعر فوق VWAP"
      : "السعر تحت VWAP",
  );

  reasons.push(
    ema9 > ema21
      ? "EMA9 أعلى من EMA21"
      : ema9 < ema21
        ? "EMA9 أدنى من EMA21"
        : "المتوسطات متقاربة",
  );

  if (structure === "HIGHER") {
    reasons.push(
      "البنية قصيرة المدى تصنع قممًا وقيعانًا أعلى",
    );
  } else if (
    structure === "LOWER"
  ) {
    reasons.push(
      "البنية قصيرة المدى تصنع قممًا وقيعانًا أدنى",
    );
  } else {
    reasons.push(
      "بنية السعر مختلطة",
    );
  }

  return {
    symbol,
    name,

    price: round(price, 2),

    direction,

    aboveVwap,
    vwap: round(vwap, 2),
    vwapDistancePct:
      round(
        vwapDistancePct,
        2,
      ),

    ema9: round(ema9, 2),
    ema21: round(
      ema21,
      2,
    ),

    structure,

    momentum,

    move15mPct:
      round(move15mPct, 2),

    move30mPct:
      round(move30mPct, 2),

    volumeState,

    relativeVolume:
      round(
        relativeVolume,
        2,
      ),

    reasons,
  };
}

function determineRegime(
  indices: IndexAnalysis[],
): {
  regime: Regime;
  title: string;
  environment: string;
  execution: string;
  summary: string;
} {
  const spy =
    indices.find(
      (item) =>
        item.symbol === "SPY",
    );

  const qqq =
    indices.find(
      (item) =>
        item.symbol === "QQQ",
    );

  const bullish =
    indices.filter(
      (item) =>
        item.direction ===
        "BULLISH",
    ).length;

  const bearish =
    indices.filter(
      (item) =>
        item.direction ===
        "BEARISH",
    ).length;

  const strongUp =
    indices.filter(
      (item) =>
        item.momentum ===
        "STRONG_UP",
    ).length;

  const strongDown =
    indices.filter(
      (item) =>
        item.momentum ===
        "STRONG_DOWN",
    ).length;

  const strongVolume =
    indices.filter(
      (item) =>
        item.volumeState ===
        "STRONG",
    ).length;

  const primaryBullish =
    spy?.direction ===
      "BULLISH" &&
    qqq?.direction ===
      "BULLISH";

  const primaryBearish =
    spy?.direction ===
      "BEARISH" &&
    qqq?.direction ===
      "BEARISH";

  if (
    primaryBullish &&
    bullish >= 3 &&
    strongUp >= 2 &&
    strongVolume >= 1
  ) {
    return {
      regime: "IMPULSE_UP",
      title:
        "اندفاع صاعد",
      environment:
        "حركة اتجاهية قوية مدعومة بالزخم.",
      execution:
        "أفضلية مع الاتجاه، لكن تجنب مطاردة السعر إذا أصبح ممتدًا بعيدًا عن VWAP.",
      summary:
        "SPY وQQQ يقودان الصعود مع تأكيد واسع وزخم قوي.",
    };
  }

  if (
    primaryBearish &&
    bearish >= 3 &&
    strongDown >= 2 &&
    strongVolume >= 1
  ) {
    return {
      regime:
        "IMPULSE_DOWN",
      title:
        "اندفاع هابط",
      environment:
        "ضغط بيعي اتجاهي قوي ومدعوم بالزخم.",
      execution:
        "أفضلية مع الاتجاه الهابط، لكن تجنب مطاردة PUT بعد امتداد كبير أسفل VWAP.",
      summary:
        "SPY وQQQ يقودان الهبوط مع تأكيد واسع وزخم قوي.",
    };
  }

  if (
    primaryBullish &&
    bullish >= 3
  ) {
    const primaryMomentumUp =
      [
        spy?.momentum,
        qqq?.momentum,
      ].some(
        (momentum) =>
          momentum === "UP" ||
          momentum === "STRONG_UP",
      );

    return {
      regime: "TREND_UP",
      title:
        primaryMomentumUp
          ? "اتجاه صاعد قائم — الزخم داعم"
          : "اتجاه صاعد قائم — الزخم هادئ",
      environment:
        primaryMomentumUp
          ? "البنية والاتجاه صاعدان مع وجود دفع لحظي يدعم الحركة."
          : "البنية صاعدة لكن الزخم اللحظي هادئ؛ الاتجاه موجود دون اندفاع قوي.",
      execution:
        primaryMomentumUp
          ? "أفضلية مع الاتجاه الصاعد، مع التركيز على التراجعات وإعادة الاختبار بدل مطاردة السعر."
          : "الأفضل انتظار تراجع أو إعادة اختبار واضحة؛ الاتجاه صاعد لكن لا يوجد اندفاع لحظي قوي.",
      summary:
        primaryMomentumUp
          ? "SPY وQQQ متفقان على الاتجاه الصاعد ومعظم المؤشرات تؤكد الحركة والزخم يدعمها."
          : "SPY وQQQ متفقان على الاتجاه الصاعد، لكن الزخم القصير لا يزال هادئًا.",
    };
  }

  if (
    primaryBearish &&
    bearish >= 3
  ) {
    const primaryMomentumDown =
      [
        spy?.momentum,
        qqq?.momentum,
      ].some(
        (momentum) =>
          momentum === "DOWN" ||
          momentum === "STRONG_DOWN",
      );

    return {
      regime: "TREND_DOWN",
      title:
        primaryMomentumDown
          ? "اتجاه هابط قائم — الزخم داعم"
          : "اتجاه هابط قائم — الزخم هادئ",
      environment:
        primaryMomentumDown
          ? "البنية والاتجاه هابطان مع وجود ضغط لحظي يدعم الحركة."
          : "البنية هابطة لكن الزخم اللحظي هادئ؛ الاتجاه موجود دون تسارع قوي.",
      execution:
        primaryMomentumDown
          ? "أفضلية مع الاتجاه الهابط، مع انتظار الارتدادات أو إعادة الاختبار بدل مطاردة الهبوط."
          : "الأفضل انتظار ارتداد أو إعادة اختبار واضحة؛ الاتجاه هابط لكن لا يوجد ضغط لحظي قوي.",
      summary:
        primaryMomentumDown
          ? "SPY وQQQ متفقان على الاتجاه الهابط ومعظم المؤشرات تؤكد الحركة والزخم يدعمها."
          : "SPY وQQQ متفقان على الاتجاه الهابط، لكن الزخم القصير لا يزال هادئًا.",
    };
  }

  const neutral =
    indices.filter(
      (item) =>
        item.direction ===
        "NEUTRAL",
    ).length;

  const nearVwap =
    indices.filter(
      (item) =>
        Math.abs(
          item.vwapDistancePct,
        ) <= 0.2,
    ).length;

  if (
    neutral >= 2 &&
    nearVwap >= 2
  ) {
    return {
      regime: "RANGE",
      title:
        "سوق متذبذب — لا أفضلية اتجاهية",
      environment:
        "الحركة حول VWAP ولا توجد سيطرة اتجاهية واضحة.",
      execution:
        "جودة الصفقات الاتجاهية منخفضة؛ تجنب مطاردة الاختراقات الضعيفة وانتظر خروجًا واضحًا.",
      summary:
        "المؤشرات تفتقد لاتجاه متفق عليه والسعر قريب من مناطق التوازن.",
    };
  }

  return {
    regime: "TRANSITION",
    title:
      "مرحلة انتقال — الاتجاه غير محسوم",
    environment:
      "المؤشرات متعارضة أو السوق يمر بمرحلة انتقال بين اتجاهين.",
    execution:
      "لا توجد أفضلية واضحة الآن؛ انتظار تأكيد SPY وQQQ أفضل من توقع الاتجاه.",
    summary:
      "الاتجاهات الداخلية غير متفقة بما يكفي لإعلان حالة اتجاهية.",
  };
}

export async function GET() {
  try {
    const apiKey =
      process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          ok: false,
          error:
            "FINNHUB_API_KEY غير موجود.",
        },
        {
          status: 500,
        },
      );
    }

    const settled =
      await Promise.allSettled(
        INDEXES.map(
          async (index) => {
            const result =
              await getCandles({
                symbol:
                  index.symbol,
                interval: 5,
                apiKey,
              });

            return analyzeIndex(
              index.symbol,
              index.name,
              result.candles,
            );
          },
        ),
      );

    const indices:
      IndexAnalysis[] = [];

    const failed: Array<{
      symbol: string;
      error: string;
    }> = [];

    settled.forEach(
      (result, index) => {
        if (
          result.status ===
          "fulfilled"
        ) {
          indices.push(
            result.value,
          );
        } else {
          failed.push({
            symbol:
              INDEXES[index]
                .symbol,
            error:
              result.reason instanceof
              Error
                ? result.reason
                    .message
                : "خطأ غير معروف",
          });
        }
      },
    );

    const spy =
      indices.find(
        (item) =>
          item.symbol ===
          "SPY",
      );

    const qqq =
      indices.find(
        (item) =>
          item.symbol ===
          "QQQ",
      );

    /*
      لا نصدر تشخيص سوق
      بدون SPY وQQQ.
    */
    if (!spy || !qqq) {
      return Response.json(
        {
          ok: false,
          error:
            "لا توجد بيانات كافية لتشخيص السوق.",
          failed,
        },
        {
          status: 502,
        },
      );
    }

    const diagnosis =
      determineRegime(
        indices,
      );

    const aboveVwapCount =
      indices.filter(
        (item) =>
          item.aboveVwap,
      ).length;

    const bullishCount =
      indices.filter(
        (item) =>
          item.direction ===
          "BULLISH",
      ).length;

    const bearishCount =
      indices.filter(
        (item) =>
          item.direction ===
          "BEARISH",
      ).length;

    return Response.json(
      {
        ok: true,

        updatedAt:
          new Date()
            .toISOString(),

        timeframe: "5m",

        market: {
          ...diagnosis,

          primaryAgreement:
            spy.direction ===
            qqq.direction,

          aboveVwapCount,
          belowVwapCount:
            indices.length -
            aboveVwapCount,

          bullishCount,
          bearishCount,
          neutralCount:
            indices.length -
            bullishCount -
            bearishCount,
        },

        indices,
        failed,

        meta: {
          source:
            "Finnhub intraday candles via candle-engine",

          methodology: [
            "Session VWAP",
            "EMA 9 / EMA 21",
            "30-minute price structure",
            "15/30-minute momentum",
            "time-of-day relative volume",
            "SPY and QQQ primary confirmation",
            "IWM and DIA secondary confirmation",
          ],

          disclaimer:
            "تشخيص لحالة السوق وليس توصية شراء أو بيع.",
        },
      },
      {
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          "فشل إنشاء تشخيص السوق.",
        details:
          error instanceof Error
            ? error.message
            : "خطأ غير معروف",
      },
      {
        status: 500,
      },
    );
  }
}
