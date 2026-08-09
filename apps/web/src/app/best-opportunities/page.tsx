"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  createOpportunity,
  type AnalysisResponse,
  type Opportunity,
} from "@/lib/analysis-engine";

const SCAN_SYMBOLS = [
  "AMZN",
  "NVDA",
  "AMD",
  "AAPL",
  "META",
  "MSTR",
  "MSFT",
  "AVGO",
  "TSLA",
  "QQQ",
];

const BATCH_SIZE = 2;
const BATCH_DELAY_MS = 750;
const REFRESH_INTERVAL_MS =
  60_000;

function clamp(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Math.min(
    Math.max(
      value,
      minimum,
    ),
    maximum,
  );
}

function getTradePlan(
  item: Opportunity,
) {
  const strength =
    clamp(
      item.score,
      50,
      100,
    );

  const targetMovePct =
    1.2 +
    ((strength - 50) /
      50) *
      1.8;

  const stopMovePct =
    0.75 +
    ((100 - strength) /
      50) *
      0.45;

  const direction =
    item.side === "PUT"
      ? -1
      : 1;

  const fallbackEntry =
    item.price;

  const fallbackTarget =
    fallbackEntry *
    (1 +
      direction *
        (targetMovePct /
          100));

  const fallbackStop =
    fallbackEntry *
    (1 -
      direction *
        (stopMovePct /
          100));

  const storedPlan =
    item.tradePlan;

  const target =
    storedPlan
      ?.targets?.[0];

  const risk =
    item.score >= 85
      ? "منخفضة"
      : item.score >= 70
        ? "متوسطة"
        : "مرتفعة";

  return {
    entry:
      storedPlan
        ?.entryPrice &&
      storedPlan.entryPrice >
        0
        ? storedPlan.entryPrice
        : fallbackEntry,

    target:
      target?.price &&
      target.price > 0
        ? target.price
        : fallbackTarget,

    stop:
      storedPlan
        ?.stopPrice &&
      storedPlan.stopPrice >
        0
        ? storedPlan.stopPrice
        : fallbackStop,

    reachProbability:
      target?.probability
        ? clamp(
            Math.round(
              target.probability,
            ),
            1,
            99,
          )
        : clamp(
            Math.round(
              item.score,
            ),
            1,
            99,
          ),

    risk,
  };
}

function cleanContractTicker(
  value: string,
) {
  return value.replace(
    /^O:/,
    "",
  );
}

