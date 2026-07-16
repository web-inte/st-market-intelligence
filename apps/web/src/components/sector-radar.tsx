"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

type SectorCompany = {
  symbol: string;
  name: string;
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
  trend: "UP" | "DOWN" | "FLAT";
  flowState: string;
  dataAvailable: boolean;
  dataError: string | null;
  rank: number;
  companies: SectorCompany[];
};

type SectorResponse = {
  ok: boolean;
  updatedAt: string;
  summary: {
    requestedCount: number;
    availableCount: number;
    risingCount: number;
    fallingCount: number;
    flatCount: number;
    breadthLabel: string;
    strongest: SectorItem | null;
    weakest: SectorItem | null;
  };
  rotation: {
    label: string;
    from: SectorItem | null;
    to: SectorItem | null;
    confidence: string;
    spread: number;
    explanation: string;
  };
  sectors: SectorItem[];
};

const SECTOR_STORAGE_KEY = "st-sector-overview-v11";

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

function cardClass(
  score: number,
  available: boolean
) {
  if (!available) {
    return "border-slate-700/60 hover:border-slate-600";
  }

  if (score >= 80) {
    return "border-emerald-400/25 hover:border-emerald-400/45";
  }

  if (score >= 65) {
    return "border-cyan-400/20 hover:border-cyan-400/40";
  }

  if (score < 30) {
    return "border-rose-400/25 hover:border-rose-400/45";
  }

  return "border-white/[0.08] hover:border-white/20";
}

function flowClass(value: string) {
  if (
    value.includes("دخول")
  ) {
    return "text-emerald-300";
  }

  if (
    value.includes("خروج")
  ) {
    return "text-rose-300";
  }

  return "text-slate-400";
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatUpdatedAt(
  value?: string
) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(
      "ar-SA",
      {
        timeZone:
          "Asia/Riyadh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
    ).format(new Date(value));
  } catch {
    return "—";
  }
}

