import type {
  DetectedOptionStrategy,
  DetectedStrategyLeg,
} from "@/lib/options-strategy-engine";

function formatNumber(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      timeZone: "Asia/Riyadh",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function directionClasses(direction: DetectedOptionStrategy["direction"]) {
  return direction === "صعودي"
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function LegCard({ leg }: { leg: DetectedStrategyLeg }) {
  const isBuy = leg.action === "شراء";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isBuy
          ? "border-emerald-400/20 bg-emerald-400/[0.045]"
          : "border-rose-400/20 bg-rose-400/[0.045]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`font-black ${
            isBuy ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {leg.role}
        </p>

        <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1 text-xs font-black">
          {leg.action} عقد {leg.contractLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">سعر التنفيذ</p>
          <p className="mt-1 font-black">{formatNumber(leg.strike)}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500">سعر العقد</p>
          <p className="mt-1 font-black">${formatNumber(leg.price)}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500">حجم التنفيذ</p>
          <p className="mt-1 font-black">{formatInteger(leg.size)}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500">وقت التنفيذ</p>
          <p className="mt-1 font-bold text-slate-300">
            {formatDate(leg.executionTime)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WhaleStrategyCard({
  strategy,
}: {
  strategy: DetectedOptionStrategy;
}) {
  const metricLabel =
    strategy.cashFlowType === "ائتماني"
      ? "صافي الائتمان التقريبي"
      : "صافي الخصم التقريبي";

  return (
    <article className="overflow-hidden rounded-3xl border border-violet-400/25 bg-gradient-to-b from-violet-400/[0.09] to-white/[0.025] shadow-2xl shadow-black/20 xl:col-span-2">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-3xl font-black">{strategy.symbol}</h2>

            <span className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-black text-violet-300">
              صفقة مركبة محتملة
            </span>

            <span
              className={`rounded-lg border px-3 py-1 text-xs font-black ${directionClasses(
                strategy.direction
              )}`}
            >
              الاتجاه المتوقع: {strategy.direction}
            </span>

            <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
              {strategy.cashFlowType}
            </span>
          </div>

          <h3 className="mt-4 text-xl font-black text-violet-200 sm:text-2xl">
            {strategy.name}
          </h3>

          <p className="mt-2 text-xs text-slate-500">
            تاريخ الانتهاء: {strategy.expiration}
          </p>
        </div>

        <div className="min-w-28 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-3 text-center">
          <p className="text-[10px] text-cyan-200">موثوقية الاكتشاف</p>
          <p className="mt-1 text-2xl font-black text-cyan-300">
            {strategy.confidence}%
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <LegCard leg={strategy.sellLeg} />
          <LegCard leg={strategy.buyLeg} />
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="bg-slate-950/90 p-4">
            <p className="text-xs text-slate-500">عرض السبريد</p>
            <p className="mt-1 font-black">{formatNumber(strategy.width)}</p>
          </div>

          <div className="bg-slate-950/90 p-4">
            <p className="text-xs text-slate-500">{metricLabel}</p>
            <p className="mt-1 font-black text-amber-300">
              ${formatNumber(strategy.netPremium)}
            </p>
          </div>

          <div className="bg-slate-950/90 p-4">
            <p className="text-xs text-slate-500">نقطة التعادل التقريبية</p>
            <p className="mt-1 font-black">
              {formatNumber(strategy.breakeven)}
            </p>
          </div>

          <div className="bg-slate-950/90 p-4">
            <p className="text-xs text-slate-500">أقصى ربح لكل سبريد</p>
            <p className="mt-1 font-black text-emerald-300">
              ${formatNumber(strategy.maxProfit)}
            </p>
          </div>

          <div className="bg-slate-950/90 p-4">
            <p className="text-xs text-slate-500">أقصى خسارة لكل سبريد</p>
            <p className="mt-1 font-black text-rose-300">
              ${formatNumber(strategy.maxLoss)}
            </p>
          </div>

          <div className="bg-slate-950/90 p-4">
            <p className="text-xs text-slate-500">العائد إلى المخاطرة</p>
            <p className="mt-1 font-black">
              {strategy.rewardRiskRatio === null
                ? "—"
                : `${formatNumber(strategy.rewardRiskRatio)} : 1`}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.045] p-4">
          <p className="text-xs font-black text-violet-300">
            ماذا تعني هذه الاستراتيجية؟
          </p>

          <p className="mt-3 text-sm leading-7 text-slate-300">
            {strategy.explanation}
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4">
          <p className="text-xs font-black text-cyan-300">
            لماذا اعتبرها النظام صفقة مركبة؟
          </p>

          <p className="mt-3 text-sm leading-7 text-slate-300">
            {strategy.detectionReason}
          </p>
        </div>

        <p className="border-t border-white/10 pt-4 text-xs leading-6 text-slate-500">
          الحسابات تقريبية وتعتمد على سعر التنفيذ المصنف لكل ساق. قد تكون
          العمليات تحوطًا أو تنفيذات مستقلة رغم تشابهها، لذلك لا تمثل
          توصية شراء أو بيع.
        </p>
      </div>
    </article>
  );
}
