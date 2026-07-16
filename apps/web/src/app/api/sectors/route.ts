import {
  getOrSetCache,
} from "../../../lib/market-cache";

import {
  createAdminClient,
} from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompanyDefinition = {
  symbol: string;
  name: string;
};

type SectorDefinition = {
  symbol: string;
  name: string;
  icon: string;
  companies: CompanyDefinition[];
};

type Trend =
  | "UP"
  | "DOWN"
  | "FLAT";

type CachedBar = {
  c: number;
  v: number;
  t: number;
};

type MarketMetrics = {
  symbol: string;
  price: number;
  dailyChangePct: number;
  fiveDayChangePct: number;
  relativeStrengthPct: number;
  volumeRatio: number;
  strengthScore: number;
  status: string;
  trend: Trend;
  flowState: string;
  dataAvailable: boolean;
  dataError: string | null;
  cachedAt: string | null;
};

type SectorItem =
  MarketMetrics & {
    name: string;
    icon: string;
    rank: number;
    rotationScore: number;
    companies: CompanyDefinition[];
  };

type CompanyItem =
  MarketMetrics &
  CompanyDefinition & {
    rank: number;
  };

type FinnhubQuote = {
  c?: number;
};

type CachedBarsRow = {
  symbol: string;
  bars: unknown;
  updated_at: string;
};

const FINNHUB_ORIGIN =
  "https://finnhub.io/api/v1";

const SECTORS: SectorDefinition[] = [
  {
    symbol: "XLK",
    name: "التكنولوجيا",
    icon: "💻",
    companies: [
      { symbol: "AAPL", name: "آبل" },
      { symbol: "MSFT", name: "مايكروسوفت" },
      { symbol: "NVDA", name: "إنفيديا" },
      { symbol: "AVGO", name: "برودكوم" },
    ],
  },
  {
    symbol: "SOXX",
    name: "أشباه الموصلات",
    icon: "🧩",
    companies: [
      { symbol: "NVDA", name: "إنفيديا" },
      { symbol: "AVGO", name: "برودكوم" },
      { symbol: "AMD", name: "إيه إم دي" },
      { symbol: "QCOM", name: "كوالكوم" },
      { symbol: "MU", name: "ميكرون" },
    ],
  },
  {
    symbol: "XLF",
    name: "البنوك والخدمات المالية",
    icon: "🏦",
    companies: [
      { symbol: "JPM", name: "جي بي مورغان" },
      { symbol: "BAC", name: "بنك أوف أمريكا" },
      { symbol: "GS", name: "غولدمان ساكس" },
      { symbol: "MS", name: "مورغان ستانلي" },
      { symbol: "V", name: "فيزا" },
      { symbol: "MA", name: "ماستركارد" },
    ],
  },
  {
    symbol: "XLE",
    name: "الطاقة",
    icon: "⛽",
    companies: [
      { symbol: "XOM", name: "إكسون موبيل" },
      { symbol: "CVX", name: "شيفرون" },
      { symbol: "COP", name: "كونوكو فيليبس" },
      { symbol: "SLB", name: "شلمبرجير" },
    ],
  },
  {
    symbol: "XLV",
    name: "الرعاية الصحية",
    icon: "🏥",
    companies: [
      { symbol: "LLY", name: "إيلي ليلي" },
      { symbol: "UNH", name: "يونايتد هيلث" },
      { symbol: "JNJ", name: "جونسون آند جونسون" },
      { symbol: "ABBV", name: "آبفي" },
    ],
  },
  {
    symbol: "XLI",
    name: "الصناعات",
    icon: "🏭",
    companies: [
      { symbol: "GE", name: "جي إي إيروسبيس" },
      { symbol: "CAT", name: "كاتربيلر" },
      { symbol: "HON", name: "هانيويل" },
      { symbol: "BA", name: "بوينغ" },
    ],
  },
  {
    symbol: "XLY",
    name: "السلع الاستهلاكية الكمالية",
    icon: "🛒",
    companies: [
      { symbol: "AMZN", name: "أمازون" },
      { symbol: "TSLA", name: "تسلا" },
      { symbol: "HD", name: "هوم ديبوت" },
      { symbol: "MCD", name: "ماكدونالدز" },
    ],
  },
  {
    symbol: "XLP",
    name: "السلع الاستهلاكية الأساسية",
    icon: "🥤",
    companies: [
      { symbol: "COST", name: "كوستكو" },
      { symbol: "WMT", name: "وولمارت" },
      { symbol: "KO", name: "كوكاكولا" },
      { symbol: "PG", name: "بروكتر آند غامبل" },
      { symbol: "PEP", name: "بيبسيكو" },
    ],
  },
  {
    symbol: "XLC",
    name: "خدمات الاتصالات",
    icon: "📡",
    companies: [
      { symbol: "META", name: "ميتا" },
      { symbol: "GOOGL", name: "ألفابت" },
      { symbol: "NFLX", name: "نتفليكس" },
      { symbol: "CMCSA", name: "كومكاست" },
    ],
  },
  {
    symbol: "XLB",
    name: "المواد الأساسية",
    icon: "🧱",
    companies: [
      { symbol: "LIN", name: "ليندي" },
      { symbol: "SHW", name: "شيروين ويليامز" },
      { symbol: "FCX", name: "فريبورت ماكموران" },
    ],
  },
  {
    symbol: "XLRE",
    name: "العقارات",
    icon: "🏢",
    companies: [
      { symbol: "PLD", name: "برولوجيس" },
      { symbol: "AMT", name: "أمريكان تاور" },
      { symbol: "O", name: "ريالتي إنكم" },
    ],
  },
  {
    symbol: "XLU",
    name: "المرافق",
    icon: "⚡",
    companies: [
      { symbol: "NEE", name: "نكست إيرا إنرجي" },
      { symbol: "SO", name: "ساذرن كومباني" },
      { symbol: "DUK", name: "ديوك إنرجي" },
    ],
  },
];

