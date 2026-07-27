"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type EventType =
  | "EARNINGS"
  | "GUIDANCE"
  | "CONTRACT"
  | "ACQUISITION"
  | "REGULATORY"
  | "LEGAL"
  | "MANAGEMENT"
  | "PRODUCT"
  | "ANALYST"
  | "GENERAL";

type Impact =
  | "POSITIVE"
  | "NEGATIVE"
  | "NEUTRAL";

type NewsItem = {
  id?: string;
  external_id: string;
  symbol: string;
  headline: string;
  summary: string | null;
  source: string | null;
  source_url: string | null;
  image_url: string | null;
  event_type: EventType;
  impact: Impact;
  importance: number;
  classification_reason: string | null;
  published_at: string;
  detected_at?: string;
};

type NewsApiResponse = {
  ok?: boolean;
  news?: NewsItem[];
  count?: number;
  updatedAt?: string;
  error?: string;
};

const EVENT_FILTERS: Array<{
  value: EventType | "ALL";
  label: string;
}> = [
  {
    value: "ALL",
    label: "كل الأخبار",
  },
  {
    value: "EARNINGS",
    label: "الأرباح",
  },
  {
    value: "GUIDANCE",
    label: "التوقعات",
  },
  {
    value: "CONTRACT",
    label: "العقود والصفقات",
  },
  {
    value: "ACQUISITION",
    label: "الاستحواذات",
  },
  {
    value: "REGULATORY",
    label: "تنظيمي",
  },
  {
    value: "LEGAL",
    label: "قانوني",
  },
  {
    value: "ANALYST",
    label: "المحللون",
  },
  {
    value: "PRODUCT",
    label: "المنتجات",
  },
];

const IMPACT_FILTERS: Array<{
  value: Impact | "ALL";
  label: string;
}> = [
  {
    value: "ALL",
    label: "كل التأثيرات",
  },
  {
    value: "POSITIVE",
    label: "إيجابي محتمل",
  },
  {
    value: "NEGATIVE",
    label: "سلبي محتمل",
  },
  {
    value: "NEUTRAL",
    label: "غير محسوم",
  },
];

const EVENT_LABELS:
  Record<EventType, string> = {
    EARNINGS: "إعلان أرباح",
    GUIDANCE: "توقعات وتوجيهات",
    CONTRACT: "عقد أو صفقة",
    ACQUISITION: "استحواذ أو اندماج",
    REGULATORY: "خبر تنظيمي",
    LEGAL: "خبر قانوني",
    MANAGEMENT: "تغيير إداري",
    PRODUCT: "منتج أو خدمة",
    ANALYST: "توصية محلل",
    GENERAL: "خبر جوهري",
  };

function impactLabel(
  impact: Impact
) {
  if (impact === "POSITIVE") {
    return "إيجابي محتمل";
  }

  if (impact === "NEGATIVE") {
    return "سلبي محتمل";
  }

  return "التأثير غير محسوم";
}

function impactClasses(
  impact: Impact
) {
  if (impact === "POSITIVE") {
    return "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300";
  }

  if (impact === "NEGATIVE") {
    return "border-rose-400/25 bg-rose-400/[0.08] text-rose-300";
  }

  return "border-amber-400/25 bg-amber-400/[0.08] text-amber-300";
}

function importanceClasses(
  value: number
) {
  if (value >= 90) {
    return "text-rose-300";
  }

  if (value >= 80) {
    return "text-amber-300";
  }

  return "text-cyan-300";
}

function formatPublishedTime(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "وقت غير معروف";
  }

  const difference =
    Date.now() -
    date.getTime();

  const minutes =
    Math.max(
      0,
      Math.floor(
        difference / 60_000
      )
    );

  if (minutes < 1) {
    return "الآن";
  }

  if (minutes < 60) {
    return `منذ ${minutes} دقيقة`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `منذ ${hours} ساعة`;
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

function normalizeSymbol(
  value: string
) {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9.-]/g,
      ""
    )
    .slice(0, 10);
}

