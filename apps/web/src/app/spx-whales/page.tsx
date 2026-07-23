"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
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

type OpenInterestLevel = {
  strike: number;
  openInterest: number;
};

type OpenInterestData = {
  direction:
    | "CALL"
    | "PUT"
    | "NEUTRAL";

  callTotal: number;
  putTotal: number;
  callPct: number;
  putPct: number;

  topCall:
    OpenInterestLevel[];

  topPut:
    OpenInterestLevel[];
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

  openInterest?:
    OpenInterestData | null;
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
  lowest_price: number | null;
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
  close_reason: string | null;

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
  status?: string,
  closeReason?: string | null
) {
  if (status === "ACTIVE") {
    return "قيد المتابعة";
  }

  if (status === "WATCH") {
    return "تحت المراقبة";
  }

  if (status === "STOPPED") {
    return closeReason ===
      "SPX_INVALIDATION"
      ? "ضرب الوقف"
      : "تم إيقاف العقد";
  }

  if (status === "EXPIRED") {
    return "منتهي";
  }

  return status || "—";
}

function tradeCloseMessage(
  trade: SpxTrade
) {
  if (
    trade.close_reason ===
    "OPPOSITE_DIRECTION"
  ) {
    return (
      trade.stop_reason ||
      "تم إيقاف العقد بسبب تحول اتجاه الفرصة إلى الاتجاه المعاكس."
    );
  }

  if (
    trade.close_reason ===
    "PROFIT_PROTECTION_DRAWDOWN"
  ) {
    return (
      trade.stop_reason ||
      "تم إيقاف العقد بعد تراجع السعر وتفعيل حماية الربح."
    );
  }

  if (
    trade.close_reason ===
    "SPX_INVALIDATION"
  ) {
    return `ضرب وقف SPX عند ${formatNumber(
      trade.invalidation_level
    )}. انتهت متابعة هذا العقد.`;
  }

  return (
    trade.stop_reason ||
    "تم إيقاف متابعة هذا العقد."
  );
}

