"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type DataRecord =
  Record<string, unknown>;

type WhaleSetup = {
  id: number;
  whale_trade_id: number;

  symbol: string | null;

  original_option_ticker:
    | string
    | null;

  original_contract_type:
    | string
    | null;

  original_strike:
    | number
    | string
    | null;

  original_expiration:
    | string
    | null;

  original_contract_price:
    | number
    | string
    | null;

  premium_value:
    | number
    | string
    | null;

  source_snapshot: unknown;

  tracking_option_ticker:
    | string
    | null;

  tracking_side:
    | string
    | null;

  tracking_strike:
    | number
    | string
    | null;

  tracking_expiration:
    | string
    | null;

  is_alternative: boolean;

  alternative_reason:
    | string
    | null;

  entry_price:
    | number
    | string
    | null;

  current_price:
    | number
    | string
    | null;

  best_price:
    | number
    | string
    | null;

  contract_bid:
    | number
    | string
    | null;

  contract_ask:
    | number
    | string
    | null;

  contract_profit_dollars:
    | number
    | string
    | null;

  contract_profit_pct:
    | number
    | string
    | null;

  contract_quote_at:
    | string
    | null;

  stock_entry_price:
    | number
    | string
    | null;

  stock_current_price:
    | number
    | string
    | null;

  stock_best_price:
    | number
    | string
    | null;

  stop_price:
    | number
    | string
    | null;

  status: string;
  contract_status: string;

  activated_at:
    | string
    | null;

  closed_at:
    | string
    | null;

  close_reason:
    | string
    | null;

  last_error:
    | string
    | null;

  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  ok: boolean;
  count?: number;
  trades?: WhaleSetup[];
  error?: string;
  updatedAt?: string;
};

