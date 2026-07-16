"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

type TradeTarget = {
  index: number;
  price: number;
};

type ActiveTrade = {
  id: string;
  activatedAt: string;

  contractEntryPrice: number;
contractCurrentPrice: number;
contractBestPrice: number;
contractBid: number;
contractAsk: number;
contractProfitDollars: number;
contractProfitPct: number;
contractStopPrice: number;
contractQuoteAt: string | null;
closedAt: string | null;
closeReason: string | null;

  symbol: string;
  side: "CALL" | "PUT";
  sideLabel: string;

  contractTicker: string;
  contractStrike: number;
  contractExpiration: string;

  entryPrice: number;
  stopPrice: number | null;

  targets: TradeTarget[];

  currentPrice: number;
  bestPrice: number;
  bestPriceAt: string | null;

  currentProfitPct: number;
  bestProfitPct: number;

  highestTargetHit: number;

  contractStatus: string;
  statusLabel: string;

  warningMessage: string | null;
  warningAt: string | null;
};

type ActiveTradesResponse = {
  ok: boolean;
  updatedAt?: string;
  count?: number;
  trades?: ActiveTrade[];
  error?: string;
};

const REFRESH_INTERVAL_MS = 30_000;

function numberText(
  value: number | null,
  digits = 2
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(digits);
}

