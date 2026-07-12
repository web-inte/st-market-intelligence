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

function sideBackground(side: Side) {
  if (side === "CALL") {
    return "border-emerald-500/20 bg-emerald-500/10";
  }

  if (side === "PUT") {
    return "border-rose-500/20 bg-rose-500/10";
  }

  return "border-slate-700 bg-slate-800/70";
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

function scoreRing(score: number) {
  if (score >= 85) {
    return "border-emerald-400/40 shadow-emerald-500/10";
  }

  if (score >= 70) {
    return "border-amber-400/40 shadow-amber-500/10";
  }

  return "border-rose-400/40 shadow-rose-500/10";
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
    let requestRunning = false;

    async function loadOpportunities() {
      if (requestRunning) {
        return;
      }

      requestRunning = true;
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
        requestRunning = false;

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
      120_000
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

  const bestOpportunity = opportunities[0];

  const tickerItems = useMemo(
    () => [...opportunities, ...opportunities],
    [opportunities]
  );

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030914] text-white selection:bg-cyan-400/30"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.035)_1px,transparent_1px)] bg-[size:42px_42px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-[140px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -left-40 h-[520px] w-[520px] rounded-full bg-blue-600/10 blur-[150px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[420px] h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/[0.035] blur-[140px]"
      />

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <nav className="mb-4 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-slate-950/50 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 shadow-lg shadow-cyan-500/10">
              <span className="text-sm font-black text-cyan-300">
                ST
              </span>
            </div>

            <div>
              <p className="text-sm font-bold tracking-wide text-white">
                ST Market Intelligence
              </p>

              <p className="text-[11px] text-slate-500">
                Smart Market Analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />

              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>

            <span className="text-xs font-bold tracking-[0.14em] text-emerald-300">
              LIVE
            </span>
          </div>
        </nav>

        <section
          dir="ltr"
          className="relative mb-12 overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950/65 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          <div className="flex min-h-14 items-center">
            <div className="relative z-30 flex min-h-14 shrink-0 items-center gap-2 border-r border-white/[0.07] bg-slate-950 px-4 sm:px-5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />

                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>

              <span className="whitespace-nowrap text-xs font-black tracking-[0.14em] text-emerald-300">
                MARKET LIVE
              </span>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              {tickerItems.length > 0 ? (
                <div className="market-ticker-track flex w-max items-center py-4">
                  {tickerItems.map((item, index) => {
                    const isPositive =
                      item.changePct > 0;

                    const isNegative =
                      item.changePct < 0;

                    return (
                      <button
                        type="button"
                        key={`${item.symbol}-${index}`}
                        onClick={() =>
                          router.push(
                            `/stocks/${encodeURIComponent(
                              item.symbol
                            )}`
                          )
                        }
                        className="flex shrink-0 items-center gap-2 px-5 text-sm transition hover:opacity-80 sm:px-7"
                      >
                        <span className="font-black tracking-wide text-white">
                          {item.symbol}
                        </span>

                        <span
                          className={`text-xs font-black ${
                            isPositive
                              ? "text-emerald-400"
                              : isNegative
                                ? "text-rose-400"
                                : "text-slate-400"
                          }`}
                        >
                          {isPositive
                            ? "▲"
                            : isNegative
                              ? "▼"
                              : "●"}
                        </span>

                        <span className="font-semibold tabular-nums text-slate-300">
                          ${item.price.toFixed(2)}
                        </span>

                        <span
                          className={`text-xs font-bold tabular-nums ${
                            isPositive
                              ? "text-emerald-400"
                              : isNegative
                                ? "text-rose-400"
                                : "text-slate-500"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {item.changePct.toFixed(2)}%
                        </span>

                        <span className="ml-3 text-slate-800">
                          |
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-14 items-center px-6">
                  <span className="animate-pulse text-sm text-slate-500">
                    جارٍ تحميل أسعار السوق...
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <header className="mx-auto mb-12 max-w-5xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-2 text-xs font-medium text-cyan-300 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />

            تحليل لحظي مدعوم بمحركات متعددة
          </div>

          <h1 className="text-balance text-4xl font-black leading-[1.2] tracking-tight sm:text-5xl lg:text-7xl">
            اكتشف أقوى فرص السوق

            <span className="mt-2 block bg-gradient-to-l from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
              قبل تحركها
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-400 sm:text-lg">
            منصة تحليل متقدمة تجمع حركة السعر، تدفق
            العقود، القاما، الزخم وجودة العقد في قراءة
            واحدة تساعدك على اكتشاف الفرص الأقوى
            بوضوح وسرعة.
          </p>
        </header>

        <section className="mb-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <form
            onSubmit={handleSearch}
            className="rounded-3xl border border-white/[0.08] bg-slate-950/65 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6"
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
                className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-4 text-left text-lg font-semibold uppercase outline-none transition focus:border-cyan-400/40"
              />

              <button
                type="submit"
                disabled={!symbol.trim()}
                className="rounded-2xl bg-gradient-to-l from-cyan-400 to-sky-500 px-6 py-4 font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:-translate-y-0.5 hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                تحليل
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() =>
              router.push("/options-analyzer")
            }
            className="group flex items-center justify-between gap-4 rounded-3xl border border-cyan-400/20 bg-slate-950/65 p-5 text-right shadow-2xl shadow-cyan-950/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-400/40 sm:p-6"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-cyan-400">
                Options Analyzer
              </p>

              <h2 className="mt-2 text-xl font-black text-white">
                تحليل عقود الشركات
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                اختر الشركة ونوع العقد وتاريخ
                الانتهاء واعرض أفضل العقود.
              </p>
            </div>

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-xl text-cyan-300 transition group-hover:-translate-x-1">
              ←
            </div>
          </button>
        </section>

        <section className="mb-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/60 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-7">
            <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />

                  <p className="text-sm font-medium text-slate-400">
                    نظرة السوق الحالية
                  </p>
                </div>

                <h2
                  className={`text-3xl font-black sm:text-4xl ${marketStatusColor}`}
                >
                  {marketStatus}
                </h2>

                <p className="mt-3 max-w-lg text-sm leading-7 text-slate-500">
                  يتم احتساب حالة السوق من متوسط قوة
                  الفرص الحالية وتوافق محركات التحليل.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Market Score
                  </p>

                  <p className="mt-1 text-left text-5xl font-black tracking-tight text-white">
                    {loading ? "..." : marketScore}
                  </p>
                </div>

                <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/[0.05]">
                  <div className="absolute inset-2 animate-[spin_14s_linear_infinite] rounded-full border border-dashed border-cyan-400/20" />

<span
  dir="ltr"
  className="text-xs font-bold text-cyan-300"
>
  {loading ? "..." : `${marketScore} / 100`}
</span>
                </div>
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/60 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-7">
            <div className="relative">
              <p className="text-sm font-medium text-slate-400">
                الفرصة الأعلى تقييمًا
              </p>

              {loading ? (
                <div className="mt-5 animate-pulse">
                  <div className="h-9 w-28 rounded-lg bg-slate-800" />

                  <div className="mt-3 h-5 w-44 rounded bg-slate-800/70" />
                </div>
              ) : bestOpportunity ? (
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-4xl font-black tracking-tight">
                      {bestOpportunity.symbol}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      {bestOpportunity.status}
                    </p>

                    <div
                      className={`mt-4 inline-flex rounded-lg border px-3 py-1.5 text-xs font-bold ${sideBackground(
                        bestOpportunity.side
                      )} ${sideColor(
                        bestOpportunity.side
                      )}`}
                    >
                      {bestOpportunity.side}
                    </div>
                  </div>

                  <div className="text-left">
                    <p
                      className={`text-5xl font-black ${scoreColor(
                        bestOpportunity.score
                      )}`}
                    >
                      {bestOpportunity.score}
                    </p>

                    <p className="mt-1 text-xs text-slate-600">
                      Opportunity Score
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  لا توجد فرصة متاحة حاليًا.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-400">
              Market Opportunities
            </p>

            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              أفضل الفرص الآن
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />

              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>

            تحديث مباشر
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {WATCHLIST.map((stock) => (
              <div
                key={stock}
                className="animate-pulse rounded-3xl border border-white/[0.06] bg-slate-950/60 p-6"
              >
                <div className="flex justify-between gap-5">
                  <div>
                    <div className="h-8 w-24 rounded-lg bg-slate-800" />

                    <div className="mt-4 h-4 w-36 rounded bg-slate-800/70" />

                    <div className="mt-3 h-4 w-28 rounded bg-slate-800/50" />
                  </div>

                  <div className="h-20 w-20 rounded-full bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-rose-500/20 bg-rose-500/[0.06] p-6 text-rose-300 backdrop-blur-xl">
            <p className="font-bold">
              تعذر تحميل البيانات
            </p>

            <p className="mt-2 text-sm text-rose-300/70">
              {error}
            </p>
          </div>
        ) : null}

        {!loading &&
        !error &&
        opportunities.length === 0 ? (
          <div className="rounded-3xl border border-white/[0.07] bg-slate-950/60 p-10 text-center text-slate-400 backdrop-blur-xl">
            لا توجد فرص متاحة حاليًا.
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 sm:grid-cols-2">
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
                className="group relative cursor-pointer overflow-hidden rounded-3xl border border-white/[0.07] bg-slate-950/65 p-6 shadow-xl shadow-black/10 backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:border-cyan-400/25 hover:shadow-2xl hover:shadow-cyan-950/20 focus:border-cyan-400/40 focus:outline-none"
              >
                <div className="relative">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-3xl font-black tracking-tight">
                          {item.symbol}
                        </h3>

                        <span
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-black ${sideBackground(
                            item.side
                          )} ${sideColor(item.side)}`}
                        >
                          {item.side}
                        </span>
                      </div>

                      <p className="mt-3 text-sm font-medium text-slate-300">
                        {item.status}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        مستوى الثقة:{" "}
                        <span className="text-slate-300">
                          {item.confidence}
                        </span>
                      </p>
                    </div>

                    <div
                      className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border bg-slate-950/80 shadow-xl ${scoreRing(
                        item.score
                      )}`}
                    >
                      <span
                        className={`text-2xl font-black ${scoreColor(
                          item.score
                        )}`}
                      >
                        {item.score}
                      </span>

                      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-600">
                        Score
                      </span>
                    </div>
                  </div>

                  <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-600">
                        السعر الحالي
                      </p>

                      <p className="mt-1 text-xl font-bold text-white">
                        ${item.price.toFixed(2)}
                      </p>
                    </div>

                    <div className="text-left">
                      <p className="text-xs text-slate-600">
                        التغير
                      </p>

                      <p
                        className={`mt-1 text-base font-bold ${
                          item.changePct >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {item.changePct >= 0
                          ? "+"
                          : ""}
                        {item.changePct.toFixed(2)}%
                      </p>
                    </div>

                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03] text-slate-500 transition duration-300 group-hover:-translate-x-1 group-hover:border-cyan-400/20 group-hover:bg-cyan-400/[0.08] group-hover:text-cyan-300">
                      ←
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <footer className="mt-16 border-t border-white/[0.06] pt-6 text-center">
          <p className="text-xs leading-6 text-slate-600">
            التحليلات مبنية على بيانات السوق ولا تمثل
            توصية مباشرة بالشراء أو البيع.
          </p>
        </footer>
      </section>

      <style jsx global>{`
        @keyframes marketTickerScroll {
          from {
            transform: translateX(0);
          }

          to {
            transform: translateX(-50%);
          }
        }

        .market-ticker-track {
          animation: marketTickerScroll 34s linear
            infinite;
          will-change: transform;
        }

        .market-ticker-track:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .market-ticker-track {
            animation: none;
            transform: none;
          }
        }
      `}</style>
    </main>
  );
}