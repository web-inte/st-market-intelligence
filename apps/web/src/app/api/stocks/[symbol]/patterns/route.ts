import {
  NextRequest,
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

type PatternDirection =
  | "BULLISH"
  | "BEARISH"
  | "NEUTRAL";

type PatternCategory =
  | "CLASSIC"
  | "CANDLESTICK";

type PatternStatus =
  | "COMPLETE"
  | "FORMING";

type RawPattern = {
  symbol?: string;
  patternname?: string;
  patterntype?: string;
  status?: string;
  mature?: number;
  sortTime?: number;

  aprice?: number;
  atime?: number;
  bprice?: number;
  btime?: number;
  cprice?: number;
  ctime?: number;
  dprice?: number;
  dtime?: number;
  eprice?: number;
  etime?: number;

  start_price?: number;
  start_time?: number;
  end_price?: number;
  end_time?: number;

  entry?: number;
  profit1?: number;
  profit2?: number;
  stoploss?: number;

  [key: string]:
    unknown;
};

type PatternResponse = {
  points?: RawPattern[];
  error?: string;
};

type PatternDefinition = {
  label: string;
  category: PatternCategory;
  direction:
    | PatternDirection
    | "SOURCE";
  explanation: string;
  confirmation: string;
  invalidation: string;
};

const CACHE_TTL_MS =
  60_000;

const cache =
  new Map<
    string,
    {
      expiresAt: number;
      payload: unknown;
    }
  >();

/*
 * نعرض فقط النماذج الكلاسيكية المهمة والواضحة.
 */
const CLASSIC_PATTERNS:
  Record<
    string,
    PatternDefinition
  > = {
    "double top": {
      label: "قمة مزدوجة",
      category: "CLASSIC",
      direction: "BEARISH",
      explanation:
        "يظهر عندما يفشل السعر مرتين في تجاوز منطقة قمة متقاربة، وقد يشير إلى ضعف الاتجاه الصاعد.",
      confirmation:
        "يتأكد عادة بعد كسر خط العنق أو الدعم الواقع بين القمتين.",
      invalidation:
        "يُلغى إذا عاد السعر واخترق القمتين بثبات.",
    },

    "double bottom": {
      label: "قاع مزدوج",
      category: "CLASSIC",
      direction: "BULLISH",
      explanation:
        "يظهر عندما يرتد السعر مرتين من منطقة قاع متقاربة، وقد يشير إلى ضعف الاتجاه الهابط.",
      confirmation:
        "يتأكد عادة بعد اختراق خط العنق أو المقاومة بين القاعين.",
      invalidation:
        "يُلغى إذا كسر السعر القاعين بثبات.",
    },

    "head and shoulders": {
      label: "الرأس والكتفين",
      category: "CLASSIC",
      direction: "BEARISH",
      explanation:
        "نموذج انعكاسي يتكوّن من قمتين جانبيتين وقمة وسطى أعلى منهما.",
      confirmation:
        "يتأكد بعد كسر خط العنق والإغلاق أسفله.",
      invalidation:
        "يُلغى إذا عاد السعر فوق خط العنق ثم اخترق الرأس.",
    },

    "inverse head and shoulders": {
      label:
        "الرأس والكتفين المعكوس",
      category: "CLASSIC",
      direction: "BULLISH",
      explanation:
        "نموذج انعكاسي صاعد يتكوّن من ثلاثة قيعان، ويكون القاع الأوسط أعمق.",
      confirmation:
        "يتأكد بعد اختراق خط العنق والإغلاق فوقه.",
      invalidation:
        "يُلغى إذا عاد السعر أسفل خط العنق ثم كسر الرأس.",
    },

    "ascending triangle": {
      label: "مثلث صاعد",
      category: "CLASSIC",
      direction: "BULLISH",
      explanation:
        "مقاومة أفقية مع قيعان صاعدة، ما يدل على زيادة ضغط المشترين.",
      confirmation:
        "يتأكد باختراق المقاومة مع ثبات السعر فوقها.",
      invalidation:
        "يُلغى بكسر خط القيعان الصاعدة.",
    },

    "descending triangle": {
      label: "مثلث هابط",
      category: "CLASSIC",
      direction: "BEARISH",
      explanation:
        "دعم أفقي مع قمم هابطة، ما يدل على زيادة ضغط البائعين.",
      confirmation:
        "يتأكد بكسر الدعم والثبات أسفله.",
      invalidation:
        "يُلغى باختراق خط القمم الهابطة.",
    },

    "symmetrical triangle": {
      label: "مثلث متماثل",
      category: "CLASSIC",
      direction: "SOURCE",
      explanation:
        "يتقلص نطاق السعر بين قمم هابطة وقيعان صاعدة قبل حركة محتملة قوية.",
      confirmation:
        "يُنتظر اختراق أحد ضلعي المثلث مع إغلاق واضح.",
      invalidation:
        "يفشل إذا عاد السعر سريعًا داخل المثلث بعد الاختراق.",
    },

    "falling wedge": {
      label: "وتد هابط",
      category: "CLASSIC",
      direction: "BULLISH",
      explanation:
        "يتحرك السعر داخل نطاق هابط متقارب، وقد يشير إلى ضعف ضغط البيع.",
      confirmation:
        "يتأكد باختراق الحد العلوي للوتد.",
      invalidation:
        "يُلغى بكسر الحد السفلي واستمرار الهبوط.",
    },

    "rising wedge": {
      label: "وتد صاعد",
      category: "CLASSIC",
      direction: "BEARISH",
      explanation:
        "يتحرك السعر داخل نطاق صاعد متقارب، وقد يشير إلى ضعف الزخم الشرائي.",
      confirmation:
        "يتأكد بكسر الحد السفلي للوتد.",
      invalidation:
        "يُلغى باختراق الحد العلوي والثبات فوقه.",
    },

    "bull flag": {
      label: "علم صاعد",
      category: "CLASSIC",
      direction: "BULLISH",
      explanation:
        "توقف أو تصحيح قصير بعد حركة صاعدة قوية قبل احتمال استكمال الصعود.",
      confirmation:
        "يتأكد باختراق الحد العلوي للعلم.",
      invalidation:
        "يُلغى بكسر الحد السفلي للعلم.",
    },

    "bear flag": {
      label: "علم هابط",
      category: "CLASSIC",
      direction: "BEARISH",
      explanation:
        "ارتداد قصير بعد حركة هابطة قوية قبل احتمال استكمال الهبوط.",
      confirmation:
        "يتأكد بكسر الحد السفلي للعلم.",
      invalidation:
        "يُلغى باختراق الحد العلوي للعلم.",
    },

    "channel up": {
      label: "قناة صاعدة",
      category: "CLASSIC",
      direction: "BULLISH",
      explanation:
        "يتحرك السعر بين دعم ومقاومة صاعدين بصورة منتظمة.",
      confirmation:
        "يُراقب الارتداد من دعم القناة أو اختراق مقاومتها.",
      invalidation:
        "تضعف القناة عند كسر الحد السفلي والإغلاق تحته.",
    },

    "channel down": {
      label: "قناة هابطة",
      category: "CLASSIC",
      direction: "BEARISH",
      explanation:
        "يتحرك السعر بين دعم ومقاومة هابطين بصورة منتظمة.",
      confirmation:
        "يُراقب الرفض من مقاومة القناة أو كسر دعمها.",
      invalidation:
        "تضعف القناة عند اختراق الحد العلوي والإغلاق فوقه.",
    },
  };

/*
 * نماذج الشموع المهمة فقط.
 */
const CANDLESTICK_PATTERNS:
  Record<
    string,
    PatternDefinition
  > = {
    "bullish engulfing": {
      label: "ابتلاع شرائي",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "شمعة صاعدة تبتلع جسم الشمعة الهابطة السابقة، وقد تعكس انتقال القوة للمشترين.",
      confirmation:
        "يُفضّل اختراق أعلى النموذج أو ظهور شمعة صاعدة لاحقة.",
      invalidation:
        "يضعف النموذج بكسر أدنى شموعه.",
    },

    "bearish engulfing": {
      label: "ابتلاع بيعي",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "شمعة هابطة تبتلع جسم الشمعة الصاعدة السابقة، وقد تعكس انتقال القوة للبائعين.",
      confirmation:
        "يُفضّل كسر أدنى النموذج أو ظهور شمعة هابطة لاحقة.",
      invalidation:
        "يضعف النموذج باختراق أعلى شموعه.",
    },

    "morning star": {
      label: "نجمة الصباح",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "نموذج من ثلاث شموع قد يظهر قرب نهاية موجة هابطة ويشير إلى تحسن الطلب.",
      confirmation:
        "يتأكد بتجاوز أعلى الشمعة الثالثة أو مقاومة قريبة.",
      invalidation:
        "يُلغى بكسر أدنى النموذج.",
    },

    "evening star": {
      label: "نجمة المساء",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "نموذج من ثلاث شموع قد يظهر قرب نهاية موجة صاعدة ويشير إلى زيادة العرض.",
      confirmation:
        "يتأكد بكسر أدنى الشمعة الثالثة أو دعم قريب.",
      invalidation:
        "يُلغى باختراق أعلى النموذج.",
    },

    "hammer": {
      label: "المطرقة",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "شمعة بظل سفلي طويل تظهر رفض الأسعار المنخفضة، وتكون أهم بعد هبوط.",
      confirmation:
        "يُفضّل اختراق أعلى المطرقة بشمعة لاحقة.",
      invalidation:
        "يُلغى بكسر أدنى ظل المطرقة.",
    },

    "inverted hammer": {
      label: "المطرقة المقلوبة",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "شمعة بظل علوي طويل بعد هبوط، وقد تدل على بدء محاولة شرائية.",
      confirmation:
        "تحتاج اختراق أعلى الشمعة أو إغلاقًا صاعدًا لاحقًا.",
      invalidation:
        "يُلغى بكسر أدنى النموذج.",
    },

    "hanging man": {
      label: "الرجل المشنوق",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "شمعة بظل سفلي طويل بعد صعود، وقد تشير إلى ظهور ضغط بيع.",
      confirmation:
        "تحتاج كسر أدنى الشمعة أو شمعة هابطة لاحقة.",
      invalidation:
        "يُلغى باختراق أعلى النموذج.",
    },

    "shooting star": {
      label: "الشهاب",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "شمعة بظل علوي طويل بعد صعود، وتوضح رفض الأسعار المرتفعة.",
      confirmation:
        "يتأكد بكسر أدنى الشمعة.",
      invalidation:
        "يُلغى باختراق أعلى ظلها.",
    },

    "three white soldiers": {
      label:
        "الجنود البيض الثلاثة",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "ثلاث شموع صاعدة متتالية قوية قد تشير إلى سيطرة واضحة للمشترين.",
      confirmation:
        "يُفضّل استمرار التداول فوق أعلى النموذج.",
      invalidation:
        "يضعف النموذج بالعودة أسفل منتصفه أو كسر أدناه.",
    },

    "three black crows": {
      label:
        "الغربان السوداء الثلاثة",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "ثلاث شموع هابطة متتالية قوية قد تشير إلى سيطرة واضحة للبائعين.",
      confirmation:
        "يُفضّل استمرار التداول أسفل أدنى النموذج.",
      invalidation:
        "يضعف النموذج بالعودة فوق منتصفه أو اختراق أعلاه.",
    },

    "dark cloud cover": {
      label:
        "غطاء السحابة الداكنة",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "شمعة هابطة تدخل بعمق داخل جسم شمعة صاعدة سابقة، وقد تشير إلى ضعف الصعود.",
      confirmation:
        "يتأكد بكسر أدنى النموذج.",
      invalidation:
        "يُلغى باختراق أعلى النموذج.",
    },

    "piercing pattern": {
      label:
        "النموذج الاختراقي الشرائي",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "شمعة صاعدة تدخل بعمق داخل جسم شمعة هابطة سابقة، وقد تشير إلى تحسن الطلب.",
      confirmation:
        "يتأكد باختراق أعلى النموذج.",
      invalidation:
        "يُلغى بكسر أدنى النموذج.",
    },

    "bullish harami": {
      label: "هارامي شرائي",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "شمعة صغيرة داخل جسم شمعة هابطة كبيرة، وقد تشير إلى تراجع ضغط البيع.",
      confirmation:
        "يحتاج اختراق أعلى النموذج.",
      invalidation:
        "يُلغى بكسر أدنى النموذج.",
    },

    "bearish harami": {
      label: "هارامي بيعي",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "شمعة صغيرة داخل جسم شمعة صاعدة كبيرة، وقد تشير إلى تراجع ضغط الشراء.",
      confirmation:
        "يحتاج كسر أدنى النموذج.",
      invalidation:
        "يُلغى باختراق أعلى النموذج.",
    },

    "three inside up": {
      label:
        "ثلاث شموع داخلية صاعدة",
      category: "CANDLESTICK",
      direction: "BULLISH",
      explanation:
        "تطور صاعد لنموذج هارامي، وتأتي الشمعة الثالثة لتأكيد تحسن المشترين.",
      confirmation:
        "يُفضّل اختراق أعلى النموذج.",
      invalidation:
        "يُلغى بكسر أدنى النموذج.",
    },

    "three inside down": {
      label:
        "ثلاث شموع داخلية هابطة",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "تطور هابط لنموذج هارامي، وتأتي الشمعة الثالثة لتأكيد تحسن البائعين.",
      confirmation:
        "يُفضّل كسر أدنى النموذج.",
      invalidation:
        "يُلغى باختراق أعلى النموذج.",
    },

    "two black gapping": {
      label:
        "فجوة الشمعتين الهابطتين",
      category: "CANDLESTICK",
      direction: "BEARISH",
      explanation:
        "نموذج هابط يظهر بعد فجوة ويتبعه ضغط بيع متتابع.",
      confirmation:
        "يتأكد باستمرار السعر أسفل منطقة الفجوة.",
      invalidation:
        "يضعف عند إغلاق الفجوة والعودة فوقها.",
    },
  };

function normalizeSymbol(
  value: unknown
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9.-]/g,
      ""
    )
    .slice(0, 10);
}

