import {
  getOrSetCache,
} from "../../../lib/market-cache";

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

type MassiveBar = {
  c?: number;
  v?: number;
  t?: number;
};

type MassiveResponse = {
  results?: MassiveBar[];
  error?: string;
  message?: string;
};

type Trend = "UP" | "DOWN" | "FLAT";

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
};

type SectorItem = MarketMetrics & {
  name: string;
  icon: string;
  rank: number;
  rotationScore: number;
  companies: CompanyDefinition[];
};

type CompanyItem = MarketMetrics &
  CompanyDefinition & {
    rank: number;
  };

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

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function percentChange(current: number, previous: number) {
  return previous > 0
    ? ((current - previous) / previous) * 100
    : 0;
}

function statusLabel(score: number, available: boolean) {
  if (!available) return "بيانات غير متاحة";
  if (score >= 80) return "قوي جدًا";
  if (score >= 65) return "إيجابي";
  if (score >= 45) return "محايد";
  if (score >= 30) return "ضعيف";
  return "ضعيف جدًا";
}

function flowState(score: number, available: boolean) {
  if (!available) return "غير متاح";
  if (score >= 1.5) return "دخول سيولة نسبي قوي";
  if (score >= 0.45) return "دخول سيولة نسبي";
  if (score <= -1.5) return "خروج سيولة نسبي قوي";
  if (score <= -0.45) return "خروج سيولة نسبي";
  return "تدفق متوازن";
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
}

