import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WhaleTrade = {
  id: number;
  symbol: string;
  option_ticker: string;
  contract_type: "call" | "put";
  strike: number;
  expiration: string;
  stock_price: number;
  contract_price: number;
  premium_value: number;
  volume: number;
  open_interest: number;
  volume_change: number;
  spread_pct: number | null;
  delta: number | null;
  gamma: number | null;
  whale_score: number;
  classification: string;
  money_position: string;
  direction_status: string;
  gamma_status: string;
  reason: string;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
};

async function getWhaleTrades(): Promise<WhaleTrade[]> {
  const supabaseUrl = process.env.SUPABASE_URL;

  const supabaseSecret =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseSecret) {
    return [];
  }

  const requestUrl =
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/whale_trades` +
    "?select=*" +
    "&is_active=eq.true" +
    "&order=last_seen_at.desc" +
    "&limit=50";

  try {
    const response = await fetch(requestUrl, {
      headers: {
        apikey: supabaseSecret,
        Authorization: `Bearer ${supabaseSecret}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function formatMoney(value: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  if (numericValue >= 1_000_000) {
    return `${(numericValue / 1_000_000).toFixed(2)} مليون دولار`;
  }

  return `${Math.round(numericValue).toLocaleString("en-US")} دولار`;
}

function formatNumber(value: number | null, digits = 2) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "—";
  }

  return numericValue.toFixed(digits);
}

function formatInteger(value: number) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return Math.round(numericValue).toLocaleString("en-US");
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

function getScoreClasses(score: number) {
  if (score >= 85) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
  }

  if (score >= 75) {
    return "border-amber-400/40 bg-amber-400/10 text-amber-300";
  }

  return "border-slate-500/40 bg-slate-500/10 text-slate-300";
}

function getContractClasses(contractType: "call" | "put") {
  if (contractType === "call") {
    return "bg-emerald-400/15 text-emerald-300";
  }

  return "bg-rose-400/15 text-rose-300";
}

export default async function WhaleTradesPage() {
  const trades = await getWhaleTrades();

  const highestScore =
    trades.length > 0
      ? Math.max(...trades.map((trade) => Number(trade.whale_score) || 0))
      : 0;

  const totalPremium = trades.reduce(
    (total, trade) => total + (Number(trade.premium_value) || 0),
    0
  );

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold text-cyan-400">
              ST Market Intelligence
            </p>

            <h1 className="text-3xl font-black sm:text-4xl">
              صفقات الحيتان
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              رصد تلقائي للعقود الكبيرة بقيمة تبدأ من مليون دولار، مع
              تحليل قوة الحوت والسيولة والقاما وجودة العقد.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold transition hover:bg-white/10"
            >
              الرئيسية
            </Link>

            <Link
              href="/whale-trades"
              className="rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-400"
            >
              تحديث النتائج
            </Link>
          </div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">الصفقات المرصودة</p>
            <p className="mt-2 text-3xl font-black">{trades.length}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">أعلى قوة حوت</p>
            <p className="mt-2 text-3xl font-black">{highestScore}%</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">إجمالي القيمة المرصودة</p>
            <p className="mt-2 text-xl font-black text-amber-300">
              {formatMoney(totalPremium)}
            </p>
          </div>
        </section>

        <section className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-4">
          <div>
            <p className="font-black text-emerald-300">
              الفحص التلقائي يعمل
            </p>

            <p className="mt-1 text-xs text-slate-400">
              يتم الفحص كل 5 دقائق خلال وقت الجلسة
            </p>
          </div>

          <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
        </section>

        {trades.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-20 text-center">
            <div className="text-5xl">🐋</div>

            <h2 className="mt-5 text-2xl font-black">
              لا توجد صفقة حوت مؤهلة حاليًا
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
              النظام لن يعرض أي عقد إلا بعد اجتياز قيمة الصفقة وقرب
              السترايك وجودة السبريد والحد الأدنى لقوة الحوت.
            </p>
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-2">
            {trades.map((trade) => (
              <article
                key={trade.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20"
              >
                <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-black">
                        {trade.symbol}
                      </h2>

                      <span
                        className={`rounded-lg px-3 py-1 text-sm font-black ${getContractClasses(
                          trade.contract_type
                        )}`}
                      >
                        {trade.contract_type === "call" ? "CALL" : "PUT"}
                      </span>

                      <span className="rounded-lg bg-white/10 px-3 py-1 text-sm font-bold">
                        {formatNumber(trade.strike, 0)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-400">
                      تاريخ الانتهاء: {trade.expiration}
                    </p>
                  </div>

                  <div
                    className={`rounded-2xl border px-4 py-3 text-center ${getScoreClasses(
                      trade.whale_score
                    )}`}
                  >
                    <p className="text-xs">قوة الحوت</p>
                    <p className="text-2xl font-black">
                      {trade.whale_score}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
                  <div className="bg-slate-950/90 p-4">
                    <p className="text-xs text-slate-500">
                      قيمة الصفقة
                    </p>

                    <p className="mt-1 font-black text-amber-300">
                      {formatMoney(trade.premium_value)}
                    </p>
                  </div>

                  <div className="bg-slate-950/90 p-4">
                    <p className="text-xs text-slate-500">
                      سعر العقد
                    </p>

                    <p className="mt-1 font-black">
                      {formatNumber(trade.contract_price)}
                    </p>
                  </div>

                  <div className="bg-slate-950/90 p-4">
                    <p className="text-xs text-slate-500">
                      حجم التداول
                    </p>

                    <p className="mt-1 font-black">
                      {formatInteger(trade.volume)}
                    </p>
                  </div>

                  <div className="bg-slate-950/90 p-4">
                    <p className="text-xs text-slate-500">
                      العقود المفتوحة
                    </p>

                    <p className="mt-1 font-black">
                      {formatInteger(trade.open_interest)}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-lg bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-300">
                      {trade.classification}
                    </span>

                    <span className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
                      {trade.money_position}
                    </span>

                    <span className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
                      {trade.gamma_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500">سعر السهم</p>
                      <p className="mt-1 font-bold">
                        {formatNumber(trade.stock_price)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">دلتا</p>
                      <p className="mt-1 font-bold">
                        {formatNumber(trade.delta, 3)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">قاما</p>
                      <p className="mt-1 font-bold">
                        {formatNumber(trade.gamma, 4)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">السبريد</p>
                      <p className="mt-1 font-bold">
                        {trade.spread_pct === null
                          ? "—"
                          : `${formatNumber(trade.spread_pct)}%`}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold text-slate-500">
                      تحليل الصفقة
                    </p>

                    <p className="text-sm leading-7 text-slate-300">
                      {trade.reason}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>{trade.direction_status}</span>

                    <span>
                      آخر رصد: {formatDate(trade.last_seen_at)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}