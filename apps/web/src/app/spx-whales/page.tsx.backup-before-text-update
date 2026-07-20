"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

type MarketData = {
  direction: "CALL" | "PUT" | "NEUTRAL";
  stockPrice: number;
  callFlow: number;
  putFlow: number;
  totalFlow: number;
  callFlowPct: number;
  putFlowPct: number;
  flowGap: number;
  gammaChop: boolean;
  nearMagnet: boolean;
  magnetDistance: number;
};

type GammaData = {
  netGex: number;
  zeroGamma: number;
  callWall: number;
  putWall: number;
  magnet: number;
};

type SignalData = {
  ok: boolean;
  status:
    | "ACTIVE"
    | "WATCH"
    | "NO_TRADE"
    | "NO_CONTRACTS";
  message?: string;
  market?: MarketData | null;
  gamma?: GammaData | null;
};

type SpxTrade = {
  id: string;
  option_ticker: string;
  side: "CALL" | "PUT";
  strike: number;
  expiration: string;

  entry_price: number;
  current_price: number | null;
  current_bid: number | null;
  current_ask: number | null;

  best_price: number | null;
  best_profit_dollars: number | null;
  best_profit_pct: number | null;

  current_profit_dollars: number | null;
  current_profit_pct: number | null;

  spx_entry_price: number | null;
  spx_current_price: number | null;
  invalidation_level: number | null;

  stop_contract_price: number | null;
  stop_profit_dollars: number | null;
  stop_profit_pct: number | null;
  stop_reason: string | null;

  score: number | null;
  quality: string | null;

  status:
    | "WATCH"
    | "ACTIVE"
    | "STOPPED"
    | "EXPIRED"
    | "ERROR";

  activated_at: string | null;
  stopped_at: string | null;
  hidden_after: string | null;
};

type ApiData = {
  ok: boolean;
  created?: boolean;
  stopped?: boolean;
  message?: string;
  activeTrade?: SpxTrade | null;
  trades?: SpxTrade[];
  signal?: SignalData;

  marketSession?: {
    isOpen: boolean;
    phase?: string;
    label?: string;
  };

  error?: string;
  updatedAt?: string;
};

function formatNumber(
  value: unknown,
  digits = 2
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(
  value: unknown,
  showSign = false
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  const sign =
    showSign && parsed > 0
      ? "+"
      : "";

  return `${sign}$${formatNumber(parsed)}`;
}

function compactNumber(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  const absolute =
    Math.abs(parsed);

  if (absolute >= 1_000_000_000) {
    return `${formatNumber(
      parsed / 1_000_000_000
    )}B`;
  }

  if (absolute >= 1_000_000) {
    return `${formatNumber(
      parsed / 1_000_000
    )}M`;
  }

  if (absolute >= 1_000) {
    return `${formatNumber(
      parsed / 1_000
    )}K`;
  }

  return formatNumber(parsed);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return date.toLocaleString(
    "ar-SA-u-ca-gregory",
    {
      dateStyle: "short",
      timeStyle: "short",
    }
  );
}

function Metric({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold text-slate-500">
        {label}
      </p>

      <p
        className={`mt-2 break-words text-lg font-black sm:text-xl ${color}`}
      >
        {value}
      </p>
    </div>
  );
}

function tradeStatusStyle(
  status?: string
) {
  if (status === "ACTIVE") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (status === "WATCH") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }

  if (status === "STOPPED") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  }

  return "border-slate-400/20 bg-slate-400/10 text-slate-300";
}

function tradeStatusLabel(
  status?: string
) {
  if (status === "ACTIVE") {
    return "قيد المتابعة";
  }

  if (status === "WATCH") {
    return "تحت المراقبة";
  }

  if (status === "STOPPED") {
    return "ضرب الوقف";
  }

  if (status === "EXPIRED") {
    return "منتهي";
  }

  return status || "—";
}