function normalizePatternName(
  value: unknown
) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeInterval(
  value: string | null
) {
  const parsed =
    Number.parseInt(
      String(value || ""),
      10
    );

  if (
    [
      15,
      30,
      60,
      240,
      1440,
    ].includes(parsed)
  ) {
    return parsed;
  }

  return 30;
}

function resolveResolution(
  interval: number
) {
  if (interval === 1440) {
    return {
      resolution: "D",
      effectiveInterval:
        1440,
      fallback: false,
    };
  }

  if (interval === 240) {
    return {
      resolution: "60",
      effectiveInterval: 60,
      fallback: true,
    };
  }

  return {
    resolution:
      String(interval),
    effectiveInterval:
      interval,
    fallback: false,
  };
}

function positiveNumber(
  value: unknown
) {
  const number =
    Number(value);

  return (
    Number.isFinite(number) &&
    number > 0
  )
    ? number
    : null;
}

function unixToIso(
  value: unknown
) {
  const timestamp =
    Number(value);

  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  ) {
    return null;
  }

  return new Date(
    timestamp * 1000
  ).toISOString();
}

function resolveDirection(
  definition:
    PatternDefinition,
  rawDirection: unknown
): PatternDirection {
  if (
    definition.direction !==
    "SOURCE"
  ) {
    return definition.direction;
  }

  const direction =
    String(rawDirection || "")
      .trim()
      .toLowerCase();

  if (direction === "bullish") {
    return "BULLISH";
  }

  if (direction === "bearish") {
    return "BEARISH";
  }

  return "NEUTRAL";
}