function num(
  value: unknown,
  fallback = 0
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function round(
  value: number,
  digits = 2
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
) {
  return Math.min(
    Math.max(
      value,
      minimum
    ),
    maximum
  );
}

function percentChange(
  current: number,
  previous: number
) {
  return previous > 0
    ? ((current - previous) /
        previous) *
        100
    : 0;
}

function statusLabel(
  score: number,
  available: boolean
) {
  if (!available) {
    return "بيانات غير متاحة";
  }

  if (score >= 80) {
    return "قوي جدًا";
  }

  if (score >= 65) {
    return "إيجابي";
  }

  if (score >= 45) {
    return "محايد";
  }

  if (score >= 30) {
    return "ضعيف";
  }

  return "ضعيف جدًا";
}

function flowState(
  score: number,
  available: boolean
) {
  if (!available) {
    return "غير متاح";
  }

  if (score >= 1.5) {
    return "دخول سيولة نسبي قوي";
  }

  if (score >= 0.45) {
    return "دخول سيولة نسبي";
  }

  if (score <= -1.5) {
    return "خروج سيولة نسبي قوي";
  }

  if (score <= -0.45) {
    return "خروج سيولة نسبي";
  }

  return "تدفق متوازن";
}

function calculateRotationScore(
  metrics: Pick<
    MarketMetrics,
    | "dailyChangePct"
    | "fiveDayChangePct"
    | "relativeStrengthPct"
    | "volumeRatio"
  >
) {
  return round(
    metrics.relativeStrengthPct *
      0.55 +
      metrics.fiveDayChangePct *
        0.28 +
      metrics.dailyChangePct *
        0.17 +
      clamp(
        (metrics.volumeRatio - 1) *
          1.4,
        -1.2,
        1.4
      ),
    3
  );
}

function normalizeBars(
  value: unknown
): CachedBar[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return null;
      }

      const row =
        item as Record<
          string,
          unknown
        >;

      const close =
        num(row.c);

      const timestamp =
        num(row.t);

      if (
        close <= 0 ||
        timestamp <= 0
      ) {
        return null;
      }

      return {
        c: close,
        v: num(row.v),
        t: timestamp,
      };
    })
    .filter(
      (
        item
      ): item is CachedBar =>
        item !== null
    )
    .sort(
      (left, right) =>
        left.t -
        right.t
    );
}

