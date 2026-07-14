import Link from "next/link";
import AutoRefresh from "./auto-refresh";

import { hydrateWhaleTrade } from "@/lib/hydrate-whale-trade";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type NumericValue = number | string | null;

type WhaleTrade = {
  id: number | string;
  trade_key?: string | null;

  symbol?: string | null;
  option_ticker?: string | null;
  contract_type?: string | null;
  strike?: NumericValue;
  expiration?: string | null;

  stock_price?: NumericValue;
  contract_price?: NumericValue;
  premium_value?: NumericValue;

  trade_size?: NumericValue;
  volume?: NumericValue;
  open_interest?: NumericValue;
  volume_change?: NumericValue;

  bid?: NumericValue;
  ask?: NumericValue;
  bid_size?: NumericValue;
  ask_size?: NumericValue;
  spread_pct?: NumericValue;

  execution_location?: string | null;
  estimated_side?: string | null;

  delta?: NumericValue;
  gamma?: NumericValue;
  theta?: NumericValue;
  vega?: NumericValue;
  iv?: NumericValue;

  whale_score?: NumericValue;
  classification?: string | null;
  money_position?: string | null;
  direction_status?: string | null;
  gamma_status?: string | null;
  reason?: string | null;

  is_block?: boolean | null;
  is_sweep?: boolean | null;
  sweep_count?: NumericValue;
  repeat_count?: NumericValue;
  hedge_flag?: boolean | null;

  trade_timestamp?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  is_active?: boolean | null;
};

type SearchParams = {
  symbol?: string | string[];
  type?: string | string[];
  classification?: string | string[];
  execution?: string | string[];
  minPremium?: string | string[];
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function formatMoney(value: unknown) {
  const number = safeNumber(value);

  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(2)}M`;
  }

  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(1)}K`;
  }

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function formatInteger(value: unknown) {
  return Math.round(safeNumber(value)).toLocaleString("en-US");
}

function formatNumber(value: unknown, digits = 2) {
  const number = nullableNumber(value);

  if (number === null) {
    return "—";
  }

  return number.toFixed(digits);
}

function formatPercent(value: unknown, digits = 2) {
  const number = nullableNumber(value);

  if (number === null) {
    return "—";
  }

  return `${number.toFixed(digits)}%`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }

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

function getTradeTime(trade: WhaleTrade) {
  return (
    trade.trade_timestamp ||
    trade.last_seen_at ||
    trade.created_at ||
    trade.first_seen_at ||
    null
  );
}

function getContractType(trade: WhaleTrade) {
  return String(trade.contract_type || "").toLowerCase() === "put"
    ? "put"
    : "call";
}