async function fetchBarsDirect(
  symbol: string,
  apiKey: string
): Promise<MassiveBar[]> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 55);

  const url =
    `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(
      symbol
    )}/range/1/day/${dateKey(from)}/${dateKey(to)}` +
    `?adjusted=true&sort=asc&limit=120&apiKey=${encodeURIComponent(
      apiKey
    )}`;

  let lastError = `تعذر تحميل ${symbol}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      20_000
    );

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      const payload =
        (await response.json()) as MassiveResponse;

      if (response.ok) {
        const bars = (payload.results ?? [])
          .filter(
            (bar) =>
              num(bar.c) > 0 &&
              num(bar.t) > 0
          )
          .sort(
            (left, right) =>
              num(left.t) - num(right.t)
          );

        if (bars.length >= 2) {
          return bars;
        }

        lastError =
          `لا توجد جلسات كافية لتحليل ${symbol}`;
      } else {
        lastError =
          payload.error ||
          payload.message ||
          `تعذر تحميل ${symbol} برمز HTTP ${response.status}`;

        if (
          response.status !== 429 &&
          response.status < 500
        ) {
          break;
        }
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : lastError;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < 4) {
      await sleep(attempt * 900);
    }
  }

  throw new Error(lastError);
}

async function getBars(
  symbol: string,
  apiKey: string
) {
  return getOrSetCache<MassiveBar[]>(
    `sector-bars:v4-individual:${symbol}`,
    {
      ttlMs: 2 * 60_000,
      staleMs: 30 * 60_000,
    },
    () =>
      fetchBarsDirect(
        symbol,
        apiKey
      )
  );
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
    metrics.relativeStrengthPct * 0.55 +
      metrics.fiveDayChangePct * 0.28 +
      metrics.dailyChangePct * 0.17 +
      clamp(
        (metrics.volumeRatio - 1) * 1.4,
        -1.2,
        1.4
      ),
    3
  );
}

function unavailableMetrics(
  symbol: string,
  error: string
): MarketMetrics {
  return {
    symbol,
    price: 0,
    dailyChangePct: 0,
    fiveDayChangePct: 0,
    relativeStrengthPct: 0,
    volumeRatio: 0,
    strengthScore: 0,
    status: statusLabel(0, false),
    trend: "FLAT",
    flowState: "غير متاح",
    dataAvailable: false,
    dataError: error,
  };
}

function buildMetrics(
  symbol: string,
  bars: MassiveBar[],
  benchmarkFiveDayChangePct = 0
): MarketMetrics {
  if (bars.length < 2) {
    return unavailableMetrics(
      symbol,
      "لا توجد جلسات كافية."
    );
  }

  const latest =
    bars[bars.length - 1];

  const previous =
    bars[bars.length - 2];

  const fiveDayReference =
    bars[
      Math.max(
        0,
        bars.length - 6
      )
    ];

  const price =
    num(latest.c);

  if (price <= 0) {
    return unavailableMetrics(
      symbol,
      "السعر الحالي غير متاح."
    );
  }

  const dailyChangePct = round(
    percentChange(
      price,
      num(previous.c)
    )
  );

  const fiveDayChangePct = round(
    percentChange(
      price,
      num(fiveDayReference.c)
    )
  );

  const priorVolumes = bars
    .slice(
      Math.max(
        0,
        bars.length - 21
      ),
      bars.length - 1
    )
    .map((bar) =>
      num(bar.v)
    )
    .filter(
      (volume) =>
        volume > 0
    );

  const averageVolume =
    priorVolumes.length > 0
      ? priorVolumes.reduce(
          (sum, volume) =>
            sum + volume,
          0
        ) /
        priorVolumes.length
      : 0;

  const volumeRatio =
    averageVolume > 0
      ? round(
          num(latest.v) /
            averageVolume
        )
      : 0;

  const relativeStrengthPct = round(
    fiveDayChangePct -
      benchmarkFiveDayChangePct
  );

  const volumeImpact = clamp(
    (volumeRatio - 1) * 9,
    -8,
    10
  );

  const strengthScore = clamp(
    Math.round(
      50 +
        dailyChangePct * 8 +
        fiveDayChangePct * 4 +
        relativeStrengthPct * 6 +
        volumeImpact
    ),
    0,
    100
  );

  const baseMetrics = {
    symbol,
    price: round(price),
    dailyChangePct,
    fiveDayChangePct,
    relativeStrengthPct,
    volumeRatio,
    strengthScore,
    status: statusLabel(
      strengthScore,
      true
    ),
    trend:
      dailyChangePct > 0.05
        ? ("UP" as const)
        : dailyChangePct < -0.05
          ? ("DOWN" as const)
          : ("FLAT" as const),
    dataAvailable: true,
    dataError: null,
  };

  return {
    ...baseMetrics,
    flowState: flowState(
      calculateRotationScore(
        baseMetrics
      ),
      true
    ),
  };
}

function sortByStrength<
  T extends {
    dataAvailable: boolean;
    strengthScore: number;
    relativeStrengthPct: number;
  }
>(items: T[]) {
  return [...items].sort(
    (left, right) => {
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
  const apiKey =
    process.env.MASSIVE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "MASSIVE_API_KEY غير موجود."
    );
  }

  const spyBars =
    await getBars(
      "SPY",
      apiKey
    );

  const benchmark =
    buildMetrics(
      "SPY",
      spyBars,
      0
    );

  if (!benchmark.dataAvailable) {
    throw new Error(
      "تعذر تحميل بيانات SPY المرجعية."
    );
  }

  const rawSectors: SectorItem[] = [];

  for (
    let index = 0;
    index < SECTORS.length;
    index += 1
  ) {
    const definition =
      SECTORS[index];

    try {
      const bars =
        await getBars(
          definition.symbol,
          apiKey
        );

      const metrics =
        buildMetrics(
          definition.symbol,
          bars,
          benchmark.fiveDayChangePct
        );

      rawSectors.push({
        ...metrics,
        name: definition.name,
        icon: definition.icon,
        companies:
          definition.companies,
        rank: 0,
        rotationScore:
          metrics.dataAvailable
            ? calculateRotationScore(
                metrics
              )
            : -999,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذر تحميل القطاع.";

      const metrics =
        unavailableMetrics(
          definition.symbol,
          message
        );

      rawSectors.push({
        ...metrics,
        name: definition.name,
        icon: definition.icon,
        companies:
          definition.companies,
        rank: 0,
        rotationScore: -999,
      });
    }

    if (
      index <
      SECTORS.length - 1
    ) {
      await sleep(350);
    }
  }

  const sectors =
    sortByStrength(
      rawSectors
    ).map(
      (sector, index) => ({
        ...sector,
        rank: index + 1,
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
        sector.trend === "UP"
    ).length;

  const fallingCount =
    availableSectors.filter(
      (sector) =>
        sector.trend === "DOWN"
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
      (left, right) =>
        right.rotationScore -
        left.rotationScore
    );

  const rotationTo =
    rotationSorted[0] ?? null;

  const rotationFrom =
    rotationSorted[
      rotationSorted.length - 1
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

  const confidence =
    rotationSpread >= 5
      ? "مرتفعة"
      : rotationSpread >= 2.5
        ? "متوسطة"
        : "ضعيفة";

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
      from: rotationFrom,
      to: rotationTo,
      confidence,
      spread: rotationSpread,
      explanation:
        rotationTo &&
        rotationFrom &&
        rotationTo.symbol !==
          rotationFrom.symbol
          ? `تُظهر المقارنة النسبية أن الأموال تميل إلى الخروج من ${rotationFrom.name} (${rotationFrom.symbol}) والتوجه نحو ${rotationTo.name} (${rotationTo.symbol}). يعتمد التقدير على تغير اليوم، أداء خمس جلسات، التفوق على SPY، ونشاط الحجم.`
          : "لا تتوفر بيانات كافية لتحديد حركة الأموال بين القطاعات.",
    },
    sectors,
    failed: sectors
      .filter(
        (sector) =>
          !sector.dataAvailable
      )
      .map((sector) => ({
        symbol: sector.symbol,
        error:
          sector.dataError ||
          "بيانات غير متاحة",
      })),
    meta: {
      disclaimer:
        "حركة الأموال تقدير نسبي مبني على السعر والزخم والحجم، وليست قياسًا مباشرًا لصافي تدفقات الصناديق.",
    },
  };
}

async function loadDetail(
  symbol: string
) {
  const definition =
    SECTORS.find(
      (sector) =>
        sector.symbol === symbol
    );

  if (!definition) {
    throw new Error(
      "رمز القطاع غير مدعوم."
    );
  }

  const overview =
    await getOrSetCache(
      "sector-overview:v4-individual",
      {
        ttlMs: 2 * 60_000,
        staleMs:
          30 * 60_000,
      },
      loadOverview
    );

  const sector =
    overview.sectors.find(
      (item: SectorItem) =>
        item.symbol === symbol
    );

  if (!sector) {
    throw new Error(
      "تعذر تحميل القطاع."
    );
  }

  const apiKey =
    process.env.MASSIVE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "MASSIVE_API_KEY غير موجود."
    );
  }

  const companies: CompanyItem[] = [];

  for (
    let index = 0;
    index <
    definition.companies.length;
    index += 1
  ) {
    const company =
      definition.companies[index];

    try {
      const bars =
        await getBars(
          company.symbol,
          apiKey
        );

      const metrics =
        buildMetrics(
          company.symbol,
          bars,
          overview.benchmark
            .fiveDayChangePct
        );

      companies.push({
        ...company,
        ...metrics,
        rank: 0,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "تعذر تحميل الشركة.";

      companies.push({
        ...company,
        ...unavailableMetrics(
          company.symbol,
          message
        ),
        rank: 0,
      });
    }

    if (
      index <
      definition.companies.length -
        1
    ) {
      await sleep(350);
    }
  }

  const sortedCompanies =
    sortByStrength(
      companies
    ).map(
      (company, index) => ({
        ...company,
        rank: index + 1,
      })
    );

  const availableCompanies =
    sortedCompanies.filter(
      (company) =>
        company.dataAvailable
    );

  const risingCount =
    availableCompanies.filter(
      (company) =>
        company.trend === "UP"
    ).length;

  const fallingCount =
    availableCompanies.filter(
      (company) =>
        company.trend === "DOWN"
    ).length;

  const averageDailyChangePct =
    availableCompanies.length > 0
      ? round(
          availableCompanies.reduce(
            (sum, company) =>
              sum +
              company.dailyChangePct,
            0
          ) /
            availableCompanies.length
        )
      : 0;

  const averageFiveDayChangePct =
    availableCompanies.length > 0
      ? round(
          availableCompanies.reduce(
            (sum, company) =>
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
    companies:
      sortedCompanies,
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
      sortedCompanies
        .filter(
          (company) =>
            !company.dataAvailable
        )
        .map((company) => ({
          symbol: company.symbol,
          error:
            company.dataError ||
            "بيانات غير متاحة",
        })),
  };
}

export async function GET(
  request: Request
) {
  try {
    const url =
      new URL(request.url);

    const symbol = String(
      url.searchParams.get(
        "symbol"
      ) ?? ""
    )
      .trim()
      .toUpperCase()
      .replace(/[^A-Z.-]/g, "");

    const data = symbol
      ? await getOrSetCache(
          `sector-detail:v4-individual:${symbol}`,
          {
            ttlMs: 2 * 60_000,
            staleMs:
              30 * 60_000,
          },
          () =>
            loadDetail(symbol)
        )
      : await getOrSetCache(
          "sector-overview:v4-individual",
          {
            ttlMs: 2 * 60_000,
            staleMs:
              30 * 60_000,
          },
          loadOverview
        );

    return Response.json(data, {
      status: 200,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    });
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
        details: message,
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