function unavailableMetrics(
  symbol: string,
  error: string,
  cachedAt: string | null
): MarketMetrics {
  return {
    symbol,
    price: 0,
    dailyChangePct: 0,
    fiveDayChangePct: 0,
    relativeStrengthPct: 0,
    volumeRatio: 0,
    strengthScore: 0,
    status:
      statusLabel(
        0,
        false
      ),
    trend: "FLAT",
    flowState:
      "غير متاح",
    dataAvailable: false,
    dataError: error,
    cachedAt,
  };
}

function isLatestBarToday(
  timestamp: number
) {
  const barDate =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(
      new Date(timestamp)
    );

  const today =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(
      new Date()
    );

  return barDate === today;
}

function buildMetrics(
  symbol: string,
  bars: CachedBar[],
  currentPrice: number,
  cachedAt: string | null,
  benchmarkFiveDayChangePct = 0
): MarketMetrics {
  if (bars.length < 6) {
    return unavailableMetrics(
      symbol,
      "لا توجد جلسات محفوظة كافية.",
      cachedAt
    );
  }

  const latest =
    bars[bars.length - 1];

  const previous =
    bars[bars.length - 2];

  const fiveDayReference =
    bars[bars.length - 6];

  const price =
    currentPrice > 0
      ? currentPrice
      : latest.c;

  const dailyReference =
    isLatestBarToday(
      latest.t
    )
      ? previous.c
      : latest.c;

  const dailyChangePct =
    round(
      percentChange(
        price,
        dailyReference
      )
    );

  const fiveDayChangePct =
    round(
      percentChange(
        price,
        fiveDayReference.c
      )
    );

  const previousVolumes =
    bars
      .slice(
        Math.max(
          0,
          bars.length - 21
        ),
        bars.length - 1
      )
      .map(
        (bar) =>
          bar.v
      )
      .filter(
        (volume) =>
          volume > 0
      );

  const averageVolume =
    previousVolumes.length > 0
      ? previousVolumes.reduce(
          (
            sum,
            volume
          ) =>
            sum + volume,
          0
        ) /
        previousVolumes.length
      : 0;

  const volumeRatio =
    averageVolume > 0
      ? round(
          latest.v /
            averageVolume
        )
      : 0;

  const relativeStrengthPct =
    round(
      fiveDayChangePct -
        benchmarkFiveDayChangePct
    );

  const volumeImpact =
    clamp(
      (volumeRatio - 1) *
        9,
      -8,
      10
    );

  const strengthScore =
    clamp(
      Math.round(
        50 +
          dailyChangePct *
            8 +
          fiveDayChangePct *
            4 +
          relativeStrengthPct *
            6 +
          volumeImpact
      ),
      0,
      100
    );

  const metrics = {
    symbol,
    price:
      round(
        price
      ),
    dailyChangePct,
    fiveDayChangePct,
    relativeStrengthPct,
    volumeRatio,
    strengthScore,
    status:
      statusLabel(
        strengthScore,
        true
      ),
    trend:
      dailyChangePct >
      0.05
        ? ("UP" as const)
        : dailyChangePct <
            -0.05
          ? ("DOWN" as const)
          : ("FLAT" as const),
    dataAvailable: true,
    dataError: null,
    cachedAt,
  };

  return {
    ...metrics,
    flowState:
      flowState(
        calculateRotationScore(
          metrics
        ),
        true
      ),
  };
}

async function readBarsCache(
  symbols: string[]
) {
  const supabase =
    createAdminClient();

  const uniqueSymbols =
    Array.from(
      new Set(
        symbols.map(
          (symbol) =>
            symbol
              .trim()
              .toUpperCase()
        )
      )
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "market_sector_bars_cache"
      )
      .select(
        "symbol,bars,updated_at"
      )
      .in(
        "symbol",
        uniqueSymbols
      );

  if (error) {
    throw new Error(
      `تعذر قراءة كاش القطاعات: ${error.message}`
    );
  }

  const map =
    new Map<
      string,
      {
        bars: CachedBar[];
        updatedAt: string;
      }
    >();

  for (
    const row of
      (data ?? []) as CachedBarsRow[]
  ) {
    map.set(
      row.symbol.toUpperCase(),
      {
        bars:
          normalizeBars(
            row.bars
          ),
        updatedAt:
          row.updated_at,
      }
    );
  }

  return map;
}