function resolveStatus(
  pattern: RawPattern
): PatternStatus {
  const mature =
    Number(
      pattern.mature || 0
    ) === 1;

  const status =
    String(
      pattern.status || ""
    )
      .trim()
      .toLowerCase();

  if (
    mature ||
    status === "complete"
  ) {
    return "COMPLETE";
  }

  return "FORMING";
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params =
      await context.params;

    const symbol =
      normalizeSymbol(
        params.symbol
      );

    if (!symbol) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "رمز السهم غير صالح.",
        },
        {
          status: 400,
        }
      );
    }

    const interval =
      normalizeInterval(
        request.nextUrl
          .searchParams
          .get("interval")
      );

    const {
      resolution,
      effectiveInterval,
      fallback,
    } =
      resolveResolution(
        interval
      );

    const cacheKey =
      `${symbol}:${resolution}`;

    const cached =
      cache.get(cacheKey);

    if (
      cached &&
      cached.expiresAt >
        Date.now()
    ) {
      return NextResponse.json({
        ...(cached.payload as object),
        cached: true,
      });
    }

    const apiKey =
      process.env
        .FINNHUB_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "مفتاح بيانات السوق غير موجود.",
        },
        {
          status: 500,
        }
      );
    }

    const url =
      "https://finnhub.io/api/v1/scan/pattern" +
      `?symbol=${encodeURIComponent(
        symbol
      )}` +
      `&resolution=${encodeURIComponent(
        resolution
      )}` +
      `&token=${encodeURIComponent(
        apiKey
      )}`;

    const response =
      await fetch(url, {
        cache: "no-store",
        signal:
          AbortSignal.timeout(
            15_000
          ),
      });

    const result =
      (await response.json()) as
        PatternResponse;

    if (
      !response.ok ||
      result.error
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.error ||
            `تعذر جلب النماذج: HTTP ${response.status}`,
        },
        {
          status:
            response.ok
              ? 502
              : response.status,
        }
      );
    }

    const rawPatterns =
      Array.isArray(
        result.points
      )
        ? result.points
        : [];

    const patterns =
      rawPatterns
        .map(
          (
            pattern,
            index
          ) => {
            const status =
              String(
                pattern.status ||
                ""
              )
                .trim()
                .toLowerCase();

            /*
             * لا نعرض النماذج الفاشلة.
             */
            if (
              status === "failed"
            ) {
              return null;
            }

            const name =
              normalizePatternName(
                pattern.patternname
              );

            const definition =
              CLASSIC_PATTERNS[
                name
              ] ||
              CANDLESTICK_PATTERNS[
                name
              ];

            if (!definition) {
              return null;
            }

            const detectedTimestamp =
              pattern.sortTime ||
              pattern.end_time ||
              pattern.dtime ||
              pattern.atime ||
              0;

            return {
              id: [
                symbol,
                interval,
                name,
                detectedTimestamp,
                index,
              ].join(":"),

              name,
              label:
                definition.label,
              category:
                definition.category,
              direction:
                resolveDirection(
                  definition,
                  pattern.patterntype
                ),
              status:
                resolveStatus(
                  pattern
                ),

              explanation:
                definition
                  .explanation,
              confirmation:
                definition
                  .confirmation,
              invalidation:
                definition
                  .invalidation,

              detectedAt:
                unixToIso(
                  detectedTimestamp
                ),

              entry:
                positiveNumber(
                  pattern.entry
                ),
              target1:
                positiveNumber(
                  pattern.profit1
                ),
              target2:
                positiveNumber(
                  pattern.profit2
                ),
              stopLoss:
                positiveNumber(
                  pattern.stoploss
                ),

              startPrice:
                positiveNumber(
                  pattern.start_price
                ) ||
                positiveNumber(
                  pattern.aprice
                ),

              endPrice:
                positiveNumber(
                  pattern.end_price
                ) ||
                positiveNumber(
                  pattern.dprice
                ),
            };
          }
        )
        .filter(
          (
            pattern
          ): pattern is NonNullable<
            typeof pattern
          > => Boolean(pattern)
        )
        .sort((first, second) => {
          const firstTime =
            first.detectedAt
              ? new Date(
                  first.detectedAt
                ).getTime()
              : 0;

          const secondTime =
            second.detectedAt
              ? new Date(
                  second.detectedAt
                ).getTime()
              : 0;

          return (
            secondTime -
            firstTime
          );
        })
        .slice(0, 20);

    const classicPatterns =
      patterns.filter(
        (pattern) =>
          pattern.category ===
          "CLASSIC"
      );

    const candlestickPatterns =
      patterns.filter(
        (pattern) =>
          pattern.category ===
          "CANDLESTICK"
      );

    const payload = {
      ok: true,
      symbol,
      requestedInterval:
        interval,
      effectiveInterval,
      resolution,
      fallback,
      fallbackMessage:
        fallback
          ? "اكتشاف النماذج على فريم 4H غير متاح مباشرة؛ المعروض هو فريم 1H."
          : null,

      classicPatterns,
      candlestickPatterns,

      counts: {
        classic:
          classicPatterns.length,
        candlestick:
          candlestickPatterns.length,
        complete:
          patterns.filter(
            (pattern) =>
              pattern.status ===
              "COMPLETE"
          ).length,
        forming:
          patterns.filter(
            (pattern) =>
              pattern.status ===
              "FORMING"
          ).length,
      },

      updatedAt:
        new Date()
          .toISOString(),
      cached: false,
    };

    cache.set(
      cacheKey,
      {
        expiresAt:
          Date.now() +
          CACHE_TTL_MS,
        payload,
      }
    );

    return NextResponse.json(
      payload
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحميل النماذج الفنية.",
      },
      {
        status: 500,
      }
    );
  }
}