function getScoreClasses(score: number) {
  if (score >= 90) {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-200";
  }

  if (score >= 80) {
    return "border-cyan-400/40 bg-cyan-400/10 text-cyan-200";
  }

  if (score >= 70) {
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  }

  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

function getContractClasses(contractType: string) {
  if (contractType === "call") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function getExecutionLabel(location?: string | null) {
  switch (String(location || "").toUpperCase()) {
    case "AT_ASK":
      return "عند Ask";
    case "AT_BID":
      return "عند Bid";
    case "ABOVE_MID":
      return "فوق المنتصف";
    case "BELOW_MID":
      return "تحت المنتصف";
    case "MID":
      return "عند المنتصف";
    default:
      return "غير محسوم";
  }
}

function getSideLabel(side?: string | null) {
  switch (String(side || "").toUpperCase()) {
    case "BUY":
      return "شراء محتمل";
    case "SELL":
      return "بيع محتمل";
    default:
      return "غير محدد";
  }
}

function getSideClasses(side?: string | null) {
  switch (String(side || "").toUpperCase()) {
    case "BUY":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    case "SELL":
      return "border-rose-400/30 bg-rose-400/10 text-rose-300";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  }
}

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
    "&limit=200";

  try {
    const response = await fetch(requestUrl, {
      headers: {
        apikey: supabaseSecret,
        Authorization: `Bearer ${supabaseSecret}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "Failed to fetch whale trades:",
        response.status,
        await response.text(),
      );

      return [];
    }

    const data = await response.json();

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Whale trades request failed:", error);

    return [];
  }
}


function getClearTradeDecision(
  trade: WhaleTrade
): {
  label: string;
  reason: string;
} {
  const contractType =
    getContractType(trade);

  const estimatedSide = String(
    trade.estimated_side ?? "UNKNOWN"
  ).toUpperCase();

  if (
    estimatedSide === "BUY" &&
    contractType === "call"
  ) {
    return {
      label: "القرار: CALL — صعودي",
      reason: "شراء عقد CALL محتمل",
    };
  }

  if (
    estimatedSide === "BUY" &&
    contractType === "put"
  ) {
    return {
      label: "القرار: PUT — هبوطي",
      reason: "شراء عقد PUT محتمل",
    };
  }

  if (
    estimatedSide === "SELL" &&
    contractType === "call"
  ) {
    return {
      label: "القرار: PUT — هبوطي",
      reason: "بيع عقد CALL محتمل",
    };
  }

  if (
    estimatedSide === "SELL" &&
    contractType === "put"
  ) {
    return {
      label: "القرار: CALL — صعودي",
      reason: "بيع عقد PUT محتمل",
    };
  }

  return {
    label: "القرار: اتركها",
    reason: "اتجاه التنفيذ غير محسوم",
  };
}

export default async function WhaleTradesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const trades = await getWhaleTrades();

  const symbolFilter = readParam(params.symbol)
    .trim()
    .toUpperCase();

  const typeFilter = readParam(params.type)
    .trim()
    .toLowerCase();

  const classificationFilter = readParam(params.classification)
    .trim()
    .toLowerCase();

  const executionFilter = readParam(params.execution)
    .trim()
    .toUpperCase();

  const minPremium = Math.max(
    0,
    safeNumber(readParam(params.minPremium)),
  );

  const hydratedTrades = Array.isArray(trades)
    ? trades.map((trade) =>
        hydrateWhaleTrade(trade)
      )
    : [];

  const filteredTrades = hydratedTrades.filter((trade) => {
    const ruleRecord =
      trade as WhaleTrade &
        Record<string, unknown>;

    const displayStrength = safeNumber(
      ruleRecord.whale_score ??
        ruleRecord.score ??
        ruleRecord.strength ??
        0
    );

    const expirationValue =
      ruleRecord.expiration ??
      ruleRecord.expiration_date ??
      ruleRecord.expiry ??
      ruleRecord.expiry_date;

    let expirationKey: string | null = null;

    if (typeof expirationValue === "string") {
      const cleanedExpiration =
        expirationValue.trim();

      const isoMatch =
        cleanedExpiration.match(
          /^(\d{4})-(\d{2})-(\d{2})/
        );

      const displayMatch =
        cleanedExpiration.match(
          /^(\d{2})[-/](\d{2})[-/](\d{4})$/
        );

      if (isoMatch) {
        expirationKey =
          `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      } else if (displayMatch) {
        expirationKey =
          `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
      }
    }

    const newYorkParts =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());

    const newYorkValues =
      Object.fromEntries(
        newYorkParts.map((part) => [
          part.type,
          part.value,
        ])
      );

    const todayKey =
      `${newYorkValues.year}-${newYorkValues.month}-${newYorkValues.day}`;

    const keyToUtc = (dateKey: string) => {
      const [year, month, day] =
        dateKey.split("-").map(Number);

      return Date.UTC(
        year,
        month - 1,
        day
      );
    };

    const daysToExpiration =
      expirationKey
        ? Math.round(
            (
              keyToUtc(expirationKey) -
              keyToUtc(todayKey)
            ) /
              86_400_000
          )
        : null;

    const ruleSymbol = String(
      trade.symbol ?? ""
    ).toUpperCase();

    const isDailyIndex = [
      "SPX",
      "SPXW",
      "NDX",
      "NDXP",
    ].includes(ruleSymbol);

    if (isDailyIndex) {
      if (
        displayStrength < 90 ||
        (
          daysToExpiration === null ||
          daysToExpiration < 1 ||
          daysToExpiration > 3
        )
      ) {
        return false;
      }
    } else {
      if (
        displayStrength < 80 ||
        daysToExpiration === null ||
        daysToExpiration < 0 ||
        daysToExpiration > 14
      ) {
        return false;
      }
    }

    const symbol = String(trade.symbol || "").toUpperCase();
    const contractType = getContractType(trade);
    const estimatedSide = String(
      trade.estimated_side || "UNKNOWN",
    ).toUpperCase();

    const premium = safeNumber(trade.premium_value);
    const repeatCount = safeNumber(trade.repeat_count);

    if (symbolFilter && !symbol.includes(symbolFilter)) {
      return false;
    }

    if (typeFilter && contractType !== typeFilter) {
      return false;
    }

    if (executionFilter && estimatedSide !== executionFilter) {
      return false;
    }

    if (premium < minPremium) {
      return false;
    }

    if (classificationFilter === "sweep" && !trade.is_sweep) {
      return false;
    }

    if (classificationFilter === "block" && !trade.is_block) {
      return false;
    }

    if (
      classificationFilter === "repeat" &&
      repeatCount < 3
    ) {
      return false;
    }

    if (
      classificationFilter === "million" &&
      premium < 1_000_000
    ) {
      return false;
    }

    return true;
  });

  const totalPremium = filteredTrades.reduce(
    (total, trade) => total + safeNumber(trade.premium_value),
    0,
  );

  const callTrades = filteredTrades.filter(
    (trade) => getContractType(trade) === "call",
  );

  const putTrades = filteredTrades.filter(
    (trade) => getContractType(trade) === "put",
  );

  const callPremium = callTrades.reduce(
    (total, trade) => total + safeNumber(trade.premium_value),
    0,
  );

  const putPremium = putTrades.reduce(
    (total, trade) => total + safeNumber(trade.premium_value),
    0,
  );

  const callPremiumPct =
    totalPremium > 0 ? (callPremium / totalPremium) * 100 : 0;

  const putPremiumPct =
    totalPremium > 0 ? (putPremium / totalPremium) * 100 : 0;

  const sweepCount = filteredTrades.filter(
    (trade) => Boolean(trade.is_sweep),
  ).length;

  const blockCount = filteredTrades.filter(
    (trade) => Boolean(trade.is_block),
  ).length;

  const averageScore =
    filteredTrades.length > 0
      ? Math.round(
          filteredTrades.reduce(
            (total, trade) => total + safeNumber(trade.whale_score),
            0,
          ) / filteredTrades.length,
        )
      : 0;

  const largestTrade =
    filteredTrades.length > 0
      ? filteredTrades.reduce((largest, trade) =>
          safeNumber(trade.premium_value) >
          safeNumber(largest.premium_value)
            ? trade
            : largest,
        )
      : null;

  const currentQuery = new URLSearchParams();

  if (symbolFilter) {
    currentQuery.set("symbol", symbolFilter);
  }

  if (typeFilter) {
    currentQuery.set("type", typeFilter);
  }

  if (classificationFilter) {
    currentQuery.set("classification", classificationFilter);
  }

  if (executionFilter) {
    currentQuery.set("execution", executionFilter);
  }

  if (minPremium > 0) {
    currentQuery.set("minPremium", String(minPremium));
  }

  const refreshHref =
    currentQuery.size > 0
      ? `/whale-trades?${currentQuery.toString()}`
      : "/whale-trades";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#020617] px-4 py-6 text-white sm:px-6 sm:py-10"
    >
      <div className="mx-auto max-w-7xl">
        <AutoRefresh intervalMs={20_000} />
        <header className="mb-7 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-l from-cyan-500/10 via-slate-900/90 to-amber-400/10 p-5 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                  LIVE FLOW
                </span>

                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
                  الرصد المؤسسي
                </span>
              </div>

              <h1 className="text-3xl font-black sm:text-5xl">
                صفقات الحيتان
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
                تحليل صفقات الأوبشن الكبيرة حسب قيمة التنفيذ الفعلية،
                وموقع التنفيذ من Bid وAsk، مع تصنيف Block وSweep المحتمل
                والتكرار المؤسسي وجودة العقد.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold transition hover:bg-white/10"
              >
                ← الرئيسية
              </Link>

              <Link
                href={refreshHref}
                className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
              >
                تحديث النتائج
              </Link>
            </div>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-slate-500">الصفقات الظاهرة</p>
            <p className="mt-2 text-3xl font-black">
              {filteredTrades.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-slate-500">إجمالي القيمة</p>
            <p className="mt-2 text-2xl font-black text-amber-300">
              ${formatMoney(totalPremium)}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
            <p className="text-xs text-slate-500">CALL</p>
            <p className="mt-2 text-2xl font-black text-emerald-300">
              {callPremiumPct.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
            <p className="text-xs text-slate-500">PUT</p>
            <p className="mt-2 text-2xl font-black text-rose-300">
              {putPremiumPct.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] p-4">
            <p className="text-xs text-slate-500">Sweep / Block</p>
            <p className="mt-2 text-2xl font-black text-cyan-300">
              {sweepCount} / {blockCount}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-slate-500">متوسط القوة</p>
            <p className="mt-2 text-3xl font-black">
              {averageScore}%
            </p>
          </div>
        </section>

        <section className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-300">
              CALL ${formatMoney(callPremium)}
            </span>

            <span className="font-bold text-rose-300">
              PUT ${formatMoney(putPremium)}
            </span>
          </div>

          <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="bg-emerald-400 transition-all"
              style={{ width: `${callPremiumPct}%` }}
            />

            <div
              className="bg-rose-400 transition-all"
              style={{ width: `${putPremiumPct}%` }}
            />
          </div>
        </section>

        {largestTrade && (
          <section className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-5">
            <p className="text-xs font-black text-amber-300">
              أكبر صفقة مرصودة
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-3xl font-black">
                {largestTrade.symbol || "—"}
              </span>

              <span
                className={`rounded-lg border px-3 py-1 text-sm font-black ${getContractClasses(
                  getContractType(largestTrade),
                )}`}
              >
                {getContractType(largestTrade).toUpperCase()}
              </span>

              <span className="text-xl font-black text-amber-300">
                ${formatMoney(largestTrade.premium_value)}
              </span>

              <span className="text-sm text-slate-400">
                Strike {formatNumber(largestTrade.strike, 0)}
              </span>
            </div>
          </section>
        )}

        <form
          method="GET"
          className="mb-7 grid gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6"
        >
          <input
            name="symbol"
            defaultValue={symbolFilter}
            placeholder="رمز السهم"
            className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold uppercase outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50"
          />

          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-400/50"
          >
            <option value="">CALL وPUT</option>
            <option value="call">CALL فقط</option>
            <option value="put">PUT فقط</option>
          </select>

          <select
            name="classification"
            defaultValue={classificationFilter}
            className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-400/50"
          >
            <option value="">جميع التصنيفات</option>
            <option value="sweep">Sweep محتمل</option>
            <option value="block">Block</option>
            <option value="repeat">تكرار مؤسسي</option>
            <option value="million">صفقات مليونية</option>
          </select>

          <select
            name="execution"
            defaultValue={executionFilter}
            className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-400/50"
          >
            <option value="">كل اتجاهات التنفيذ</option>
            <option value="BUY">شراء محتمل</option>
            <option value="SELL">بيع محتمل</option>
            <option value="UNKNOWN">غير محسوم</option>
          </select>

          <select
            name="minPremium"
            defaultValue={minPremium > 0 ? String(minPremium) : ""}
            className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-400/50"
          >
            <option value="">كل القيم</option>
            <option value="250000">250 ألف فأكثر</option>
            <option value="500000">500 ألف فأكثر</option>
            <option value="1000000">مليون فأكثر</option>
            <option value="2000000">مليونان فأكثر</option>
            <option value="5000000">5 ملايين فأكثر</option>
          </select>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
            >
              تطبيق
            </button>

            <Link
              href="/whale-trades"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold transition hover:bg-white/10"
            >
              مسح
            </Link>
          </div>
        </form>

        {filteredTrades.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-20 text-center">
            <div className="text-6xl">🐋</div>

            <h2 className="mt-5 text-2xl font-black">
              لا توجد صفقات مطابقة حاليًا
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
              قد يكون السوق مغلقًا، أو لم تصل أي صفقة إلى الحد الأدنى
              المطلوب، أو أن الفلاتر الحالية تستبعد الصفقات الموجودة.
            </p>
          </section>
        ) : (
          <section className="grid gap-5 xl:grid-cols-2">
            {filteredTrades.map((trade) => {
              const contractType = getContractType(trade);
              const whaleScore = Math.round(
                safeNumber(trade.whale_score),
              );

              const tradeSize =
                safeNumber(trade.trade_size) ||
                safeNumber(trade.volume_change) ||
                safeNumber(trade.volume);

              return (
                <article
                  key={String(trade.id)}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.055] to-white/[0.025] shadow-2xl shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-3xl font-black">
                          {trade.symbol || "—"}
                        </h2>

                        <span
                          className={`rounded-lg border px-3 py-1 text-xs font-black ${getContractClasses(
                            contractType,
                          )}`}
                        >
                          {contractType.toUpperCase()}
                        </span>

                        <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-black">
                          Strike {formatNumber(trade.strike, 0)}
                        </span>

                        {trade.is_sweep && (
                          <span className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
                            SWEEP محتمل
                          </span>
                        )}

                        {trade.is_block && (
                          <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300">
                            BLOCK
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        الانتهاء: {trade.expiration || "—"}
                      </p>
                    </div>

                    <div
                      className={`min-w-20 rounded-2xl border px-3 py-3 text-center ${getScoreClasses(
                        whaleScore,
                      )}`}
                    >
                      <p className="text-[10px]">قوة الصفقة</p>
                      <p className="mt-1 text-2xl font-black">
                        {whaleScore}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
                    <div className="bg-slate-950/90 p-4">
                      <p className="text-xs text-slate-500">
                        قيمة الصفقة
                      </p>
                      <p className="mt-1 text-lg font-black text-amber-300">
                        ${formatMoney(trade.premium_value)}
                      </p>
                    </div>

                    <div className="bg-slate-950/90 p-4">
                      <p className="text-xs text-slate-500">
                        حجم التنفيذ
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {formatInteger(tradeSize)}
                      </p>
                    </div>

                    <div className="bg-slate-950/90 p-4">
                      <p className="text-xs text-slate-500">
                        الاهتمام المفتوح
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {formatInteger(trade.open_interest)}
                      </p>
                    </div>

                    <div className="bg-slate-950/90 p-4">
                      <p className="text-xs text-slate-500">
                        سعر العقد
                      </p>
                      <p className="mt-1 text-lg font-black">
                        ${formatNumber(trade.contract_price)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-lg border px-3 py-2 text-xs font-bold ${getSideClasses(
                          trade.estimated_side,
                        )}`}
                      >
                        {getClearTradeDecision(trade).label}
                      </span>

                      <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
                        {getExecutionLabel(trade.execution_location)}
                      </span>

                      <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
                        {trade.money_position || "موضع غير محدد"}
                      </span>

                      {safeNumber(trade.repeat_count) >= 3 && (
                        <span className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-300">
                          تكرار {formatInteger(trade.repeat_count)} مرات
                        </span>
                      )}

                      {trade.hedge_flag && (
                        <span className="rounded-lg border border-slate-400/30 bg-slate-400/10 px-3 py-2 text-xs font-bold text-slate-300">
                          تحوط محتمل
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-slate-500">Bid</p>
                        <p className="mt-1 font-black">
                          {formatNumber(trade.bid)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">Ask</p>
                        <p className="mt-1 font-black">
                          {formatNumber(trade.ask)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">السبريد</p>
                        <p className="mt-1 font-black">
                          {formatPercent(trade.spread_pct)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">IV</p>
                        <p className="mt-1 font-black">
                          {formatPercent(
                            safeNumber(trade.iv) * 100,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-5">
                      <div>
                        <p className="text-xs text-slate-500">
                          سعر السهم
                        </p>
                        <p className="mt-1 font-bold">
                          ${formatNumber(trade.stock_price)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">Delta</p>
                        <p className="mt-1 font-bold">
                          {formatNumber(trade.delta, 3)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">Gamma</p>
                        <p className="mt-1 font-bold">
                          {formatNumber(trade.gamma, 4)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">Theta</p>
                        <p className="mt-1 font-bold">
                          {formatNumber(trade.theta, 3)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">Vega</p>
                        <p className="mt-1 font-bold">
                          {formatNumber(trade.vega, 3)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] p-4">
                      <p className="mb-2 text-xs font-black text-cyan-300">
                        تحليل الصفقة
                      </p>

                      <p className="text-sm leading-7 text-slate-300">
                        {trade.reason ||
                          "لم يكتمل تحليل هذه الصفقة بعد."}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {trade.direction_status ||
                          "اتجاه التنفيذ غير محسوم"}
                      </span>

                      <span>
                        آخر تنفيذ: {formatDate(getTradeTime(trade))}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section className="mt-7 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <h3 className="font-black text-amber-300">
            ملاحظات مهمة
          </h3>

          <p className="mt-3 text-sm leading-7 text-slate-400">
            تصنيف الشراء أو البيع تقديري حسب موقع التنفيذ من Bid وAsk.
            صفقة الأوبشن الكبيرة قد تكون شراءً أو بيعًا أو تحوطًا أو جزءًا
            من استراتيجية متعددة الأطراف، لذلك لا تمثل وحدها توصية دخول.
          </p>
        </section>
      </div>
    </main>
  );
}