async function fetchFinnhubPrice(
  symbol: string
) {
  const apiKey =
    process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return 0;
  }

  const url =
    `${FINNHUB_ORIGIN}/quote` +
    `?symbol=${encodeURIComponent(
      symbol
    )}` +
    `&token=${encodeURIComponent(
      apiKey
    )}`;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      6_000
    );

  try {
    const response =
      await fetch(
        url,
        {
          cache: "no-store",
          signal:
            controller.signal,
        }
      );

    if (!response.ok) {
      return 0;
    }

    const quote =
      (await response.json()) as
        FinnhubQuote;

    const price =
      num(quote.c);

    return price > 0
      ? price
      : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(
      timeout
    );
  }
}

function getFinnhubPrice(
  symbol: string
) {
  return getOrSetCache<number>(
    `sector-price:v10:${symbol}`,
    {
      ttlMs: 60_000,
      staleMs:
        5 * 60_000,
    },
    () =>
      fetchFinnhubPrice(
        symbol
      )
  );
}

async function mapLimit<
  T,
  R
>(
  items: T[],
  concurrency: number,
  worker: (
    item: T
  ) => Promise<R>
) {
  const results =
    new Array<R>(
      items.length
    );

  let nextIndex = 0;

  async function run() {
    while (true) {
      const index =
        nextIndex;

      nextIndex += 1;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index]
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            Math.max(
              items.length,
              1
            )
          ),
      },
      () => run()
    )
  );

  return results;
}

async function getPrices(
  symbols: string[]
) {
  const uniqueSymbols =
    Array.from(
      new Set(
        symbols.map(
          (symbol) =>
            symbol
              .trim()
              .toUpperCase()
        )
      )
    );

  const pairs =
    await mapLimit(
      uniqueSymbols,
      6,
      async (
        symbol
      ) =>
        [
          symbol,
          await getFinnhubPrice(
            symbol
          ),
        ] as const
    );

  return new Map<
    string,
    number
  >(pairs);
}

function sortByStrength<
  T extends {
    dataAvailable: boolean;
    strengthScore: number;
    relativeStrengthPct: number;
  }
>(
  items: T[]
) {
  return [...items].sort(
    (
      left,
      right
    ) => {
      if (
        left.dataAvailable !==
        right.dataAvailable
      ) {
        return left.dataAvailable
          ? -1
          : 1;
      }

      if (
        right.strengthScore !==
        left.strengthScore
      ) {
        return (
          right.strengthScore -
          left.strengthScore
        );
      }

      return (
        right.relativeStrengthPct -
        left.relativeStrengthPct
      );
    }
  );
}