function record(
  value: unknown
): DataRecord {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function numberValue(
  value: unknown
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function textValue(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : "";
}

function getSource(
  value: unknown
) {
  const snapshot = record(value);
  const raw = record(snapshot.raw);
  const processed = record(
    raw.full_processed_row
  );

  return {
    ...snapshot,
    ...processed,
  };
}

function formatNumber(
  value: unknown,
  digits = 2
) {
  const number =
    numberValue(value);

  if (!number) {
    return "—";
  }

  return number.toLocaleString(
    "en-US",
    {
      minimumFractionDigits:
        digits,
      maximumFractionDigits:
        digits,
    }
  );
}

function formatWholeNumber(
  value: unknown
) {
  const number =
    numberValue(value);

  if (!number) {
    return "—";
  }

  return Math.round(
    number
  ).toLocaleString("en-US");
}

function formatMoney(
  value: unknown
) {
  const number =
    numberValue(value);

  if (!number) {
    return "—";
  }

  if (
    Math.abs(number) >=
    1_000_000
  ) {
    return `$${(
      number / 1_000_000
    ).toFixed(2)}M`;
  }

  if (
    Math.abs(number) >=
    1_000
  ) {
    return `$${(
      number / 1_000
    ).toFixed(2)}K`;
  }

  return `$${number.toFixed(2)}`;
}

function formatDate(
  value: unknown
) {
  const text =
    textValue(value);

  if (!text) {
    return "—";
  }

  const date =
    new Date(text);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text;
  }

  return new Intl.DateTimeFormat(
    "ar-SA-u-ca-gregory",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function statusLabel(
  status: string
) {
  const normalized =
    status.toUpperCase();

  if (
    normalized ===
    "PENDING_CONTRACT"
  ) {
    return "جارٍ اختيار العقد";
  }

  if (
    normalized === "ACTIVE"
  ) {
    return "نشطة";
  }

  if (
    normalized === "TARGET_1"
  ) {
    return "الهدف الأول";
  }

  if (
    normalized === "TARGET_2"
  ) {
    return "الهدف الثاني";
  }

  if (
    normalized === "TARGET_3"
  ) {
    return "الهدف الثالث";
  }

  if (
    normalized === "STOPPED"
  ) {
    return "ضرب الوقف";
  }

  if (
    normalized === "EXPIRED"
  ) {
    return "منتهية";
  }

  if (
    normalized === "ERROR"
  ) {
    return "تعذر التحديث";
  }

  return status || "—";
}

function statusClasses(
  status: string
) {
  const normalized =
    status.toUpperCase();

  if (
    normalized === "ACTIVE"
  ) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (
    normalized.startsWith(
      "TARGET_"
    )
  ) {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  }

  if (
    normalized === "STOPPED" ||
    normalized === "ERROR"
  ) {
    return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  }

  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3">
      <div className="text-[11px] font-bold text-slate-500">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-black text-white">
        {value}
      </div>
    </div>
  );
}

export default function WhaleActiveTradesPage() {
  const [
    trades,
    setTrades,
  ] = useState<
    WhaleSetup[]
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

  const loadTrades =
    useCallback(
      async (
        initial = false
      ) => {
        try {
          if (initial) {
            setLoading(true);
          } else {
            setRefreshing(true);
          }

          setError("");

          const response =
            await fetch(
              "/api/whale-active-trades",
              {
                cache:
                  "no-store",
              }
            );

          const payload =
            (await response.json()) as ApiResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "تعذر تحميل متابعة صفقات الحيتان"
            );
          }

          setTrades(
            Array.isArray(
              payload.trades
            )
              ? payload.trades
              : []
          );

          setUpdatedAt(
            payload.updatedAt ||
              new Date().toISOString()
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "حدث خطأ غير معروف"
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadTrades(true);

    const interval =
      window.setInterval(
        () => {
          void loadTrades(false);
        },
        30_000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [loadTrades]);

  const statistics =
    useMemo(() => {
      const active =
        trades.filter(
          (trade) =>
            trade.status ===
              "ACTIVE" ||
            trade.status.startsWith(
              "TARGET_"
            )
        ).length;

      const alternatives =
        trades.filter(
          (trade) =>
            trade.is_alternative
        ).length;

      const stopped =
        trades.filter(
          (trade) =>
            trade.status ===
            "STOPPED"
        ).length;

      return {
        total:
          trades.length,
        active,
        alternatives,
        stopped,
      };
    }, [trades]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050816] px-4 pb-16 pt-8 text-white sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-white/10 bg-slate-900/65 p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-cyan-300">
                ST MARKET INTELLIGENCE
              </p>

              <h1 className="mt-2 text-2xl font-black sm:text-3xl">
                متابعة صفقات الحيتان
              </h1>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-400">
                متابعة تلقائية للعقود
                التي ترصدها صفحة
                صفقات الحيتان، مع
                تحديث سعر العقد وأعلى
                سعر والربح والخسارة.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadTrades(
                  false
                )
              }
              disabled={
                refreshing
              }
              className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? "جارٍ التحديث..."
                : "تحديث الآن"}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="إجمالي الصفقات"
              value={String(
                statistics.total
              )}
            />

            <Metric
              label="الصفقات النشطة"
              value={String(
                statistics.active
              )}
            />

            <Metric
              label="العقود البديلة"
              value={String(
                statistics.alternatives
              )}
            />

            <Metric
              label="ضربت الوقف"
              value={String(
                statistics.stopped
              )}
            />
          </div>

          <div className="mt-4 text-xs font-bold text-slate-500">
            آخر تحديث:{" "}
            {updatedAt
              ? formatDate(
                  updatedAt
                )
              : "—"}
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm font-bold leading-7 text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/50 p-10 text-center font-black text-slate-400">
            جارٍ تحميل صفقات
            الحيتان...
          </div>
        ) : null}

        {!loading &&
        trades.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/50 p-10 text-center">
            <div className="text-lg font-black">
              لا توجد صفقات حيتان
              جديدة في المتابعة
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-500">
              أي صفقة حيتان جديدة
              ستظهر هنا تلقائيًا.
            </div>
          </div>
        ) : null}

        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          {trades.map(
            (trade) => {
              const source =
                getSource(
                  trade.source_snapshot
                );

              const score =
                numberValue(
                  source.whale_score ??
                    source.score
                );

              const originalPrice =
                numberValue(
                  trade.original_contract_price
                ) ||
                numberValue(
                  source.contract_price
                );

              const profitDollars =
                numberValue(
                  trade.contract_profit_dollars
                );

              const profitPct =
                numberValue(
                  trade.contract_profit_pct
                );

              const positive =
                profitDollars >= 0;

              return (
                <article
                  key={trade.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-xl shadow-black/20"
                >
                  <header className="border-b border-white/10 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-3xl font-black">
                            {trade.symbol ||
                              "—"}
                          </h2>

                          <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">
                            {trade.original_contract_type ||
                              "—"}
                          </span>

                          {trade.is_alternative ? (
                            <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
                              عقد بديل
                            </span>
                          ) : (
                            <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-300">
                              العقد الأصلي
                            </span>
                          )}
                        </div>

                        <div className="mt-2 break-all text-xs font-bold text-slate-500">
                          {trade.original_option_ticker ||
                            "—"}
                        </div>
                      </div>

                      <div
                        className={[
                          "rounded-xl border px-3 py-2 text-xs font-black",
                          statusClasses(
                            trade.status
                          ),
                        ].join(
                          " "
                        )}
                      >
                        {statusLabel(
                          trade.status
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-black text-cyan-200">
                        قوة الصفقة:{" "}
                        {score
                          ? `${formatNumber(
                              score,
                              0
                            )}%`
                          : "—"}
                      </span>

                      <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-slate-300">
                        {textValue(
                          source.classification
                        ) || "—"}
                      </span>

                      <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-black text-slate-300">
                        {textValue(
                          source.money_position
                        ) || "—"}
                      </span>
                    </div>
                  </header>

                  <div className="p-5">
                    <h3 className="text-sm font-black text-cyan-300">
                      صفقة الحوت الأصلية
                    </h3>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Metric
                        label="السترايك"
                        value={formatNumber(
                          trade.original_strike ||
                            source.strike
                        )}
                      />

                      <Metric
                        label="الانتهاء"
                        value={
                          trade.original_expiration ||
                          textValue(
                            source.expiration
                          ) ||
                          "—"
                        }
                      />

                      <Metric
                        label="سعر العقد"
                        value={
                          originalPrice
                            ? `$${formatNumber(
                                originalPrice
                              )}`
                            : "—"
                        }
                      />

                      <Metric
                        label="قيمة الصفقة"
                        value={formatMoney(
                          trade.premium_value
                        )}
                      />

                      <Metric
                        label="حجم التنفيذ"
                        value={formatWholeNumber(
                          source.volume_change ??
                            source.last_trade_size ??
                            source.trade_size
                        )}
                      />

                      <Metric
                        label="الحجم"
                        value={formatWholeNumber(
                          source.volume
                        )}
                      />

                      <Metric
                        label="الاهتمام المفتوح"
                        value={formatWholeNumber(
                          source.open_interest
                        )}
                      />

                      <Metric
                        label="السبريد"
                        value={
                          numberValue(
                            source.spread_pct
                          )
                            ? `${formatNumber(
                                source.spread_pct
                              )}%`
                            : "—"
                        }
                      />

                      <Metric
                        label="Bid"
                        value={
                          numberValue(
                            source.bid
                          )
                            ? `$${formatNumber(
                                source.bid
                              )}`
                            : "—"
                        }
                      />

                      <Metric
                        label="Ask"
                        value={
                          numberValue(
                            source.ask
                          )
                            ? `$${formatNumber(
                                source.ask
                              )}`
                            : "—"
                        }
                      />

                      <Metric
                        label="Delta"
                        value={formatNumber(
                          source.delta,
                          4
                        )}
                      />

                      <Metric
                        label="Gamma"
                        value={formatNumber(
                          source.gamma,
                          4
                        )}
                      />

                      <Metric
                        label="Theta"
                        value={formatNumber(
                          source.theta,
                          4
                        )}
                      />

                      <Metric
                        label="Vega"
                        value={formatNumber(
                          source.vega,
                          4
                        )}
                      />

                      <Metric
                        label="IV"
                        value={
                          numberValue(
                            source.iv
                          )
                            ? `${formatNumber(
                                source.iv
                              )}%`
                            : "—"
                        }
                      />

                      <Metric
                        label="سعر السهم"
                        value={
                          numberValue(
                            source.stock_price
                          )
                            ? `$${formatNumber(
                                source.stock_price
                              )}`
                            : "—"
                        }
                      />
                    </div>

                    <div className="mt-5 border-t border-white/10 pt-5">
                      <h3 className="text-sm font-black text-emerald-300">
                        عقد التنفيذ والمتابعة
                      </h3>

                      <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                        <div className="break-all text-xs font-black text-slate-300">
                          {trade.tracking_option_ticker ||
                            "جارٍ اختيار عقد المتابعة"}
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Metric
                            label="نوع العقد"
                            value={
                              trade.tracking_side ||
                              "—"
                            }
                          />

                          <Metric
                            label="السترايك"
                            value={formatNumber(
                              trade.tracking_strike
                            )}
                          />

                          <Metric
                            label="الانتهاء"
                            value={
                              trade.tracking_expiration ||
                              "—"
                            }
                          />

                          <Metric
                            label="سعر الدخول"
                            value={
                              numberValue(
                                trade.entry_price
                              )
                                ? `$${formatNumber(
                                    trade.entry_price
                                  )}`
                                : "—"
                            }
                          />

                          <Metric
                            label="السعر الحالي"
                            value={
                              numberValue(
                                trade.current_price
                              )
                                ? `$${formatNumber(
                                    trade.current_price
                                  )}`
                                : "—"
                            }
                          />

                          <Metric
                            label="أعلى سعر"
                            value={
                              numberValue(
                                trade.best_price
                              )
                                ? `$${formatNumber(
                                    trade.best_price
                                  )}`
                                : "—"
                            }
                          />

                          <Metric
                            label="Bid الحالي"
                            value={
                              numberValue(
                                trade.contract_bid
                              )
                                ? `$${formatNumber(
                                    trade.contract_bid
                                  )}`
                                : "—"
                            }
                          />

                          <Metric
                            label="Ask الحالي"
                            value={
                              numberValue(
                                trade.contract_ask
                              )
                                ? `$${formatNumber(
                                    trade.contract_ask
                                  )}`
                                : "—"
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div
                          className={[
                            "rounded-2xl border p-4",
                            positive
                              ? "border-emerald-400/25 bg-emerald-400/10"
                              : "border-rose-400/25 bg-rose-400/10",
                          ].join(
                            " "
                          )}
                        >
                          <div className="text-xs font-bold text-slate-400">
                            الربح / الخسارة
                          </div>

                          <div
                            className={[
                              "mt-1 text-xl font-black",
                              positive
                                ? "text-emerald-300"
                                : "text-rose-300",
                            ].join(
                              " "
                            )}
                          >
                            {profitDollars >=
                            0
                              ? "+"
                              : ""}
                            $
                            {formatNumber(
                              profitDollars
                            )}
                          </div>
                        </div>

                        <div
                          className={[
                            "rounded-2xl border p-4",
                            positive
                              ? "border-emerald-400/25 bg-emerald-400/10"
                              : "border-rose-400/25 bg-rose-400/10",
                          ].join(
                            " "
                          )}
                        >
                          <div className="text-xs font-bold text-slate-400">
                            النسبة
                          </div>

                          <div
                            className={[
                              "mt-1 text-xl font-black",
                              positive
                                ? "text-emerald-300"
                                : "text-rose-300",
                            ].join(
                              " "
                            )}
                          >
                            {profitPct >= 0
                              ? "+"
                              : ""}
                            {formatNumber(
                              profitPct
                            )}
                            %
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <Metric
                          label="دخول السهم"
                          value={
                            numberValue(
                              trade.stock_entry_price
                            )
                              ? `$${formatNumber(
                                  trade.stock_entry_price
                                )}`
                              : "—"
                          }
                        />

                        <Metric
                          label="السهم الحالي"
                          value={
                            numberValue(
                              trade.stock_current_price
                            )
                              ? `$${formatNumber(
                                  trade.stock_current_price
                                )}`
                              : "—"
                          }
                        />

                        <Metric
                          label="أفضل سعر للسهم"
                          value={
                            numberValue(
                              trade.stock_best_price
                            )
                              ? `$${formatNumber(
                                  trade.stock_best_price
                                )}`
                              : "—"
                          }
                        />
                      </div>
                    </div>

                    {trade.alternative_reason ? (
                      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs font-bold leading-6 text-amber-200">
                        {trade.alternative_reason}
                      </div>
                    ) : null}

                    {trade.last_error ? (
                      <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs font-bold leading-6 text-rose-200">
                        {trade.last_error}
                      </div>
                    ) : null}

                    {textValue(
                      source.reason
                    ) ? (
                      <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4 text-xs font-semibold leading-7 text-slate-300">
                        <span className="font-black text-cyan-300">
                          تحليل الصفقة:{" "}
                        </span>

                        {textValue(
                          source.reason
                        )}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap justify-between gap-2 text-[11px] font-bold text-slate-600">
                      <span>
                        التفعيل:{" "}
                        {formatDate(
                          trade.activated_at ||
                            trade.created_at
                        )}
                      </span>

                      <span>
                        تحديث العقد:{" "}
                        {formatDate(
                          trade.contract_quote_at
                        )}
                      </span>
                    </div>
                  </div>
                </article>
              );
            }
          )}
        </div>
      </div>
    </main>
  );
}