function TradeCard({
  trade,
  onRefresh,
  refreshing,
}: {
  trade: SpxTrade;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const active =
    trade.status === "ACTIVE" ||
    trade.status === "WATCH";

  const stoppedBySpx =
    trade.status === "STOPPED" &&
    trade.close_reason ===
      "SPX_INVALIDATION";

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

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-xl border px-4 py-3 text-sm font-black ${tradeStatusStyle(
              trade.status
            )}`}
          >
            {tradeStatusLabel(
              trade.status,
              trade.close_reason
            )}
          </span>

          {active ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-3 text-sm font-black text-fuchsia-200 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? "جارٍ التحديث..."
                : "تحديث"}
            </button>
          ) : null}
        </div>
      </div>

      {trade.status === "STOPPED" ? (
        <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 font-black leading-7 text-rose-200">
          {tradeCloseMessage(trade)}
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
              : stoppedBySpx
                ? "سعر العقد عند الوقف"
                : "سعر العقد عند الإيقاف"
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
              : stoppedBySpx
                ? "النتيجة عند الوقف"
                : "النتيجة عند الإيقاف"
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
          label="أدنى سعر للعقد"
          value={`$${formatNumber(
            trade.lowest_price ??
              trade.entry_price
          )}`}
          color="text-amber-300"
        />

        <Metric
          label="سعر SPX الحالي"
          value={SPX_PRICE_DISPLAY_NOTE}
          color="text-cyan-300"
          valueClassName="text-xs leading-6 text-center whitespace-normal"
        />

        <Metric
          label="الوقف"
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
            {stoppedBySpx
              ? "وقت ضرب الوقف"
              : trade.status === "STOPPED"
                ? "وقت إيقاف العقد"
                : "وقت ضرب الوقف"}
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

  const [openInterestOpen, setOpenInterestOpen] =
    useState(false);

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

  const quoteRequestRunning =
    useRef(false);

  const loadQuote =
    useCallback(async () => {
      if (
        quoteRequestRunning.current
      ) {
        return;
      }

      quoteRequestRunning.current =
        true;

      try {
        const response =
          await fetch(
            "/api/spx-active-trade/quote",
            {
              cache: "no-store",
            }
          );

        const payload =
          (await response.json()) as {
            ok: boolean;
            activeTrade?:
              SpxTrade | null;
            error?: string;
          };

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "تعذر تحديث سعر عقد SPX"
          );
        }

        const updatedTrade =
          payload.activeTrade;

        if (!updatedTrade) {
          return;
        }

        setData((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,

            activeTrade:
              updatedTrade,

            trades:
              (current.trades || [])
                .map((trade) =>
                  trade.id ===
                  updatedTrade.id
                    ? updatedTrade
                    : trade
                ),
          };
        });
      } catch (quoteError) {
        console.warn(
          "تعذر تحديث سعر عقد SPX:",
          quoteError
        );
      } finally {
        quoteRequestRunning.current =
          false;
      }
    }, []);

  const hasTrackedTrade =
    Boolean(
      data?.activeTrade ||
      data?.trades?.some(
        (trade) =>
          trade.status === "ACTIVE" ||
          trade.status === "WATCH"
      )
    );

  const regularSessionOpen =
    data?.marketSession?.isOpen === true &&
    data?.marketSession?.phase === "REGULAR";

  /*
    المسار الكامل:
    تحليل القاما وFlow وإنشاء/إغلاق الصفقات.
    يعمل كل 20 ثانية فقط.
  */
  useEffect(() => {
    if (!data) {
      void load(true);
    }

    let timer:
      number | undefined;

    const startFullPolling = () => {
      if (
        document.hidden ||
        !regularSessionOpen
      ) {
        return;
      }

      timer =
        window.setInterval(
          () => void load(false),
          20_000
        );
    };

    const stopFullPolling = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const handleVisibilityChange = () => {
      stopFullPolling();

      if (!document.hidden) {
        void load(false);
        startFullPolling();
      }
    };

    startFullPolling();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      stopFullPolling();

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    load,
    data,
    regularSessionOpen,
  ]);

  /*
    المسار الخفيف:
    يحدث سعر العقد النشط فقط كل ثانية.
    لا يعيد تحليل القاما أو Flow.
  */
  useEffect(() => {
    if (
      !hasTrackedTrade ||
      !regularSessionOpen
    ) {
      return;
    }

    let timer:
      number | undefined;

    const startQuotePolling = () => {
      if (document.hidden) {
        return;
      }

      void loadQuote();

      timer =
        window.setInterval(
          () => void loadQuote(),
          1_000
        );
    };

    const stopQuotePolling = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const handleVisibilityChange = () => {
      stopQuotePolling();

      if (!document.hidden) {
        startQuotePolling();
      }
    };

    startQuotePolling();

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      stopQuotePolling();

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [
    hasTrackedTrade,
    loadQuote,
    regularSessionOpen,
  ]);

  const signal =
    data?.signal;

  const openInterest =
    signal?.openInterest;

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

  const flowDirection =
    market?.direction || "NEUTRAL";

  const callFlowPct = Number(
    market?.callFlowPct || 0
  );

  const putFlowPct = Number(
    market?.putFlowPct || 0
  );

  const netGex = Number(
    gamma?.netGex || 0
  );

  const zeroGamma =
    gamma?.zeroGamma != null
      ? Number(gamma.zeroGamma)
      : 0;

  const netGexFlip = Number(
    gamma?.netGexFlip || 0
  );

  const magnet = Number(
    gamma?.magnet || 0
  );

  const callWall = Number(
    gamma?.callWall || 0
  );

  const putWall = Number(
    gamma?.putWall || 0
  );

  const pivotLevels = [
    netGexFlip,
    zeroGamma,
    magnet,
    putWall,
  ].filter(
    (level) =>
      Number.isFinite(level) &&
      level > 0 &&
      (
        spxPrice <= 0 ||
        Math.abs(level - spxPrice) <= 30
      )
  );

  const pivotLow =
    pivotLevels.length > 0
      ? Math.min(...pivotLevels)
      : 0;

  const pivotHigh =
    pivotLevels.length > 0
      ? Math.max(...pivotLevels)
      : 0;

  const pivotLabel =
    pivotLow > 0 && pivotHigh > 0
      ? Math.abs(pivotHigh - pivotLow) < 1
        ? formatNumber(pivotLow, 0)
        : `${formatNumber(
            pivotLow,
            0
          )} – ${formatNumber(
            pivotHigh,
            0
          )}`
      : "غير محددة";

  const marketReading =
    flowDirection === "CALL"
      ? `تدفق CALL متفوق بنسبة ${formatNumber(
          callFlowPct
        )}% مقابل ${formatNumber(
          putFlowPct
        )}% لـ PUT${
          netGex > 0
            ? "، وصافي القاما موجب"
            : netGex < 0
              ? "، لكن صافي القاما سالب"
              : ""
        }${
          market?.gammaChop
            ? "، مع وجود Gamma Chop"
            : "، ولا توجد حالة Gamma Chop"
        }.`
      : flowDirection === "PUT"
        ? `تدفق PUT متفوق بنسبة ${formatNumber(
            putFlowPct
          )}% مقابل ${formatNumber(
            callFlowPct
          )}% لـ CALL${
            netGex > 0
              ? "، وصافي القاما موجب"
              : netGex < 0
                ? "، وصافي القاما سالب"
                : ""
          }${
            market?.gammaChop
              ? "، مع وجود Gamma Chop"
              : "، ولا توجد حالة Gamma Chop"
          }.`
        : `تدفقات CALL وPUT متقاربة، ولا توجد أفضلية اتجاه واضحة${
            market?.gammaChop
              ? " مع وجود Gamma Chop."
              : "."
          }`;

  const primaryScenario =
    flowDirection === "CALL"
      ? pivotHigh > 0 && callWall > pivotHigh
        ? `الثبات فوق المنطقة المحورية ${pivotLabel} يدعم استمرار الحركة باتجاه Call Wall عند ${formatNumber(
            callWall,
            0
          )}.`
        : "الأفضلية تميل إلى CALL، لكن لا توجد مساحة واضحة كافية حتى المقاومة التالية."
      : flowDirection === "PUT"
        ? pivotLow > 0 && putWall < pivotLow
          ? `الثبات أسفل المنطقة المحورية ${pivotLabel} يدعم استمرار الحركة باتجاه Put Wall عند ${formatNumber(
              putWall,
              0
            )}.`
          : "الأفضلية تميل إلى PUT، لكن لا توجد مساحة واضحة كافية حتى الدعم التالي."
        : "لا يوجد سيناريو اتجاهي واضح حاليًا؛ الأفضل انتظار اتساع فرق التدفق وخروج السعر من المنطقة المحورية.";

  const invalidationScenario =
    flowDirection === "CALL"
      ? pivotLow > 0
        ? `كسر ${formatNumber(
            pivotLow,
            0
          )} والثبات أسفله يضعف سيناريو CALL ويستدعي إعادة التقييم.`
        : "انقلاب Flow إلى PUT أو ظهور Gamma Chop يلغي أفضلية CALL الحالية."
      : flowDirection === "PUT"
        ? pivotHigh > 0
          ? `اختراق ${formatNumber(
              pivotHigh,
              0
            )} والثبات فوقه يضعف سيناريو PUT ويستدعي إعادة التقييم.`
          : "انقلاب Flow إلى CALL أو اختفاء الضغط البيعي يلغي أفضلية PUT الحالية."
        : "يظل سيناريو الانتظار قائمًا حتى يظهر تفوق واضح في Flow ويخرج السعر من نطاق التذبذب.";

  const confidenceReasons: string[] = [];

  if (flowDirection !== "NEUTRAL") {
    confidenceReasons.push(
      "✅ اتجاه Flow واضح"
    );
  } else {
    confidenceReasons.push(
      "⚠️ اتجاه Flow محايد"
    );
  }

  if (netGex > 0) {
    confidenceReasons.push(
      "✅ Net GEX موجب"
    );
  } else if (netGex < 0) {
    confidenceReasons.push(
      "⚠️ Net GEX سالب ويرفع التقلب"
    );
  }

  confidenceReasons.push(
    market?.gammaChop
      ? "⚠️ Gamma Chop نشط"
      : "✅ لا يوجد Gamma Chop"
  );

  if (
    pivotLow > 0 &&
    pivotHigh > 0
  ) {
    confidenceReasons.push(
      `✅ المنطقة المحورية محددة عند ${pivotLabel}`
    );
  }

  const systemScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        45 +
          Math.min(
            Math.abs(flowGap),
            25
          ) *
            1.4 +
          (
            flowDirection === "NEUTRAL"
              ? -15
              : 10
          ) +
          (
            market?.gammaChop
              ? -20
              : 10
          ) +
          (
            pivotLevels.length >= 2
              ? 10
              : 0
          )
      )
    )
  );

  type GammaLevelSummary = {
    key: string;
    label: string;
    price: number;
    role: string;
    distance: number;
    side: "ABOVE" | "BELOW" | "AT";
  };

  const gammaLevels: GammaLevelSummary[] = [];

  const addGammaLevel = (
    key: string,
    label: string,
    rawPrice: number,
    role: string
  ) => {
    const price = Number(rawPrice || 0);

    if (!Number.isFinite(price) || price <= 0) {
      return;
    }

    const difference =
      spxPrice > 0
        ? price - spxPrice
        : 0;

    gammaLevels.push({
      key,
      label,
      price,
      role,
      distance: Math.abs(difference),
      side:
        difference > 1
          ? "ABOVE"
          : difference < -1
            ? "BELOW"
            : "AT",
    });
  };

  if (gamma) {
    addGammaLevel(
      "call-wall",
      "Call Wall",
      gamma.callWall,
      "المقاومة الرئيسية"
    );

    addGammaLevel(
      "put-wall",
      "Put Wall",
      gamma.putWall,
      "الدعم الرئيسي"
    );

    addGammaLevel(
      "magnet",
      "Magnet",
      gamma.magnet,
      "منطقة جذب سعري"
    );

    addGammaLevel(
      "net-gex-flip",
      "Net GEX Flip",
      gamma.netGexFlip,
      "مستوى تفاعل لحظي"
    );

    if (gamma.zeroGamma != null) {
      addGammaLevel(
        "zero-gamma",
        "Zero Gamma",
        gamma.zeroGamma,
        "منطقة تحول في بيئة القاما"
      );
    }
  }

  const sortedGammaLevels =
    [...gammaLevels].sort(
      (first, second) =>
        first.distance -
        second.distance
    );

  const nearestSupport =
    sortedGammaLevels.find(
      (level) =>
        level.side === "BELOW" &&
        (
          level.key === "put-wall" ||
          level.key === "net-gex-flip" ||
          level.key === "zero-gamma" ||
          level.key === "magnet"
        )
    ) || null;

  const nearestResistance =
    sortedGammaLevels.find(
      (level) =>
        level.side === "ABOVE" &&
        (
          level.key === "call-wall" ||
          level.key === "net-gex-flip" ||
          level.key === "zero-gamma" ||
          level.key === "magnet"
        )
    ) || null;

  const clusteredLevels =
    gammaLevels.filter(
      (level) =>
        spxPrice > 0 &&
        level.distance <= 10
    );

  const gammaClusterLow =
    clusteredLevels.length > 0
      ? Math.min(
          ...clusteredLevels.map(
            (level) => level.price
          )
        )
      : 0;

  const gammaClusterHigh =
    clusteredLevels.length > 0
      ? Math.max(
          ...clusteredLevels.map(
            (level) => level.price
          )
        )
      : 0;

  const gammaClusterLabel =
    gammaClusterLow > 0 &&
    gammaClusterHigh > 0
      ? Math.abs(
          gammaClusterHigh -
            gammaClusterLow
        ) < 1
        ? formatNumber(
            gammaClusterLow,
            0
          )
        : `${formatNumber(
            gammaClusterLow,
            0
          )} – ${formatNumber(
            gammaClusterHigh,
            0
          )}`
      : "لا توجد منطقة متقاربة حاليًا";

  const gammaRiskSummary =
    clusteredLevels.length >= 3
      ? `توجد كثافة مرتفعة من مستويات القاما قرب السعر داخل نطاق ${gammaClusterLabel}، لذلك هذه المنطقة مرشحة لتفاعل قوي أو تذبذب قبل تحديد الاتجاه.`
      : clusteredLevels.length === 2
        ? `يوجد تداخل بين مستويين مهمين قرب السعر عند ${gammaClusterLabel}، ما يجعل المنطقة حساسة للاختراق أو الارتداد.`
        : "مستويات القاما متباعدة نسبيًا، لذلك الحركة بين الدعم والمقاومة قد تكون أوضح.";

  const strongestGammaBias =
    gamma &&
    gamma.strongestCallGammaValue >
      gamma.strongestPutGammaValue
      ? `تجمع Gamma CALL أقوى عند ${formatNumber(
          gamma.strongestCallGammaStrike,
          0
        )} بقوة ${compactNumber(
          gamma.strongestCallGammaValue
        )}.`
      : gamma &&
          gamma.strongestPutGammaValue >
            gamma.strongestCallGammaValue
        ? `تجمع Gamma PUT أقوى عند ${formatNumber(
            gamma.strongestPutGammaStrike,
            0
          )} بقوة ${compactNumber(
            gamma.strongestPutGammaValue
          )}.`
        : "قوة Gamma CALL وPUT متقاربة، ولا توجد أفضلية واضحة من التجمعات.";

  const decisionSupportFactors: string[] = [];
  const decisionRiskFactors: string[] = [];

  let advancedDecisionScore = 50;

  const flowStrength =
    Math.abs(callFlowPct - putFlowPct);

  if (flowDirection === "CALL") {
    advancedDecisionScore += Math.min(
      20,
      flowStrength * 0.8
    );

    decisionSupportFactors.push(
      `تفوق CALL Flow بنسبة ${formatNumber(
        callFlowPct
      )}%`
    );
  } else if (flowDirection === "PUT") {
    advancedDecisionScore += Math.min(
      20,
      flowStrength * 0.8
    );

    decisionSupportFactors.push(
      `تفوق PUT Flow بنسبة ${formatNumber(
        putFlowPct
      )}%`
    );
  } else {
    advancedDecisionScore -= 20;

    decisionRiskFactors.push(
      "تدفقات CALL وPUT متقاربة"
    );
  }

  if (market?.gammaChop) {
    advancedDecisionScore -= 22;

    decisionRiskFactors.push(
      "Gamma Chop نشط ويرفع احتمالية الاختراقات الكاذبة"
    );
  } else {
    advancedDecisionScore += 10;

    decisionSupportFactors.push(
      "لا توجد حالة Gamma Chop"
    );
  }

  if (netGex > 0) {
    if (flowDirection !== "NEUTRAL") {
      advancedDecisionScore += 7;
    }

    decisionSupportFactors.push(
      "Net GEX موجب ويميل إلى تهدئة التقلب"
    );
  } else if (netGex < 0) {
    advancedDecisionScore -= 3;

    decisionRiskFactors.push(
      "Net GEX سالب وقد يوسّع الحركة بسرعة"
    );
  }

  const aboveZeroGamma =
    zeroGamma > 0 &&
    spxPrice > zeroGamma;

  const belowZeroGamma =
    zeroGamma > 0 &&
    spxPrice < zeroGamma;

  if (
    flowDirection === "CALL" &&
    aboveZeroGamma
  ) {
    advancedDecisionScore += 10;

    decisionSupportFactors.push(
      "السعر أعلى Zero Gamma ويدعم سيناريو CALL"
    );
  } else if (
    flowDirection === "PUT" &&
    belowZeroGamma
  ) {
    advancedDecisionScore += 10;

    decisionSupportFactors.push(
      "السعر أسفل Zero Gamma ويدعم سيناريو PUT"
    );
  } else if (
    flowDirection === "CALL" &&
    belowZeroGamma
  ) {
    advancedDecisionScore -= 12;

    decisionRiskFactors.push(
      "السعر أسفل Zero Gamma رغم تفوق CALL"
    );
  } else if (
    flowDirection === "PUT" &&
    aboveZeroGamma
  ) {
    advancedDecisionScore -= 12;

    decisionRiskFactors.push(
      "السعر أعلى Zero Gamma رغم تفوق PUT"
    );
  }

  const distanceToMagnet =
    magnet > 0 && spxPrice > 0
      ? Math.abs(spxPrice - magnet)
      : 999;

  if (distanceToMagnet <= 5) {
    advancedDecisionScore -= 8;

    decisionRiskFactors.push(
      "السعر ملاصق لـ Magnet وقد يبقى في حالة جذب وتذبذب"
    );
  } else if (distanceToMagnet <= 10) {
    advancedDecisionScore -= 4;

    decisionRiskFactors.push(
      "السعر قريب من Magnet"
    );
  }

  const callRoom =
    callWall > 0 && spxPrice > 0
      ? callWall - spxPrice
      : 0;

  const putRoom =
    putWall > 0 && spxPrice > 0
      ? spxPrice - putWall
      : 0;

  if (flowDirection === "CALL") {
    if (callRoom >= 15) {
      advancedDecisionScore += 8;

      decisionSupportFactors.push(
        `توجد مساحة ${formatNumber(
          callRoom,
          0
        )} نقطة حتى Call Wall`
      );
    } else if (callRoom > 0) {
      advancedDecisionScore -= 8;

      decisionRiskFactors.push(
        `المسافة إلى Call Wall محدودة: ${formatNumber(
          callRoom,
          0
        )} نقاط`
      );
    }
  }

  if (flowDirection === "PUT") {
    if (putRoom >= 15) {
      advancedDecisionScore += 8;

      decisionSupportFactors.push(
        `توجد مساحة ${formatNumber(
          putRoom,
          0
        )} نقطة حتى Put Wall`
      );
    } else if (putRoom > 0) {
      advancedDecisionScore -= 8;

      decisionRiskFactors.push(
        `المسافة إلى Put Wall محدودة: ${formatNumber(
          putRoom,
          0
        )} نقاط`
      );
    }
  }

  const modeledDecisionScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        advancedDecisionScore
      )
    )
  );

  const advancedDecision =
    market?.gammaChop ||
    flowDirection === "NEUTRAL" ||
    modeledDecisionScore < 65
      ? "انتظار"
      : flowDirection;

  const decisionQuality =
    modeledDecisionScore >= 85
      ? "ممتازة"
      : modeledDecisionScore >= 75
        ? "جيدة"
        : modeledDecisionScore >= 65
          ? "مقبولة بحذر"
          : "غير مؤهلة";

  const decisionRiskLevel =
    market?.gammaChop ||
    modeledDecisionScore < 60
      ? "مرتفع"
      : netGex < 0 ||
          distanceToMagnet <= 10
        ? "متوسط"
        : "منخفض";

  const activationCondition =
    advancedDecision === "CALL"
      ? pivotHigh > 0
        ? `الثبات فوق ${formatNumber(
            pivotHigh,
            0
          )} مع استمرار تفوق CALL Flow.`
        : "استمرار تفوق CALL Flow مع اختراق المقاومة الأقرب والثبات فوقها."
      : advancedDecision === "PUT"
        ? pivotLow > 0
          ? `الثبات أسفل ${formatNumber(
              pivotLow,
              0
            )} مع استمرار تفوق PUT Flow.`
          : "استمرار تفوق PUT Flow مع كسر الدعم الأقرب والثبات أسفله."
        : "انتظار اتساع فرق Flow وخروج السعر بوضوح من منطقة التفاعل.";

  const advancedInvalidation =
    advancedDecision === "CALL"
      ? pivotLow > 0
        ? `كسر ${formatNumber(
            pivotLow,
            0
          )} أو انقلاب Flow إلى PUT.`
        : "انقلاب Flow إلى PUT أو ظهور Gamma Chop."
      : advancedDecision === "PUT"
        ? pivotHigh > 0
          ? `اختراق ${formatNumber(
              pivotHigh,
              0
            )} أو انقلاب Flow إلى CALL.`
          : "انقلاب Flow إلى CALL أو ظهور Gamma Chop."
        : "لا يوجد إلغاء قبل تفعيل سيناريو واضح.";

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

            <section className="mt-5 overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-900/65">
              <button
                type="button"
                onClick={() =>
                  setOpenInterestOpen(
                    (current) => !current
                  )
                }
                aria-expanded={
                  openInterestOpen
                }
                className="flex w-full items-center justify-between gap-4 p-5 text-right transition hover:bg-white/[0.03] sm:p-6"
              >
                <div>
                  <p className="text-xs font-black tracking-[0.15em] text-cyan-400">
                    OPTIONS POSITIONING
                  </p>

                  <h2 className="mt-2 text-xl font-black text-white">
                    Open Interest
                  </h2>
                </div>

                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-xl font-black text-cyan-300">
                  {openInterestOpen
                    ? "−"
                    : "+"}
                </span>
              </button>

              {openInterestOpen ? (
                <div className="border-t border-white/10 p-5 sm:p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-bold text-slate-400">
                      اتجاه OI
                    </p>

                    <span
                      className={`rounded-xl border px-4 py-2 text-sm font-black ${
                        openInterest?.direction ===
                        "CALL"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : openInterest?.direction ===
                              "PUT"
                            ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                            : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                      }`}
                    >
                      {openInterest?.direction ||
                        "NEUTRAL"}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-black text-emerald-300">
                          CALL OI
                        </h3>

                        <span className="text-xs font-bold text-slate-500">
                          {formatNumber(
                            openInterest?.callPct,
                            2
                          )}
                          %
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(openInterest?.topCall ||
                          []).length > 0 ? (
                          (
                            openInterest?.topCall ||
                            []
                          ).map(
                            (level, index) => (
                              <div
                                key={`call-oi-${level.strike}-${index}`}
                                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
                              >
                                <span className="font-black text-white">
                                  {formatNumber(
                                    level.strike,
                                    0
                                  )}
                                </span>

                                <span className="font-black text-emerald-300">
                                  {formatNumber(
                                    level.openInterest,
                                    0
                                  )}
                                </span>
                              </div>
                            )
                          )
                        ) : (
                          <p className="text-sm font-bold text-slate-500">
                            لا توجد بيانات متاحة.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-black text-rose-300">
                          PUT OI
                        </h3>

                        <span className="text-xs font-bold text-slate-500">
                          {formatNumber(
                            openInterest?.putPct,
                            2
                          )}
                          %
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(openInterest?.topPut ||
                          []).length > 0 ? (
                          (
                            openInterest?.topPut ||
                            []
                          ).map(
                            (level, index) => (
                              <div
                                key={`put-oi-${level.strike}-${index}`}
                                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
                              >
                                <span className="font-black text-white">
                                  {formatNumber(
                                    level.strike,
                                    0
                                  )}
                                </span>

                                <span className="font-black text-rose-300">
                                  {formatNumber(
                                    level.openInterest,
                                    0
                                  )}
                                </span>
                              </div>
                            )
                          )
                        ) : (
                          <p className="text-sm font-bold text-slate-500">
                            لا توجد بيانات متاحة.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
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


            <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-slate-900/70 p-5 sm:p-6">
              <div>
                <p className="text-xs font-black text-cyan-300">
                  المرحلة الأولى
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  التقرير التنفيذي
                </h2>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-black text-cyan-300">
                    📊 قراءة السوق
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                    {marketReading}
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-black text-violet-300">
                    🎯 المنطقة المحورية
                  </p>

                  <p className="mt-3 text-2xl font-black text-white">
                    {pivotLabel}
                  </p>

                  <p className="mt-2 text-xs font-semibold leading-6 text-slate-400">
                    تجمع Net GEX Flip وZero Gamma وMagnet والجدار الأقرب عند توفرها.
                  </p>
                </article>

                <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                  <p className="text-sm font-black text-emerald-300">
                    📈 السيناريو الأساسي
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                    {primaryScenario}
                  </p>
                </article>

                <article className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
                  <p className="text-sm font-black text-rose-300">
                    ⚠️ سيناريو الإلغاء
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                    {invalidationScenario}
                  </p>
                </article>
              </div>

              <article className="mt-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[0.05] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-fuchsia-300">
                      ⭐ درجة الثقة
                    </p>

                    <p className="mt-2 text-3xl font-black">
                      {systemScore}/100
                    </p>
                  </div>

                  <span
                    className={[
                      "rounded-full border px-4 py-2 text-sm font-black",
                      flowDirection === "CALL"
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : flowDirection === "PUT"
                          ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                          : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                    ].join(" ")}
                  >
                    الاتجاه: {
                      flowDirection === "NEUTRAL"
                        ? "انتظار"
                        : flowDirection
                    }
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm font-semibold leading-7 text-slate-300 sm:grid-cols-2">
                  {confidenceReasons.map(
                    (reason) => (
                      <p key={reason}>
                        {reason}
                      </p>
                    )
                  )}
                </div>
              </article>
            </section>

            <section className="mt-6 rounded-3xl border border-violet-400/20 bg-slate-900/70 p-5 sm:p-6">
              <div>
                <p className="text-xs font-black text-violet-300">
                  المرحلة الثانية
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  خريطة مستويات القاما
                </h2>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                  <p className="text-sm font-black text-emerald-300">
                    الدعم الأقرب
                  </p>

                  <p className="mt-3 text-2xl font-black">
                    {nearestSupport
                      ? formatNumber(
                          nearestSupport.price,
                          0
                        )
                      : "—"}
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-7 text-slate-300">
                    {nearestSupport
                      ? `${nearestSupport.label} — ${nearestSupport.role} ويبعد ${formatNumber(
                          nearestSupport.distance,
                          0
                        )} نقطة عن السعر.`
                      : "لا يوجد مستوى دعم واضح أسفل السعر ضمن البيانات الحالية."}
                  </p>
                </article>

                <article className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
                  <p className="text-sm font-black text-rose-300">
                    المقاومة الأقرب
                  </p>

                  <p className="mt-3 text-2xl font-black">
                    {nearestResistance
                      ? formatNumber(
                          nearestResistance.price,
                          0
                        )
                      : "—"}
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-7 text-slate-300">
                    {nearestResistance
                      ? `${nearestResistance.label} — ${nearestResistance.role} وتبعد ${formatNumber(
                          nearestResistance.distance,
                          0
                        )} نقطة عن السعر.`
                      : "لا يوجد مستوى مقاومة واضح أعلى السعر ضمن البيانات الحالية."}
                  </p>
                </article>

                <article className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">
                  <p className="text-sm font-black text-cyan-300">
                    منطقة التفاعل
                  </p>

                  <p className="mt-3 text-2xl font-black">
                    {gammaClusterLabel}
                  </p>

                  <p className="mt-2 text-sm font-semibold leading-7 text-slate-300">
                    {gammaRiskSummary}
                  </p>
                </article>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-black text-violet-300">
                    ترتيب المستويات حسب القرب
                  </p>

                  <div className="mt-3 space-y-2 text-sm font-semibold leading-7 text-slate-300">
                    {sortedGammaLevels.length > 0 ? (
                      sortedGammaLevels.map(
                        (level) => (
                          <p key={level.key}>
                            {level.label}:{" "}
                            <span className="font-black text-white">
                              {formatNumber(
                                level.price,
                                0
                              )}
                            </span>{" "}
                            — {level.role} — يبعد{" "}
                            {formatNumber(
                              level.distance,
                              0
                            )} نقطة
                          </p>
                        )
                      )
                    ) : (
                      <p>
                        لا تتوفر مستويات قاما كافية حاليًا.
                      </p>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
                  <p className="text-sm font-black text-amber-300">
                    قراءة تجمعات القاما
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                    {strongestGammaBias}
                  </p>

                  <p className="mt-3 text-xs font-semibold leading-6 text-slate-400">
                    أقوى تجمع لا يُستخدم وحده كإشارة دخول؛ يتم دمجه مع Flow وموقع السعر والجدران.
                  </p>
                </article>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-fuchsia-400/20 bg-slate-900/70 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-fuchsia-300">
                    المرحلة الثالثة
                  </p>

                  <h2 className="mt-2 text-2xl font-black">
                    قرار النظام المتقدم
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={[
                      "rounded-full border px-4 py-2 text-sm font-black",
                      advancedDecision === "CALL"
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : advancedDecision === "PUT"
                          ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                          : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                    ].join(" ")}
                  >
                    القرار: {advancedDecision}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black">
                    الجودة: {decisionQuality}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold text-slate-500">
                    درجة السيناريو
                  </p>

                  <p className="mt-2 text-3xl font-black">
                    {modeledDecisionScore}/100
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold text-slate-500">
                    مستوى الخطر
                  </p>

                  <p
                    className={[
                      "mt-2 text-2xl font-black",
                      decisionRiskLevel === "منخفض"
                        ? "text-emerald-300"
                        : decisionRiskLevel === "متوسط"
                          ? "text-amber-300"
                          : "text-rose-300",
                    ].join(" ")}
                  >
                    {decisionRiskLevel}
                  </p>
                </article>

                <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-bold text-slate-500">
                    الهدف الهيكلي
                  </p>

                  <p className="mt-2 text-2xl font-black">
                    {advancedDecision === "CALL" &&
                    callWall > 0
                      ? formatNumber(
                          callWall,
                          0
                        )
                      : advancedDecision === "PUT" &&
                          putWall > 0
                        ? formatNumber(
                            putWall,
                            0
                          )
                        : "انتظار"}
                  </p>
                </article>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                  <p className="text-sm font-black text-emerald-300">
                    العوامل الداعمة
                  </p>

                  <div className="mt-3 space-y-2 text-sm font-semibold leading-7 text-slate-300">
                    {decisionSupportFactors.length > 0 ? (
                      decisionSupportFactors.map(
                        (factor) => (
                          <p key={factor}>
                            ✅ {factor}
                          </p>
                        )
                      )
                    ) : (
                      <p>
                        لا توجد عوامل داعمة كافية حاليًا.
                      </p>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
                  <p className="text-sm font-black text-rose-300">
                    عوامل الخطر
                  </p>

                  <div className="mt-3 space-y-2 text-sm font-semibold leading-7 text-slate-300">
                    {decisionRiskFactors.length > 0 ? (
                      decisionRiskFactors.map(
                        (factor) => (
                          <p key={factor}>
                            ⚠️ {factor}
                          </p>
                        )
                      )
                    ) : (
                      <p>
                        لا توجد عوامل خطر جوهرية حاليًا.
                      </p>
                    )}
                  </div>
                </article>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">
                  <p className="text-sm font-black text-cyan-300">
                    شرط التفعيل
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                    {activationCondition}
                  </p>
                </article>

                <article className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
                  <p className="text-sm font-black text-amber-300">
                    شرط الإلغاء
                  </p>

                  <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                    {advancedInvalidation}
                  </p>
                </article>
              </div>

              <p className="mt-4 text-xs font-semibold leading-6 text-slate-500">
                درجة السيناريو تقيس توافق Flow وهيكل القاما وموقع السعر، وهي مستقلة عن تقييم جودة عقد الأوبشن نفسه.
              </p>
            </section>

            <section className="mt-6">
              <h2 className="mb-4 text-xl font-black">
                الصفقة تحت المتابعة
              </h2>

              {activeTrade ? (
                <TradeCard
                  trade={activeTrade}
                
              onRefresh={() => void load(false)}
              refreshing={refreshing}
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
                      
              onRefresh={() => void load(false)}
              refreshing={refreshing}
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