async function loadOverview() {
  const symbols = [
    "SPY",
    ...SECTORS.map(
      (sector) =>
        sector.symbol
    ),
  ];

  const [
    barsMap,
    prices,
  ] =
    await Promise.all([
      readBarsCache(
        symbols
      ),
      getPrices(
        symbols
      ),
    ]);

  const spyCache =
    barsMap.get("SPY");

  const benchmark =
    buildMetrics(
      "SPY",
      spyCache?.bars ??
        [],
      prices.get("SPY") ??
        0,
      spyCache?.updatedAt ??
        null,
      0
    );

  if (
    !benchmark.dataAvailable
  ) {
    throw new Error(
      "كاش SPY غير جاهز. شغّل seed-sector-cache.py أولًا."
    );
  }

  const sectors =
    sortByStrength(
      SECTORS.map(
        (definition) => {
          const cached =
            barsMap.get(
              definition.symbol
            );

          const metrics =
            buildMetrics(
              definition.symbol,
              cached?.bars ??
                [],
              prices.get(
                definition.symbol
              ) ?? 0,
              cached?.updatedAt ??
                null,
              benchmark
                .fiveDayChangePct
            );

          return {
            ...metrics,
            name:
              definition.name,
            icon:
              definition.icon,
            companies:
              definition.companies,
            rank: 0,
            rotationScore:
              metrics.dataAvailable
                ? calculateRotationScore(
                    metrics
                  )
                : -999,
          };
        }
      )
    ).map(
      (
        sector,
        index
      ) => ({
        ...sector,
        rank:
          index + 1,
      })
    );

  const availableSectors =
    sectors.filter(
      (sector) =>
        sector.dataAvailable
    );

  const risingCount =
    availableSectors.filter(
      (sector) =>
        sector.trend ===
        "UP"
    ).length;

  const fallingCount =
    availableSectors.filter(
      (sector) =>
        sector.trend ===
        "DOWN"
    ).length;

  const flatCount =
    availableSectors.length -
    risingCount -
    fallingCount;

  const breadthDifference =
    risingCount -
    fallingCount;

  const breadthLabel =
    breadthDifference >= 5
      ? "اتساع السوق إيجابي قوي"
      : breadthDifference >= 2
        ? "اتساع السوق إيجابي"
        : breadthDifference <= -5
          ? "اتساع السوق سلبي قوي"
          : breadthDifference <= -2
            ? "اتساع السوق سلبي"
            : "اتساع السوق متوازن";

  const rotationSorted =
    [...availableSectors].sort(
      (
        left,
        right
      ) =>
        right.rotationScore -
        left.rotationScore
    );

  const rotationTo =
    rotationSorted[0] ??
    null;

  const rotationFrom =
    rotationSorted[
      rotationSorted.length -
        1
    ] ?? null;

  const rotationSpread =
    rotationTo &&
    rotationFrom
      ? round(
          rotationTo.rotationScore -
            rotationFrom.rotationScore,
          2
        )
      : 0;

  return {
    ok: true,
    updatedAt:
      new Date().toISOString(),
    benchmark,
    summary: {
      requestedCount:
        SECTORS.length,
      availableCount:
        availableSectors.length,
      risingCount,
      fallingCount,
      flatCount,
      breadthLabel,
      strongest:
        availableSectors[0] ??
        null,
      weakest:
        availableSectors[
          availableSectors.length -
            1
        ] ?? null,
    },
    rotation: {
      label:
        rotationSpread >= 2.5
          ? "دوران قطاعي واضح"
          : rotationSpread >= 1
            ? "دوران قطاعي متوسط"
            : "دوران قطاعي محدود",
      from:
        rotationFrom,
      to:
        rotationTo,
      confidence:
        rotationSpread >= 5
          ? "مرتفعة"
          : rotationSpread >= 2.5
            ? "متوسطة"
            : "ضعيفة",
      spread:
        rotationSpread,
      explanation:
        rotationTo &&
        rotationFrom &&
        rotationTo.symbol !==
          rotationFrom.symbol
          ? `تُظهر المقارنة النسبية أن الأموال تميل إلى الخروج من ${rotationFrom.name} (${rotationFrom.symbol}) والتوجه نحو ${rotationTo.name} (${rotationTo.symbol}). يعتمد التقدير على تغير اليوم، أداء خمس جلسات، التفوق على SPY، ونشاط الحجم.`
          : "لا تتوفر بيانات كافية لتحديد حركة الأموال بين القطاعات.",
    },
    sectors,
    failed:
      sectors
        .filter(
          (sector) =>
            !sector.dataAvailable
        )
        .map(
          (sector) => ({
            symbol:
              sector.symbol,
            error:
              sector.dataError ||
              "بيانات غير متاحة",
          })
        ),
  };
}

async function getOverview() {
  return getOrSetCache(
    "sector-overview:v11-live-worker",
    {
      ttlMs:
        60_000,
      staleMs:
        10 * 60_000,
    },
    loadOverview
  );
}

