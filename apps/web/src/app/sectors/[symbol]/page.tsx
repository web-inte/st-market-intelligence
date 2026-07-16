"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";

type CompanyItem = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePct: number;
  fiveDayChangePct: number;
  relativeStrengthPct: number;
  volumeRatio: number;
  strengthScore: number;
  status: string;
  trend: "UP" | "DOWN" | "FLAT";
  flowState: string;
  dataAvailable: boolean;
  dataError: string | null;
  rank: number;
};

type SectorItem = {
  symbol: string;
  name: string;
  icon: string;
  price: number;
  dailyChangePct: number;
  fiveDayChangePct: number;
  relativeStrengthPct: number;
  volumeRatio: number;
  strengthScore: number;
  status: string;
  flowState: string;
  dataAvailable: boolean;
  rank: number;
};

type DetailResponse = {
  ok: boolean;
  updatedAt: string;
  sector: SectorItem;
  companies: CompanyItem[];
  summary: {
    requestedCompanies: number;
    availableCompanies: number;
    risingCount: number;
    fallingCount: number;
    strongestCompany: CompanyItem | null;
    weakestCompany: CompanyItem | null;
    averageDailyChangePct: number;
    averageFiveDayChangePct: number;
  };
};

function sectorDetailStorageKey(
  symbol: string
) {
  return `st-sector-detail-v11:${symbol}`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function changeClass(value: number) {
  if (value > 0) {
    return "text-emerald-400";
  }

  if (value < 0) {
    return "text-rose-400";
  }

  return "text-slate-400";
}

function scoreClass(
  score: number,
  available = true
) {
  if (!available) {
    return "text-slate-500";
  }

  if (score >= 80) {
    return "text-emerald-300";
  }

  if (score >= 65) {
    return "text-cyan-300";
  }

  if (score < 30) {
    return "text-rose-300";
  }

  return "text-amber-300";
}

function flowClass(value: string) {
  if (value.includes("دخول")) {
    return "text-emerald-300";
  }

  if (value.includes("خروج")) {
    return "text-rose-300";
  }

  return "text-slate-400";
}

export default function SectorDetailsPage() {
  const params =
    useParams<{
      symbol: string;
    }>();

  const symbol =
    useMemo(
      () =>
        String(
          params?.symbol ?? ""
        )
          .trim()
          .toUpperCase(),
      [params]
    );

  const [data, setData] =
    useState<DetailResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;
    let running = false;

    try {
      const cached =
        window.localStorage.getItem(
          sectorDetailStorageKey(
            symbol
          )
        );

      if (cached) {
        const parsed =
          JSON.parse(
            cached
          ) as DetailResponse;

        if (
          parsed?.ok &&
          parsed.sector?.symbol ===
            symbol
        ) {
          setData(parsed);
          setLoading(false);
        }
      }
    } catch (cacheError) {
      console.warn(
        "Failed to restore sector detail cache:",
        cacheError
      );
    }

    async function load() {
      if (running) return;

      running = true;

      try {
        const response =
          await fetch(
            `/api/sectors?symbol=${encodeURIComponent(
              symbol
            )}`,
            {
              cache: "no-store",
            }
          );

        const payload =
          await response.json();

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "تعذر تحميل القطاع"
          );
        }

        if (!cancelled) {
          setData(payload);
          setError("");

          try {
            window.localStorage.setItem(
              sectorDetailStorageKey(
                symbol
              ),
              JSON.stringify(
                payload
              )
            );
          } catch (cacheError) {
            console.warn(
              "Failed to save sector detail cache:",
              cacheError
            );
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل القطاع"
          );
        }
      } finally {
        running = false;

        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    const timer =
      window.setInterval(() => {
        void load();
      }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(
        timer
      );
    };
  }, [symbol]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#030914] px-4 py-6 text-white sm:px-7 sm:py-10"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black transition hover:bg-white/10"
          >
            ← العودة إلى المنصة
          </Link>

          <Link
            href={`/gamma-liquidity?symbol=${encodeURIComponent(
              symbol
            )}`}
            className="rounded-xl border border-violet-400/25 bg-violet-400/10 px-4 py-3 text-sm font-black text-violet-300 transition hover:bg-violet-400/15"
          >
            تحليل قاما وسيولة القطاع
          </Link>
        </div>

        {loading && !data ? (
          <div className="h-96 animate-pulse rounded-3xl border border-white/[0.07] bg-slate-950/60" />
        ) : null}

        {error && !data ? (
          <div className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-8 text-center text-rose-300">
            <p className="text-xl font-black">
              تعذر تحميل تفاصيل القطاع
            </p>

            <p className="mt-3 text-sm">
              {error}
            </p>
          </div>
        ) : null}

        {data ? (
          <>
            <header className="mb-6 rounded-3xl border border-white/[0.08] bg-gradient-to-l from-violet-500/10 via-slate-950/80 to-cyan-500/10 p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-4xl">
                      {
                        data.sector
                          .icon
                      }
                    </span>

                    <div>
                      <p className="text-xs font-black text-violet-300">
                        تحليل القطاع
                      </p>

                      <h1 className="mt-1 text-3xl font-black sm:text-5xl">
                        {
                          data.sector
                            .name
                        }
                      </h1>
                    </div>

                    <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-black">
                      {
                        data.sector
                          .symbol
                      }
                    </span>
                  </div>

                  <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-400">
                    جميع أهم شركات القطاع ظاهرة أدناه، مع السعر، تغير اليوم،
                    أداء خمس جلسات، القوة أمام SPY، ونشاط الحجم.
                  </p>
                </div>

                <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.055] px-7 py-5 text-center">
                  <p className="text-xs text-slate-500">
                    درجة قوة القطاع
                  </p>

                  <p
                    className={`mt-2 text-5xl font-black ${scoreClass(
                      data.sector
                        .strengthScore,
                      data.sector
                        .dataAvailable
                    )}`}
                  >
                    {data.sector
                      .dataAvailable
                      ? data.sector
                          .strengthScore
                      : "—"}
                  </p>

                  <p className="mt-1 text-sm font-black text-slate-300">
                    {
                      data.sector
                        .status
                    }
                  </p>

                  <p
                    className={`mt-2 text-xs font-black ${flowClass(
                      data.sector
                        .flowState
                    )}`}
                  >
                    {
                      data.sector
                        .flowState
                    }
                  </p>
                </div>
              </div>
            </header>

            {data.sector
              .dataAvailable ? (
              <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
                {[
                  [
                    "آخر سعر",
                    `$${data.sector.price.toFixed(
                      2
                    )}`,
                    "text-white",
                  ],
                  [
                    "تغير اليوم",
                    signed(
                      data.sector
                        .dailyChangePct
                    ),
                    changeClass(
                      data.sector
                        .dailyChangePct
                    ),
                  ],
                  [
                    "أداء 5 جلسات",
                    signed(
                      data.sector
                        .fiveDayChangePct
                    ),
                    changeClass(
                      data.sector
                        .fiveDayChangePct
                    ),
                  ],
                  [
                    "القوة أمام SPY",
                    signed(
                      data.sector
                        .relativeStrengthPct
                    ),
                    changeClass(
                      data.sector
                        .relativeStrengthPct
                    ),
                  ],
                  [
                    "الحجم مقابل الجلسة السابقة",
                    `${data.sector.volumeRatio.toFixed(
                      2
                    )}×`,
                    "text-white",
                  ],
                  [
                    "ترتيب القطاع",
                    `المركز ${data.sector.rank}`,
                    "text-violet-300",
                  ],
                ].map(
                  ([
                    label,
                    value,
                    className,
                  ]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-slate-950/65 p-4"
                    >
                      <p className="text-xs text-slate-500">
                        {label}
                      </p>

                      <p
                        className={`mt-2 text-xl font-black ${className}`}
                      >
                        {value}
                      </p>
                    </div>
                  )
                )}
              </section>
            ) : null}

            <section className="mb-7 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
                <p className="text-xs font-black text-emerald-300">
                  أقوى شركة داخل القطاع
                </p>

                <p className="mt-3 text-2xl font-black">
                  {data.summary
                    .strongestCompany
                    ?.name ??
                    "غير متاح"}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {data.summary
                    .strongestCompany
                    ?.symbol ?? "—"}
                </p>
              </div>

              <div className="rounded-3xl border border-rose-400/15 bg-rose-400/[0.04] p-5">
                <p className="text-xs font-black text-rose-300">
                  أضعف شركة داخل القطاع
                </p>

                <p className="mt-3 text-2xl font-black">
                  {data.summary
                    .weakestCompany
                    ?.name ??
                    "غير متاح"}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {data.summary
                    .weakestCompany
                    ?.symbol ?? "—"}
                </p>
              </div>
            </section>

            <div className="mb-5">
              <p className="text-xs font-black text-cyan-300">
                أهم الشركات
              </p>

              <h2 className="mt-2 text-2xl font-black">
                ترتيب شركات القطاع حسب القوة
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                تم عرض{" "}
                {
                  data.summary
                    .requestedCompanies
                } من{" "}
                {
                  data.summary
                    .requestedCompanies
                } شركة • بيانات متاحة{" "}
                {
                  data.summary
                    .availableCompanies
                }{" "}
                • صاعدة{" "}
                {
                  data.summary
                    .risingCount
                }{" "}
                • هابطة{" "}
                {
                  data.summary
                    .fallingCount
                }
              </p>
            </div>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.companies.map(
                (company) => (
                  <article
                    key={
                      company.symbol
                    }
                    className="rounded-3xl border border-white/[0.08] bg-slate-950/65 p-5 shadow-xl shadow-black/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-2xl font-black">
                          {
                            company.symbol
                          }
                        </p>

                        <p className="mt-1 text-sm text-slate-400">
                          {
                            company.name
                          }
                        </p>

                        <p className="mt-2 text-xs text-slate-600">
                          المركز{" "}
                          {
                            company.rank
                          }
                        </p>
                      </div>

                      <p
                        className={`text-3xl font-black ${scoreClass(
                          company.strengthScore,
                          company.dataAvailable
                        )}`}
                      >
                        {company.dataAvailable
                          ? company.strengthScore
                          : "—"}
                      </p>
                    </div>

                    {company.dataAvailable ? (
                      <>
                        <div className="my-4 h-px bg-white/[0.06]" />

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500">
                              السعر
                            </p>

                            <p className="mt-1 font-black">
                              $
                              {company.price.toFixed(
                                2
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500">
                              اليوم
                            </p>

                            <p
                              className={`mt-1 font-black ${changeClass(
                                company.dailyChangePct
                              )}`}
                            >
                              {signed(
                                company.dailyChangePct
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500">
                              5 جلسات
                            </p>

                            <p
                              className={`mt-1 font-black ${changeClass(
                                company.fiveDayChangePct
                              )}`}
                            >
                              {signed(
                                company.fiveDayChangePct
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500">
                              مقابل SPY
                            </p>

                            <p
                              className={`mt-1 font-black ${changeClass(
                                company.relativeStrengthPct
                              )}`}
                            >
                              {signed(
                                company.relativeStrengthPct
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500">
                              الحجم
                            </p>

                            <p className="mt-1 font-black">
                              {company.volumeRatio.toFixed(
                                2
                              )}
                              ×
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500">
                              حركة السيولة
                            </p>

                            <p
                              className={`mt-1 font-black ${flowClass(
                                company.flowState
                              )}`}
                            >
                              {
                                company.flowState
                              }
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
                        <p className="text-sm font-black text-amber-300">
                          البيانات غير متاحة مؤقتًا
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          ستبقى الشركة ظاهرة وسيعيد النظام المحاولة تلقائيًا.
                        </p>
                      </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <Link
                        href={`/stocks/${encodeURIComponent(
                          company.symbol
                        )}`}
                        className="rounded-xl bg-cyan-400 px-3 py-3 text-center text-xs font-black text-slate-950 transition hover:bg-cyan-300"
                      >
                        تحليل السهم
                      </Link>

                      <Link
                        href={`/gamma-liquidity?symbol=${encodeURIComponent(
                          company.symbol
                        )}`}
                        className="rounded-xl border border-violet-400/25 bg-violet-400/10 px-3 py-3 text-center text-xs font-black text-violet-300 transition hover:bg-violet-400/15"
                      >
                        القاما والسيولة
                      </Link>
                    </div>
                  </article>
                )
              )}
            </section>

            <section className="mt-7 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
              <p className="font-black text-amber-300">
                ملاحظة منهجية
              </p>

              <p className="mt-3 text-sm leading-7 text-slate-400">
                حركة الأموال والقوة النسبية تقديرات مبنية على السعر والزخم
                والحجم، وليست قياسًا مباشرًا لصافي تدفقات الصناديق ولا تمثل
                توصية شراء أو بيع.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
