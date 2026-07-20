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
  netGexFlip: number;
  zeroGamma: number | null;
  callWall: number;
  putWall: number;
  magnet: number;
  strongestCallGammaStrike: number;
  strongestCallGammaValue: number;
  strongestPutGammaStrike: number;
  strongestPutGammaValue: number;
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

const SPX_PRICE_DISPLAY_NOTE =
  "يعتمد تنفيذ الصفقة على حركة الشارت اللحظية وليس على السعر المعروض داخل المنصة.";

function Metric({
  label,
  value,
  color = "text-white",
  valueClassName,
}: {
  label: string;
  value: string;
  color?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold text-slate-500">
        {label}
      </p>

      <p
        dir={
          valueClassName?.includes("force-ltr")
            ? "ltr"
            : undefined
        }
        className={`mt-2 break-words font-black ${valueClassName || "text-lg sm:text-xl"} ${color}`}
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
          value={SPX_PRICE_DISPLAY_NOTE}
          color="text-cyan-300"
          valueClassName="text-xs leading-6 text-center whitespace-normal"
        />

        <Metric
          label="سعر SPX الحالي"
          value={SPX_PRICE_DISPLAY_NOTE}
          color="text-cyan-300"
          valueClassName="text-xs leading-6 text-center whitespace-normal"
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

  const spxPrice = Number(
    market?.stockPrice || 0
  );

  const flowGap = Number(
    market?.flowGap || 0
  );

  const marketStructureNotes: string[] = [];

  if (gamma) {
    marketStructureNotes.push(
      gamma.netGex < 0
        ? "🔴 Net GEX سالب — السوق أكثر قابلية لاتساع الحركة وارتفاع التقلب."
        : gamma.netGex > 0
          ? "🟢 Net GEX موجب — تحركات صناع السوق قد تساعد على تهدئة التقلب."
          : "🟡 Net GEX متعادل — لا توجد أفضلية واضحة من هيكل القاما."
    );

    if (
      spxPrice > 0 &&
      gamma.netGexFlip > 0
    ) {
      const distanceToNetGexFlip =
        Math.abs(
          spxPrice - gamma.netGexFlip
        );

      marketStructureNotes.push(
        distanceToNetGexFlip <= 5
          ? `🟣 السعر قريب من Net GEX Flip عند ${formatNumber(
              gamma.netGexFlip,
              0
            )} — مستوى تفاعل لحظي قد يعمل دعمًا أو مقاومة.`
          : spxPrice > gamma.netGexFlip
            ? `🟢 السعر أعلى Net GEX Flip ${formatNumber(
                gamma.netGexFlip,
                0
              )} — المستوى اللحظي يعمل أسفل السعر كدعم محتمل.`
            : `🔴 السعر أسفل Net GEX Flip ${formatNumber(
                gamma.netGexFlip,
                0
              )} — المستوى اللحظي يعمل أعلى السعر كمقاومة محتملة.`
      );
    }

    if (
      spxPrice > 0 &&
      gamma.zeroGamma != null &&
      gamma.zeroGamma > 0
    ) {
      const distanceToZeroGamma =
        Math.abs(
          spxPrice - gamma.zeroGamma
        );

      marketStructureNotes.push(
        distanceToZeroGamma <= 5
          ? `🟡 السعر قريب من Zero Gamma عند ${formatNumber(
              gamma.zeroGamma,
              0
            )} — السوق عند منطقة تحول في بيئة القاما.`
          : spxPrice > gamma.zeroGamma
            ? `🟢 السعر أعلى Zero Gamma ${formatNumber(
                gamma.zeroGamma,
                0
              )} — بيئة القاما تميل إلى الاستقرار النسبي فوق المستوى.`
            : `🔴 السعر أسفل Zero Gamma ${formatNumber(
                gamma.zeroGamma,
                0
              )} — بيئة القاما أكثر قابلية لاتساع الحركة أسفل المستوى.`
      );
    }

    if (
      gamma.zeroGamma != null &&
      gamma.netGexFlip > 0
    ) {
      const flipGap =
        Math.abs(
          gamma.zeroGamma -
            gamma.netGexFlip
        );

      if (flipGap <= 10) {
        marketStructureNotes.push(
          `🔵 Net GEX Flip وZero Gamma متقاربان بفارق ${formatNumber(
            flipGap,
            0
          )} نقاط — المنطقة بينهما تُعد محورًا مهمًا لحركة SPX.`
        );
      }
    }

    marketStructureNotes.push(
      market?.gammaChop
        ? "🔴 Gamma Chop نشط — احتمالية التذبذب والاختراقات الكاذبة مرتفعة."
        : "🟢 لا توجد حالة Gamma Chop — الحركة أكثر ملاءمة لبناء اتجاه."
    );

    if (
      spxPrice > 0 &&
      gamma.magnet > 0
    ) {
      const distanceToMagnet =
        Math.abs(
          spxPrice - gamma.magnet
        );

      marketStructureNotes.push(
        distanceToMagnet <= 10
          ? `🟡 السعر قريب من Magnet بفارق ${formatNumber(
              distanceToMagnet,
              0
            )} نقاط — احتمال الانجذاب إليه مرتفع.`
          : `🔵 Magnet يبعد ${formatNumber(
              distanceToMagnet,
              0
            )} نقطة عن السعر الحالي.`
      );
    }
  }

  const gammaStructureNotes: string[] = [];

  if (gamma) {
    if (
      spxPrice > 0 &&
      gamma.callWall > 0
    ) {
      const callWallDistance =
        gamma.callWall - spxPrice;

      gammaStructureNotes.push(
        callWallDistance > 0
          ? `🟢 Call Wall عند ${formatNumber(
              gamma.callWall,
              0
            )} ويبعد ${formatNumber(
              callWallDistance,
              0
            )} نقطة — يمثل المقاومة الرئيسية أعلى السعر.`
          : `🟡 السعر عند أو أعلى Call Wall ${formatNumber(
              gamma.callWall,
              0
            )} — راقب ثبات الاختراق قبل الاعتماد على استمرار الصعود.`
      );
    }

    if (
      spxPrice > 0 &&
      gamma.putWall > 0
    ) {
      const putWallDistance =
        spxPrice - gamma.putWall;

      gammaStructureNotes.push(
        putWallDistance > 0
          ? `🔴 Put Wall عند ${formatNumber(
              gamma.putWall,
              0
            )} ويبعد ${formatNumber(
              putWallDistance,
              0
            )} نقطة — يمثل الدعم الرئيسي أسفل السعر.`
          : `🟡 السعر عند أو أسفل Put Wall ${formatNumber(
              gamma.putWall,
              0
            )} — كسر المستوى قد يوسع الحركة الهابطة.`
      );
    }

    gammaStructureNotes.push(
      `🟢 أقوى Gamma CALL عند سترايك ${formatNumber(
        gamma.strongestCallGammaStrike,
        0
      )} بقوة ${compactNumber(
        gamma.strongestCallGammaValue
      )}.`
    );

    gammaStructureNotes.push(
      `🔴 أقوى Gamma PUT عند سترايك ${formatNumber(
        gamma.strongestPutGammaStrike,
        0
      )} بقوة ${compactNumber(
        gamma.strongestPutGammaValue
      )}.`
    );
  }

  const flowDirection =
    market?.direction || "NEUTRAL";

  const systemScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        50 +
          Math.min(Math.abs(flowGap), 20) * 1.5 +
          (market?.gammaChop ? -20 : 10) +
          (flowDirection === "NEUTRAL" ? -15 : 10)
      )
    )
  );

  const systemDirection =
    market?.gammaChop ||
    flowDirection === "NEUTRAL"
      ? "انتظار"
      : flowDirection;

  const systemSummary =
    systemDirection === "CALL"
      ? "الأفضلية الحالية تميل إلى CALL، بشرط وجود مساحة كافية قبل Call Wall واستمرار تفوق تدفق CALL."
      : systemDirection === "PUT"
        ? "الأفضلية الحالية تميل إلى PUT، بشرط بقاء الضغط البيعي ووجود مساحة كافية قبل Put Wall."
        : "لا توجد أفضلية كافية حاليًا، والأفضل انتظار اتساع فرق التدفق أو خروج السعر من منطقة التذبذب.";

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
                فرصة SPX اليومية
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-400">
                رصد لحظي لأقوى عقد SPX يومي، مبني على القاما والسيولة والزخم. تتم متابعة فرصة واحدة فقط حتى تحقق أهدافها أو يُلغى السيناريو، مع حفظ أعلى ربح وصل إليه العقد.
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
                value={SPX_PRICE_DISPLAY_NOTE}
                color="text-cyan-300"
                valueClassName="text-xs leading-6 text-center whitespace-normal"
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
                valueClassName="text-lg sm:text-xl force-ltr"
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
                valueClassName="text-lg sm:text-xl force-ltr"
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
                label="Net GEX Flip"
                value={
                  gamma
                    ? formatNumber(
                        gamma.netGexFlip,
                        0
                      )
                    : "—"
                }
                color="text-violet-300"
              />

              <Metric
                label="Zero Gamma"
                value={
                  gamma?.zeroGamma != null
                    ? formatNumber(
                        gamma.zeroGamma,
                        0
                      )
                    : "—"
                }
                color="text-cyan-300"
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


              <Metric
                label="أقوى Gamma CALL"
                value={
                  gamma
                    ? `\u2066${formatNumber(
                        gamma.strongestCallGammaStrike,
                        0
                      )} — ${compactNumber(
                        gamma.strongestCallGammaValue
                      )}\u2069`
                    : "—"
                }
                color="text-emerald-300"
              />

              <Metric
                label="أقوى Gamma PUT"
                value={
                  gamma
                    ? `\u2066${formatNumber(
                        gamma.strongestPutGammaStrike,
                        0
                      )} — ${compactNumber(
                        gamma.strongestPutGammaValue
                      )}\u2069`
                    : "—"
                }
                color="text-rose-300"
              />
            </section>


            <section className="mt-6 grid gap-4 lg:grid-cols-3">
              <article className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.05] p-5">
                <p className="text-xs font-black text-cyan-300">
                  المرحلة الأولى
                </p>

                <h2 className="mt-2 text-xl font-black">
                  هيكل السوق
                </h2>

                <div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-slate-300">
                  {marketStructureNotes.length > 0 ? (
                    marketStructureNotes.map(
                      (note) => (
                        <p key={note}>
                          {note}
                        </p>
                      )
                    )
                  ) : (
                    <p>
                      لا تتوفر بيانات كافية لتحليل هيكل السوق حاليًا.
                    </p>
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-violet-400/20 bg-violet-400/[0.05] p-5">
                <p className="text-xs font-black text-violet-300">
                  المرحلة الثانية
                </p>

                <h2 className="mt-2 text-xl font-black">
                  تحليل مستويات القاما
                </h2>

                <div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-slate-300">
                  {gammaStructureNotes.length > 0 ? (
                    gammaStructureNotes.map(
                      (note) => (
                        <p key={note}>
                          {note}
                        </p>
                      )
                    )
                  ) : (
                    <p>
                      لا تتوفر مستويات قاما كافية للتحليل حاليًا.
                    </p>
                  )}
                </div>
              </article>

              <article className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-400/[0.05] p-5">
                <p className="text-xs font-black text-fuchsia-300">
                  المرحلة الثالثة
                </p>

                <h2 className="mt-2 text-xl font-black">
                  قرار النظام
                </h2>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-black">
                    التقييم: {systemScore}/100
                  </span>

                  <span
                    className={[
                      "rounded-full border px-3 py-2 text-sm font-black",
                      systemDirection === "CALL"
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : systemDirection === "PUT"
                          ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                          : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                    ].join(" ")}
                  >
                    الاتجاه: {systemDirection}
                  </span>
                </div>

                <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
                  {systemSummary}
                </p>
              </article>
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