function percentText(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const prefix =
    value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(`${value}T00:00:00`);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function sideClass(
  side: ActiveTrade["side"]
) {
  return side === "CALL"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

function performanceClass(
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

function statusClass(
  status: string
) {
  if (status === "TARGET_2") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  }

  if (status === "TARGET_1") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
}

function TargetList({
  targets,
  highestTargetHit,
}: {
  targets: TradeTarget[];
  highestTargetHit: number;
}) {
  if (targets.length === 0) {
    return (
      <span className="text-slate-500">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((target) => {
        const reached =
          highestTargetHit >=
          target.index;

        return (
          <span
            key={`${target.index}-${target.price}`}
            className={[
              "rounded-lg border px-2 py-1 text-xs font-bold",
              reached
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                : "border-slate-700 bg-slate-900/70 text-slate-300",
            ].join(" ")}
          >
            هـ{target.index}:{" "}
            {numberText(
              target.price
            )}
            {reached ? " ✓" : ""}
          </span>
        );
      })}
    </div>
  );
}

export default function ActiveTradesPage() {
  const [trades, setTrades] =
    useState<ActiveTrade[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [updatedAt, setUpdatedAt] =
    useState("");

  const loadTrades =
    useCallback(
      async (
        manualRefresh = false
      ) => {
        if (manualRefresh) {
          setRefreshing(true);
        }

        try {
          const response =
            await fetch(
              "/api/active-trades",
              {
                cache: "no-store",
              }
            );

          const payload =
            (await response.json()) as
              ActiveTradesResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "تعذر تحميل الصفقات النشطة"
            );
          }

          setTrades(
            payload.trades || []
          );

          setUpdatedAt(
            payload.updatedAt || ""
          );

          setError("");
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل الصفقات النشطة"
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadTrades();

    const interval =
      window.setInterval(() => {
        void loadTrades();
      }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [loadTrades]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 text-white"
    >
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold text-cyan-300">
              متابعة تلقائية
            </p>

            <h1 className="text-3xl font-black sm:text-4xl">
              الصفقات النشطة
            </h1>

          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-amber-300">
            ⚠️ هذه البيانات ليست توصيات بيع أو شراء، وإنما لأغراض تعليمية فقط.
          </p>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              متابعة وقت التفعيل،
              والعقد، ومستويات
              الدخول والوقف
              والأهداف، وأفضل سعر
              تحقق منذ تفعيل الصفقة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={refreshing}
              onClick={() =>
                void loadTrades(true)
              }
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-bold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing
                ? "جارٍ التحديث..."
                : "تحديث الآن"}
            </button>

            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-500"
            >
              العودة إلى المنصة
            </Link>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">
              إجمالي الصفقات النشطة
            </p>

            <p className="mt-2 text-3xl font-black text-white">
              {trades.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">
              عقود كول
            </p>

            <p className="mt-2 text-3xl font-black text-emerald-300">
              {
                trades.filter(
                  (trade) =>
                    trade.side ===
                    "CALL"
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">
              عقود بوت
            </p>

            <p className="mt-2 text-3xl font-black text-rose-300">
              {
                trades.filter(
                  (trade) =>
                    trade.side ===
                    "PUT"
                ).length
              }
            </p>
          </div>
        </div>

        {updatedAt ? (
          <p className="mb-4 text-xs text-slate-500">
            آخر تحديث:{" "}
            {formatDateTime(
              updatedAt
            )}
          </p>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center text-slate-400">
            جارٍ تحميل الصفقات
            النشطة...
          </div>
        ) : trades.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center">
            <p className="text-xl font-black text-white">
              لا توجد صفقات نشطة
              حاليًا
            </p>

            <p className="mt-3 text-sm text-slate-400">
              ستظهر الصفقات هنا
              تلقائيًا عند تفعيل
              فرصة جديدة.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 xl:block">
              <div className="overflow-x-auto">
                <table className="min-w-[1450px] w-full text-right text-sm">
                  <thead className="border-b border-slate-800 bg-slate-900">
                    <tr className="text-slate-400">
                      <th className="px-4 py-4">
                        وقت التفعيل
                      </th>
                      <th className="px-4 py-4">
                        الرمز
                      </th>

                <th className="px-4 py-4">
                  وقت التنفيذ
                </th>
                      <th className="px-4 py-4">
                        النوع
                      </th>
                      <th className="px-4 py-4">
                        السترايك
                      </th>
                      <th className="px-4 py-4">
                        تاريخ العقد
                      </th>
                      
                      <th className="px-4 py-4">
  دخول العقد
</th>
                      <th className="px-4 py-4">
                        الأهداف
                      </th>
                      <th className="px-4 py-4">
  سعر السهم الحالي
</th>



<th className="px-4 py-4">
                        الوقف
                      </th>

<th className="px-4 py-4">
  سعر العقد الحالي
</th>



<th className="px-4 py-4">
  ربح العقد
</th>
                      <th className="px-4 py-4">
                        الحالة
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800">
                    {trades.map(
                      (trade) => (
                        <tr
                          key={trade.id}
                          className="transition hover:bg-slate-800/40"
                        >
                          <td className="whitespace-nowrap px-4 py-5 text-slate-300">
                            {formatDateTime(
                              trade.activatedAt
                            )}
                          </td>

                          <td className="px-4 py-5 text-lg font-black text-white">
                            {trade.symbol}
                          </td>

                <td className="px-4 py-5 whitespace-nowrap">
                  <p className="font-bold text-white">
                    {new Date(
                      trade.activatedAt
                    ).toLocaleString(
                      "ar-SA",
                      {
                        timeZone:
                          "Asia/Riyadh",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </p>
                </td>

                          <td className="px-4 py-5">
                            <span
                              className={[
                                "inline-flex rounded-lg border px-2.5 py-1 text-xs font-black",
                                sideClass(
                                  trade.side
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {
                                trade.sideLabel
                              }
                            </span>
                          </td>

                          <td className="px-4 py-5 font-bold text-white">
                            {numberText(
                              trade.contractStrike
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-5 text-slate-300">
                            {formatDate(
                              trade.contractExpiration
                            )}
                          </td>

                          

                          <td className="px-4 py-5">
                  <p className="font-bold text-white">
                    {numberText(
                      trade.contractEntryPrice
                    )}
                  </p>
                </td>

                          <td className="px-4 py-5">
                            <TargetList
                              targets={
                                trade.targets
                              }
                              highestTargetHit={
                                trade.highestTargetHit
                              }
                            />
                          </td>

                          
                <td className="px-4 py-5">
                  <p className="font-bold text-white">
                    {numberText(trade.currentPrice)}
                  </p>

                  <p
                    className={[
                      "mt-1 text-xs font-bold",
                      performanceClass(
                        trade.currentProfitPct
                      ),
                    ].join(" ")}
                  >
                    {percentText(
                      trade.currentProfitPct
                    )}
                  </p>
                </td>

                

                <td className="px-4 py-5 font-bold text-rose-300">
                            {numberText(
                              trade.stopPrice
                            )}
                          </td>

                <td className="px-4 py-5">
                  <p className="font-bold text-white">
                    {numberText(
                      trade.contractStatus ===
                        "STOPPED" &&
                        trade.contractStopPrice > 0
                        ? trade.contractStopPrice
                        : trade.contractCurrentPrice
                    )}
                  </p>

                  {trade.contractStatus ===
                    "STOPPED" && (
                    <p className="mt-1 text-xs font-bold text-rose-400">
                      السعر عند الوقف
                    </p>
                  )}
                </td>

                

                <td
                  className={[
                    "px-4 py-5 font-black",
                    performanceClass(
                      trade.contractProfitPct
                    ),
                  ].join(" ")}
                >
                  <p>
                    {trade.contractProfitDollars > 0
                      ? "+"
                      : ""}
                    {numberText(
                      trade.contractProfitDollars
                    )}{" "}
                    $
                  </p>

                  <p className="mt-1 text-xs">
                    {percentText(
                      trade.contractProfitPct
                    )}
                  </p>
                </td>

                          <td className="px-4 py-5">
                            <span
                              className={[
                                "inline-flex whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-bold",
                                statusClass(
                                  trade.contractStatus
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {
                                trade.statusLabel
                              }
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 xl:hidden">
              {trades.map(
                (trade) => (
                  <article
                    key={trade.id}
                    className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-black">
                            {
                              trade.symbol
                            }
                          </h2>

                          <span
                            className={[
                              "rounded-lg border px-2 py-1 text-xs font-black",
                              sideClass(
                                trade.side
                              ),
                            ].join(
                              " "
                            )}
                          >
                            {
                              trade.sideLabel
                            }
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          تفعيل:{" "}
                          {formatDateTime(
                            trade.activatedAt
                          )}
                        </p>
                      </div>

                      <span
                        className={[
                          "rounded-lg border px-2.5 py-1 text-xs font-bold",
                          statusClass(
                            trade.contractStatus
                          ),
                        ].join(
                          " "
                        )}
                      >
                        {
                          trade.statusLabel
                        }
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          السترايك
                        </p>
                        <p className="mt-1 font-black">
                          {numberText(
                            trade.contractStrike
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          تاريخ العقد
                        </p>
                        <p className="mt-1 font-bold">
                          {formatDate(
                            trade.contractExpiration
                          )}
                        </p>
                      </div>

                      

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          الوقف
                        </p>
                        <p className="mt-1 font-black text-rose-300">
                          {numberText(
                            trade.stopPrice
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          السعر الحالي
                        </p>
                        <p className="mt-1 font-black">
                          {numberText(
                            trade.currentPrice
                          )}
                        </p>
                        <p
                          className={[
                            "mt-1 text-xs font-bold",
                            performanceClass(
                              trade.currentProfitPct
                            ),
                          ].join(
                            " "
                          )}
                        >
                          {percentText(
                            trade.currentProfitPct
                          )}
                        </p>
                      </div>

                      

                      

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          أعلى هدف
                        </p>
                        <p className="mt-1 font-black text-emerald-300">
                          {trade.highestTargetHit >
                          0
                            ? `الهدف ${trade.highestTargetHit}`
                            : "لم يتحقق"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold text-slate-500">
                        أهداف السهم
                      </p>

                      <TargetList
                        targets={
                          trade.targets
                        }
                        highestTargetHit={
                          trade.highestTargetHit
                        }
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-slate-600">
                      رمز العقد:{" "}
                      {
                        trade.contractTicker
                      }
                    </p>
                  </article>
                )
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}