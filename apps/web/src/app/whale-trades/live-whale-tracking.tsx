"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type NumericValue =
  | number
  | string
  | null
  | undefined;

type TrackingTrade = {
  id?: number | string;
  whale_trade_id?: number | string;

  tracking_option_ticker?: string | null;
  tracking_side?: string | null;
  tracking_strike?: NumericValue;
  tracking_expiration?: string | null;

  is_alternative?: boolean | null;
  alternative_reason?: string | null;

  entry_price?: NumericValue;
  current_price?: NumericValue;
  best_price?: NumericValue;

  contract_bid?: NumericValue;
  contract_ask?: NumericValue;

  contract_profit_dollars?: NumericValue;
  contract_profit_pct?: NumericValue;

  best_profit_dollars?: NumericValue;
  best_profit_pct?: NumericValue;

  stock_entry_price?: NumericValue;
  stock_current_price?: NumericValue;
  stock_best_price?: NumericValue;

  stop_price?: NumericValue;
  gamma_targets?: unknown;
  highest_target_hit?: NumericValue;

  activated_at?: string | null;

  status?: string | null;
  contract_status?: string | null;

  contract_quote_at?: string | null;
};

type Props = {
  whaleTradeId: number | string;
};

function safeNumber(
  value: NumericValue,
  fallback = 0,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function formatOptionalPrice(
  value: NumericValue,
) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return "غير محدد بعد";
  }

  return `$${number.toFixed(2)}`;
}

function formatPrice(value: NumericValue) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toFixed(2);
}

function formatSignedMoney(value: NumericValue) {
  const number = safeNumber(value);

  return `${number >= 0 ? "+" : "-"}$${Math.abs(
    number,
  ).toFixed(2)}`;
}

function formatSignedPercent(value: NumericValue) {
  const number = safeNumber(value);

  return `${number >= 0 ? "+" : ""}${number.toFixed(
    2,
  )}%`;
}

function getStatusLabel(status?: string | null) {
  switch (
    String(status || "")
      .trim()
      .toUpperCase()
  ) {
    case "ACTIVE":
      return "نشطة وتحت المتابعة";

    case "TARGET_1":
      return "تحقق الهدف الأول";

    case "TARGET_2":
      return "تحقق الهدف الثاني";

    case "TARGET_3":
      return "تحققت الأهداف";

    case "STOPPED":
      return "ضرب الوقف";

    case "EXPIRED":
      return "انتهت";

    case "ERROR":
      return "تعذر تحديث العقد";

    default:
      return "جاري بدء المتابعة";
  }
}

function getStatusClasses(status?: string | null) {
  switch (
    String(status || "")
      .trim()
      .toUpperCase()
  ) {
    case "ACTIVE":
      return "border-cyan-400/25 bg-cyan-400/10 text-cyan-300";

    case "TARGET_1":
    case "TARGET_2":
    case "TARGET_3":
      return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";

    case "STOPPED":
    case "EXPIRED":
    case "ERROR":
      return "border-rose-400/25 bg-rose-400/10 text-rose-300";

    default:
      return "border-amber-400/25 bg-amber-400/10 text-amber-300";
  }
}


function formatActivationDate(
  value?: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Riyadh",
    },
  ).format(date);
}

function formatActivationTime(
  value?: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Riyadh",
    },
  ).format(date);
}

function formatActivationAge(
  value?: string | null,
) {
  if (!value) {
    return "—";
  }

  const activatedAt =
    new Date(value).getTime();

  if (
    !Number.isFinite(activatedAt)
  ) {
    return "—";
  }

  const totalMinutes =
    Math.max(
      0,
      Math.floor(
        (Date.now() - activatedAt) /
          60_000,
      ),
    );

  const days =
    Math.floor(
      totalMinutes / 1_440,
    );

  const hours =
    Math.floor(
      (totalMinutes % 1_440) / 60,
    );

  const minutes =
    totalMinutes % 60;

  if (days > 0) {
    return `منذ ${days} يوم و${hours} ساعة`;
  }

  if (hours > 0) {
    return `منذ ${hours} ساعة و${minutes} دقيقة`;
  }

  return `منذ ${minutes} دقيقة`;
}