async function loadDetail(
  symbol: string
) {
  const definition =
    SECTORS.find(
      (sector) =>
        sector.symbol ===
        symbol
    );

  if (!definition) {
    throw new Error(
      "رمز القطاع غير مدعوم."
    );
  }

  const overview =
    await getOverview();

  const sector =
    overview.sectors.find(
      (
        item: SectorItem
      ) =>
        item.symbol ===
        symbol
    );

  if (!sector) {
    throw new Error(
      "تعذر تحميل القطاع."
    );
  }

  const companySymbols =
    definition.companies.map(
      (company) =>
        company.symbol
    );

  const [
    barsMap,
    prices,
  ] =
    await Promise.all([
      readBarsCache(
        companySymbols
      ),
      getPrices(
        companySymbols
      ),
    ]);

  const companies =
    sortByStrength(
      definition.companies.map(
        (company) => {
          const cached =
            barsMap.get(
              company.symbol
            );

          const metrics =
            buildMetrics(
              company.symbol,
              cached?.bars ??
                [],
              prices.get(
                company.symbol
              ) ?? 0,
              cached?.updatedAt ??
                null,
              overview.benchmark
                .fiveDayChangePct
            );

          return {
            ...company,
            ...metrics,
            rank: 0,
          };
        }
      )
    ).map(
      (
        company,
        index
      ) => ({
        ...company,
        rank:
          index + 1,
      })
    );

  const availableCompanies =
    companies.filter(
      (company) =>
        company.dataAvailable
    );

  const risingCount =
    availableCompanies.filter(
      (company) =>
        company.trend ===
        "UP"
    ).length;

  const fallingCount =
    availableCompanies.filter(
      (company) =>
        company.trend ===
        "DOWN"
    ).length;

  const averageDailyChangePct =
    availableCompanies.length >
    0
      ? round(
          availableCompanies.reduce(
            (
              sum,
              company
            ) =>
              sum +
              company.dailyChangePct,
            0
          ) /
            availableCompanies.length
        )
      : 0;

  const averageFiveDayChangePct =
    availableCompanies.length >
    0
      ? round(
          availableCompanies.reduce(
            (
              sum,
              company
            ) =>
              sum +
              company.fiveDayChangePct,
            0
          ) /
            availableCompanies.length
        )
      : 0;

  return {
    ok: true,
    updatedAt:
      new Date().toISOString(),
    sector,
    benchmark:
      overview.benchmark,
    companies,
    leaders:
      availableCompanies.slice(
        0,
        3
      ),
    laggards:
      [...availableCompanies]
        .reverse()
        .slice(0, 3),
    summary: {
      requestedCompanies:
        definition.companies.length,
      availableCompanies:
        availableCompanies.length,
      risingCount,
      fallingCount,
      strongestCompany:
        availableCompanies[0] ??
        null,
      weakestCompany:
        availableCompanies[
          availableCompanies.length -
            1
        ] ?? null,
      averageDailyChangePct,
      averageFiveDayChangePct,
    },
    failed:
      companies
        .filter(
          (company) =>
            !company.dataAvailable
        )
        .map(
          (company) => ({
            symbol:
              company.symbol,
            error:
              company.dataError ||
              "بيانات غير متاحة",
          })
        ),
  };
}

export async function GET(
  request: Request
) {
  try {
    const url =
      new URL(
        request.url
      );

    const symbol =
      String(
        url.searchParams.get(
          "symbol"
        ) ?? ""
      )
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z.-]/g,
          ""
        );

    const data = symbol
      ? await getOrSetCache(
          `sector-detail:v11-live-worker:${symbol}`,
          {
            ttlMs:
              60_000,
            staleMs:
              10 * 60_000,
          },
          () =>
            loadDetail(
              symbol
            )
        )
      : await getOverview();

    return Response.json(
      data,
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "خطأ غير معروف";

    return Response.json(
      {
        ok: false,
        error:
          message ===
          "رمز القطاع غير مدعوم."
            ? message
            : "تعذر تحميل بيانات القطاعات.",
        details:
          message,
      },
      {
        status:
          message ===
          "رمز القطاع غير مدعوم."
            ? 404
            : 500,
      }
    );
  }
}
