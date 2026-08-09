"use client";
import MarketChatUnreadButton from "./market-chat-unread-button";

import Link from "next/link";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import SectorRadar from "../../components/sector-radar";

import {
  createClient,
} from "../../lib/supabase/client";

import {
  useLiveStockPrices,
} from "../../lib/live-market";

import {
  createOpportunity,
  type AnalysisResponse,
  type Opportunity,
  type Side,
} from "../../lib/analysis-engine";
import DecisionScannerControl from "../admin/DecisionScannerControl";

const WATCHLIST = [
  "AMZN",
  "NVDA",
  "AMD",
  "AAPL",
  "META",
  "MSTR",
  "MSFT",
  "AVGO",
  "TSLA",
  "QQQ",
  "SPY",
  "GOOGL",
  "PLTR",
  "NFLX",
  "CRM",
  "ORCL",
  "JPM",
  "BAC",
  "COIN",
  "SHOP",
  "MU",
  "INTC",
  "QCOM",
  "ARM",
  "SMCI",
  "SNOW",
  "UBER",
  "DIS",
  "PYPL",
  "XOM",
  "BA",
  "TTD",
  "CRWD",
  "DDOG",
  "NET",
  "PANW",
  "ZS",
  "MDB",
  "TEAM",
  "ANET",
  "APP",
  "HOOD",
  "RBLX",
  "TTWO",
  "EA",
  "DECK",
  "ONON",
  "ABNB",
  "BKNG",
  "DE",
  "CAT",
  "GE",
  "ETN",
  "PH",
  "CMI",
  "TT",
  "LULU",
  "VRTX",
  "REGN",
  "MRK",
  "ABBV",
  "ISRG",
  "INTU",
  "ADSK",
  "ADP",
  "PAYX",
  "CB",
  "MMC",
  "ICE",
  "CME",
  "SPGI",
  "MCO",
  "MSCI",
  "AON",
  "AJG",
  "RSG",
  "WM",
  "URI",
  "FAST",
  "ODFL",
  "CPRT",
  "FERG",
  "XYL",
  "VRT",
  "KLAC",
  "LRCX",
  "APH",
  "CDNS",
  "SNPS",
  "NXPI",
  "MCHP",
  "FICO",
  "AXON",
  "HCA",
  "ELV",
  "CI",
  "HUM",
  "CNC",
  "NOC",
  "GD",
  "LMT",
  "RTX",
  "HON",
  "EMR",
  "ITW",
  "ROK",
  "JCI",
  "LEN",
  "DHI",
  "PHM",
  "NVR",
  "LOW",
  "TJX",
  "CMG",
  "ORLY",
  "ROST",
  "GWW",
];
const TELEGRAM_CHANNEL_URL = "https://t.me/STtradevip";

type MarketOverviewResponse = {
  ok: boolean;
  updatedAt: string;
  timeframe: string;

  market: {
    regime:
      | "TREND_UP"
      | "TREND_DOWN"
      | "RANGE"
      | "TRANSITION"
      | "IMPULSE_UP"
      | "IMPULSE_DOWN";

    title: string;
    environment: string;
    execution: string;
    summary: string;

    primaryAgreement: boolean;

    aboveVwapCount: number;
    belowVwapCount: number;

    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
  };

  indices: Array<{
    symbol: string;
    name: string;
    price: number;

    direction:
      | "BULLISH"
      | "BEARISH"
      | "NEUTRAL";

    aboveVwap: boolean;
    vwap: number;
    vwapDistancePct: number;

    ema9: number;
    ema21: number;

    structure:
      | "HIGHER"
      | "LOWER"
      | "MIXED";

    momentum:
      | "STRONG_UP"
      | "UP"
      | "NEUTRAL"
      | "DOWN"
      | "STRONG_DOWN";

    move15mPct: number;
    move30mPct: number;

    volumeState:
      | "STRONG"
      | "NORMAL"
      | "WEAK";

    relativeVolume: number;

    reasons: string[];
  }>;

  failed?: Array<{
    symbol: string;
    error: string;
  }>;
};

