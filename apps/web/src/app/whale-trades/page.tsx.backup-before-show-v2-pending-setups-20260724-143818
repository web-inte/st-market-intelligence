import Link from "next/link";
import AutoRefresh from "./auto-refresh";

import { hydrateWhaleTrade } from "@/lib/hydrate-whale-trade";
import WhaleOpportunityCard from "./whale-opportunity-card";
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

    const whaleTrades =
      Array.isArray(data)
        ? data
        : [];

    /*
     * لا نعرض إلا الفرص التي تم تجهيز عقد متابعة
     * لها بسعر دخول لا يتجاوز 3.00 دولار.
     */
    const setupsUrl =
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/whale_trade_setups` +
      "?select=whale_trade_id,entry_price" +
      "&entry_price=gt.0" +
      "&entry_price=lte.3";

    const setupsResponse =
      await fetch(setupsUrl, {
        headers: {
          apikey: supabaseSecret,
          Authorization:
            `Bearer ${supabaseSecret}`,
        },
        cache: "no-store",
      });

    if (!setupsResponse.ok) {
      console.error(
        "Failed to fetch eligible whale setups:",
        setupsResponse.status,
        await setupsResponse.text(),
      );

      return [];
    }

    const setupsData =
      await setupsResponse.json();

    const eligibleTradeIds =
      new Set(
        (
          Array.isArray(setupsData)
            ? setupsData
            : []
        ).map(
          (
            setup: {
              whale_trade_id?:
                | number
                | string
                | null;
            },
          ) =>
            String(
              setup.whale_trade_id ?? "",
            ),
        ),
      );

    return whaleTrades.filter(
      (trade) =>
        eligibleTradeIds.has(
          String(trade.id),
        ),
    );
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
      label: "التدفق: صعودي — شراء CALL",
      reason: "شراء عقد CALL محتمل",
    };
  }

  if (
    estimatedSide === "BUY" &&
    contractType === "put"
  ) {
    return {
      label: "التدفق: هبوطي — شراء PUT",
      reason: "شراء عقد PUT محتمل",
    };
  }

  if (
    estimatedSide === "SELL" &&
    contractType === "call"
  ) {
    return {
      label: "التدفق: هبوطي — بيع CALL",
      reason: "بيع عقد CALL محتمل",
    };
  }

  if (
    estimatedSide === "SELL" &&
    contractType === "put"
  ) {
    return {
      label: "التدفق: صعودي — بيع PUT",
      reason: "بيع عقد PUT محتمل",
    };
  }

  return {
    label: "التدفق: غير محسوم",
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

  const rankedTrades = [...filteredTrades]
    .sort((firstTrade, secondTrade) => {
      const scoreDifference =
        safeNumber(secondTrade.whale_score) -
        safeNumber(firstTrade.whale_score);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return (
        safeNumber(secondTrade.premium_value) -
        safeNumber(firstTrade.premium_value)
      );
    })
    .slice(0, 10);

  const strategyDetection = {
    strategies: [],
    unmatchedTrades: rankedTrades,
  };

  const displayedItemsCount =
    rankedTrades.length;

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
        <header className="mb-7 rounded-3xl border border-white/10 bg-gradient-to-l from-cyan-500/10 via-slate-900/90 to-emerald-500/[0.06] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black text-cyan-300">
                  أفضل الفرص المؤسسية الآن
                </p>

                <h1 className="mt-2 text-3xl font-black sm:text-5xl">
                  فرص الحيتان
                </h1>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
                  يعرض النظام أفضل الفرص المؤسسية التي اجتازت معايير الترشيح،
                  مع القرار وسبب الاختيار والمتابعة المباشرة داخل بطاقة واحدة.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold transition hover:bg-white/10"
                >
                  ← العودة إلى المنصة
                </Link>

                <Link
                  href="/whale-trades"
                  className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
                >
                  تحديث الفرص
                </Link>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5 text-sm">
              <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.07] px-4 py-2 font-bold text-cyan-300">
                {displayedItemsCount} فرص مرشحة
              </span>

              <span className="text-slate-500">
                المتابعة تتحدث تلقائيًا داخل كل فرصة
              </span>
            </div>
          </header>

          {rankedTrades.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-20 text-center">
              <div className="text-6xl">🐋</div>

              <h2 className="mt-5 text-2xl font-black">
                لا توجد فرصة مؤسسية مكتملة حاليًا
              </h2>

              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
                لم تصل أي صفقة إلى معايير الترشيح المطلوبة في الوقت الحالي.
              </p>
            </section>
          ) : (
            <section className="grid gap-6 xl:grid-cols-2">
              {rankedTrades.map((trade) => (
                <WhaleOpportunityCard
                  key={String(trade.id)}
                  trade={trade}
                />
              ))}
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