export default function MarketNewsPage() {
  const router =
    useRouter();

  const [
    news,
    setNews,
  ] =
    useState<NewsItem[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    searching,
    setSearching,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    searchSymbol,
    setSearchSymbol,
  ] =
    useState("");

  const [
    activeSymbol,
    setActiveSymbol,
  ] =
    useState("");

  const [
    eventType,
    setEventType,
  ] =
    useState<
      EventType | "ALL"
    >("ALL");

  const [
    impact,
    setImpact,
  ] =
    useState<
      Impact | "ALL"
    >("ALL");

  const [
    updatedAt,
    setUpdatedAt,
  ] =
    useState("");

  const loadNews =
    useCallback(
      async (
        symbol = activeSymbol
      ) => {
        setLoading(true);
        setError("");

        try {
          const params =
            new URLSearchParams();

          params.set(
            "limit",
            "100"
          );

          if (symbol) {
            params.set(
              "symbol",
              symbol
            );
          }

          if (
            eventType !== "ALL"
          ) {
            params.set(
              "eventType",
              eventType
            );
          }

          if (
            impact !== "ALL"
          ) {
            params.set(
              "impact",
              impact
            );
          }

          const response =
            await fetch(
              `/api/market-news?${params.toString()}`,
              {
                cache: "no-store",
              }
            );

          const result =
            (await response.json()) as
              NewsApiResponse;

          if (
            !response.ok ||
            result.ok === false
          ) {
            throw new Error(
              result.error ||
                "تعذر تحميل الأخبار."
            );
          }

          setNews(
            result.news || []
          );

          setUpdatedAt(
            result.updatedAt || ""
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل الأخبار."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        activeSymbol,
        eventType,
        impact,
      ]
    );

  useEffect(() => {
    void loadNews();

    const timer =
      window.setInterval(
        () => {
          void loadNews();
        },
        60_000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [loadNews]);

  async function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const symbol =
      normalizeSymbol(
        searchSymbol
      );

    if (!symbol) {
      setError(
        "اكتب رمز سهم صالح."
      );
      return;
    }

    setSearching(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/market-news/search?symbol=${encodeURIComponent(
            symbol
          )}`,
          {
            cache: "no-store",
          }
        );

      const result =
        (await response.json()) as
          NewsApiResponse & {
            symbol?: string;
          };

      if (
        !response.ok ||
        result.ok === false
      ) {
        throw new Error(
          result.error ||
            `تعذر جلب أخبار ${symbol}.`
        );
      }

      setActiveSymbol(symbol);
      setSearchSymbol(symbol);

      await loadNews(symbol);
    } catch (
      searchError
    ) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "تعذر جلب أخبار الشركة."
      );
    } finally {
      setSearching(false);
    }
  }

  function clearSymbolFilter() {
    setActiveSymbol("");
    setSearchSymbol("");
  }

  const importantCount =
    useMemo(
      () =>
        news.filter(
          (item) =>
            item.importance >= 85
        ).length,
      [news]
    );

  const positiveCount =
    useMemo(
      () =>
        news.filter(
          (item) =>
            item.impact ===
            "POSITIVE"
        ).length,
      [news]
    );

  const negativeCount =
    useMemo(
      () =>
        news.filter(
          (item) =>
            item.impact ===
            "NEGATIVE"
        ).length,
      [news]
    );

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#020617] px-4 py-7 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.08] via-slate-950/90 to-violet-500/[0.06] p-5 shadow-2xl shadow-cyan-950/10 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/dashboard"
                  )
                }
                className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-4 py-2 text-sm font-bold text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
              >
                ← العودة للمنصة
              </button>

              <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-cyan-400">
                محركات السوق
              </p>

              <h1 className="mt-2 text-3xl font-black sm:text-4xl">
                أهم أخبار الأسهم الأمريكية
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                رصد تلقائي للأرباح والعقود والاستحواذات والتوقعات والأخبار التنظيمية والقانونية التي قد تؤثر على حركة السهم.
              </p>
            </div>

            <div className="grid min-w-[260px] grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/[0.07] bg-slate-950/70 p-3 text-center">
                <p className="text-xl font-black text-white">
                  {news.length}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  خبر معروض
                </p>
              </div>

              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-center">
                <p className="text-xl font-black text-amber-300">
                  {importantCount}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  عالي الأهمية
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3 text-center">
                <p className="text-xl font-black text-cyan-300">
                  5m
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  دورة الفحص
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-white/[0.08] bg-slate-950/70 p-5 shadow-xl shadow-black/20">
          <form
            onSubmit={
              handleSearch
            }
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={
                searchSymbol
              }
              onChange={(event) =>
                setSearchSymbol(
                  normalizeSymbol(
                    event.target.value
                  )
                )
              }
              placeholder="ابحث عن أي شركة مثل NVDA أو RIVN"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={10}
              className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-4 text-left text-lg font-black uppercase outline-none transition focus:border-cyan-400/40"
            />

            <button
              type="submit"
              disabled={
                searching ||
                !searchSymbol.trim()
              }
              className="rounded-2xl bg-gradient-to-l from-cyan-400 to-sky-500 px-7 py-4 font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {searching
                ? "جارٍ جلب الأخبار..."
                : "بحث الأخبار"}
            </button>

            {activeSymbol ? (
              <button
                type="button"
                onClick={
                  clearSymbolFilter
                }
                className="rounded-2xl border border-white/[0.08] bg-slate-900/70 px-5 py-4 font-black text-slate-300 transition hover:text-white"
              >
                عرض كل السوق
              </button>
            ) : null}
          </form>

          {activeSymbol ? (
            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-3 text-sm font-bold text-cyan-200">
              تعرض الآن أخبار{" "}
              <span className="font-black">
                {activeSymbol}
              </span>
            </div>
          ) : null}
        </section>

        <section className="mb-6 space-y-4 rounded-3xl border border-white/[0.08] bg-slate-950/55 p-5">
          <div className="flex flex-wrap gap-2">
            {EVENT_FILTERS.map(
              (filter) => (
                <button
                  key={
                    filter.value
                  }
                  type="button"
                  onClick={() =>
                    setEventType(
                      filter.value
                    )
                  }
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-black transition",
                    eventType ===
                    filter.value
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                      : "border-white/[0.07] bg-slate-900/65 text-slate-400 hover:text-white",
                  ].join(" ")}
                >
                  {filter.label}
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {IMPACT_FILTERS.map(
              (filter) => (
                <button
                  key={
                    filter.value
                  }
                  type="button"
                  onClick={() =>
                    setImpact(
                      filter.value
                    )
                  }
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-black transition",
                    impact ===
                    filter.value
                      ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
                      : "border-white/[0.07] bg-slate-900/65 text-slate-400 hover:text-white",
                  ].join(" ")}
                >
                  {filter.label}
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              إيجابي:{" "}
              <strong className="text-emerald-300">
                {positiveCount}
              </strong>
            </span>

            <span>
              سلبي:{" "}
              <strong className="text-rose-300">
                {negativeCount}
              </strong>
            </span>

            {updatedAt ? (
              <span className="mr-auto">
                آخر تحميل:{" "}
                {formatPublishedTime(
                  updatedAt
                )}
              </span>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="mb-6 rounded-3xl border border-rose-400/20 bg-rose-400/[0.07] p-5 font-bold text-rose-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-white/[0.08] bg-slate-950/65 p-12 text-center font-bold text-slate-400">
            جارٍ تحميل أخبار السوق...
          </div>
        ) : null}

        {!loading &&
        news.length === 0 ? (
          <div className="rounded-3xl border border-white/[0.08] bg-slate-950/65 p-12 text-center">
            <p className="text-xl font-black text-white">
              لا توجد أخبار مطابقة
            </p>

            <p className="mt-3 text-sm text-slate-500">
              غيّر الفلاتر أو ابحث عن رمز آخر.
            </p>
          </div>
        ) : null}

        {!loading &&
        news.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {news.map(
              (item) => (
                <article
                  key={
                    item.external_id
                  }
                  className="group flex flex-col rounded-3xl border border-white/[0.08] bg-slate-950/70 p-5 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-cyan-400/20"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/stocks/${encodeURIComponent(
                            item.symbol
                          )}`
                        )
                      }
                      className="rounded-xl bg-cyan-400/10 px-3 py-1.5 text-sm font-black text-cyan-300 transition hover:bg-cyan-400/20"
                    >
                      {item.symbol}
                    </button>

                    <span className="rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-3 py-1.5 text-xs font-black text-violet-300">
                      {
                        EVENT_LABELS[
                          item
                            .event_type
                        ]
                      }
                    </span>

                    <span
                      className={[
                        "rounded-xl border px-3 py-1.5 text-xs font-black",
                        impactClasses(
                          item.impact
                        ),
                      ].join(" ")}
                    >
                      {impactLabel(
                        item.impact
                      )}
                    </span>

                    <span
                      className={[
                        "mr-auto text-xs font-black",
                        importanceClasses(
                          item.importance
                        ),
                      ].join(" ")}
                    >
                      الأهمية{" "}
                      {item.importance}
                      /100
                    </span>
                  </div>

                  <h2 className="mt-4 text-xl font-black leading-8 text-white">
                    {item.headline}
                  </h2>

                  {item.summary ? (
                    <p className="mt-3 line-clamp-4 text-sm leading-7 text-slate-400">
                      {item.summary}
                    </p>
                  ) : null}

                  {item.classification_reason ? (
                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-slate-900/65 p-3 text-sm leading-6 text-slate-300">
                      {
                        item.classification_reason
                      }
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5 text-xs text-slate-500">
                    <span>
                      {item.source ||
                        "مصدر غير معروف"}{" "}
                      •{" "}
                      {formatPublishedTime(
                        item.published_at
                      )}
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/stocks/${encodeURIComponent(
                              item.symbol
                            )}`
                          )
                        }
                        className="font-black text-cyan-300 hover:text-cyan-200"
                      >
                        تحليل السهم
                      </button>

                      {item.source_url ? (
                        <a
                          href={
                            item.source_url
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="font-black text-slate-300 hover:text-white"
                        >
                          المصدر
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            )}
          </section>
        ) : null}

        <p className="mt-8 text-center text-xs leading-6 text-slate-600">
          تصنيف تأثير الأخبار تحليلي واحتمالي، ولا يضمن اتجاه حركة السهم ولا يمثل توصية مباشرة بالشراء أو البيع.
        </p>
      </div>
    </main>
  );
}
