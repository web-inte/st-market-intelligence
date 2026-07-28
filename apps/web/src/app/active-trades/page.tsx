"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TradeTarget = {
  index: number;
  price: number;
};

type ActiveTrade = {
  id: string;
  activatedAt: string;

  contractEntryPrice: number;
contractCurrentPrice: number;
contractBestPrice: number;
contractBid: number;
contractAsk: number;
contractProfitDollars: number;
contractProfitPct: number;
contractStopPrice: number;
contractQuoteAt: string | null;
closedAt: string | null;
closeReason: string | null;

  symbol: string;
  engineCode:
    | "A"
    | "B"
    | "C"
    | "D";
  side: "CALL" | "PUT";
  sideLabel: string;

  contractTicker: string;
  contractStrike: number;
  contractExpiration: string;

  entryPrice: number;
  stopPrice: number | null;

  targets: TradeTarget[];

  currentPrice: number;
  bestPrice: number;
  bestPriceAt: string | null;

  currentProfitPct: number;
  bestProfitPct: number;

  highestTargetHit: number;

  contractStatus: string;
  statusLabel: string;

  warningMessage: string | null;
  warningAt: string | null;
};

type ActiveTradesResponse = {
  ok: boolean;
  updatedAt?: string;
  count?: number;
  trades?: ActiveTrade[];
  error?: string;
};

const REFRESH_INTERVAL_MS = 5_000;

function numberText(
  value: number | null,
  digits = 2
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(digits);
}

function engineTitle(
  code: ActiveTrade["engineCode"]
) {
  if (code === "A") {
    return "محرك تحليل القاما";
  }

  if (code === "D") {
    return "محرك القرار";
  }

  if (code === "B") {
    return "محرك البوتات";
  }

  return "المصدر غير معروف";
}

function engineClass(
  code: ActiveTrade["engineCode"]
) {
  if (code === "A") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  }

  if (code === "D") {
    return "border-violet-400/30 bg-violet-400/10 text-violet-300";
  }

  if (code === "B") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }

  return "border-slate-400/30 bg-slate-400/10 text-slate-300";
}

function percentText(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const prefix =
    value > 0 ? "+" : "";

  return `${prefix}${value.toFixed(2)}%`;
}


function bestContractProfitDollars(
  trade: ActiveTrade
) {
  const entry =
    Number(trade.contractEntryPrice);

  const best =
    Number(trade.contractBestPrice);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(best) ||
    entry <= 0
  ) {
    return 0;
  }

  return Math.round(
    (best - entry) * 100 * 100
  ) / 100;
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(`${value}T00:00:00`);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ar-SA-u-ca-gregory",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "ar-SA-u-ca-gregory",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}

function sideClass(
  side: ActiveTrade["side"]
) {
  return side === "CALL"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

function performanceClass(
  value: number
) {
  if (value > 0) {
    return "text-emerald-300";
  }

  if (value < 0) {
    return "text-rose-300";
  }

  return "text-slate-300";
}

function statusClass(
  status: string
) {
  if (status === "TARGET_2") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
  }

  if (status === "TARGET_1") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
}

function TargetList({
  targets,
  highestTargetHit,
}: {
  targets: TradeTarget[];
  highestTargetHit: number;
}) {
  if (targets.length === 0) {
    return (
      <span className="text-slate-500">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((target) => {
        const reached =
          highestTargetHit >=
          target.index;

        return (
          <span
            key={`${target.index}-${target.price}`}
            className={[
              "rounded-lg border px-2 py-1 text-xs font-bold",
              reached
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                : "border-slate-700 bg-slate-900/70 text-slate-300",
            ].join(" ")}
          >
            هـ{target.index}:{" "}
            {numberText(
              target.price
            )}
            {reached ? " ✓" : ""}
          </span>
        );
      })}
    </div>
  );
}

