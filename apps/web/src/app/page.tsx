"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  createOpportunity,
  type AnalysisResponse,
  type Opportunity,
  type Side,
} from "../lib/analysis-engine";

const WATCHLIST = ["NVDA", "TSLA", "AMD", "META"];

function sideColor(side: Side) {
  if (side === "CALL") {
    return "text-emerald-400";
  }

  if (side === "PUT") {
    return "text-rose-400";
  }

  return "text-slate-400";
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

export default function Home() {
  const router = useRouter();

  const [symbol, setSymbol] = useState("");
  const [opportunities, setOpportunities] = useState<
    Opportunity[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const stock = symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z.-]/g, "");

    if (!stock) {
      return;
    }

    router.push(
      `/stocks/${encodeURIComponent(stock)}`
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function loadOpportunities() {
      setLoading(true);
      setError("");

      try {
        const results = await Promise.allSettled(
          WATCHLIST.map(async (stockSymbol) => {
            const response = await fetch(
              `/api/analysis/${encodeURIComponent(
                stockSymbol
              )}`,
              {
                cache: "no-store",
              }
            );

            if (!response.ok) {
              throw new Error(
                `تعذر تحليل ${stockSymbol}`
              );
            }

            const analysis =
              (await response.json()) as AnalysisResponse;

            return createOpportunity(analysis);
          })
        );

        if (cancelled) {
          return;
        }

        const validResults = results
          .filter(
            (
              result
            ): result is PromiseFulfilledResult<Opportunity> =>
              result.status === "fulfilled"
          )
          .map((result) => result.value)
          .sort((a, b) => b.score - a.score);

        setOpportunities(validResults);

        if (validResults.length === 0) {
          setError(
            "تعذر تحميل فرص السوق حاليًا."
          );
        }
      } catch (loadError) {
        console.error(
          "Failed to load opportunities:",
          loadError
        );

        if (!cancelled) {
          setError(
            "حدث خطأ أثناء تحميل التحليلات."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOpportunities();

    const refreshTimer = window.setInterval(
      () => {
        void loadOpportunities();
      },
      60_000
    );

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const marketScore = useMemo(() => {
    if (opportunities.length === 0) {
      return 0;
    }

    const total = opportunities.reduce(
      (sum, item) => sum + item.score,
      0
    );

    return Math.round(
      total / opportunities.length
    );
  }, [opportunities]);

  const marketStatus = useMemo(() => {
    if (marketScore >= 85) {
      return "إيجابي قوي";
    }

    if (marketScore >= 70) {
      return "إيجابي بحذر";
    }

    if (marketScore >= 55) {
      return "محايد";
    }

    if (marketScore > 0) {
      return "سلبي";
    }

    return "جارٍ التحليل";
  }, [marketScore]);

  const marketStatusColor =
    marketScore >= 70
      ? "text-emerald-400"
      : marketScore >= 55
        ? "text-amber-400"
        : marketScore > 0
          ? "text-rose-400"
          : "text-slate-400";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#07111f] text-white"
    >
      <section className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-10">
          <p className="text-sm text-cyan-400">
            ST Market Intelligence
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            أفضل الفرص في السوق الآن
          </h1>

          <p className="mt-3 text-slate-400">
            تحليل يجمع السعر والسيولة والقاما
            والزخم في نتيجة واحدة.
          </p>
        </header>

        <form
          onSubmit={handleSearch}
          className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
        >
          <p className="mb-3 text-sm text-slate-400">
            ابحث عن أي سهم
          </p>

          <div className="flex gap-3">
            <input
              type="text"
              value={symbol}
              onChange={(event) =>
                setSymbol(event.target.value)
              }
              placeholder="مثال: NVDA"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={10}
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#07111f] px-4 py-3 text-left text-lg uppercase outline-none transition focus:border-cyan-400"
            />

            <button
              type="submit"
              disabled={!symbol.trim()}
              className="rounded-xl bg-cyan-400 px-5 py-3 font-bold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              تحليل
            </button>
          </div>
        </form>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">
                حالة السوق
              </p>

              <h2
                className={`mt-1 text-xl font-semibold ${marketStatusColor}`}
              >
                {marketStatus}
              </h2>
            </div>

            <div className="text-left">
              <p className="text-sm text-slate-400">
                Market Score
              </p>

              <p className="text-3xl font-bold">
                {loading ? "..." : marketScore}
              </p>
            </div>
          </div>
        </section>

        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            أفضل الفرص
          </h2>

          <span className="text-sm text-slate-500">
            بيانات مباشرة
          </span>
        </div>

        {loading ? (
          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
            جارٍ تحليل الأسهم...
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-900/60 bg-rose-950/20 p-5 text-rose-300">
            {error}
          </div>
        ) : null}

        {!loading &&
        !error &&
        opportunities.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-400">
            لا توجد فرص متاحة حاليًا.
          </div>
        ) : null}

        <div className="grid gap-4">
          {opportunities.map((item) => (
            <article
              key={item.symbol}
              role="button"
              tabIndex={0}
              aria-label={`فتح تحليل ${item.symbol}`}
              onClick={() =>
                router.push(
                  `/stocks/${encodeURIComponent(
                    item.symbol
                  )}`
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  event.preventDefault();

                  router.push(
                    `/stocks/${encodeURIComponent(
                      item.symbol
                    )}`
                  );
                }
              }}
              className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-cyan-400 focus:border-cyan-400 focus:outline-none"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold">
                    {item.symbol}
                  </h3>

                  <p className="mt-1 text-sm text-slate-400">
                    {item.status}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    الثقة: {item.confidence}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    ${item.price.toFixed(2)}{" "}
                    <span
                      className={
                        item.changePct >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {item.changePct >= 0
                        ? "+"
                        : ""}
                      {item.changePct.toFixed(2)}%
                    </span>
                  </p>
                </div>

                <div className="text-left">
                  <p
                    className={`font-semibold ${sideColor(
                      item.side
                    )}`}
                  >
                    {item.side}
                  </p>

                  <p
                    className={`mt-1 text-3xl font-bold ${scoreColor(
                      item.score
                    )}`}
                  >
                    {item.score}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}