function formatExpiration(
  value: string,
) {
  if (!value) {
    return "غير متاح";
  }

  const date =
    new Date(
      `${value}T12:00:00Z`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(date);
}

function gammaRiskText(
  level:
    Opportunity[
      "gammaRiskLevel"
    ],
) {
  if (level === "LOW") {
    return "منخفضة";
  }

  if (level === "HIGH") {
    return "مرتفعة";
  }

  return "متوسطة";
}

function sideClasses(
  side: Opportunity["side"],
) {
  return side === "CALL"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
    : "border-rose-400/25 bg-rose-400/10 text-rose-300";
}

function scoreClasses(
  score: number,
) {
  if (score >= 85) {
    return "border-emerald-400/30 text-emerald-300";
  }

  return "border-amber-400/30 text-amber-300";
}

function filterOpportunities(
  items: Opportunity[],
) {
  return items
    .filter(
      (item) =>
        item.side !==
          "NEUTRAL" &&
        item.score >= 70 &&
        item.contract !==
          null &&
        item.contractScore >=
          75 &&
        item.consensusStatus !==
          "CONFLICTED" &&
        item.gammaRiskLevel !==
          "HIGH",
    )
    .sort(
      (a, b) =>
        b.score -
          a.score ||
        b.contractScore -
          a.contractScore ||
        a.gammaRiskScore -
          b.gammaRiskScore,
    );
}

export default function BestOpportunitiesPage() {
  const router =
    useRouter();

  const [
    opportunities,
    setOpportunities,
  ] = useState<
    Opportunity[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    updatedAt,
    setUpdatedAt,
  ] = useState("");

  const loadOpportunities =
    useCallback(
      async (
        manual = false,
      ) => {
        if (manual) {
          setRefreshing(true);
        }

        setError("");

        const results:
          Opportunity[] = [];

        try {
          for (
            let start = 0;
            start <
            SCAN_SYMBOLS.length;
            start +=
              BATCH_SIZE
          ) {
            const batch =
              SCAN_SYMBOLS.slice(
                start,
                start +
                  BATCH_SIZE,
              );

            const settled =
              await Promise.allSettled(
                batch.map(
                  async (
                    stockSymbol,
                  ) => {
                    const response =
                      await fetch(
                        `/api/analysis/${encodeURIComponent(
                          stockSymbol,
                        )}`,
                        {
                          cache:
                            "no-store",
                        },
                      );

                    if (
                      !response.ok
                    ) {
                      throw new Error(
                        `تعذر تحليل ${stockSymbol}`,
                      );
                    }

                    const analysis =
                      (await response.json()) as
                        AnalysisResponse;

                    return createOpportunity(
                      analysis,
                    );
                  },
                ),
              );

            for (
              const result of
              settled
            ) {
              if (
                result.status ===
                "fulfilled"
              ) {
                results.push(
                  result.value,
                );
              }
            }

            /*
              تحديث تدريجي:
              أي فرصة مؤهلة تظهر
              فور انتهاء دفعتها.
            */
            setOpportunities(
              filterOpportunities(
                [...results],
              ),
            );

            const hasMore =
              start +
                BATCH_SIZE <
              SCAN_SYMBOLS.length;

            if (hasMore) {
              await new Promise<void>(
                (resolve) =>
                  window.setTimeout(
                    resolve,
                    BATCH_DELAY_MS,
                  ),
              );
            }
          }

          setUpdatedAt(
            new Date()
              .toISOString(),
          );
        } catch (
          loadError
        ) {
          console.error(
            "Failed to load best opportunities:",
            loadError,
          );

          setError(
            "تعذر تحديث أفضل الفرص حاليًا.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadOpportunities();

    const timer =
      window.setInterval(
        () => {
          void loadOpportunities();
        },
        REFRESH_INTERVAL_MS,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [loadOpportunities]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#020817] text-white"
    >
      <section className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/dashboard",
                )
              }
              className="mb-5 text-sm font-bold text-slate-400 transition hover:text-cyan-300"
            >
              → العودة للمنصة
            </button>

            <p className="text-xs font-black tracking-[0.16em] text-cyan-400">
              رصد الفرص
            </p>

            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              أفضل الفرص الآن
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              الفرص التي اجتازت
              شروط الاتجاه وجودة
              العقد والتوافق
              ومخاطر القاما.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/[0.07] bg-slate-950/70 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-500">
                الفرص الحالية
              </p>

              <p className="mt-1 text-xl font-black text-cyan-300">
                {
                  opportunities.length
                }
              </p>
            </div>

            <button
              type="button"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadOpportunities(
                  true,
                )
              }
              className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-300 transition hover:border-cyan-300/50 disabled:opacity-50"
            >
              {refreshing
                ? "جارٍ التحديث..."
                : "تحديث الآن"}
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-slate-950/60 px-4 py-3 text-xs font-bold text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>

          <span>
            تحديث تلقائي كل
            دقيقة
          </span>

          {updatedAt ? (
            <>
              <span className="text-slate-700">
                •
              </span>

              <span>
                آخر تحديث:{" "}
                {new Intl.DateTimeFormat(
                  "ar-SA",
                  {
                    timeZone:
                      "Asia/Riyadh",
                    hour:
                      "2-digit",
                    minute:
                      "2-digit",
                    second:
                      "2-digit",
                    hour12:
                      true,
                  },
                ).format(
                  new Date(
                    updatedAt,
                  ),
                )}
              </span>
            </>
          ) : null}
        </div>

        {loading &&
        opportunities.length ===
          0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {SCAN_SYMBOLS.slice(
              0,
              4,
            ).map(
              (stock) => (
                <div
                  key={stock}
                  className="h-64 animate-pulse rounded-3xl border border-white/[0.06] bg-slate-950/60"
                />
              ),
            )}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-rose-300">
            {error}
          </div>
        ) : null}

        {!loading &&
        !error &&
        opportunities.length ===
          0 ? (
          <div className="rounded-3xl border border-white/[0.07] bg-slate-950/60 p-10 text-center">
            <p className="text-lg font-black text-white">
              لا توجد فرصة
              مطابقة للشروط
              حاليًا
            </p>

            <p className="mt-2 text-sm text-slate-500">
              سيتم تحديث الصفحة
              تلقائيًا عند الفحص
              التالي.
            </p>
          </div>
        ) : null}

        {opportunities.length >
        0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {opportunities.map(
              (item) => {
                const plan =
                  getTradePlan(
                    item,
                  );

                const contract =
                  item.contract;

                return (
                  <article
                    key={
                      item.symbol
                    }
                    className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-slate-950/70 p-5 shadow-xl shadow-black/10 sm:p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-3xl font-black">
                            {
                              item.symbol
                            }
                          </h2>

                          <span
                            className={[
                              "rounded-lg border px-2.5 py-1 text-[11px] font-black",
                              sideClasses(
                                item.side,
                              ),
                            ].join(
                              " ",
                            )}
                          >
                            {
                              item.side
                            }
                          </span>
                        </div>

                        <p className="mt-3 text-sm font-bold text-slate-300">
                          {
                            item.status
                          }
                        </p>

                        <p className="mt-2 text-xs text-slate-500">
                          مستوى الثقة:{" "}
                          <span className="text-slate-300">
                            {
                              item.confidence
                            }
                          </span>
                        </p>
                      </div>

                      <div
                        className={[
                          "flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border bg-slate-950",
                          scoreClasses(
                            item.score,
                          ),
                        ].join(
                          " ",
                        )}
                      >
                        <span className="text-2xl font-black">
                          {
                            item.score
                          }
                        </span>

                        <span className="mt-1 text-[9px] text-slate-600">
                          التقييم
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold">
                      <span className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-2.5 py-1 text-cyan-300">
                        {
                          item.contractQuality
                        }{" "}
                        •{" "}
                        {
                          item.contractScore
                        }
                        /100
                      </span>

                      <span className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-slate-300">
                        {
                          item.consensusLabel
                        }
                      </span>

                      <span className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-2.5 py-1 text-amber-300">
                        مخاطرة القاما:{" "}
                        {gammaRiskText(
                          item.gammaRiskLevel,
                        )}
                      </span>
                    </div>

                    {contract ? (
                      <div className="mt-5 overflow-hidden rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035]">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                          <div>
                            <p className="text-[10px] font-bold text-cyan-400">
                              العقد المختار
                            </p>

                            <p
                              dir="ltr"
                              className="mt-1 text-sm font-black text-white"
                            >
                              {cleanContractTicker(
                                contract.ticker,
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] text-slate-500">
                              السعر المرجعي
                            </p>

                            <p className="mt-1 text-lg font-black text-cyan-300">
                              $
                              {contract.midpoint.toFixed(
                                2,
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-px bg-white/[0.05] sm:grid-cols-6">
                          {[
                            [
                              "السترايك",
                              `$${contract.strike.toFixed(
                                2,
                              )}`,
                            ],
                            [
                              "الانتهاء",
                              formatExpiration(
                                contract.expiration,
                              ),
                            ],
                            [
                              "دلتا",
                              Math.abs(
                                contract.delta,
                              ).toFixed(
                                2,
                              ),
                            ],
                            [
                              "السبريد",
                              contract.spreadPct ===
                              null
                                ? "—"
                                : `${contract.spreadPct.toFixed(
                                    1,
                                  )}%`,
                            ],
                            [
                              "الفوليوم",
                              contract.volume.toLocaleString(
                                "en-US",
                              ),
                            ],
                            [
                              "OI",
                              contract.openInterest.toLocaleString(
                                "en-US",
                              ),
                            ],
                          ].map(
                            ([
                              label,
                              value,
                            ]) => (
                              <div
                                key={
                                  label
                                }
                                className="bg-[#07111f]/90 px-2 py-3 text-center"
                              >
                                <p className="text-[9px] text-slate-600">
                                  {
                                    label
                                  }
                                </p>

                                <p className="mt-1 text-[11px] font-black text-slate-200">
                                  {
                                    value
                                  }
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.025] p-3 text-center">
                        <p className="text-[10px] text-slate-500">
                          دخول السهم
                        </p>
                        <p className="mt-1 font-black">
                          $
                          {plan.entry.toFixed(
                            2,
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-3 text-center">
                        <p className="text-[10px] text-slate-500">
                          الهدف
                        </p>
                        <p className="mt-1 font-black text-emerald-300">
                          $
                          {plan.target.toFixed(
                            2,
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] p-3 text-center">
                        <p className="text-[10px] text-slate-500">
                          الوقف
                        </p>
                        <p className="mt-1 font-black text-amber-300">
                          $
                          {plan.stop.toFixed(
                            2,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05] px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-emerald-300">
                          نسبة الوصول
                          التقديرية:{" "}
                          {
                            plan.reachProbability
                          }
                          %
                        </span>

                        <span className="text-xs text-slate-400">
                          المخاطرة
                          السعرية:{" "}
                          {
                            plan.risk
                          }
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/stocks/${encodeURIComponent(
                            item.symbol,
                          )}`,
                        )
                      }
                      className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
                    >
                      فتح التحليل الكامل ←
                    </button>
                  </article>
                );
              },
            )}
          </div>
        ) : null}

        <p className="mt-10 text-center text-xs leading-6 text-slate-600">
          التحليلات مبنية على
          بيانات السوق ولا تمثل
          توصية مباشرة بالشراء أو
          البيع.
        </p>
      </section>
    </main>
  );
}
