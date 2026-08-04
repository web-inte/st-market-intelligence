import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DataRecord = Record<string, unknown>;

function record(value: unknown): DataRecord {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function numberValue(
  value: unknown,
  fallback = 0
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function textValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function round(
  value: number,
  digits = 2
): number {
  const factor = 10 ** digits;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor
    ) / factor
  );
}

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير مكتملة"
    );
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function nanosecondsToIso(
  value: unknown
): string | null {
  const nanoseconds = Number(value);

  if (
    !Number.isFinite(nanoseconds) ||
    nanoseconds <= 0
  ) {
    return null;
  }

  const milliseconds =
    Math.floor(
      nanoseconds / 1_000_000
    );

  const date =
    new Date(milliseconds);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

async function fetchContractSnapshot(
  contractTicker: string,
  apiKey: string
) {
  const normalizedTicker =
    contractTicker.startsWith("O:")
      ? contractTicker
      : `O:${contractTicker}`;

  const url =
    "https://api.massive.com/v3/snapshot/options/" +
    `I%3ASPX/${encodeURIComponent(
      normalizedTicker
    )}` +
    `?apiKey=${encodeURIComponent(
      apiKey
    )}`;

  const response =
    await fetch(url, {
      cache: "no-store",
      signal:
        AbortSignal.timeout(4_000),
    });

  if (!response.ok) {
    throw new Error(
      `تعذر جلب سعر العقد: ${response.status}`
    );
  }

  const payload =
    record(await response.json());

  const result =
    record(payload.results);

  const quote =
    record(result.last_quote);

  const trade =
    record(result.last_trade);

  const bid =
    numberValue(quote.bid);

  const ask =
    numberValue(quote.ask);

  const midpoint =
    numberValue(
      quote.midpoint
    ) > 0
      ? numberValue(
          quote.midpoint
        )
      : bid > 0 && ask > 0
        ? (bid + ask) / 2
        : 0;

  const lastPrice =
    numberValue(trade.price);

  const quoteTimestamp =
    nanosecondsToIso(
      quote.last_updated
    );

  const tradeTimestamp =
    nanosecondsToIso(
      trade.sip_timestamp
    );

  const quoteTimeMs =
    quoteTimestamp
      ? new Date(
          quoteTimestamp
        ).getTime()
      : 0;

  const tradeTimeMs =
    tradeTimestamp
      ? new Date(
          tradeTimestamp
        ).getTime()
      : 0;

  const currentPrice =
    bid > 0
      ? bid
      : midpoint > 0
        ? midpoint
        : lastPrice;

  const tradeIsNewest =
    lastPrice > 0 &&
    tradeTimeMs > quoteTimeMs;

  const displayPrice =
    tradeIsNewest
      ? lastPrice
      : midpoint > 0
        ? midpoint
        : bid > 0
          ? bid
          : lastPrice;

  if (
    currentPrice <= 0 ||
    displayPrice <= 0
  ) {
    throw new Error(
      "لم يرجع Massive سعرًا صالحًا للعقد"
    );
  }

  return {
    bid: round(bid),
    ask: round(ask),
    currentPrice:
      round(currentPrice),
    displayPrice:
      round(displayPrice),
    priceSource:
      tradeIsNewest
        ? "LAST_TRADE"
        : midpoint > 0
          ? "MIDPOINT"
          : "BID",
    quoteAt:
      (
        tradeIsNewest
          ? tradeTimestamp
          : quoteTimestamp ||
            tradeTimestamp
      ) ||
      new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const massiveApiKey =
      process.env.MASSIVE_API_KEY;

    if (!massiveApiKey) {
      throw new Error(
        "متغير MASSIVE_API_KEY غير موجود"
      );
    }

    const supabase =
      createAdminClient();

    const {
      data: liveTrades,
      error: liveError,
    } = await supabase
      .from("spx_trade_setups")
      .select("*")
      .in("status", [
        "ACTIVE",
        "WATCH",
      ])
      .order("created_at", {
        ascending: false,
      })
      .limit(3);

    if (liveError) {
      throw liveError;
    }

    if (
      !liveTrades ||
      liveTrades.length === 0
    ) {
      return NextResponse.json(
        {
          ok: true,
          activeTrades: [],
          activeTrade: null,
          updated: false,
          message:
            "لا توجد صفقات SPX نشطة.",
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    const results =
      await Promise.all(
        liveTrades.map(
          async (liveTrade) => {
            try {
              const snapshot =
                await fetchContractSnapshot(
                  textValue(
                    liveTrade.option_ticker
                  ),
                  massiveApiKey
                );

              const entryPrice =
                numberValue(
                  liveTrade.entry_price
                );

              const previousBest =
                numberValue(
                  liveTrade.best_price,
                  entryPrice
                );

              const previousLowest =
                numberValue(
                  liveTrade.lowest_price,
                  entryPrice
                );

              const bestPrice =
                Math.max(
                  previousBest,
                  snapshot.currentPrice
                );

              const lowestPrice =
                Math.min(
                  previousLowest,
                  snapshot.currentPrice
                );

              const currentProfitDollars =
                round(
                  (
                    snapshot.currentPrice -
                    entryPrice
                  ) * 100
                );

              const currentProfitPct =
                entryPrice > 0
                  ? round(
                      (
                        (
                          snapshot.currentPrice -
                          entryPrice
                        ) /
                        entryPrice
                      ) * 100
                    )
                  : 0;

              const bestProfitDollars =
                round(
                  (
                    bestPrice -
                    entryPrice
                  ) * 100
                );

              const bestProfitPct =
                entryPrice > 0
                  ? round(
                      (
                        (
                          bestPrice -
                          entryPrice
                        ) /
                        entryPrice
                      ) * 100
                    )
                  : 0;

              /*
                نفس حماية الربح الحالية دون تعديل:
                بعد تحقيق 100$ ثم الهبوط إلى -100$.
              */
              const profitProtectionStopped =
                bestProfitDollars >= 100 &&
                currentProfitDollars <= -100;

              const stoppedAt =
                profitProtectionStopped
                  ? new Date().toISOString()
                  : null;

              const hiddenAfter =
                profitProtectionStopped
                  ? new Date(
                      Date.now() +
                        30 *
                          60 *
                          1000
                    ).toISOString()
                  : null;

              const {
                data: updatedTrade,
                error: updateError,
              } = await supabase
                .from(
                  "spx_trade_setups"
                )
                .update({
                  current_price:
                    snapshot.currentPrice,

                  current_bid:
                    snapshot.bid,

                  current_ask:
                    snapshot.ask,

                  best_price:
                    bestPrice,

                  lowest_price:
                    lowestPrice,

                  best_price_at:
                    bestPrice >
                    previousBest
                      ? snapshot.quoteAt
                      : liveTrade.best_price_at,

                  current_profit_dollars:
                    currentProfitDollars,

                  current_profit_pct:
                    currentProfitPct,

                  best_profit_dollars:
                    bestProfitDollars,

                  best_profit_pct:
                    bestProfitPct,

                  last_quote_at:
                    snapshot.quoteAt,

                  last_error:
                    null,

                  ...(profitProtectionStopped
                    ? {
                        status:
                          "STOPPED",

                        stopped_at:
                          stoppedAt,

                        closed_at:
                          stoppedAt,

                        hidden_after:
                          hiddenAfter,

                        stop_contract_price:
                          snapshot.currentPrice,

                        stop_profit_dollars:
                          currentProfitDollars,

                        stop_profit_pct:
                          currentProfitPct,

                        stop_reason:
                          "حقق العقد 100$ أو أكثر ثم تراجع إلى خسارة 100$ أو أكثر",

                        close_reason:
                          "PROFIT_PROTECTION_DRAWDOWN",
                      }
                    : {}),
                })
                .eq(
                  "id",
                  liveTrade.id
                )
                .in("status", [
                  "ACTIVE",
                  "WATCH",
                ])
                .select("*")
                .maybeSingle();

              if (updateError) {
                throw updateError;
              }

              if (!updatedTrade) {
                return null;
              }

              return {
                ...updatedTrade,

                display_price:
                  snapshot.displayPrice,

                display_price_source:
                  snapshot.priceSource,
              };
            } catch (error) {
              console.warn(
                "تعذر تحديث عقد SPX:",
                {
                  id:
                    liveTrade.id,
                  ticker:
                    liveTrade.option_ticker,
                  error:
                    error instanceof Error
                      ? error.message
                      : "خطأ غير معروف",
                }
              );

              /*
                فشل عقد واحد لا يمنع تحديث
                بقية العقود المفتوحة.
              */
              return {
                ...liveTrade,
                last_error:
                  error instanceof Error
                    ? error.message
                    : "تعذر تحديث العقد",
              };
            }
          }
        )
      );

    const activeTrades =
      results.filter(
        (
          trade
        ): trade is NonNullable<
          typeof trade
        > => trade !== null
      );

    return NextResponse.json(
      {
        ok: true,
        activeTrades,

        /*
          نبقي activeTrade مؤقتًا للتوافق
          مع الواجهة القديمة.
        */
        activeTrade:
          activeTrades[0] || null,

        updated: true,
        updatedAt:
          new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير معروف",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  }
}
