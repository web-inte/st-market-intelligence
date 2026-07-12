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

async function getAnalysis(symbol: string) {
  const response = await fetch(
    `${getBaseUrl()}/api/analysis/${encodeURIComponent(
      symbol
    )}`,
    {
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
        className="min-h-screen bg-[#07111f] px-5 py-10 text-white"
      >
        <section className="mx-auto max-w-3xl">
          <a
            href="/"
            className="mb-7 inline-flex text-sm text-cyan-400"
          >
            ← العودة للصفحة الرئيسية
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
      <section className="mx-auto max-w-6xl px-5 py-8">
        <a
  href="/"
  className="group mb-8 inline-flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-200 shadow-lg shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-300 hover:shadow-cyan-950/30"
>
  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-slate-950/70 text-cyan-400 transition duration-300 group-hover:border-cyan-400/20 group-hover:bg-cyan-400/10">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14m-6-6 6 6-6 6"
      />
    </svg>
  </span>

  <span className="text-right">
    <span className="block">
      العودة لأفضل الفرص
    </span>

    <span className="mt-0.5 block text-[11px] font-normal text-slate-500 transition group-hover:text-cyan-400/70">
      الصفحة الرئيسية
    </span>
  </span>
</a>

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
              درجة الفرصة
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

        <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              أفضل عقد
            </p>

            <p className="mt-2 break-all text-lg font-bold">
              {selectedContract?.ticker ??
                "غير متاح"}
            </p>

            {selectedContract ? (
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
              بيانات مباشرة
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
