import ShareAnalysisMenu from "./ShareAnalysisMenu";
import { cookies } from "next/headers";
import StockSmartChart from "../../../components/stock-smart-chart";
import {
  analyzeMarketData,
  type AnalysisError,
  type AnalysisResponse,
  type Side,
} from "../../../lib/analysis-engine";

export const dynamic = "force-dynamic";

type StockPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return `http://localhost:${process.env.PORT ?? 3000}`;
}

function numberFormat(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function priceFormat(value: number) {
  return Number(value || 0).toFixed(2);
}

function percentFormat(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "غير متاح";
  }

  return `${value.toFixed(2)}%`;
}

function formatFirstSeen(
  value?: string
) {
  if (!value) {
    return "غير متاح";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "غير متاح";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      timeZone:
        "Asia/Riyadh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function formatAge(
  minutes?: number
) {
  const safeMinutes =
    Math.max(
      0,
      Math.floor(
        Number(minutes) || 0
      )
    );

  if (safeMinutes < 1) {
    return "الآن";
  }

  if (safeMinutes < 60) {
    return `منذ ${safeMinutes} دقيقة`;
  }

  const hours =
    Math.floor(
      safeMinutes / 60
    );

  const remainingMinutes =
    safeMinutes % 60;

  return remainingMinutes > 0
    ? `منذ ${hours} س و${remainingMinutes} د`
    : `منذ ${hours} ساعة`;
}

function profitClasses(
  value: number
) {
  if (value > 0) {
    return "text-emerald-300";
  }

  if (value < 0) {
    return "text-rose-300";
  }

  return "text-slate-300";
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function sideArabic(side: Side) {
  if (side === "CALL") {
    return "اتجاه صاعد";
  }

  if (side === "PUT") {
    return "اتجاه هابط";
  }

  return "محايد";
}

function sideClasses(side: Side) {
  if (side === "CALL") {
    return {
      badge: "bg-emerald-400/10 text-emerald-400",
    };
  }

  if (side === "PUT") {
    return {
      badge: "bg-rose-400/10 text-rose-400",
    };
  }

  return {
    badge: "bg-slate-700 text-slate-300",
  };
}

function scoreColor(score: number) {
  if (score >= 85) {
    return "text-emerald-400";
  }

  if (score >= 70) {
    return "text-amber-400";
  }

  return "text-rose-400";
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

function createPricePlan(
  price: number,
  score: number,
  side: Side
) {
  const safePrice = Number(price || 0);
  const safeScore = clamp(
    Number(score || 0),
    0,
    100
  );

  if (
    safePrice <= 0 ||
    side === "NEUTRAL"
  ) {
    return {
      entry: safePrice,
      stop: safePrice,
      levels: [] as Array<{
        index: number;
        price: number;
        movePct: number;
        probability: number;
      }>,
      risk: "مرتفعة",
    };
  }

  const direction =
    side === "PUT" ? -1 : 1;

  const baseMove =
    0.8 + (safeScore / 100) * 0.9;

  const stopMove =
    0.7 +
    ((100 - safeScore) / 100) * 0.5;

  const levelPercentages = [
    baseMove,
    baseMove * 1.75,
    baseMove * 2.6,
  ];

  const levels = levelPercentages.map(
    (movePct, index) => ({
      index: index + 1,
      price:
        safePrice *
        (1 +
          direction *
            (movePct / 100)),
      movePct,
      probability: clamp(
        Math.round(
          safeScore - index * 9
        ),
        10,
        99
      ),
    })
  );

  const stop =
    safePrice *
    (1 -
      direction *
        (stopMove / 100));

  const risk =
    safeScore >= 85
      ? "منخفضة"
      : safeScore >= 70
        ? "متوسطة"
        : "مرتفعة";

  return {
    entry: safePrice,
    stop,
    levels,
    risk,
  };
}


function buildGammaTargets(
  optionsValue: unknown,
  entryPrice: number,
  side: Side,
  score: number
) {
  const options =
    optionsValue as Record<string, any>;

  const collections = [
    options.callWall,
    options.putWall,
    options.magnet,
    options.support,
    options.resistance,
    ...(Array.isArray(options.gammaLevels)
      ? options.gammaLevels
      : []),
    ...(Array.isArray(options.walls)
      ? options.walls
      : []),
    ...(Array.isArray(options.gammaByStrike)
      ? options.gammaByStrike
      : []),
    ...(Array.isArray(options.strikes)
      ? options.strikes
      : []),
    ...(Array.isArray(options.rows)
      ? options.rows
      : []),
  ];

  const strikes = collections
    .map((item) => {
      const strike = Number(
        item?.strike ??
        item?.price ??
        item
      );

      return Number.isFinite(strike)
        ? strike
        : null;
    })
    .filter(
      (strike): strike is number =>
        strike !== null &&
        strike > 0 &&
        (
          side === "CALL"
            ? strike > entryPrice
            : side === "PUT"
              ? strike < entryPrice
              : false
        )
    )
    .filter(
      (strike, index, values) =>
        values.findIndex(
          (value) =>
            Math.abs(value - strike) < 0.01
        ) === index
    )
    .sort((first, second) =>
      side === "PUT"
        ? second - first
        : first - second
    )
    .slice(0, 3);

  return strikes.map(
    (price, index) => ({
      index: index + 1,
      price,
      movePct:
        Math.abs(
          ((price - entryPrice) /
            entryPrice) *
            100
        ),
      probability: clamp(
        Math.round(score - index * 9),
        10,
        99
      ),
      kind: "gamma" as const,
    })
  );
}

function levelStatus(
  currentPrice: number,
  targetPrice: number,
  side: Side
) {
  if (
    side === "CALL" &&
    currentPrice >= targetPrice
  ) {
    return {
      label: "تحقق",
      classes:
        "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    };
  }

  if (
    side === "PUT" &&
    currentPrice <= targetPrice
  ) {
    return {
      label: "تحقق",
      classes:
        "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    };
  }

  const distance =
    currentPrice > 0
      ? Math.abs(
          (targetPrice - currentPrice) /
            currentPrice
        ) * 100
      : 100;

  if (distance <= 0.5) {
    return {
      label: "قريب من التحقق",
      classes:
        "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
    };
  }

  return {
    label: "لم يتحقق",
    classes:
      "border-white/[0.07] bg-white/[0.03] text-slate-400",
  };
}

async function getAnalysis(symbol: string) {
  const analysisCookieStore = await cookies();
  const analysisCookieHeader = analysisCookieStore
    .getAll()
    .map(
      ({ name, value }) =>
        `${name}=${encodeURIComponent(value)}`
    )
    .join("; ");

  const response = await fetch(
    `${getBaseUrl()}/api/analysis/${encodeURIComponent(
      symbol
    )}`,
    {
      headers: analysisCookieHeader
        ? { cookie: analysisCookieHeader }
        : undefined,
      cache: "no-store",
    }
  );

  const result = (await response.json()) as
    | AnalysisResponse
    | AnalysisError;

  if (!response.ok || !("quote" in result)) {
    throw new Error(
      "error" in result && result.error
        ? result.error
        : "تعذر جلب تحليل السهم"
    );
  }

  return result;
}

export default async function StockAnalysisPage({
  params,
}: StockPageProps) {
  const { symbol } = await params;

  const stockSymbol = symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.-]/g, "");

  let analysis: AnalysisResponse;

  try {
    analysis = await getAnalysis(stockSymbol);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "حدث خطأ غير معروف";

    return (
      <main
        dir="rtl"
        className="pt-24 sm:pt-28 min-h-screen bg-[#07111f] px-5 py-10 text-white"
      >
        <section className="mx-auto max-w-3xl">
          <a
            href="/dashboard"
            className="mb-7 inline-flex text-sm text-cyan-400"
          >
            ← العودة إلى المنصة
          </a>

          <div className="rounded-3xl border border-rose-900/60 bg-rose-950/20 p-6">
            <h1 className="text-2xl font-bold text-rose-400">
              تعذر تحليل {stockSymbol}
            </h1>

            <p className="mt-4 leading-8 text-slate-300">
              {message}
            </p>
          </div>
        </section>
      </main>
    );
  }

  const {
    quote,
    options,
  } = analysis;

  const marketAnalysis =
    analyzeMarketData(analysis);

  const {
    decision,
    consensus,
    gammaRisk,
    selectedContract,
    flowScore,
    contractScore,
    momentumScore,
    gammaScore,
    gammaStatus,
    summary,
    contractQuality,
  } = marketAnalysis;

  const recommendedContracts =
  decision.side === "CALL"
    ? options.recommendedCalls
    : decision.side === "PUT"
      ? options.recommendedPuts
      : [];

  const sideStyle =
    sideClasses(decision.side);

  const chartOptions =
    options as Record<string, any>;

  const storedPlan =
    analysis.tradePlan;

  const fallbackEntry =
    Number(quote.price);

  const fallbackPricePlan =
    createPricePlan(
      fallbackEntry,
      decision.score,
      decision.side
    );

  const storedLevels =
    storedPlan?.targets?.map(
      (target) => ({
        index: target.index,
        price: target.price,
        movePct:
          target.movePct,
        probability:
          target.probability,
        kind:
          target.source ===
          "GAMMA"
            ? "gamma" as const
            : "estimated" as const,
      })
    ) || [];

  const pricePlan = {
    entry:
      storedPlan?.entryPrice &&
      storedPlan.entryPrice > 0
        ? storedPlan.entryPrice
        : fallbackPricePlan.entry,

    stop:
      storedPlan?.stopPrice &&
      storedPlan.stopPrice > 0
        ? storedPlan.stopPrice
        : fallbackPricePlan.stop,

    levels:
      storedLevels.length > 0
        ? storedLevels
        : fallbackPricePlan.levels.map(
            (level) => ({
              ...level,
              kind:
                "estimated" as const,
            })
          ),

    risk:
      fallbackPricePlan.risk,
  };

  const positiveReasons = [
    consensus.label,
    gammaStatus,
    sideArabic(decision.side),
    selectedContract
      ? contractQuality
      : null,
    ...consensus.reasons,
  ].filter(
    (
      reason
    ): reason is string =>
      Boolean(reason)
  );

  const riskReasons = [
    ...gammaRisk.reasons,
    selectedContract
      ? selectedContract.spreadPct !==
          null &&
        selectedContract.spreadPct > 15
        ? "السبريد مرتفع نسبيًا."
        : null
      : "لا يوجد عقد مطابق للشروط حاليًا.",
    decision.side === "NEUTRAL"
      ? "اتجاه المحركات غير محسوم."
      : null,
  ].filter(
    (
      reason
    ): reason is string =>
      Boolean(reason)
  );

  const stockPageUrl = `${getBaseUrl()}/stocks/${encodeURIComponent(
    analysis.symbol
  )}`;

  const shareText = `${analysis.symbol}
الاتجاه: ${decision.side}
قوة الإشارة: ${decision.score}%
السعر الحالي: $${priceFormat(
    quote.price
  )}
الدخول المرجعي: $${priceFormat(
    pricePlan.entry
  )}
الهدف الأول: ${
    pricePlan.levels[0]
      ? `$${priceFormat(
          pricePlan.levels[0].price
        )}`
      : "غير متاح"
  }
الوقف التقديري: $${priceFormat(
    pricePlan.stop
  )}${
    storedPlan
      ? `
أول ظهور: ${formatFirstSeen(
          storedPlan.firstSeenAt
        )}
الأداء منذ الظهور: ${
          storedPlan.currentProfitPct >= 0
            ? "+"
            : ""
        }${storedPlan.currentProfitPct.toFixed(2)}%
الحالة: ${storedPlan.lifecycleLabel}`
      : ""
  }`;

  const telegramShareUrl =
    `https://t.me/share/url?url=${encodeURIComponent(
      stockPageUrl
    )}&text=${encodeURIComponent(
      shareText
    )}`;

  const engines = [
    {
      name: "تدفق العقود",
      score: flowScore,
      status: sideArabic(decision.side),
      description: `CALL ${options.callVolumePct.toFixed(
        2
      )}% مقابل PUT ${options.putVolumePct.toFixed(
        2
      )}%.`,
    },
    {
      name: "القاما",
      score: gammaScore,
      status: gammaStatus,
      description: `تقدير صافي GEX الحالي: ${compactNumber(
        options.estimatedNetGex
      )}.`,
    },
    {
      name: "الزخم السعري",
      score: momentumScore,
      status:
        quote.changePct > 0
          ? "صاعد"
          : quote.changePct < 0
            ? "هابط"
            : "محايد",
      description: `تغير السهم الحالي ${quote.changePct.toFixed(
        2
      )}%، وأعلى سعر ${priceFormat(
        quote.high
      )} وأدنى سعر ${priceFormat(
        quote.low
      )}.`,
    },
    {
      name: "جودة العقد",
      score: contractScore,
      status: selectedContract
        ? contractQuality
        : "لا يوجد عقد مطابق",
      description: selectedContract
        ? `الحجم ${numberFormat(
            selectedContract.volume
          )}، الاهتمام المفتوح ${numberFormat(
            selectedContract.openInterest
          )}، السبريد ${percentFormat(
            selectedContract.spreadPct
          )}، والدلتا ${selectedContract.delta.toFixed(
            4
          )}.`
        : "لم يجتز أي عقد شروط الحجم والاهتمام المفتوح والدلتا والسبريد.",
    },
    {
  name: "توافق المحركات",
  score: consensus.score,
  status: consensus.label,
  description:
    consensus.reasons.length > 0
      ? consensus.reasons.join(" • ")
      : "لا توجد إشارات كافية لتحديد مستوى التوافق.",
},
{
  name: "مخاطر القاما",
  score: gammaRisk.score,
  status: gammaRisk.label,
  description:
    gammaRisk.reasons.length > 0
      ? gammaRisk.reasons.join("\n")
      : "بيانات قاما غير كافية حاليًا",
},

  ];
    return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#07111f] text-white"
    >
      <meta
        httpEquiv="refresh"
        content="120"
      />
      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <a
            href="/dashboard"
            className="group inline-flex min-h-12 items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-200 shadow-lg shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-300 hover:shadow-cyan-950/30"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-slate-950/70 text-cyan-400">
              ←
            </span>

            <span className="text-right">
              <span className="block">
                العودة إلى المنصة
              </span>

              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                لوحة التحليل
              </span>
            </span>
          </a>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <a
              href={`/gamma-liquidity?symbol=${encodeURIComponent(
                analysis.symbol
              )}`}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-300 transition hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-500/20"
            >
              <span>
                ⚡ القاما والسيولة
              </span>

              <span className="mr-2 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-black">
                PLUS
              </span>
            </a>

            <a
              href={`/stocks/${encodeURIComponent(
                analysis.symbol
              )}`}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-slate-900/70 px-4 py-3 text-sm font-bold text-slate-300 transition hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-300"
            >
              تحديث التحليل
            </a>

            <ShareAnalysisMenu
              symbol={analysis.symbol}
            />
          </div>
        </div>

        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-cyan-400">
              ST Market Intelligence
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {analysis.symbol}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-semibold">
                ${priceFormat(quote.price)}
              </span>

              <span
                className={
                  quote.changePct >= 0
                    ? "font-semibold text-emerald-400"
                    : "font-semibold text-rose-400"
                }
              >
                {quote.changePct >= 0
                  ? "+"
                  : ""}
                {quote.changePct.toFixed(2)}%
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              الافتتاح ${priceFormat(
                quote.open
              )} • الأعلى $
              {priceFormat(
                quote.high
              )} • الأدنى $
              {priceFormat(quote.low)}
            </p>
          </div>

          <div className="text-left">
            <p className="text-sm text-slate-400">
              قوة الإشارة
            </p>

            <p
              className={`text-5xl font-bold ${scoreColor(
                decision.score
              )}`}
            >
              {decision.score}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              درجة محسوبة من 100
            </p>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full ${
                decision.side === "CALL"
                  ? "bg-emerald-400"
                  : decision.side === "PUT"
                    ? "bg-rose-400"
                    : "bg-slate-500"
              }`}
              style={{
                width: `${clamp(
                  decision.score,
                  0,
                  100
                )}%`,
              }}
            />
          </div>
        </header>

        <section className="mb-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-4 py-2 font-semibold ${sideStyle.badge}`}
            >
              {decision.side}
            </span>

            <span className="rounded-full bg-cyan-400/10 px-4 py-2 text-cyan-400">
              {decision.status}
            </span>

            <span className="rounded-full bg-slate-800 px-4 py-2 text-slate-300">
              الثقة: {decision.confidence}
            </span>
          </div>

          <h2 className="text-xl font-semibold">
            الخلاصة
          </h2>

          <p className="mt-3 leading-8 text-slate-300">
            {summary}
          </p>
        </section>


        <StockSmartChart
          symbol={analysis.symbol}
          currentPrice={Number(quote.price)}
          entry={pricePlan.entry}
          stop={pricePlan.stop}
          targets={pricePlan.levels.map(
            (level) => ({
              index: level.index,
              price: level.price,
            })
          )}
          side={decision.side}
          gammaData={{
            gammaStructure:
              chartOptions.gammaStructure ??
              null,
            walls:
              chartOptions.walls ??
              null,
            gammaByStrike:
              chartOptions.gammaByStrike ??
              null,
            gammaLevels:
              chartOptions.gammaLevels ??
              null,
            levels:
              chartOptions.levels ??
              null,
            callWall:
              chartOptions.callWall ??
              null,
            putWall:
              chartOptions.putWall ??
              null,
            nearestSupport:
              chartOptions.nearestSupport ??
              null,
            nearestResistance:
              chartOptions.nearestResistance ??
              null,
            support:
              chartOptions.support ??
              null,
            resistance:
              chartOptions.resistance ??
              null,
            magnet:
              chartOptions.magnet ??
              null,
            gammaFlip:
              chartOptions.gammaFlip ??
              chartOptions.gammaFlipLevel ??
              null,
            zeroGamma:
              chartOptions.zeroGamma ??
              chartOptions.zeroGammaLevel ??
              null,
          }}
        />

        <section className="mb-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-cyan-400">
                خطة الحركة التقديرية
              </p>

              <h2 className="mt-2 text-2xl font-black">
                الدخول والوقف والمستويات
              </h2>
            </div>

            <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400">
              المخاطرة: {pricePlan.risk}
            </span>
          </div>

          {storedPlan ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
                <p className="text-xs text-slate-500">
                  وقت أول ظهور
                </p>
                <p className="mt-2 font-black text-cyan-300">
                  {formatFirstSeen(
                    storedPlan.firstSeenAt
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {formatAge(
                    storedPlan.ageMinutes
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-xs text-slate-500">
                  السعر الحالي
                </p>
                <p className="mt-2 font-black text-white">
                  ${priceFormat(
                    quote.price
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-xs text-slate-500">
                  الأداء منذ الظهور
                </p>
                <p
                  className={`mt-2 font-black ${profitClasses(
                    storedPlan.currentProfitPct
                  )}`}
                >
                  {storedPlan.currentProfitPct >= 0
                    ? "+"
                    : ""}
                  {storedPlan.currentProfitPct.toFixed(2)}%
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <p className="text-xs text-slate-500">
                  حالة المتابعة
                </p>
                <p className="mt-2 font-black text-amber-300">
                  {storedPlan.lifecycleLabel}
                </p>
              </div>
            </div>
          ) : null}

          {decision.side === "NEUTRAL" ? (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5 text-amber-200">
              لا توجد مستويات اتجاهية واضحة لأن التحليل الحالي محايد.
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
                  <p className="text-xs text-slate-500">
                    الدخول المرجعي
                  </p>

                  <p className="mt-2 text-3xl font-black text-cyan-300">
                    ${priceFormat(pricePlan.entry)}
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4">
                  <p className="text-xs text-slate-500">
                    الوقف التقديري
                  </p>

                  <p className="mt-2 text-3xl font-black text-rose-300">
                    ${priceFormat(pricePlan.stop)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {pricePlan.levels.map(
                  (level) => {
                    const status =
                      levelStatus(
                        quote.price,
                        level.price,
                        decision.side
                      );

                    return (
                      <article
                        key={level.index}
                        className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-white">
                            {level.kind === "gamma" ? "هدف Gamma" : "هدف سعري"} {level.index}
                          </p>

                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${status.classes}`}
                          >
                            {status.label}
                          </span>
                        </div>

                        <p className="mt-4 text-3xl font-black text-emerald-300">
                          ${priceFormat(level.price)}
                        </p>

                        <div className="mt-4 flex items-center justify-between text-xs">
                          <span className="text-slate-500">
                            الحركة التقديرية
                          </span>

                          <span className="font-bold text-slate-300">
                            {level.movePct.toFixed(2)}%
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-slate-500">
                            نسبة الوصول
                          </span>

                          <span className="font-bold text-cyan-300">
                            {level.probability}%
                          </span>
                        </div>

                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-400"
                            style={{
                              width: `${level.probability}%`,
                            }}
                          />
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            </>
          )}

          <p className="mt-5 text-xs leading-6 text-slate-600">
            المستويات مبنية على سعر أول ظهور للفرصة وتبقى ثابتة طوال مدة الخطة، بينما يتحدث السعر الحالي تلقائيًا.
          </p>
        </section>

        <section className="mb-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.045] p-6">
            <h2 className="text-xl font-black text-emerald-300">
              أسباب قوة الفرصة
            </h2>

            <div className="mt-5 space-y-3">
              {positiveReasons.length > 0 ? (
                positiveReasons
                  .slice(0, 6)
                  .map((reason, index) => (
                    <div
                      key={`${reason}-${index}`}
                      className="flex gap-3 rounded-2xl border border-white/[0.05] bg-slate-950/35 p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-xs font-black text-emerald-300">
                        {index + 1}
                      </span>

                      <p className="text-sm leading-6 text-slate-300">
                        {reason}
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-slate-500">
                  لا توجد أسباب إيجابية كافية حاليًا.
                </p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.045] p-6">
            <h2 className="text-xl font-black text-amber-300">
              عوامل الخطر
            </h2>

            <div className="mt-5 space-y-3">
              {riskReasons.length > 0 ? (
                riskReasons
                  .slice(0, 6)
                  .map((reason, index) => (
                    <div
                      key={`${reason}-${index}`}
                      className="flex gap-3 rounded-2xl border border-white/[0.05] bg-slate-950/35 p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/10 text-xs font-black text-amber-300">
                        {index + 1}
                      </span>

                      <p className="text-sm leading-6 text-slate-300">
                        {reason}
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-slate-500">
                  لا توجد عوامل خطر بارزة ضمن البيانات الحالية.
                </p>
              )}
            </div>
          </article>
        </section>

        <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              أفضل عقد
            </p>

            <p className="mt-2 break-all text-lg font-bold">
              {selectedContract?.ticker ??
                "غير متاح"}
            </p>

            {decision.side !== "NEUTRAL" && selectedContract ? (
              <p className="mt-2 text-sm text-slate-500">
                {selectedContract.type.toUpperCase()}{" "}
                • Strike{" "}
                {selectedContract.strike} •{" "}
                {selectedContract.expiration}
              </p>
            ) : null}
          </div>
        </section>

        {recommendedContracts.length > 0 ? (
  <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold">العقود المقترحة</h2>

        <p className="mt-1 text-sm text-slate-400">
          أفضل العقود المتوافقة مع اتجاه التحليل
        </p>
      </div>

      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-400">
        {decision.side}
      </span>
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {recommendedContracts.slice(0, 3).map((contract, index) => {
        const contractLabel =
          index === 0
            ? "العقد المتوازن"
            : index === 1
              ? "العقد المحافظ"
              : "العقد الهجومي";

        return (
          <article
            key={`${contract.type}-${contract.strike}-${index}`}
            className="rounded-2xl border border-slate-800 bg-[#0b162b] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-cyan-400">
                  {contractLabel}
                </p>

                <h3 className="mt-1 text-xl font-bold">
                  {decision.side} — Strike {contract.strike}
                </h3>
              </div>

              <span className="rounded-lg bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-200">
                #{index + 1}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">الحجم</p>
                <p className="mt-1 font-semibold">
                  {numberFormat(contract.volume)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">الاهتمام المفتوح</p>
                <p className="mt-1 font-semibold">
                  {numberFormat(contract.openInterest)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
  <p className="text-xs text-slate-400">سعر العقد</p>

  <p className="mt-1 text-2xl font-bold text-emerald-400">
    ${priceFormat(contract.midpoint)}
  </p>

  <div className="mt-2 flex justify-between text-xs text-slate-400">
    <span>Bid: ${priceFormat(contract.bid)}</span>
    <span>Ask: ${priceFormat(contract.ask)}</span>
  </div>
</div>

             <div className="rounded-xl bg-slate-950/50 p-3">
  <p className="text-xs text-slate-500">
    تاريخ الانتهاء
  </p>

  <p className="mt-1 font-semibold text-white">
    {contract.expiration || "غير متاح"}
  </p>
</div> 

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">السبريد</p>
                <p className="mt-1 font-semibold">
                  {percentFormat(contract.spreadPct)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">Vol/OI</p>
                <p className="mt-1 font-semibold">
                  {contract.volumeOiRatio?.toFixed(2) ?? "غير متاح"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">Delta</p>
                <p className="mt-1 font-semibold">
                  {contract.delta?.toFixed(4) ?? "غير متاح"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">Gamma</p>
                <p className="mt-1 font-semibold">
                  {contract.gamma?.toFixed(6) ?? "غير متاح"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">Theta</p>
                <p className="mt-1 font-semibold">
                  {contract.theta?.toFixed(4) ?? "غير متاح"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">Vega</p>
                <p className="mt-1 font-semibold">
                  {contract.vega?.toFixed(4) ?? "غير متاح"}
                </p>
              </div>

              <div className="col-span-2 rounded-xl bg-slate-950/50 p-3">
                <p className="text-xs text-slate-500">IV</p>
                <p className="mt-1 font-semibold">
                  {contract.iv != null
                    ? `${(contract.iv * 100).toFixed(2)}%`
                    : "غير متاح"}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  </section>
) : null}
                <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold">
              تفاصيل التحليل
            </h2>

            <span className="text-left text-sm text-slate-500">
              تحديث تلقائي كل دقيقتين
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {engines.map((engine) => (
              <article
                key={engine.name}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">
                      {engine.name}
                    </h3>

                    <p className="mt-2 text-sm text-cyan-400">
                      {engine.status}
                    </p>
                  </div>

                  <p
                    className={`text-3xl font-bold ${scoreColor(
                      engine.score
                    )}`}
                  >
                    {engine.score}
                  </p>
                </div>

                <div className="mt-4 whitespace-pre-line leading-7 text-slate-400">
  {engine.description}
</div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}