function normalizeTargets(
  value: unknown,
): number[] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map(Number)
      .filter(
        (item) =>
          Number.isFinite(item) &&
          item > 0,
      )
      .slice(0, 3);
  }

  if (
    parsed &&
    typeof parsed === "object"
  ) {
    const record =
      parsed as Record<string, unknown>;

    return [
      record.target1 ??
        record.target_1 ??
        record.tp1,
      record.target2 ??
        record.target_2 ??
        record.tp2,
      record.target3 ??
        record.target_3 ??
        record.tp3,
    ]
      .map(Number)
      .filter(
        (item) =>
          Number.isFinite(item) &&
          item > 0,
      )
      .slice(0, 3);
  }

  return [];
}

function normalizeTrades(payload: unknown): TrackingTrade[] {
  if (Array.isArray(payload)) {
    return payload as TrackingTrade[];
  }

  if (
    payload &&
    typeof payload === "object"
  ) {
    const record =
      payload as Record<string, unknown>;

    const candidates = [
      record.trades,
      record.data,
      record.setups,
      record.items,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate as TrackingTrade[];
      }
    }
  }

  return [];
}

export default function LiveWhaleTracking({
  whaleTradeId,
}: Props) {
  const [trackingTrades, setTrackingTrades] =
    useState<TrackingTrade[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadTracking = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        const response = await fetch(
          "/api/whale-trades/live",
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            "تعذر تحميل متابعة الفرصة.",
          );
        }

        const payload: unknown =
          await response.json();

        setTrackingTrades(
          normalizeTrades(payload),
        );

        setError(null);
      } catch (loadError) {
        console.error(
          "Whale live tracking failed:",
          loadError,
        );

        setError(
          "تعذر تحديث بيانات المتابعة حاليًا.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadTracking();

    const intervalId =
      window.setInterval(() => {
        void loadTracking(true);
      }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadTracking]);

  const trackingTrade = useMemo(() => {
    const requestedId =
      String(whaleTradeId);

    return (
      trackingTrades.find(
        (trade) =>
          String(
            trade.whale_trade_id ?? "",
          ) === requestedId,
      ) ?? null
    );
  }, [
    trackingTrades,
    whaleTradeId,
  ]);

  if (loading && !trackingTrade) {
    return (
      <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4">
        <p className="text-xs font-black text-cyan-300">
          المتابعة المباشرة
        </p>

        <p className="mt-2 text-sm text-slate-400">
          جاري تحميل بيانات المتابعة...
        </p>
      </section>
    );
  }

  if (!trackingTrade) {
    return (
      <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.035] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-amber-300">
              المتابعة المباشرة
            </p>

            <p className="mt-2 text-sm text-slate-400">
              هذه الفرصة غير مكتملة ولا تُعرض كتوصية تنفيذ.
            </p>
          </div>

          <span className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300">
            غير جاهزة للتنفيذ
          </span>
        </div>

        {error && (
          <p className="mt-3 text-xs text-rose-300">
            {error}
          </p>
        )}
      </section>
    );
  }

  const profitDollars =
    safeNumber(
      trackingTrade.contract_profit_dollars,
    );

  const profitPct =
    safeNumber(
      trackingTrade.contract_profit_pct,
    );

  const bestProfitDollars =
    safeNumber(
      trackingTrade.best_profit_dollars,
    );

  const bestProfitPct =
    safeNumber(
      trackingTrade.best_profit_pct,
    );

  const positive =
    profitDollars >= 0;

  const stockTargets =
    normalizeTargets(
      trackingTrade.gamma_targets,
    );

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.035]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <div>
          <p className="text-xs font-black text-cyan-300">
            المتابعة المباشرة
          </p>

          <p className="mt-1 text-sm font-bold text-white">
            {trackingTrade.tracking_option_ticker ||
              "العقد المعتمد"}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
              <p className="text-[10px] text-slate-500">
                تاريخ التفعيل
              </p>

              <p className="mt-1 text-xs font-black text-white">
                {formatActivationDate(
                  trackingTrade.activated_at,
                )}
              </p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
              <p className="text-[10px] text-slate-500">
                وقت التفعيل
              </p>

              <p className="mt-1 text-xs font-black text-white">
                {formatActivationTime(
                  trackingTrade.activated_at,
                )}
              </p>
            </div>

            <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[0.045] px-3 py-2">
              <p className="text-[10px] text-slate-500">
                عمر الصفقة
              </p>

              <p className="mt-1 text-xs font-black text-cyan-300">
                {formatActivationAge(
                  trackingTrade.activated_at,
                )}
              </p>
            </div>
          </div>
        </div>

        <span
          className={`rounded-lg border px-3 py-2 text-xs font-black ${getStatusClasses(
            trackingTrade.status,
          )}`}
        >
          {getStatusLabel(
            trackingTrade.status,
          )}
        </span>
      </div>

      {trackingTrade.is_alternative && (
        <div className="border-b border-amber-400/15 bg-amber-400/[0.05] px-4 py-3">
          <p className="text-xs font-bold text-amber-300">
            تم اعتماد عقد مناسب بسعر 3.00$ أو أقل
          </p>

          {trackingTrade.alternative_reason && (
            <p className="mt-1 text-xs leading-6 text-slate-400">
              {
                trackingTrade.alternative_reason
              }
            </p>
          )}
        </div>
      )}

      <div className="border-b border-white/10 p-4">
        <p className="text-xs font-black text-cyan-300">
          خطة التداول الكاملة
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <p className="text-xs text-slate-500">
              دخول السهم
            </p>

            <p className="mt-1 font-black text-white">
              $
              {formatPrice(
                trackingTrade.stock_entry_price,
              )}
            </p>
          </div>

          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3">
            <p className="text-xs text-slate-500">
              وقف السهم
            </p>

            <p className="mt-1 font-black text-rose-300">
              {formatOptionalPrice(
                trackingTrade.stop_price,
              )}
            </p>
          </div>

          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3"
            >
              <p className="text-xs text-slate-500">
                الهدف {index + 1}
              </p>

              <p className="mt-1 font-black text-emerald-300">
                {stockTargets[index]
                  ? `$${formatPrice(
                      stockTargets[index],
                    )}`
                  : "—"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
        <div className="bg-slate-950/80 p-4">
          <p className="text-xs text-slate-500">
            سعر الدخول
          </p>

          <p className="mt-1 text-lg font-black">
            $
            {formatPrice(
              trackingTrade.entry_price,
            )}
          </p>
        </div>

        <div className="bg-slate-950/80 p-4">
          <p className="text-xs text-slate-500">
            السعر الحالي
          </p>

          <p className="mt-1 text-lg font-black">
            $
            {formatPrice(
              trackingTrade.current_price,
            )}
          </p>
        </div>

        <div className="bg-slate-950/80 p-4">
          <p className="text-xs text-slate-500">
            أعلى سعر
          </p>

          <p className="mt-1 text-lg font-black text-emerald-300">
            $
            {formatPrice(
              trackingTrade.best_price,
            )}
          </p>
        </div>

        <div className="bg-slate-950/80 p-4">
          <p className="text-xs text-slate-500">
            وقف العقد
          </p>

          <p className="mt-1 text-lg font-black text-rose-300">
            {formatOptionalPrice(
              trackingTrade.stop_price,
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div
          className={`rounded-xl border p-4 ${
            positive
              ? "border-emerald-400/20 bg-emerald-400/[0.06]"
              : "border-rose-400/20 bg-rose-400/[0.06]"
          }`}
        >
          <p className="text-xs text-slate-400">
            الربح أو الخسارة الآن
          </p>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <p
              className={`text-xl font-black ${
                positive
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {formatSignedMoney(
                profitDollars,
              )}
            </p>

            <p
              className={`text-sm font-black ${
                positive
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {formatSignedPercent(
                profitPct,
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
          <p className="text-xs text-slate-400">
            أفضل نتيجة منذ الدخول
          </p>

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-xl font-black text-emerald-300">
              {formatSignedMoney(
                bestProfitDollars,
              )}
            </p>

            <p className="text-sm font-black text-emerald-300">
              {formatSignedPercent(
                bestProfitPct,
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-white/10 px-4 py-3 text-xs text-slate-400">
        <span>
          سعر السهم عند الدخول:{" "}
          <strong className="text-white">
            $
            {formatPrice(
              trackingTrade.stock_entry_price,
            )}
          </strong>
        </span>

        <span>
          سعر السهم الآن:{" "}
          <strong className="text-white">
            $
            {formatPrice(
              trackingTrade.stock_current_price,
            )}
          </strong>
        </span>

        <span>
          أفضل سعر للسهم:{" "}
          <strong className="text-white">
            $
            {formatPrice(
              trackingTrade.stock_best_price,
            )}
          </strong>
        </span>
      </div>
    </section>
  );
}