type MarketSession = {
  isOpen: boolean;
  phase: "REGULAR" | "PRE_MARKET" | "AFTER_HOURS" | "CLOSED";
  label: string;
  note: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getTradePlan(
  item: Opportunity
) {
  const strength =
    clamp(item.score, 50, 100);

  const targetMovePct =
    1.2 +
    ((strength - 50) / 50) *
      1.8;

  const stopMovePct =
    0.75 +
    ((100 - strength) / 50) *
      0.45;

  const direction =
    item.side === "PUT"
      ? -1
      : 1;

  const fallbackEntry =
    item.price;

  const fallbackTarget =
    fallbackEntry *
    (1 +
      direction *
        (targetMovePct / 100));

  const fallbackStop =
    fallbackEntry *
    (1 -
      direction *
        (stopMovePct / 100));

  const storedPlan =
    item.tradePlan;

  const target =
    storedPlan?.targets?.[0];

  const risk =
    item.score >= 85
      ? "منخفضة"
      : item.score >= 70
        ? "متوسطة"
        : "مرتفعة";

  return {
    entry:
      storedPlan?.entryPrice &&
      storedPlan.entryPrice > 0
        ? storedPlan.entryPrice
        : fallbackEntry,

    target:
      target?.price &&
      target.price > 0
        ? target.price
        : fallbackTarget,

    stop:
      storedPlan?.stopPrice &&
      storedPlan.stopPrice > 0
        ? storedPlan.stopPrice
        : fallbackStop,

    reachProbability:
      target?.probability
        ? clamp(
            Math.round(
              target.probability
            ),
            1,
            99
          )
        : clamp(
            Math.round(
              item.score
            ),
            1,
            99
          ),

    risk,
  };
}

function cleanContractTicker(value: string) {
  return value.replace(/^O:/, "");
}

function formatExpiration(value: string) {
  if (!value) {
    return "غير متاح";
  }

  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function gammaRiskText(level: Opportunity["gammaRiskLevel"]) {
  if (level === "LOW") {
    return "منخفضة";
  }

  if (level === "HIGH") {
    return "مرتفعة";
  }

  return "متوسطة";
}

function formatFirstSeen(
  value?: string
) {
  if (!value) {
    return "غير متاح";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "غير متاح";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      timeZone:
        "Asia/Riyadh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function formatAge(
  minutes?: number
) {
  const safeMinutes =
    Math.max(
      0,
      Math.floor(
        Number(minutes) || 0
      )
    );

  if (safeMinutes < 1) {
    return "الآن";
  }

  if (safeMinutes < 60) {
    return `منذ ${safeMinutes} دقيقة`;
  }

  const hours =
    Math.floor(
      safeMinutes / 60
    );

  const remainingMinutes =
    safeMinutes % 60;

  return remainingMinutes > 0
    ? `منذ ${hours} س و${remainingMinutes} د`
    : `منذ ${hours} ساعة`;
}

function profitClasses(
  value: number
) {
  if (value > 0) {
    return "text-emerald-400";
  }

  if (value < 0) {
    return "text-rose-400";
  }

  return "text-slate-300";
}


function getNewYorkMarketFallback(): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  const weekday = values.weekday;
  const hour = Number(values.hour) % 24;
  const minute = Number(values.minute);
  const currentMinutes = hour * 60 + minute;

  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(
    weekday,
  );

  if (!isWeekday) {
    return {
      isOpen: false,
      phase: "CLOSED",
      label: "السوق مغلق",
      note: "بيانات الأوبشن من آخر جلسة مكتملة",
    };
  }

  if (
    currentMinutes >= 9 * 60 + 30 &&
    currentMinutes < 16 * 60
  ) {
    return {
      isOpen: true,
      phase: "REGULAR",
      label: "السوق الأمريكي مفتوح",
      note: "بيانات الأوبشن من الجلسة الحالية",
    };
  }

  if (
    currentMinutes >= 4 * 60 &&
    currentMinutes < 9 * 60 + 30
  ) {
    return {
      isOpen: false,
      phase: "PRE_MARKET",
      label: "ما قبل السوق",
      note: "بيانات الأوبشن من آخر جلسة مكتملة",
    };
  }

  if (
    currentMinutes >= 16 * 60 &&
    currentMinutes < 20 * 60
  ) {
    return {
      isOpen: false,
      phase: "AFTER_HOURS",
      label: "ما بعد السوق",
      note: "انتهت جلسة الأوبشن — البيانات من الجلسة المكتملة",
    };
  }

  return {
    isOpen: false,
    phase: "CLOSED",
    label: "السوق مغلق",
    note: "بيانات الأوبشن من آخر جلسة مكتملة",
  };
}

function sideColor(side: Side) {
  if (side === "CALL") {
    return "text-emerald-400";
  }

  if (side === "PUT") {
    return "text-rose-400";
  }

  return "text-slate-400";
}

function sideBackground(side: Side) {
  if (side === "CALL") {
    return "border-emerald-500/20 bg-emerald-500/10";
  }

  if (side === "PUT") {
    return "border-rose-500/20 bg-rose-500/10";
  }

  return "border-slate-700 bg-slate-800/70";
}

function scoreColor(score: number) {
  if (score >= 85) {
    return "text-emerald-400";
  }

  if (score >= 70) {
    return "text-amber-400";
  }

  return "text-rose-400";
}

function scoreRing(score: number) {
  if (score >= 85) {
    return "border-emerald-400/40 shadow-emerald-500/10";
  }

  if (score >= 70) {
    return "border-amber-400/40 shadow-amber-500/10";
  }

  return "border-rose-400/40 shadow-rose-500/10";
}

export default function Home() {
  const router = useRouter();

  const [symbol, setSymbol] = useState("");

  const [isAdmin, setIsAdmin] =
    useState(false);

  const [
    decisionScannerOpen,
    setDecisionScannerOpen,
  ] = useState(false);

  const [adminCheckLoading, setAdminCheckLoading] =
    useState(true);

  const [botScanLoading, setBotScanLoading] =
    useState(false);

  const [botScanError, setBotScanError] =
    useState("");

  const [botScanResult, setBotScanResult] =
    useState<any>(null);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tickerOpportunities, setTickerOpportunities] = useState<Opportunity[]>([]);

  const tickerLiveSymbols =
    useMemo(
      () =>
        tickerOpportunities.map(
          (item) => item.symbol
        ),
      [tickerOpportunities]
    );

  const {
    quotes: liveTickerQuotes,
  } =
    useLiveStockPrices(
      tickerLiveSymbols
    );

  const [marketOverview, setMarketOverview] =
    useState<MarketOverviewResponse | null>(null);

  const [marketOverviewLoading, setMarketOverviewLoading] =
    useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function normalizeSearchSymbol() {
    return symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z.-]/g, "");
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const stock =
      normalizeSearchSymbol();

    if (!stock) {
      return;
    }

    router.push(`/stocks/${encodeURIComponent(stock)}`);
  }

  async function handleBotScan(
    saveToWatching = false
  ) {
    const stock =
      normalizeSearchSymbol();

    if (
      !stock ||
      !isAdmin ||
      botScanLoading
    ) {
      return;
    }

    setBotScanLoading(true);
    setBotScanError("");

    if (!saveToWatching) {
      setBotScanResult(null);
    }

    try {
      const query =
        saveToWatching
          ? "mode=manual&save=1"
          : "mode=manual";

      const response =
        await fetch(
          `/api/bot-decision/${encodeURIComponent(stock)}?${query}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        const rawError =
          payload?.details ||
          payload?.error ||
          "تعذر تشغيل الفحص";

        const readableError =
          typeof rawError === "string"
            ? rawError
            : JSON.stringify(
                rawError,
                null,
                2
              );

        throw new Error(
          readableError
        );
      }

      setBotScanResult(
        payload
      );
    } catch (scanError) {
      setBotScanError(
        scanError instanceof Error
          ? scanError.message
          : "حدث خطأ أثناء تشغيل الفحص"
      );
    } finally {
      setBotScanLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function checkAdminAccess() {
      try {
        const supabase =
          createClient();

        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setIsAdmin(false);
          }

          return;
        }

        const {
          data: profile,
        } =
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

        if (!cancelled) {
          setIsAdmin(
            profile?.role ===
              "admin"
          );
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setAdminCheckLoading(false);
        }
      }
    }

    void checkAdminAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestRunning = false;

    async function loadOpportunities() {
      if (requestRunning) {
        return;
      }

      requestRunning = true;
      setLoading(true);
      setError("");

      try {
        /*
          حماية واجهة المنصة من إطلاق عشرات
          طلبات التحليل المتزامنة.

          البحث اليدوي عن أي رمز لا يتأثر بهذا الحد.
        */
        const DASHBOARD_SCAN_LIMIT = 10;
        const BATCH_SIZE = 2;
        const BATCH_DELAY_MS = 1_500;

        const scanSymbols = WATCHLIST.slice(
          0,
          DASHBOARD_SCAN_LIMIT
        );

        const results: PromiseSettledResult<Opportunity>[] = [];

        for (
          let startIndex = 0;
          startIndex < scanSymbols.length;
          startIndex += BATCH_SIZE
        ) {
          const batch = scanSymbols.slice(
            startIndex,
            startIndex + BATCH_SIZE
          );

          const batchResults =
            await Promise.allSettled(
              batch.map(async (stockSymbol) => {
                const response = await fetch(
                  `/api/analysis/${encodeURIComponent(stockSymbol)}`,
                  {
                    cache: "no-store",
                  },
                );

                if (!response.ok) {
                  throw new Error(
                    `تعذر تحليل ${stockSymbol}`
                  );
                }

                const analysis =
                  (await response.json()) as AnalysisResponse;

                return createOpportunity(analysis);
              }),
            );

          results.push(...batchResults);

          const hasAnotherBatch =
            startIndex + BATCH_SIZE <
            scanSymbols.length;

          if (hasAnotherBatch) {
            await new Promise<void>(
              (resolve) => {
                window.setTimeout(
                  resolve,
                  BATCH_DELAY_MS
                );
              }
            );
          }
        }

        if (cancelled) {
          return;
        }

const allResults = results
  .filter(
    (result): result is PromiseFulfilledResult<Opportunity> =>
      result.status === "fulfilled",
  )
  .map((result) => result.value);

const validResults = allResults
  .filter(
    (item) =>
      item.side !== "NEUTRAL" &&
      item.score >= 70 &&
      item.contract !== null &&
      item.contractScore >= 75 &&
      item.consensusStatus !== "CONFLICTED" &&
      item.gammaRiskLevel !== "HIGH"
  )
  .sort((a, b) =>
    b.score - a.score ||
    b.contractScore - a.contractScore ||
    a.gammaRiskScore - b.gammaRiskScore
  )
  .slice(0, 5);

        setTickerOpportunities(allResults);
        setOpportunities(validResults);

        setError("");
      } catch (loadError) {
        console.error("Failed to load opportunities:", loadError);

        if (!cancelled) {
          setError("حدث خطأ أثناء تحميل التحليلات.");
        }
      } finally {
        requestRunning = false;

        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOpportunities();

    const refreshTimer = window.setInterval(() => {
      void loadOpportunities();
    }, 120_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);


  useEffect(() => {
    let cancelled = false;

    async function loadMarketOverview() {
      setMarketOverviewLoading(true);

      try {
        const response = await fetch("/api/market-overview", {
          cache: "no-store",
        });

        const result =
          (await response.json()) as MarketOverviewResponse;

        if (!response.ok || !result.ok) {
          throw new Error("تعذر تحميل نظرة السوق");
        }

        if (!cancelled) {
          setMarketOverview(result);
        }
      } catch (overviewError) {
        console.error(
          "Failed to load market overview:",
          overviewError,
        );
      } finally {
        if (!cancelled) {
          setMarketOverviewLoading(false);
        }
      }
    }

    void loadMarketOverview();

    const timer = window.setInterval(() => {
      void loadMarketOverview();
    }, 120_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const bestOpportunity = opportunities[0];

  const tickerItems = useMemo(
    () => [...tickerOpportunities, ...tickerOpportunities],
    [tickerOpportunities],
  );

  const [marketSession, setMarketSession] =
    useState<MarketSession>({
      isOpen: false,
      phase: "CLOSED",
      label: "جارٍ التحقق من السوق",
      note: "جارٍ تحميل حالة الجلسة",
    });

  useEffect(() => {
    let cancelled = false;

    async function loadMarketSession() {
      try {
        const response = await fetch("/api/market-session", {
          cache: "no-store",
        });

        const result = (await response.json()) as
          | (MarketSession & { ok: true })
          | { ok: false };

        if (!response.ok || !result.ok) {
          throw new Error("تعذر تحميل حالة السوق");
        }

        if (!cancelled) {
          setMarketSession({
            isOpen: result.isOpen,
            phase: result.phase,
            label: result.label,
            note: result.note,
          });
        }
      } catch (sessionError) {
        console.error(
          "Failed to load market session:",
          sessionError,
        );

        if (!cancelled) {
          setMarketSession(getNewYorkMarketFallback());
        }
      }
    }

    void loadMarketSession();

    const timer = window.setInterval(() => {
      void loadMarketSession();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function shareOpportunity(item: Opportunity) {
    const plan = getTradePlan(item);
    const contract = item.contract;
    const url = `${window.location.origin}/stocks/${encodeURIComponent(
      item.symbol,
    )}`;
    const text = `${item.symbol} | ${item.side}
السعر الحالي للسهم: $${item.price.toFixed(2)}${
  contract
    ? `
العقد المختار: ${contract.ticker}
سترايك: $${contract.strike.toFixed(2)}
الانتهاء: ${contract.expiration}
سعر العقد المرجعي: $${contract.midpoint.toFixed(2)}
جودة العقد: ${item.contractQuality} (${item.contractScore}/100)`
    : ""
}
دخول السهم: $${plan.entry.toFixed(2)}
هدف السهم الأول: $${plan.target.toFixed(2)}
وقف السهم: $${plan.stop.toFixed(2)}
نسبة الوصول التقديرية: ${plan.reachProbability}%${
  item.tradePlan
    ? `
أول ظهور: ${formatFirstSeen(
        item.tradePlan.firstSeenAt
      )}
الأداء منذ الظهور: ${
        item.tradePlan.currentProfitPct >= 0
          ? "+"
          : ""
      }${item.tradePlan.currentProfitPct.toFixed(2)}%`
    : ""
}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `تحليل ${item.symbol}`,
          text,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(`${text}
${url}`);
      window.alert("تم نسخ تفاصيل السهم والرابط.");
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      console.error("Share failed:", shareError);
      window.alert("تعذر فتح المشاركة حاليًا.");
    }
  }

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030914] text-white selection:bg-cyan-400/30"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.035)_1px,transparent_1px)] bg-[size:42px_42px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-[140px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -left-40 h-[520px] w-[520px] rounded-full bg-blue-600/10 blur-[150px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[420px] h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/[0.035] blur-[140px]"
      />

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <nav className="mb-4 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-slate-950/50 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 shadow-lg shadow-cyan-500/10">
              <span className="text-sm font-black text-cyan-300">ST</span>
            </div>

            <div>
              <p className="text-sm font-bold tracking-wide text-white">
                مدرسة السوق الأمريكي
              </p>

              <p className="text-[11px] text-slate-500">تحليل ذكي للسوق</p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
              marketSession.isOpen
                ? "border-emerald-400/20 bg-emerald-400/[0.07]"
                : "border-amber-400/20 bg-amber-400/[0.07]"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {marketSession.isOpen ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              ) : null}

              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  marketSession.isOpen ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </span>

            <span
              className={`text-xs font-bold ${
                marketSession.isOpen ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {marketSession.label}
            </span>
          </div>
        </nav>

        <section
          dir="ltr"
          className="relative mb-12 overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950/65 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          <div className="flex min-h-14 items-center">
            <div className="relative z-30 flex min-h-14 shrink-0 items-center gap-2 border-r border-white/[0.07] bg-slate-950 px-4 sm:px-5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />

                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>

              <span className="whitespace-nowrap text-xs font-black tracking-[0.14em] text-emerald-300">
                {marketSession.isOpen ? "السوق مباشر" : marketSession.label}
              </span>
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              {tickerItems.length > 0 ? (
                <div className="market-ticker-track flex w-max items-center py-4">
                  {tickerItems.map((item, index) => {
                    const livePrice =
                      liveTickerQuotes[
                        item.symbol
                      ]?.price;

                    const displayedPrice =
                      livePrice ??
                      item.price;

                    const isPositive = item.changePct > 0;

                    const isNegative = item.changePct < 0;

                    return (
                      <button
                        type="button"
                        key={`${item.symbol}-${index}`}
                        onClick={() =>
                          router.push(
                            `/stocks/${encodeURIComponent(item.symbol)}`,
                          )
                        }
                        className="flex shrink-0 items-center gap-2 px-5 text-sm transition hover:opacity-80 sm:px-7"
                      >
                        <span className="font-black tracking-wide text-white">
                          {item.symbol}
                        </span>

                        <span
                          className={`text-xs font-black ${
                            isPositive
                              ? "text-emerald-400"
                              : isNegative
                                ? "text-rose-400"
                                : "text-slate-400"
                          }`}
                        >
                          {isPositive ? "▲" : isNegative ? "▼" : "●"}
                        </span>

                        <span className="font-semibold tabular-nums text-slate-300">
                          ${displayedPrice.toFixed(2)}
                        </span>

                        <span
                          className={`text-xs font-bold tabular-nums ${
                            isPositive
                              ? "text-emerald-400"
                              : isNegative
                                ? "text-rose-400"
                                : "text-slate-500"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {item.changePct.toFixed(2)}%
                        </span>

                        <span className="ml-3 text-slate-800">|</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-14 items-center px-6">
                  <span className="animate-pulse text-sm text-slate-500">
                    جارٍ تحميل أسعار السوق...
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <header className="mx-auto mb-12 max-w-5xl text-center">
          {/* ACCOUNT_AND_SUBSCRIPTIONS_FIXED_BUTTONS */}
          <div
            dir="rtl"
            className="mb-3 mt-5 flex justify-center gap-2 px-4"
          >
            <Link
              href="/account"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-slate-950/95 px-4 py-3 text-sm font-black text-cyan-300 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:border-cyan-300 hover:bg-cyan-400/10"
            >
              حسابي
            </Link>

            <Link
              href="/subscriptions"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-slate-950/95 px-4 py-3 text-sm font-black text-emerald-300 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:border-emerald-300 hover:bg-emerald-400/10"
            >
              الاشتراكات
            </Link>

            {!adminCheckLoading && isAdmin ? (
              <button
                type="button"
                onClick={() =>
                  setDecisionScannerOpen(true)
                }
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-violet-400/30 bg-slate-950/95 px-4 py-3 text-sm font-black text-violet-300 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:border-violet-300 hover:bg-violet-400/10"
              >
                بحث القرار
              </button>
            ) : null}
          </div>

          {!adminCheckLoading &&
          isAdmin &&
          decisionScannerOpen ? (
            <div
              dir="rtl"
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
              onClick={() =>
                setDecisionScannerOpen(false)
              }
            >
              <div
                className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto"
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setDecisionScannerOpen(false)
                  }
                  className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-xl font-black text-slate-300 transition hover:border-rose-400/40 hover:text-rose-300"
                  aria-label="إغلاق"
                >
                  ×
                </button>

                <DecisionScannerControl />
              </div>
            </div>
          ) : null}

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-2 text-xs font-medium text-cyan-300 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            تحليل لحظي مدعوم بمحركات متعددة
          </div>

          <h1 className="text-balance text-4xl font-black leading-[1.2] tracking-tight sm:text-5xl lg:text-7xl">
            اكتشف أقوى فرص السوق
            <span className="mt-2 block bg-gradient-to-l from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
              قبل تحركها
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-400 sm:text-lg">
            منصة تحليل متقدمة تجمع حركة السعر، تدفق العقود، القاما، الزخم وجودة
            العقد في قراءة واحدة تساعدك على اكتشاف الفرص الأقوى بوضوح وسرعة.
          </p>

          <div className="mx-auto mt-6 flex w-full max-w-xl flex-col items-stretch justify-center gap-3 sm:flex-row">
            <a
              href={TELEGRAM_CHANNEL_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex flex-1 items-center justify-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.08] px-5 py-3 text-sm font-black text-sky-300 shadow-lg shadow-sky-950/20 transition duration-300 hover:-translate-y-0.5 hover:border-sky-400/40 hover:bg-sky-400/[0.14]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/10 text-lg">
                ✈
              </span>

              <span>انضم إلى قناة تيليجرام</span>
            </a>

            <MarketChatUnreadButton />
          </div>
        </header>

        <section className="mb-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3 xl:gap-5">
          <form
            onSubmit={handleSearch}
            className="rounded-3xl border border-white/[0.08] bg-slate-950/65 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6 lg:col-span-2 xl:col-span-3"
          >
            <p className="mb-3 text-sm text-slate-400">ابحث عن أي سهم</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:flex lg:items-stretch">
              <input
                type="text"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="مثال: NVDA"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                className="col-span-2 min-w-0 w-full rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 py-4 text-left text-lg font-semibold uppercase outline-none transition focus:border-cyan-400/40 sm:col-span-1 lg:flex-1"
              />

              <button
                type="submit"
                disabled={!symbol.trim()}
                className="w-full rounded-2xl bg-gradient-to-l from-cyan-400 to-sky-500 px-4 py-4 font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:-translate-y-0.5 hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-6 lg:min-w-[120px]"
              >
                تحليل
              </button>

              {!adminCheckLoading && isAdmin ? (
                <button
                  type="button"
                  disabled={
                    !symbol.trim() ||
                    botScanLoading
                  }
                  onClick={() =>
                    void handleBotScan(false)
                  }
                  className="w-full rounded-2xl border border-violet-400/30 bg-violet-400/10 px-4 py-4 font-black text-violet-300 shadow-lg shadow-violet-950/20 transition hover:-translate-y-0.5 hover:border-violet-400/50 hover:bg-violet-400/15 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-5 lg:min-w-[110px]"
                >
                  {botScanLoading
                    ? "جاري الفحص..."
                    : "الفحص"}
                </button>
              ) : null}
            </div>

            {!adminCheckLoading && isAdmin && botScanError ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm font-bold text-rose-300">
                {botScanError}
              </div>
            ) : null}

            {!adminCheckLoading && isAdmin && botScanResult ? (
              <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-4 text-right">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-violet-300">
                      نتيجة محرك القاما والسيولة والقرار
                    </p>

                    <p className="mt-2 text-xl font-black text-white">
                      {botScanResult?.symbol || normalizeSearchSymbol()}
                    </p>
                  </div>

                  <span
                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                      botScanResult?.decision?.qualifies
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-rose-400/30 bg-rose-400/10 text-rose-300"
                    }`}
                  >
                    {botScanResult?.decision?.qualifies
                      ? "مؤهلة"
                      : "غير مؤهلة"}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الاتجاه:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.side === "CALL"
                        ? "كول"
                        : botScanResult?.decision?.side === "PUT"
                          ? "بوت"
                          : "محايد"}
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الدرجة:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.score ?? 0} / 10
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الدخول:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.entry ?? "غير متوفر"}
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الوقف:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.stop ?? "غير متوفر"}
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الهدف الأول:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.tp1 ?? "غير متوفر"}
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الهدف الثاني:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.tp2 ?? "غير متوفر"}
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الهدف الثالث:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.tp3 ?? "غير متوفر"}
                    </span>
                  </p>

                  <p className="rounded-xl bg-slate-950/70 p-3 text-slate-300">
                    الانتهاء:{" "}
                    <span className="font-black text-white">
                      {botScanResult?.decision?.expiration ?? "غير متوفر"}
                    </span>
                  </p>
                </div>

                {botScanResult?.selectedContract ? (
                  <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3 text-sm text-cyan-200">
                    العقد المختار:{" "}
                    <span dir="ltr" className="font-black">
                      {botScanResult.selectedContract.optionTicker}
                    </span>
                    {" — "}
                    سترايك {botScanResult.selectedContract.strike}
                    {" — "}
                    السعر {botScanResult.selectedContract.mid}
                  </div>
                ) : null}

                {Array.isArray(
                  botScanResult?.decision?.rejectionReasons
                ) &&
                botScanResult.decision.rejectionReasons.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.05] p-3">
                    <p className="text-xs font-black text-rose-300">
                      أسباب عدم التأهل
                    </p>

                    <div className="mt-2 space-y-1 text-xs leading-6 text-rose-200/80">
                      {botScanResult.decision.rejectionReasons.map(
                        (reason: string) => (
                          <p key={reason}>
                            • {reason}
                          </p>
                        )
                      )}
                    </div>
                  </div>
                ) : null}

                {botScanResult?.watching?.saved ? (
                  <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-3 text-sm font-black text-emerald-300">
                    تم إضافة الفرصة إلى المراقبة.
                  </div>
                ) : botScanResult?.decision?.qualifies ? (
                  <button
                    type="button"
                    disabled={botScanLoading}
                    onClick={() =>
                      void handleBotScan(true)
                    }
                    className="mt-4 w-full rounded-xl bg-gradient-to-l from-violet-400 to-fuchsia-500 px-4 py-3 font-black text-slate-950 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {botScanLoading
                      ? "جاري الإضافة..."
                      : "إضافة إلى المراقبة"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

          <div className="grid gap-4 lg:grid-cols-2 xl:contents">
            <button
              type="button"
              onClick={() => router.push("/active-trades")}
              className="group relative min-h-[160px] overflow-hidden xl:min-h-[205px] rounded-[28px] border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.14] via-slate-950/95 to-cyan-500/[0.08] p-5 text-right shadow-[0_20px_55px_rgba(16,185,129,0.08)] transition duration-300 hover:-translate-y-1 hover:border-emerald-300/50 hover:shadow-[0_24px_65px_rgba(16,185,129,0.16)] sm:p-6"
            >
              <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />

              <div className="relative flex h-full flex-col justify-between gap-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-xl font-black text-emerald-300">
                    ST
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black tracking-wide text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
                    LIVE
                  </span>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-emerald-400/90">
                      المتابعة المباشرة
                    </p>

                    <h2 className="mt-2 text-2xl font-black text-white">
                      الصفقات النشطة
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      تابع سعر العقد والربح والوقف وحالة الصفقة لحظيًا.
                    </p>
                  </div>

                  <span className="shrink-0 text-2xl text-emerald-300/70 transition duration-300 group-hover:-translate-x-1 group-hover:text-emerald-200">
                    ←
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => router.push("/spx-whales")}
              className="group relative min-h-[160px] overflow-hidden xl:min-h-[205px] rounded-[28px] border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/[0.14] via-slate-950/95 to-violet-500/[0.09] p-5 text-right shadow-[0_20px_55px_rgba(217,70,239,0.08)] transition duration-300 hover:-translate-y-1 hover:border-fuchsia-300/50 hover:shadow-[0_24px_65px_rgba(217,70,239,0.16)] sm:p-6"
            >
              <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-fuchsia-400/10 blur-3xl" />

              <div className="relative flex h-full flex-col justify-between gap-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/10 text-sm font-black text-fuchsia-300">
                    SPX
                  </div>

                  <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1.5 text-[11px] font-black tracking-wide text-fuchsia-300">
                    0DTE
                  </span>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-fuchsia-400/90">
                      فرصة يومية مميزة
                    </p>

                    <h2 className="mt-2 text-2xl font-black text-white">
                      فرصة SPX اليومية
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      رصد لحظي لأقوى فرصة اعتمادًا على القاما والسيولة والزخم.
                    </p>
                  </div>

                  <span className="shrink-0 text-2xl text-fuchsia-300/70 transition duration-300 group-hover:-translate-x-1 group-hover:text-fuchsia-200">
                    ←
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/best-opportunities"
                )
              }
              className="group relative min-h-[160px] overflow-hidden xl:min-h-[205px] rounded-[28px] border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.14] via-slate-950/95 to-emerald-500/[0.08] p-5 text-right shadow-[0_20px_55px_rgba(34,211,238,0.08)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_24px_65px_rgba(34,211,238,0.16)] sm:p-6"
            >
              <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

              <div className="relative flex h-full flex-col justify-between gap-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl font-black text-cyan-300">
                    ★
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-black tracking-wide text-cyan-300">
                    LIVE
                  </span>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold tracking-[0.14em] text-cyan-400/90">
                      رصد الفرص
                    </p>

                    <h2 className="mt-2 text-2xl font-black text-white">
                      أفضل الفرص
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      اعرض الفرص التي اجتازت شروط الاتجاه والعقد والتوافق والمخاطرة.
                    </p>
                  </div>

                  <span className="shrink-0 text-2xl text-cyan-300/70 transition duration-300 group-hover:-translate-x-1 group-hover:text-cyan-200">
                    ←
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:contents">
            <button
              type="button"
              onClick={() => router.push("/gamma-liquidity?symbol=NVDA")}
              className="group relative overflow-hidden rounded-[24px] xl:min-h-[205px] border border-violet-400/15 bg-slate-950/70 p-4 text-right transition duration-300 hover:-translate-y-1 hover:border-violet-400/40 hover:bg-violet-400/[0.06] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/10 text-lg font-black text-violet-300">
                  Γ
                </div>

                <span className="text-xl text-slate-600 transition duration-300 group-hover:-translate-x-1 group-hover:text-violet-300">
                  ←
                </span>
              </div>

              <p className="mt-5 text-[11px] font-bold tracking-[0.12em] text-violet-400">
                القاما والسيولة
              </p>

              <h2 className="mt-1.5 text-lg font-black text-white">
                تحليل القاما والسيولة
              </h2>

              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                اعرض GEX والجدران والمغناطيس وتدفق العقود.
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push("/options-analyzer")}
              className="group relative overflow-hidden rounded-[24px] xl:min-h-[205px] border border-cyan-400/15 bg-slate-950/70 p-4 text-right transition duration-300 hover:-translate-y-1 hover:border-cyan-400/40 hover:bg-cyan-400/[0.06] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-lg font-black text-cyan-300">
                  ◎
                </div>

                <span className="text-xl text-slate-600 transition duration-300 group-hover:-translate-x-1 group-hover:text-cyan-300">
                  ←
                </span>
              </div>

              <p className="mt-5 text-[11px] font-bold tracking-[0.12em] text-cyan-400">
                محلل العقود
              </p>

              <h2 className="mt-1.5 text-lg font-black text-white">
                تحليل عقود الشركات
              </h2>

              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                اختر الشركة والتاريخ واعرض أفضل العقود.
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push("/whale-trades")}
              className="group relative overflow-hidden rounded-[24px] xl:min-h-[205px] border border-amber-400/15 bg-slate-950/70 p-4 text-right transition duration-300 hover:-translate-y-1 hover:border-amber-400/40 hover:bg-amber-400/[0.06] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-lg text-amber-300">
                  ◈
                </div>

                <span className="text-xl text-slate-600 transition duration-300 group-hover:-translate-x-1 group-hover:text-amber-300">
                  ←
                </span>
              </div>

              <p className="mt-5 text-[11px] font-bold tracking-[0.12em] text-amber-400">
                الرصد المؤسسي
              </p>

              <h2 className="mt-1.5 text-lg font-black text-white">
                صفقات الحيتان
              </h2>

              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                راقب العقود الكبيرة وقوة السيولة والاتجاه.
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push("/market-news")}
              className="group relative overflow-hidden rounded-[24px] xl:min-h-[205px] border border-sky-400/15 bg-slate-950/70 p-4 text-right transition duration-300 hover:-translate-y-1 hover:border-sky-400/40 hover:bg-sky-400/[0.06] sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-lg text-sky-300">
                  ◫
                </div>

                <span className="text-xl text-slate-600 transition duration-300 group-hover:-translate-x-1 group-hover:text-sky-300">
                  ←
                </span>
              </div>

              <p className="mt-5 text-[11px] font-bold tracking-[0.12em] text-sky-400">
                محتوى الفريق
              </p>

              <h2 className="mt-1.5 text-lg font-black text-white">
                مركز الأخبار
              </h2>

              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                أخبار وتنبيهات وإعلانات ينشرها فريق ST Market Intelligence.
              </p>
            </button>
          </div>
        </section>

        <section className="mb-10">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-7">

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full shadow-lg",
                  marketSession.isOpen
                    ? "bg-emerald-400 shadow-emerald-400/70"
                    : "bg-amber-400 shadow-amber-400/70",
                ].join(" ")}
              />

              <p className="text-sm font-bold text-slate-300">
                حالة السوق اللحظية
              </p>
            </div>

            <p className="mt-2 text-xs font-bold text-slate-500">
              {marketSession.isOpen
                ? "تحليل حركة السوق — فريم 5 دقائق"
                : "آخر جلسة تداول — فريم 5 دقائق"}
            </p>
          </div>

          {marketOverview ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-bold text-slate-400">
              SPY + QQQ{" "}
              <span
                className={
                  marketOverview.market.primaryAgreement
                    ? "text-emerald-300"
                    : "text-amber-300"
                }
              >
                {marketOverview.market.primaryAgreement
                  ? "متفقان"
                  : "غير متفقين"}
              </span>
            </div>
          ) : null}
        </div>

        {marketOverviewLoading && !marketOverview ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-8 text-center text-sm font-bold text-slate-400">
            جارٍ تشخيص حالة السوق...
          </div>
        ) : marketOverview ? (
          <>
            <div className="mt-7">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={[
                    "rounded-xl border px-3 py-1.5 text-xs font-black",
                    marketOverview.market.regime === "TREND_UP" ||
                    marketOverview.market.regime === "IMPULSE_UP"
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : marketOverview.market.regime === "TREND_DOWN" ||
                          marketOverview.market.regime === "IMPULSE_DOWN"
                        ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                        : marketOverview.market.regime === "RANGE"
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                          : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
                  ].join(" ")}
                >
                  {marketOverview.market.regime === "IMPULSE_UP" ||
                  marketOverview.market.regime === "IMPULSE_DOWN"
                    ? "⚡ اندفاع"
                    : marketOverview.market.regime === "RANGE"
                      ? "↔ تذبذب"
                      : marketOverview.market.regime === "TRANSITION"
                        ? "◌ مرحلة انتقال"
                        : "اتجاه قائم"}
                </span>

                <span className="text-xs font-bold text-slate-500">
                  {marketOverview.timeframe}
                </span>
              </div>

              <h2
                className={[
                  "mt-4 text-3xl font-black sm:text-4xl",
                  marketOverview.market.regime === "TREND_UP" ||
                  marketOverview.market.regime === "IMPULSE_UP"
                    ? "text-emerald-300"
                    : marketOverview.market.regime === "TREND_DOWN" ||
                        marketOverview.market.regime === "IMPULSE_DOWN"
                      ? "text-rose-300"
                      : marketOverview.market.regime === "RANGE"
                        ? "text-amber-300"
                        : "text-cyan-300",
                ].join(" ")}
              >
                {marketOverview.market.title}
              </h2>

              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
                {marketOverview.market.summary}
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold text-slate-500">
                  بيئة السوق
                </p>

                <p className="mt-2 text-sm font-black leading-6 text-white">
                  {marketOverview.market.environment}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold text-slate-500">
                  موقع السوق من VWAP
                </p>

                <p className="mt-2 text-lg font-black text-white">
                  <span className="text-emerald-300">
                    {marketOverview.market.aboveVwapCount} فوق
                  </span>
                  {" · "}
                  <span className="text-rose-300">
                    {marketOverview.market.belowVwapCount} تحت
                  </span>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-xs font-bold text-slate-500">
                  اتساق المؤشرات
                </p>

                <p className="mt-2 text-sm font-black text-white">
                  <span className="text-emerald-300">
                    {marketOverview.market.bullishCount} صاعد
                  </span>
                  {" · "}
                  <span className="text-rose-300">
                    {marketOverview.market.bearishCount} هابط
                  </span>
                  {" · "}
                  <span className="text-amber-300">
                    {marketOverview.market.neutralCount} محايد
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {marketOverview.indices.map((index) => {
                const directionLabel =
                  index.direction === "BULLISH"
                    ? "صاعد"
                    : index.direction === "BEARISH"
                      ? "هابط"
                      : "محايد";

                const structureLabel =
                  index.structure === "HIGHER"
                    ? "قمم وقيعان أعلى"
                    : index.structure === "LOWER"
                      ? "قمم وقيعان أدنى"
                      : "بنية مختلطة";

                const momentumLabel =
                  index.momentum === "STRONG_UP"
                    ? "صاعد قوي"
                    : index.momentum === "UP"
                      ? "صاعد"
                      : index.momentum === "STRONG_DOWN"
                        ? "هابط قوي"
                        : index.momentum === "DOWN"
                          ? "هابط"
                          : "محايد";

                return (
                  <div
                    key={index.symbol}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-white">
                          {index.symbol}
                        </p>

                        <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                          {index.name}
                        </p>
                      </div>

                      <span
                        className={[
                          "rounded-lg border px-2 py-1 text-[10px] font-black",
                          index.direction === "BULLISH"
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : index.direction === "BEARISH"
                              ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                        ].join(" ")}
                      >
                        {directionLabel}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-xs font-bold">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">
                          VWAP
                        </span>

                        <span
                          dir="ltr"
                          className={
                            index.aboveVwap
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }
                        >
                          {index.aboveVwap ? "فوق" : "تحت"}{" "}
                          {Math.abs(index.vwapDistancePct).toFixed(2)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">
                          البنية
                        </span>

                        <span className="text-slate-200">
                          {structureLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">
                          الزخم
                        </span>

                        <span className="text-slate-200">
                          {momentumLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">
                          الحجم
                        </span>

                        <span
                          dir="ltr"
                          className={
                            index.volumeState === "STRONG"
                              ? "text-cyan-300"
                              : index.volumeState === "WEAK"
                                ? "text-amber-300"
                                : "text-slate-200"
                          }
                        >
                          {index.relativeVolume.toFixed(2)}x
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4">
              <p className="text-xs font-black text-cyan-300">
                ماذا يعني هذا للمتداول؟
              </p>

              <p className="mt-2 text-sm font-bold leading-7 text-slate-200">
                {marketOverview.market.execution}
              </p>
            </div>

            <div
              className={[
                "mt-4 rounded-2xl border px-4 py-3 text-xs font-bold leading-6",
                marketSession.isOpen
                  ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
                  : "border-amber-400/20 bg-amber-400/[0.06] text-amber-300",
              ].join(" ")}
            >
              {marketSession.label} —{" "}
              {marketSession.isOpen
                ? "التشخيص يتحدث أثناء الجلسة."
                : "التشخيص مبني على آخر جلسة تداول متوفرة."}
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-6 text-center text-sm font-bold text-rose-300">
            تعذر تشخيص حالة السوق حاليًا.
          </div>
        )}
      </div>
    </section>

    <SectorRadar />

    <footer className="mt-16 border-t border-white/[0.06] pt-6 text-center">
          <p className="text-xs leading-6 text-slate-600">
            التحليلات مبنية على بيانات السوق ولا تمثل توصية مباشرة بالشراء أو
            البيع.
          </p>
        </footer>
      </section>

      <style jsx global>{`
        @keyframes marketTickerScroll {
          from {
            transform: translateX(0);
          }

          to {
            transform: translateX(-50%);
          }
        }

        .market-ticker-track {
          animation: marketTickerScroll 34s linear infinite;
          will-change: transform;
        }

        .market-ticker-track:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .market-ticker-track {
            animation: none;
            transform: none;
          }
        }
      `}</style>
    </main>
  );
}