function TradeCard({
  trade,
}: {
  trade: SpxTrade;
}) {
  const active =
    trade.status === "ACTIVE" ||
    trade.status === "WATCH";

  const profit =
    active
      ? Number(
          trade.current_profit_dollars
        )
      : Number(
          trade.stop_profit_dollars
        );

  const profitPct =
    active
      ? Number(
          trade.current_profit_pct
        )
      : Number(
          trade.stop_profit_pct
        );

  const profitColor =
    profit > 0
      ? "text-emerald-300"
      : profit < 0
        ? "text-rose-300"
        : "text-white";

  return (
    <article
      className={`rounded-3xl border p-5 sm:p-7 ${
        trade.status === "STOPPED"
          ? "border-rose-400/20 bg-rose-400/[0.04]"
          : "border-fuchsia-400/20 bg-slate-900/75"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-xl border px-4 py-2 text-sm font-black ${
                trade.side === "CALL"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-300"
              }`}
            >
              {trade.side}
            </span>

            <h2 className="text-2xl font-black">
              SPXW {formatNumber(
                trade.strike,
                0
              )}
            </h2>

            {trade.score !== null ? (
              <span className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-black text-cyan-300">
                {formatNumber(
                  trade.score,
                  0
                )}
                /100
              </span>
            ) : null}
          </div>

          <p className="mt-3 break-all text-xs font-bold text-slate-500">
            {trade.option_ticker}
          </p>

          <p className="mt-2 text-sm font-semibold text-slate-400">
            الانتهاء:{" "}
            {trade.expiration || "—"}
          </p>
        </div>

        <span
          className={`rounded-xl border px-4 py-3 text-sm font-black ${tradeStatusStyle(
            trade.status
          )}`}
        >
          {tradeStatusLabel(
            trade.status
          )}
        </span>
      </div>

      {trade.status === "STOPPED" ? (
        <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 font-black text-rose-200">
          ضرب وقف SPX عند مستوى{" "}
          {formatNumber(
            trade.invalidation_level
          )}
          . انتهت متابعة هذا العقد.
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="سعر الدخول"
          value={`$${formatNumber(
            trade.entry_price
          )}`}
        />

        <Metric
          label={
            active
              ? "سعر العقد الحالي"
              : "سعر العقد عند الوقف"
          }
          value={`$${formatNumber(
            active
              ? trade.current_price
              : trade.stop_contract_price
          )}`}
        />

        <Metric
          label="أعلى سعر تحقق"
          value={`$${formatNumber(
            trade.best_price
          )}`}
          color="text-emerald-300"
        />

        <Metric
          label={
            active
              ? "الربح الحالي"
              : "النتيجة عند الوقف"
          }
          value={`${money(
            profit,
            true
          )} (${formatNumber(
            profitPct
          )}%)`}
          color={profitColor}
        />

        <Metric
          label="أعلى ربح تحقق"
          value={`${money(
            trade.best_profit_dollars,
            true
          )} (${formatNumber(
            trade.best_profit_pct
          )}%)`}
          color="text-emerald-300"
        />

        <Metric
          label="سعر SPX عند الدخول"
          value={formatNumber(
            trade.spx_entry_price
          )}
          color="text-cyan-300"
        />

        <Metric
          label="سعر SPX الحالي"
          value={formatNumber(
            trade.spx_current_price
          )}
          color="text-cyan-300"
        />

        <Metric
          label="مستوى الإبطال"
          value={formatNumber(
            trade.invalidation_level
          )}
          color="text-rose-300"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-bold text-slate-500">
            وقت التفعيل
          </p>

          <p className="mt-2 font-black">
            {formatDate(
              trade.activated_at
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-bold text-slate-500">
            وقت ضرب الوقف
          </p>

          <p className="mt-2 font-black">
            {formatDate(
              trade.stopped_at
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function SpxWhalesPage() {
  const [data, setData] =
    useState<ApiData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const load = useCallback(
    async (initial = false) => {
      try {
        initial
          ? setLoading(true)
          : setRefreshing(true);

        setError("");

        const response =
          await fetch(
            "/api/spx-active-trade",
            {
              cache: "no-store",
            }
          );

        const payload =
          (await response.json()) as ApiData;

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "تعذر تحميل صفقات SPX"
          );
        }

        setData(payload);
      } catch (loadError) {
        setError(
          loadError instanceof Error
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
    void load(true);

    const timer =
      window.setInterval(
        () => void load(false),
        20_000
      );

    return () =>
      window.clearInterval(timer);
  }, [load]);

  const signal =
    data?.signal;

  const marketSession =
    data?.marketSession;

  const market =
    signal?.market;

  const gamma =
    signal?.gamma;

  const trades =
    data?.trades || [];

  const activeTrade =
    data?.activeTrade ||
    trades.find(
      (trade) =>
        trade.status === "ACTIVE" ||
        trade.status === "WATCH"
    ) ||
    null;

  const stoppedTrades =
    trades.filter(
      (trade) =>
        trade.status === "STOPPED"
    );

  const decisionMessage =
    activeTrade
      ? "توجد صفقة SPX تحت المتابعة — لن يتم إصدار عقد آخر حتى انتهاء متابعتها."
      : marketSession?.isOpen === false
        ? "السوق مغلق — لا يتم إصدار فرصة SPX جديدة."
        : data?.message ||
          signal?.message ||
          "السوق مفتوح — لا توجد فرصة SPX مطابقة للشروط حاليًا.";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#030712] px-4 py-8 text-white sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-fuchsia-400/20 bg-gradient-to-l from-fuchsia-500/10 via-slate-900 to-violet-500/10 p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-fuchsia-300">
                SPX 0DTE INTELLIGENCE
              </p>

              <h1 className="mt-2 text-3xl font-black sm:text-5xl">
                SPX اليومي
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-400">
                عقد واحد فقط تحت المتابعة.
                يتم تثبيت مستوى الإبطال من
                بيانات القاما، وتسجيل أعلى
                ربح تحقق حتى بعد ضرب الوقف.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold"
              >
                العودة إلى المنصة
              </Link>

              <button
                type="button"
                onClick={() =>
                  void load(false)
                }
                disabled={refreshing}
                className="rounded-xl bg-fuchsia-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
              >
                {refreshing
                  ? "جارٍ التحديث..."
                  : "تحديث الآن"}
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 font-bold text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/60 p-12 text-center font-black text-slate-400">
            جارٍ تحميل ومتابعة صفقة SPX...
          </div>
        ) : data ? (
          <>
            <section className="mt-6 rounded-3xl border border-white/10 bg-slate-900/65 p-5">
              <p className="text-xs font-bold text-slate-500">
                قرار النظام
              </p>

              <h2 className="mt-2 text-xl font-black leading-8 sm:text-2xl">
                {decisionMessage}
              </h2>
            </section>

            <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Metric
                label="سعر SPX"
                value={
                  market
                    ? formatNumber(
                        market.stockPrice
                      )
                    : "—"
                }
                color="text-cyan-300"
              />

              <Metric
                label="اتجاه Flow"
                value={
                  market?.direction ||
                  "—"
                }
                color={
                  market?.direction ===
                  "CALL"
                    ? "text-emerald-300"
                    : market?.direction ===
                        "PUT"
                      ? "text-rose-300"
                      : "text-amber-300"
                }
              />

              <Metric
                label="CALL Flow"
                value={
                  market
                    ? `${formatNumber(
                        market.callFlowPct
                      )}%`
                    : "—"
                }
                color="text-emerald-300"
              />

              <Metric
                label="PUT Flow"
                value={
                  market
                    ? `${formatNumber(
                        market.putFlowPct
                      )}%`
                    : "—"
                }
                color="text-rose-300"
              />

              <Metric
                label="إجمالي Flow"
                value={
                  market
                    ? compactNumber(
                        market.totalFlow
                      )
                    : "—"
                }
                color="text-amber-300"
              />

              <Metric
                label="Gamma Chop"
                value={
                  market?.gammaChop
                    ? "نعم"
                    : "لا"
                }
                color={
                  market?.gammaChop
                    ? "text-rose-300"
                    : "text-emerald-300"
                }
              />
            </section>

            <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric
                label="Net GEX"
                value={
                  gamma
                    ? compactNumber(
                        gamma.netGex
                      )
                    : "—"
                }
              />

              <Metric
                label="Zero Gamma"
                value={
                  gamma
                    ? formatNumber(
                        gamma.zeroGamma,
                        0
                      )
                    : "—"
                }
              />

              <Metric
                label="Call Wall"
                value={
                  gamma
                    ? formatNumber(
                        gamma.callWall,
                        0
                      )
                    : "—"
                }
              />

              <Metric
                label="Put Wall"
                value={
                  gamma
                    ? formatNumber(
                        gamma.putWall,
                        0
                      )
                    : "—"
                }
              />

              <Metric
                label="Magnet"
                value={
                  gamma
                    ? formatNumber(
                        gamma.magnet,
                        0
                      )
                    : "—"
                }
              />
            </section>

            <section className="mt-6">
              <h2 className="mb-4 text-xl font-black">
                الصفقة تحت المتابعة
              </h2>

              {activeTrade ? (
                <TradeCard
                  trade={activeTrade}
                />
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/50 p-10 text-center font-bold text-slate-500">
                  {marketSession?.isOpen === false
                    ? "السوق مغلق — لا يتم إصدار فرصة SPX جديدة"
                    : "السوق مفتوح — لا توجد فرصة SPX مطابقة للشروط حاليًا"}
                </div>
              )}
            </section>

            {stoppedTrades.length > 0 ? (
              <section className="mt-8">
                <h2 className="mb-4 text-xl font-black">
                  الصفقات التي ضربت الوقف
                </h2>

                <div className="space-y-4">
                  {stoppedTrades.map(
                    (trade) => (
                      <TradeCard
                        key={trade.id}
                        trade={trade}
                      />
                    )
                  )}
                </div>
              </section>
            ) : null}

            <p className="mt-6 text-center text-xs font-bold text-slate-600">
              آخر تحديث:{" "}
              {formatDate(
                data.updatedAt
              )}
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