export default function ActiveTradesPage() {
    const [
    trades,
    setTrades,
  ] = useState<ActiveTrade[]>([]);

  const [
    tradeSymbolSearch,
    setTradeSymbolSearch,
  ] = useState("");

  const [
    activeView,
    setActiveView,
  ] = useState<
    "all" | "favorites"
  >("all");

  const [
    favoriteTradeIds,
    setFavoriteTradeIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    favoriteLoadingIds,
    setFavoriteLoadingIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    favoritesError,
    setFavoritesError,
  ] = useState("");

  const normalizedTradeSymbolSearch =
    tradeSymbolSearch
      .trim()
      .toUpperCase();

  const filteredTrades =
    useMemo(
      () => {
        const viewTrades =
          activeView ===
          "favorites"
            ? trades.filter(
                (trade) =>
                  favoriteTradeIds.has(
                    trade.id
                  )
              )
            : trades;

        if (
          !normalizedTradeSymbolSearch
        ) {
          return viewTrades;
        }

        return viewTrades.filter(
          (trade) =>
            trade.symbol
              .toUpperCase()
              .includes(
                normalizedTradeSymbolSearch
              )
        );
      },
      [
        trades,
        activeView,
        favoriteTradeIds,
        normalizedTradeSymbolSearch,
      ]
    );

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [updatedAt, setUpdatedAt] =
    useState("");

  const requestInFlightRef =
    useRef(false);

  const quoteRequestInFlightRef =
    useRef(false);

  const tradesRef =
    useRef<ActiveTrade[]>([]);

  const loadFavorites =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            "/api/active-trades/favorites",
            {
              cache: "no-store",
              credentials:
                "include",
            }
          );

        const payload =
          (await response.json()) as {
            ok: boolean;
            favoriteTradeIds?: string[];
            error?: string;
          };

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "تعذر تحميل المفضلة"
          );
        }

        setFavoriteTradeIds(
          new Set(
            payload.favoriteTradeIds ||
              []
          )
        );

        setFavoritesError("");
      } catch (favoriteError) {
        setFavoritesError(
          favoriteError instanceof Error
            ? favoriteError.message
            : "تعذر تحميل المفضلة"
        );
      }
    }, []);

  const toggleFavorite =
    useCallback(
      async (
        tradeId: string
      ) => {
        if (
          favoriteLoadingIds.has(
            tradeId
          )
        ) {
          return;
        }

        const wasFavorite =
          favoriteTradeIds.has(
            tradeId
          );

        const nextFavorite =
          !wasFavorite;

        setFavoriteLoadingIds(
          (current) =>
            new Set(
              current
            ).add(
              tradeId
            )
        );

        setFavoriteTradeIds(
          (current) => {
            const next =
              new Set(
                current
              );

            if (nextFavorite) {
              next.add(
                tradeId
              );
            } else {
              next.delete(
                tradeId
              );
            }

            return next;
          }
        );

        try {
          const response =
            await fetch(
              "/api/active-trades/favorites",
              {
                method:
                  "POST",
                cache:
                  "no-store",
                credentials:
                  "include",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body:
                  JSON.stringify({
                    tradeId,
                    favorite:
                      nextFavorite,
                  }),
              }
            );

          const payload =
            (await response.json()) as {
              ok: boolean;
              error?: string;
            };

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "تعذر تحديث المفضلة"
            );
          }

          setFavoritesError("");
        } catch (favoriteError) {
          setFavoriteTradeIds(
            (current) => {
              const next =
                new Set(
                  current
                );

              if (wasFavorite) {
                next.add(
                  tradeId
                );
              } else {
                next.delete(
                  tradeId
                );
              }

              return next;
            }
          );

          setFavoritesError(
            favoriteError instanceof Error
              ? favoriteError.message
              : "تعذر تحديث المفضلة"
          );
        } finally {
          setFavoriteLoadingIds(
            (current) => {
              const next =
                new Set(
                  current
                );

              next.delete(
                tradeId
              );

              return next;
            }
          );
        }
      },
      [
        favoriteLoadingIds,
        favoriteTradeIds,
      ]
    );

  const loadTrades =
    useCallback(
      async (
        manualRefresh = false
      ) => {
        if (requestInFlightRef.current) {
          return;
        }

        requestInFlightRef.current = true;

        if (manualRefresh) {
          setRefreshing(true);
        }

        try {
          const response =
            await fetch(
              "/api/active-trades",
              {
                cache: "no-store",
              }
            );

          const payload =
            (await response.json()) as
              ActiveTradesResponse;

          if (
            !response.ok ||
            !payload.ok
          ) {
            throw new Error(
              payload.error ||
                "تعذر تحميل الصفقات النشطة"
            );
          }

          setTrades((current) => {
            const currentById =
              new Map(
                current.map((trade) => [
                  trade.id,
                  trade,
                ])
              );

            const nextTrades =
              [...(payload.trades || [])]
                .map((trade) => {
                  const live =
                    currentById.get(
                      trade.id
                    );

                  const liveTime =
                    live?.contractQuoteAt
                      ? new Date(
                          live.contractQuoteAt
                        ).getTime()
                      : 0;

                  const incomingTime =
                    trade.contractQuoteAt
                      ? new Date(
                          trade.contractQuoteAt
                        ).getTime()
                      : 0;

                  if (
                    !live ||
                    liveTime <= incomingTime
                  ) {
                    return trade;
                  }

                  return {
                    ...trade,
                    contractCurrentPrice:
                      live.contractCurrentPrice,
                    contractBestPrice:
                      Math.max(
                        Number(
                          trade.contractBestPrice
                        ) || 0,
                        Number(
                          live.contractBestPrice
                        ) || 0,
                        Number(
                          live.contractCurrentPrice
                        ) || 0,
                        Number(
                          trade.contractEntryPrice
                        ) || 0
                      ),
                    contractBid:
                      live.contractBid,
                    contractAsk:
                      live.contractAsk,
                    contractProfitDollars:
                      live.contractProfitDollars,
                    contractProfitPct:
                      live.contractProfitPct,
                    contractQuoteAt:
                      live.contractQuoteAt,
                  };
                })
                .sort(
                  (first, second) =>
                    new Date(
                      second.activatedAt
                    ).getTime() -
                    new Date(
                      first.activatedAt
                    ).getTime()
                );

            tradesRef.current =
              nextTrades;

            return nextTrades;
          });

          setUpdatedAt(
            payload.updatedAt || ""
          );

          setError("");
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل الصفقات النشطة"
          );
        } finally {
          requestInFlightRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  const loadLiveQuotes =
    useCallback(async () => {
      if (
        quoteRequestInFlightRef.current
      ) {
        return;
      }

      const trackedTrades =
        tradesRef.current.filter(
          (trade) =>
            Boolean(
              trade.contractTicker
            ) &&
            !trade.closedAt &&
            trade.contractStatus
              .toUpperCase() !==
              "STOPPED" &&
            trade.contractStatus
              .toUpperCase() !==
              "EXPIRED"
        );

      if (
        trackedTrades.length === 0
      ) {
        return;
      }

      quoteRequestInFlightRef.current =
        true;

      try {
        const response =
          await fetch(
            `/api/active-trades/quotes?t=${Date.now()}`,
            {
              method: "POST",
              cache: "no-store",
              credentials: "include",
              headers: {
                "Content-Type":
                  "application/json",
                "Cache-Control":
                  "no-cache, no-store, max-age=0",
                Pragma: "no-cache",
              },
              body: JSON.stringify({
                trades:
                  trackedTrades.map(
                    (trade) => ({
                      id: trade.id,
                      symbol:
                        trade.symbol,
                      contractTicker:
                        trade.contractTicker,
                      contractEntryPrice:
                        trade.contractEntryPrice,
                      contractBestPrice:
                        trade.contractBestPrice,
                    })
                  ),
              }),
            }
          );

        const payload =
          (await response.json()) as {
            ok: boolean;
            quotes?: Array<{
              id: string;
              contractCurrentPrice:
                number;
              contractBestPrice:
                number;
              contractBestProfitDollars:
                number;
              contractBestProfitPct:
                number;
              contractBid: number;
              contractAsk: number;
              contractProfitDollars:
                number;
              contractProfitPct:
                number;
              contractQuoteAt:
                string;
            }>;
            error?: string;
          };

        if (
          !response.ok ||
          !payload.ok
        ) {
          throw new Error(
            payload.error ||
              "تعذر تحديث أسعار العقود"
          );
        }

        const quoteById =
          new Map(
            (payload.quotes || [])
              .map((quote) => [
                quote.id,
                quote,
              ])
          );

        setTrades((current) => {
          const next =
            current.map((trade) => {
              const quote =
                quoteById.get(
                  trade.id
                );

              if (!quote) {
                return trade;
              }

              const safeContractBestPrice =
                Math.max(
                  Number(
                    trade.contractBestPrice
                  ) || 0,
                  Number(
                    quote.contractBestPrice
                  ) || 0,
                  Number(
                    quote.contractCurrentPrice
                  ) || 0,
                  Number(
                    trade.contractEntryPrice
                  ) || 0
                );

              return {
                ...trade,
                contractCurrentPrice:
                  quote.contractCurrentPrice,
                contractBestPrice:
                  safeContractBestPrice,
                contractBid:
                  quote.contractBid,
                contractAsk:
                  quote.contractAsk,
                contractProfitDollars:
                  quote.contractProfitDollars,
                contractProfitPct:
                  quote.contractProfitPct,
                contractQuoteAt:
                  quote.contractQuoteAt,
              };
            });

          tradesRef.current = next;

          return next;
        });
      } catch (quoteError) {
        console.warn(
          "تعذر تحديث أسعار العقود:",
          quoteError
        );
      } finally {
        quoteRequestInFlightRef.current =
          false;
      }
    }, []);

  useEffect(() => {
    void loadTrades();
    void loadFavorites();

    const interval =
      window.setInterval(() => {
        void loadTrades();
      }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    loadTrades,
    loadFavorites,
  ]);

  /*
    تحديث أسعار العقود فقط كل ثانية.

    لا يعيد حساب الوقف أو الأهداف،
    ولا يكتب في Supabase.
  */
  useEffect(() => {
    let timer:
      number | undefined;

    const stopPolling = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const startPolling = () => {
      if (document.hidden) {
        return;
      }

      void loadLiveQuotes();

      timer =
        window.setInterval(
          () =>
            void loadLiveQuotes(),
          3_000
        );
    };

    const resumePolling = () => {
      if (document.hidden) {
        return;
      }

      quoteRequestInFlightRef.current =
        false;

      stopPolling();
      startPolling();
    };

    const handleVisibilityChange =
      () => {
        if (document.hidden) {
          stopPolling();
          return;
        }

        resumePolling();
      };

    startPolling();

    window.addEventListener(
      "focus",
      resumePolling
    );

    window.addEventListener(
      "pageshow",
      resumePolling
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      stopPolling();

      window.removeEventListener(
        "focus",
        resumePolling
      );

      window.removeEventListener(
        "pageshow",
        resumePolling
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [loadLiveQuotes]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 text-white"
    >
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold text-cyan-300">
              متابعة تلقائية
            </p>

            <h1 className="text-3xl font-black sm:text-4xl">
              الصفقات النشطة
            </h1>

          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-amber-300">
            ⚠️ هذه البيانات ليست توصيات بيع أو شراء، وإنما لأغراض تعليمية فقط.
          </p>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              متابعة وقت التفعيل،
              والعقد، ومستويات
              الدخول والوقف
              والأهداف، وأفضل سعر
              تحقق منذ تفعيل الصفقة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={refreshing}
              onClick={() =>
                void loadTrades(true)
              }
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-bold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing
                ? "جارٍ التحديث..."
                : "تحديث الآن"}
            </button>

            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-500"
            >
              العودة إلى المنصة
            </Link>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">
              إجمالي الصفقات النشطة
            </p>

            <p className="mt-2 text-3xl font-black text-white">
              {trades.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">
              عقود كول
            </p>

            <p className="mt-2 text-3xl font-black text-emerald-300">
              {
                trades.filter(
                  (trade) =>
                    trade.side ===
                    "CALL"
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">
              عقود بوت
            </p>

            <p className="mt-2 text-3xl font-black text-rose-300">
              {
                trades.filter(
                  (trade) =>
                    trade.side ===
                    "PUT"
                ).length
              }
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
          <button
            type="button"
            onClick={() =>
              setActiveView(
                "all"
              )
            }
            className={[
              "rounded-2xl border px-4 py-2.5 text-sm font-black transition",
              activeView ===
              "all"
                ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
                : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500",
            ].join(" ")}
          >
            كل الصفقات{" "}
            <span className="text-xs opacity-80">
              ({trades.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveView(
                "favorites"
              )
            }
            className={[
              "rounded-2xl border px-4 py-2.5 text-sm font-black transition",
              activeView ===
              "favorites"
                ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500",
            ].join(" ")}
          >
            ⭐ المفضلة{" "}
            <span className="text-xs opacity-80">
              (
              {
                favoriteTradeIds.size
              }
              )
            </span>
          </button>
        </div>

        {favoritesError ? (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-200">
            {favoritesError}
          </div>
        ) : null}

        <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
          <label
            htmlFor="active-trade-symbol-search"
            className="mb-3 block text-sm font-black text-white"
          >
            البحث عن صفقة
          </label>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="active-trade-symbol-search"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={tradeSymbolSearch}
                onChange={(event) =>
                  setTradeSymbolSearch(
                    event.target.value
                      .replace(
                        /[^a-zA-Z0-9.-]/g,
                        ""
                      )
                      .toUpperCase()
                  )
                }
                placeholder="ابحث عن رمز صفقة مثل NVDA أو TSLA"
                className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 pl-12 text-left text-sm font-black uppercase tracking-wide text-white outline-none transition placeholder:text-right placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/10"
                dir="ltr"
              />

              {tradeSymbolSearch ? (
                <button
                  type="button"
                  onClick={() =>
                    setTradeSymbolSearch("")
                  }
                  aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-lg font-black text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          {normalizedTradeSymbolSearch ? (
            <p className="mt-3 text-xs font-bold text-slate-400">
              عدد الصفقات المطابقة:{" "}
              <span className="text-cyan-300">
                {filteredTrades.length}
              </span>
            </p>
          ) : null}
        </div>

        {updatedAt ? (
          <p className="mb-4 text-xs text-slate-500">
            آخر تحديث:{" "}
            {formatDateTime(
              updatedAt
            )}
          </p>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center text-slate-400">
            جارٍ تحميل الصفقات
            النشطة...
          </div>
        ) : trades.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center">
            <p className="text-xl font-black text-white">
              لا توجد صفقات نشطة
              حاليًا
            </p>

            <p className="mt-3 text-sm text-slate-400">
              ستظهر الصفقات هنا
              تلقائيًا عند تفعيل
              فرصة جديدة.
            </p>
          </div>
        ) : (
          <>
            {activeView ===
              "favorites" &&
            !normalizedTradeSymbolSearch &&
            filteredTrades.length === 0 ? (
              <div className="mb-6 rounded-3xl border border-amber-400/20 bg-amber-400/[0.06] p-8 text-center">
                <p className="text-lg font-black text-white">
                  لا توجد صفقات في المفضلة
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  اضغط على النجمة بجانب أي صفقة لحفظها هنا.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setActiveView(
                      "all"
                    )
                  }
                  className="mt-5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-slate-500"
                >
                  عرض جميع الصفقات
                </button>
              </div>
            ) : null}

            {normalizedTradeSymbolSearch &&
            filteredTrades.length === 0 ? (
              <div className="mb-6 rounded-3xl border border-amber-400/20 bg-amber-400/[0.06] p-8 text-center">
                <p className="text-lg font-black text-white">
                  لا توجد صفقة لهذا الرمز
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  البحث يعرض فقط الرموز التي لديها صفقة موجودة في هذه الصفحة.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setTradeSymbolSearch("")
                  }
                  className="mt-5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-slate-500"
                >
                  عرض جميع الصفقات
                </button>
              </div>
            ) : null}

            <div
              className={[
                "hidden overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 xl:block",
                normalizedTradeSymbolSearch &&
                filteredTrades.length === 0
                  ? "xl:hidden"
                  : "",
              ].join(" ")}
            >
              <div className="overflow-x-auto">
                <table className="min-w-[1450px] w-full text-right text-sm">
                  <thead className="border-b border-slate-800 bg-slate-900">
                    <tr className="text-slate-400">
                      <th className="w-16 px-4 py-4 text-center">
                        حفظ
                      </th>
                      <th className="px-4 py-4">
                        وقت التفعيل
                      </th>
                      <th className="px-4 py-4">
                        الرمز
                      </th>

                <th className="px-4 py-4">
                  وقت التنفيذ
                </th>
                      <th className="px-4 py-4">
                        النوع
                      </th>
                      <th className="px-4 py-4">
                        السترايك
                      </th>
                      <th className="px-4 py-4">
                        تاريخ العقد
                      </th>
                      
                      <th className="px-4 py-4">
  دخول العقد
</th>
                      <th className="px-4 py-4">
                        الأهداف
                      </th>
                      <th className="px-4 py-4">
  سعر السهم الحالي
</th>



<th className="px-4 py-4">
                        الوقف
                      </th>

<th className="px-4 py-4">
  سعر العقد الحالي
</th>



<th className="px-4 py-4">
  ربح العقد
</th>
                      <th className="px-4 py-4">
                        الحالة
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800">
                    {filteredTrades.map(
                      (trade) => (
                        <tr
                          key={trade.id}
                          className="transition hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-5 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                void toggleFavorite(
                                  trade.id
                                )
                              }
                              disabled={
                                favoriteLoadingIds.has(
                                  trade.id
                                )
                              }
                              aria-label={
                                favoriteTradeIds.has(
                                  trade.id
                                )
                                  ? "إزالة الصفقة من المفضلة"
                                  : "إضافة الصفقة إلى المفضلة"
                              }
                              title={
                                favoriteTradeIds.has(
                                  trade.id
                                )
                                  ? "إزالة من المفضلة"
                                  : "إضافة إلى المفضلة"
                              }
                              className={[
                                "inline-flex h-10 w-10 items-center justify-center rounded-xl border text-2xl transition",
                                favoriteTradeIds.has(
                                  trade.id
                                )
                                  ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
                                  : "border-slate-700 bg-slate-950/60 text-slate-500 hover:border-amber-400/40 hover:text-amber-300",
                                favoriteLoadingIds.has(
                                  trade.id
                                )
                                  ? "cursor-wait opacity-50"
                                  : "",
                              ].join(" ")}
                            >
                              {
                                favoriteTradeIds.has(
                                  trade.id
                                )
                                  ? "★"
                                  : "☆"
                              }
                            </button>
                          </td>

                          <td className="whitespace-nowrap px-4 py-5 text-slate-300">
                            {formatDateTime(
                              trade.activatedAt
                            )}
                          </td>

                          <td className="px-4 py-5">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-black text-white">
                                {trade.symbol}
                              </span>

                              <span
                                title={engineTitle(
                                  trade.engineCode
                                )}
                                className={[
                                  "inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-2 text-xs font-black",
                                  engineClass(
                                    trade.engineCode
                                  ),
                                ].join(" ")}
                              >
                                {trade.engineCode}
                              </span>
                            </div>
                          </td>

                <td className="px-4 py-5 whitespace-nowrap">
                  <p className="font-bold text-white">
                    {new Date(
                      trade.activatedAt
                    ).toLocaleString(
                      "ar-SA",
                      {
                        timeZone:
                          "Asia/Riyadh",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </p>
                </td>

                          <td className="px-4 py-5">
                            <span
                              className={[
                                "inline-flex rounded-lg border px-2.5 py-1 text-xs font-black",
                                sideClass(
                                  trade.side
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {
                                trade.sideLabel
                              }
                            </span>
                          </td>

                          <td className="px-4 py-5 font-bold text-white">
                            {numberText(
                              trade.contractStrike
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-5 text-slate-300">
                            {formatDate(
                              trade.contractExpiration
                            )}
                          </td>

                          

                          <td className="px-4 py-5">
                  <p className="font-bold text-white">
                    {numberText(
                      trade.contractEntryPrice
                    )}
                  </p>
                </td>

                          <td className="px-4 py-5">
                            <TargetList
                              targets={
                                trade.targets
                              }
                              highestTargetHit={
                                trade.highestTargetHit
                              }
                            />
                          </td>

                          
                <td className="px-4 py-5">
                  <p className="font-bold text-white">
                    {numberText(trade.currentPrice)}
                  </p>

                  <p
                    className={[
                      "mt-1 text-xs font-bold",
                      performanceClass(
                        trade.currentProfitPct
                      ),
                    ].join(" ")}
                  >
                    {percentText(
                      trade.currentProfitPct
                    )}
                  </p>
                </td>

                

                <td className="px-4 py-5 font-bold text-rose-300">
                            {numberText(
                              trade.stopPrice
                            )}
                          </td>

                <td className="px-4 py-5">
                  <p className="font-bold text-white">
                    {numberText(
                      trade.contractStatus ===
                        "STOPPED" &&
                        trade.contractStopPrice > 0
                        ? trade.contractStopPrice
                        : trade.contractCurrentPrice
                    )}
                  </p>

                  {trade.contractStatus ===
                    "STOPPED" && (
                    <p className="mt-1 text-xs font-bold text-rose-400">
                      السعر عند الوقف
                    </p>
                  )}
                </td>

                

                <td
                  className={[
                    "px-4 py-5 font-black",
                    performanceClass(
                      trade.contractProfitPct
                    ),
                  ].join(" ")}
                >
                  <p>
                    {trade.contractProfitDollars > 0
                      ? "+"
                      : ""}
                    {numberText(
                      trade.contractProfitDollars
                    )}{" "}
                    $
                  </p>

                  <p className="mt-1 text-xs">
                    {percentText(
                      trade.contractProfitPct
                    )}
                  </p>

                  <div className="mt-2 border-t border-slate-800 pt-2">
                    <p className="text-[10px] font-bold text-slate-500">
                      أعلى ربح وصل إليه
                    </p>

                    <p
                      className={[
                        "mt-1 text-xs font-black",
                        performanceClass(
                          bestContractProfitDollars(
                            trade
                          )
                        ),
                      ].join(" ")}
                    >
                      {bestContractProfitDollars(
                        trade
                      ) > 0
                        ? "+"
                        : ""}
                      {numberText(
                        bestContractProfitDollars(
                          trade
                        )
                      )}{" "}
                      $
                    </p>
                  </div>
                </td>

                          <td className="px-4 py-5">
                            <span
                              className={[
                                "inline-flex whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-bold",
                                statusClass(
                                  trade.contractStatus
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {
                                trade.statusLabel
                              }
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 xl:hidden">
              {filteredTrades.map(
                (trade) => (
                  <article
                    key={trade.id}
                    className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-2xl font-black">
                            {
                              trade.symbol
                            }
                          </h2>

                          <span
                            title={engineTitle(
                              trade.engineCode
                            )}
                            className={[
                              "inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-2 text-xs font-black",
                              engineClass(
                                trade.engineCode
                              ),
                            ].join(" ")}
                          >
                            {trade.engineCode}
                          </span>

                          <span
                            className={[
                              "rounded-lg border px-2 py-1 text-xs font-black",
                              sideClass(
                                trade.side
                              ),
                            ].join(
                              " "
                            )}
                          >
                            {
                              trade.sideLabel
                            }
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-slate-400">
                          تفعيل:{" "}
                          {formatDateTime(
                            trade.activatedAt
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            "rounded-lg border px-2.5 py-1 text-xs font-bold",
                            statusClass(
                              trade.contractStatus
                            ),
                          ].join(
                            " "
                          )}
                        >
                          {
                            trade.statusLabel
                          }
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            void toggleFavorite(
                              trade.id
                            )
                          }
                          disabled={
                            favoriteLoadingIds.has(
                              trade.id
                            )
                          }
                          aria-label={
                            favoriteTradeIds.has(
                              trade.id
                            )
                              ? "إزالة الصفقة من المفضلة"
                              : "إضافة الصفقة إلى المفضلة"
                          }
                          title={
                            favoriteTradeIds.has(
                              trade.id
                            )
                              ? "إزالة من المفضلة"
                              : "إضافة إلى المفضلة"
                          }
                          className={[
                            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-2xl transition",
                            favoriteTradeIds.has(
                              trade.id
                            )
                              ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
                              : "border-slate-700 bg-slate-950/60 text-slate-500 hover:border-amber-400/40 hover:text-amber-300",
                            favoriteLoadingIds.has(
                              trade.id
                            )
                              ? "cursor-wait opacity-50"
                              : "",
                          ].join(" ")}
                        >
                          {
                            favoriteTradeIds.has(
                              trade.id
                            )
                              ? "★"
                              : "☆"
                          }
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          السترايك
                        </p>
                        <p className="mt-1 font-black">
                          {numberText(
                            trade.contractStrike
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          تاريخ العقد
                        </p>
                        <p className="mt-1 font-bold">
                          {formatDate(
                            trade.contractExpiration
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          سعر دخول العقد
                        </p>

                        <p
                          dir="ltr"
                          className="mt-1 text-lg font-black text-white"
                        >
                          {Number.isFinite(
                            Number(
                              trade.contractEntryPrice
                            )
                          )
                            ? `$${Number(
                                trade.contractEntryPrice
                              ).toFixed(2)}`
                            : "—"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          سعر العقد الحالي
                        </p>

                        <p
                          dir="ltr"
                          className="mt-1 text-lg font-black text-cyan-300"
                        >
                          {Number.isFinite(
                            Number(
                              trade.contractCurrentPrice
                            )
                          )
                            ? `$${Number(
                                trade.contractCurrentPrice
                              ).toFixed(2)}`
                            : "—"}
                        </p>
                      </div>

                      

                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3">
                        <p className="text-xs text-slate-500">
                          أعلى ربح وصل إليه
                        </p>

                        <p
                          className={[
                            "mt-1 font-black",
                            performanceClass(
                              bestContractProfitDollars(
                                trade
                              )
                            ),
                          ].join(" ")}
                        >
                          {bestContractProfitDollars(
                            trade
                          ) > 0
                            ? "+"
                            : ""}
                          {numberText(
                            bestContractProfitDollars(
                              trade
                            )
                          )}{" "}
                          $
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          الوقف
                        </p>
                        <p className="mt-1 font-black text-rose-300">
                          {numberText(
                            trade.stopPrice
                          )}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          سعر السهم الحالي
                        </p>
                        <p className="mt-1 font-black">
                          {numberText(
                            trade.currentPrice
                          )}
                        </p>
                        <p
                          className={[
                            "mt-1 text-xs font-bold",
                            performanceClass(
                              trade.currentProfitPct
                            ),
                          ].join(
                            " "
                          )}
                        >
                          {percentText(
                            trade.currentProfitPct
                          )}
                        </p>
                      </div>

                      

                      

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          أعلى هدف
                        </p>
                        <p className="mt-1 font-black text-emerald-300">
                          {trade.highestTargetHit >
                          0
                            ? `الهدف ${trade.highestTargetHit}`
                            : "لم يتحقق"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-500">
                          ربح / خسارة العقد
                        </p>

                        <p
                          dir="ltr"
                          className={[
                            "mt-1 text-lg font-black",
                            Number(
                              trade.contractProfitDollars
                            ) >= 0
                              ? "text-emerald-300"
                              : "text-rose-300",
                          ].join(" ")}
                        >
                          {Number.isFinite(
                            Number(
                              trade.contractProfitDollars
                            )
                          )
                            ? `${Number(
                                trade.contractProfitDollars
                              ) >= 0
                                ? "+"
                                : ""}$${Number(
                                trade.contractProfitDollars
                              ).toFixed(2)}`
                            : "—"}
                        </p>

                        <p
                          dir="ltr"
                          className={[
                            "mt-1 text-xs font-bold",
                            Number(
                              trade.contractProfitPct
                            ) >= 0
                              ? "text-emerald-400"
                              : "text-rose-400",
                          ].join(" ")}
                        >
                          {Number.isFinite(
                            Number(
                              trade.contractProfitPct
                            )
                          )
                            ? `${Number(
                                trade.contractProfitPct
                              ) >= 0
                                ? "+"
                                : ""}${Number(
                                trade.contractProfitPct
                              ).toFixed(2)}%`
                            : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold text-slate-500">
                        أهداف السهم
                      </p>

                      <TargetList
                        targets={
                          trade.targets
                        }
                        highestTargetHit={
                          trade.highestTargetHit
                        }
                      />
                    </div>

                    <p className="mt-4 break-all text-xs text-slate-600">
                      رمز العقد:{" "}
                      {
                        trade.contractTicker
                      }
                    </p>

                    <Link
                      href={`/stocks/${trade.symbol}`}
                      className="mt-4 flex w-full items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-3 text-sm font-black text-cyan-200 transition duration-200 hover:border-cyan-300/50 hover:bg-cyan-400/[0.14]"
                    >
                      📊 تحليل السهم
                    </Link>
                  </article>
                )
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}