"use client";

type PatternKind =
  | "HEAD_AND_SHOULDERS"
  | "INVERSE_HEAD_AND_SHOULDERS"
  | "RISING_WEDGE"
  | "FALLING_WEDGE"
  | "ASCENDING_TRIANGLE"
  | "DESCENDING_TRIANGLE"
  | "BULL_FLAG"
  | "BEAR_FLAG";

type PatternStatus = "FORMING" | "CONFIRMED";
type PatternDirection = "CALL" | "PUT";

type PatternResult = {
  kind: PatternKind;
  status: PatternStatus;
  direction: PatternDirection;
  confidence: number;
  breakout: {
    time?: number;
    price: number;
  };
  invalidation: number;
  target1: number;
  target2: number;
  target3: number;
  drawingPoints: Array<{
    label: string;
    index?: number;
    time: number;
    price: number;
  }>;
};

type PatternSummaryCardProps = {
  symbol: string;
  topPattern: PatternResult | null;
  loading?: boolean;
  error?: boolean;
};

export type PatternSummaryCardPattern = PatternResult;

const kindLabels: Record<PatternKind, string> = {
  HEAD_AND_SHOULDERS: "الرأس والكتفين",
  INVERSE_HEAD_AND_SHOULDERS: "الرأس والكتفين المعكوس",
  RISING_WEDGE: "الوتد الصاعد",
  FALLING_WEDGE: "الوتد الهابط",
  ASCENDING_TRIANGLE: "المثلث الصاعد",
  DESCENDING_TRIANGLE: "المثلث الهابط",
  BULL_FLAG: "العلم الصاعد",
  BEAR_FLAG: "العلم الهابط",
};

const statusLabels: Record<PatternStatus, string> = {
  FORMING: "قيد التكوّن",
  CONFIRMED: "مؤكد",
};

function formatValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "—";
}

function directionClasses(direction: PatternDirection): string {
  return direction === "CALL"
    ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/20"
    : "bg-rose-400/10 text-rose-300 border-rose-400/20";
}

export default function PatternSummaryCard({
  symbol,
  topPattern,
  loading = false,
  error = false,
}: PatternSummaryCardProps) {
  const state = loading
    ? { status: "loading" as const }
    : error
      ? { status: "error" as const }
      : topPattern
        ? { status: "ready" as const, pattern: topPattern }
        : { status: "empty" as const };

  void symbol;

  return (
    <section
      dir="rtl"
      className="mb-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-cyan-400">
            النموذج الفني اليومي
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            تحليل النماذج الكلاسيكية
          </h2>
          <div className="mt-3 max-w-3xl rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-4 py-3 text-right">
            <p className="text-sm leading-7 text-slate-300">
              يرجى اختيار فريم اليومي لمتابعة النموذج الفني بدقة. ولأن بيانات الشموع في المنصة قد تتأخر قليلًا أو تختلف بشكل بسيط عن TradingView، يُفضّل تأكيد النموذج ورسم خطوط الاختراق والإلغاء والأهداف على شارت TradingView الفعلي ومتابعته من هناك.
            </p>
          </div>
        </div>
      </div>

      {state.status === "loading" ? (
        <p className="mt-5 text-sm leading-7 text-slate-300">
          جارٍ تحليل النماذج اليومية...
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-5 text-sm leading-7 text-rose-300">
          تعذر تحميل تحليل النماذج حاليًا.
        </p>
      ) : null}

      {state.status === "empty" ? (
        <p className="mt-5 text-sm leading-7 text-slate-300">
          لا يوجد نموذج يومي موثوق حاليًا.
        </p>
      ) : null}

      {state.status === "ready" ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
              {kindLabels[state.pattern.kind]}
            </span>
            <span className="rounded-full bg-white/[0.06] px-4 py-2 text-sm font-bold text-slate-200">
              {statusLabels[state.pattern.status]}
            </span>
            <span
              className={`rounded-full border px-4 py-2 text-sm font-bold ${directionClasses(
                state.pattern.direction,
              )}`}
            >
              {state.pattern.direction}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-xs text-slate-500">الثقة</p>
              <p className="mt-2 text-2xl font-black text-white">
                {formatValue(state.pattern.confidence)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-xs text-slate-500">الاختراق</p>
              <p className="mt-2 text-2xl font-black text-cyan-300">
                {formatValue(state.pattern.breakout.price)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-xs text-slate-500">الإلغاء</p>
              <p className="mt-2 text-2xl font-black text-rose-300">
                {formatValue(state.pattern.invalidation)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
              <p className="text-xs text-slate-500">الهدف الأول</p>
              <p className="mt-2 text-2xl font-black text-emerald-300">
                {formatValue(state.pattern.target1)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
              <p className="text-xs text-slate-500">الهدف الثاني</p>
              <p className="mt-2 text-2xl font-black text-emerald-300">
                {formatValue(state.pattern.target2)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
              <p className="text-xs text-slate-500">الهدف الثالث</p>
              <p className="mt-2 text-2xl font-black text-emerald-300">
                {formatValue(state.pattern.target3)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