export default function SectorRadar() {
  const router =
    useRouter();

  const [data, setData] =
    useState<SectorResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;
    let running = false;

    try {
      const cached =
        window.localStorage.getItem(
          SECTOR_STORAGE_KEY
        );

      if (cached) {
        const parsed =
          JSON.parse(
            cached
          ) as SectorResponse;

        if (
          parsed?.ok &&
          Array.isArray(
            parsed.sectors
          )
        ) {
          setData(parsed);
          setLoading(false);
        }
      }
    } catch (cacheError) {
      console.warn(
        "Failed to restore sector cache:",
        cacheError
      );
    }

    async function load() {
      if (running) return;

      running = true;

      try {
        const response =
          await fetch(
            "/api/sectors",
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
              "تعذر تحميل القطاعات"
          );
        }

        if (!cancelled) {
          setData(payload);
          setError("");

          try {
            window.localStorage.setItem(
              SECTOR_STORAGE_KEY,
              JSON.stringify(
                payload
              )
            );
          } catch (cacheError) {
            console.warn(
              "Failed to save sector cache:",
              cacheError
            );
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل القطاعات"
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
  }, []);

  const sectors =
    useMemo(
      () =>
        data?.sectors ?? [],
      [data]
    );

  return (
    <section className="mb-12">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-400">
            خريطة حركة الأموال
          </p>

          <h2 className="mt-2 text-2xl font-black sm:text-3xl">
            خريطة القطاعات
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            جميع القطاعات الـ12 مرتبة حسب تغير اليوم، أداء خمس جلسات،
            القوة أمام SPY، ونشاط الحجم.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          <p>
            آخر تحديث:{" "}
            {formatUpdatedAt(
              data?.updatedAt
            )}
          </p>

          {data ? (
            <p className="mt-1 font-bold text-cyan-300">
              تم عرض{" "}
              {
                data.summary
                  .requestedCount
              } من{" "}
              {
                data.summary
                  .requestedCount
              } قطاع
            </p>
          ) : null}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({
            length: 12,
          }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-3xl border border-white/[0.06] bg-slate-950/60"
            />
          ))}
        </div>
      ) : null}

      {error && !data ? (
        <div className="rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-rose-300">
          <p className="font-black">
            تعذر تحميل خريطة القطاعات
          </p>

          <p className="mt-2 text-sm text-rose-300/70">
            {error}
          </p>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <p className="text-xs text-slate-500">
                أقوى قطاع
              </p>

              <p className="mt-2 font-black text-emerald-300">
                {data.summary.strongest
                  ? `${data.summary.strongest.icon} ${data.summary.strongest.name}`
                  : "—"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {data.summary.strongest
                  ? `${data.summary.strongest.symbol} • ${signed(
                      data.summary.strongest.dailyChangePct
                    )}`
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.04] p-4">
              <p className="text-xs text-slate-500">
                أضعف قطاع
              </p>

              <p className="mt-2 font-black text-rose-300">
                {data.summary.weakest
                  ? `${data.summary.weakest.icon} ${data.summary.weakest.name}`
                  : "—"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {data.summary.weakest
                  ? `${data.summary.weakest.symbol} • ${signed(
                      data.summary.weakest.dailyChangePct
                    )}`
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
              <p className="text-xs text-slate-500">
                اتساع القطاعات
              </p>

              <p className="mt-2 font-black text-cyan-300">
                {
                  data.summary
                    .breadthLabel
                }
              </p>

              <p className="mt-1 text-xs text-slate-500">
                صاعدة{" "}
                {
                  data.summary
                    .risingCount
                }{" "}
                • هابطة{" "}
                {
                  data.summary
                    .fallingCount
                }{" "}
                • مستقرة{" "}
                {
                  data.summary
                    .flatCount
                }
              </p>
            </div>

            <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-4">
              <p className="text-xs text-slate-500">
                حالة الدوران
              </p>

              <p className="mt-2 font-black text-violet-300">
                {
                  data.rotation
                    .label
                }
              </p>

              <p className="mt-1 text-xs text-slate-500">
                الثقة:{" "}
                {
                  data.rotation
                    .confidence
                }
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-3xl border border-violet-400/25 bg-gradient-to-l from-violet-400/[0.1] to-cyan-400/[0.04] p-5">
            <p className="text-xs font-black text-violet-300">
              حركة الأموال بين القطاعات
            </p>

            {data.rotation.from &&
            data.rotation.to ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-center">
                    <p className="text-xs text-slate-500">
                      خروج نسبي من
                    </p>

                    <p className="mt-2 text-lg font-black text-rose-300">
                      {
                        data.rotation
                          .from.icon
                      }{" "}
                      {
                        data.rotation
                          .from.name
                      }
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {
                        data.rotation
                          .from.symbol
                      }
                    </p>
                  </div>

                  <span className="text-center text-3xl text-violet-300">
                    ←
                  </span>

                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-center">
                    <p className="text-xs text-slate-500">
                      دخول نسبي إلى
                    </p>

                    <p className="mt-2 text-lg font-black text-emerald-300">
                      {
                        data.rotation
                          .to.icon
                      }{" "}
                      {
                        data.rotation
                          .to.name
                      }
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {
                        data.rotation
                          .to.symbol
                      }
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {
                    data.rotation
                      .explanation
                  }
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                لا تتوفر بيانات كافية حاليًا.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sectors.map(
              (sector) => (
                <button
                  type="button"
                  key={sector.symbol}
                  onClick={() =>
                    router.push(
                      `/sectors/${encodeURIComponent(
                        sector.symbol
                      )}`
                    )
                  }
                  className={`group rounded-3xl border bg-slate-950/65 p-5 text-right shadow-xl shadow-black/10 backdrop-blur-xl transition duration-300 hover:-translate-y-1 ${cardClass(
                    sector.strengthScore,
                    sector.dataAvailable
                  )}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-2xl">
                          {
                            sector.icon
                          }
                        </span>

                        <h3 className="text-xl font-black">
                          {
                            sector.name
                          }
                        </h3>

                        <span className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-xs font-black text-slate-300">
                          {
                            sector.symbol
                          }
                        </span>
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        المركز{" "}
                        {sector.rank} من{" "}
                        {sectors.length}
                      </p>
                    </div>

                    <div className="text-left">
                      <p
                        className={`text-3xl font-black ${scoreClass(
                          sector.strengthScore,
                          sector.dataAvailable
                        )}`}
                      >
                        {sector.dataAvailable
                          ? sector.strengthScore
                          : "—"}
                      </p>

                      <p className="text-[10px] text-slate-600">
                        درجة القوة
                      </p>
                    </div>
                  </div>

                  {sector.dataAvailable ? (
                    <>
                      <div className="my-4 h-px bg-white/[0.06]" />

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-slate-500">
                            آخر سعر
                          </p>

                          <p className="mt-1 font-black">
                            $
                            {sector.price.toFixed(
                              2
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            تغير اليوم
                          </p>

                          <p
                            className={`mt-1 font-black ${changeClass(
                              sector.dailyChangePct
                            )}`}
                          >
                            {sector.trend ===
                            "UP"
                              ? "▲ "
                              : sector.trend ===
                                  "DOWN"
                                ? "▼ "
                                : "● "}
                            {signed(
                              sector.dailyChangePct
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            أداء 5 جلسات
                          </p>

                          <p
                            className={`mt-1 font-black ${changeClass(
                              sector.fiveDayChangePct
                            )}`}
                          >
                            {signed(
                              sector.fiveDayChangePct
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            مقابل SPY
                          </p>

                          <p
                            className={`mt-1 font-black ${changeClass(
                              sector.relativeStrengthPct
                            )}`}
                          >
                            {signed(
                              sector.relativeStrengthPct
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-slate-500">
                            الحجم مقابل الجلسة السابقة
                          </p>

                          <p className="mt-1 font-black text-slate-300">
                            {sector.volumeRatio.toFixed(
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
                              sector.flowState
                            )}`}
                          >
                            {
                              sector.flowState
                            }
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
                      <p className="text-sm font-black text-amber-300">
                        بيانات السوق غير متاحة مؤقتًا
                      </p>

                      <p className="mt-2 text-xs leading-6 text-slate-500">
                        ستبقى بطاقة القطاع ظاهرة، وسيحاول النظام تحديث بياناتها تلقائيًا.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-white/[0.05] bg-white/[0.025] p-3">
                    <p className="text-[10px] text-slate-500">
                      أهم الشركات
                    </p>

                    <p className="mt-2 text-xs leading-6 text-slate-300">
                      {sector.companies
                        .map(
                          (company) =>
                            `${company.name} (${company.symbol})`
                        )
                        .join(" • ")}
                    </p>
                  </div>

                  <div className="mt-4 text-xs font-black text-cyan-300 transition group-hover:-translate-x-1">
                    فتح تفاصيل القطاع ←
                  </div>
                </button>
              )
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
