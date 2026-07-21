import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DataRecord = Record<string, unknown>;

type LiveContract = {
  ticker: string;
  strike: number;
  expiration: string | null;
  side: "CALL" | "PUT";
  bid: number;
  ask: number;
  midpoint: number;
  currentPrice: number;
  stockPrice: number;
  delta: number;
  spreadPct: number;
  openInterest: number;
  quoteAt: string;
};

function record(value: unknown): DataRecord {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function textValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;

  return (
    Math.round(value * factor) /
    factor
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

function getProcessedSource(value: unknown) {
  const source = record(value);
  const raw = record(source.raw);
  const processed = record(
    raw.full_processed_row
  );

  return {
    ...source,
    ...processed,
  };
}

function normalizeSide(
  value: unknown
): "CALL" | "PUT" | null {
  const side = textValue(value).toUpperCase();

  if (side === "CALL" || side === "C") {
    return "CALL";
  }

  if (side === "PUT" || side === "P") {
    return "PUT";
  }

  return null;
}

function normalizeTicker(value: unknown) {
  const ticker = textValue(value);

  if (!ticker) {
    return "";
  }

  return ticker.startsWith("O:")
    ? ticker
    : `O:${ticker}`;
}

function normalizeUnderlyingSymbol(
  symbol: string,
  contractTicker = ""
) {
  const normalizedSymbol =
    symbol.trim().toUpperCase();

  const normalizedTicker =
    contractTicker.trim().toUpperCase();

  if (
    normalizedSymbol === "SPX" ||
    normalizedSymbol === "SPXW" ||
    normalizedTicker.startsWith("O:SPX")
  ) {
    return "I:SPX";
  }

  return normalizedSymbol;
}

function getExpiration(
  source: DataRecord
) {
  return (
    textValue(source.expiration) ||
    textValue(source.expiration_date) ||
    null
  );
}

function getStrike(source: DataRecord) {
  return numberValue(
    source.strike ??
      source.strike_price
  );
}

async function fetchContractSnapshot(
  symbol: string,
  contractTicker: string,
  apiKey: string
): Promise<LiveContract> {
  const underlyingSymbol =
    normalizeUnderlyingSymbol(
      symbol,
      contractTicker
    );

  const url =
    `https://api.massive.com/v3/snapshot/options/` +
    `${encodeURIComponent(underlyingSymbol)}/` +
    `${encodeURIComponent(contractTicker)}` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `تعذر جلب العقد ${contractTicker}: ${response.status}`
    );
  }

  const payload = record(
    await response.json()
  );

  const result = record(payload.results);
  const details = record(result.details);
  const quote = record(result.last_quote);
  const trade = record(result.last_trade);
  const greeks = record(result.greeks);
  const underlying = record(
    result.underlying_asset
  );

  const bid = numberValue(quote.bid);
  const ask = numberValue(quote.ask);

  const midpoint =
    numberValue(quote.midpoint) > 0
      ? numberValue(quote.midpoint)
      : bid > 0 && ask > 0
        ? (bid + ask) / 2
        : 0;

  const lastPrice =
    numberValue(trade.price);

  const currentPrice =
    bid > 0
      ? bid
      : midpoint > 0
        ? midpoint
        : lastPrice;

  if (currentPrice <= 0) {
    throw new Error(
      "لم يرجع Massive سعرًا صالحًا للعقد"
    );
  }

  const spreadPct =
    midpoint > 0 && ask > bid
      ? ((ask - bid) / midpoint) * 100
      : 0;

  const side =
    normalizeSide(
      details.contract_type
    );

  if (!side) {
    throw new Error(
      "تعذر تحديد نوع العقد"
    );
  }

  return {
    ticker:
      normalizeTicker(
        details.ticker ||
          contractTicker
      ),
    strike: numberValue(
      details.strike_price
    ),
    expiration:
      textValue(
        details.expiration_date
      ) || null,
    side,
    bid: round(bid),
    ask: round(ask),
    midpoint: round(midpoint),
    currentPrice: round(currentPrice),
    stockPrice: round(
      numberValue(underlying.price)
    ),
    delta: numberValue(greeks.delta),
    spreadPct: round(spreadPct),
    openInterest: numberValue(
      result.open_interest
    ),
    quoteAt:
      new Date().toISOString(),
  };
}

async function findAlternativeContract(input: {
  symbol: string;
  side: "CALL" | "PUT";
  expiration: string | null;
  originalStrike: number;
  apiKey: string;
}) {
  const params = new URLSearchParams({
    contract_type:
      input.side === "CALL"
        ? "call"
        : "put",
    limit: "250",
    apiKey: input.apiKey,
  });

  if (input.expiration) {
    params.set(
      "expiration_date",
      input.expiration
    );
  }

  const underlyingSymbol =
    normalizeUnderlyingSymbol(
      input.symbol
    );

  const url =
    `https://api.massive.com/v3/snapshot/options/` +
    `${encodeURIComponent(underlyingSymbol)}?` +
    params.toString();

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `تعذر تحميل العقود البديلة: ${response.status}`
    );
  }

  const payload = record(
    await response.json()
  );

  const results = Array.isArray(
    payload.results
  )
    ? payload.results
    : [];

  const candidates = results
    .map((item) => {
      const contract = record(item);
      const details = record(
        contract.details
      );
      const quote = record(
        contract.last_quote
      );
      const trade = record(
        contract.last_trade
      );
      const greeks = record(
        contract.greeks
      );
      const underlying = record(
        contract.underlying_asset
      );

      const ticker =
        normalizeTicker(
          details.ticker
        );

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

      const currentPrice =
        ask > 0
          ? ask
          : midpoint > 0
            ? midpoint
            : lastPrice;

      const delta = Math.abs(
        numberValue(greeks.delta)
      );

      const spreadPct =
        midpoint > 0 &&
        ask > bid
          ? ((ask - bid) /
              midpoint) *
            100
          : 999;

      const strike =
        numberValue(
          details.strike_price
        );

      const openInterest =
        numberValue(
          contract.open_interest
        );

      return {
        ticker,
        strike,
        expiration:
          textValue(
            details.expiration_date
          ) || null,
        side: input.side,
        bid: round(bid),
        ask: round(ask),
        midpoint:
          round(midpoint),
        currentPrice:
          round(currentPrice),
        stockPrice:
          round(
            numberValue(
              underlying.price
            )
          ),
        delta,
        spreadPct:
          round(spreadPct),
        openInterest,
        quoteAt:
          new Date().toISOString(),
      } satisfies LiveContract;
    })
    .filter((contract) => {
      return (
        contract.ticker &&
        contract.currentPrice > 0 &&
        contract.currentPrice <= 3 &&
        contract.delta >= 0.25 &&
        contract.delta <= 0.55 &&
        contract.spreadPct <= 15
      );
    })
    .sort((first, second) => {
      const firstStrikeDistance =
        Math.abs(
          first.strike -
            input.originalStrike
        );

      const secondStrikeDistance =
        Math.abs(
          second.strike -
            input.originalStrike
        );

      const firstDeltaDistance =
        Math.abs(
          first.delta - 0.4
        );

      const secondDeltaDistance =
        Math.abs(
          second.delta - 0.4
        );

      const firstScore =
        firstStrikeDistance * 2 +
        firstDeltaDistance * 20 +
        first.spreadPct * 0.3 -
        Math.min(
          first.openInterest,
          5000
        ) *
          0.001;

      const secondScore =
        secondStrikeDistance * 2 +
        secondDeltaDistance * 20 +
        second.spreadPct * 0.3 -
        Math.min(
          second.openInterest,
          5000
        ) *
          0.001;

      return firstScore - secondScore;
    });

  return candidates[0] || null;
}


function buildWhaleStockPlan(
  stockEntryPrice: number,
  side: string,
  gammaValue: number
) {
  const normalizedSide =
    String(side || "").toUpperCase();

  const direction =
    normalizedSide === "PUT"
      ? -1
      : 1;

  const gammaRiskAdjustment =
    Math.min(
      Math.abs(gammaValue) * 0.6,
      0.012
    );

  const riskPct =
    Math.min(
      0.02,
      Math.max(
        0.008,
        0.008 + gammaRiskAdjustment
      )
    );

  const riskDistance =
    stockEntryPrice * riskPct;

  return {
    stopPrice: round(
      stockEntryPrice -
        direction * riskDistance
    ),
    targets: [
      round(
        stockEntryPrice +
          direction * riskDistance
      ),
      round(
        stockEntryPrice +
          direction * riskDistance * 2
      ),
      round(
        stockEntryPrice +
          direction * riskDistance * 3
      ),
    ],
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
      data,
      error,
    } = await supabase
      .from("whale_trade_setups")
      .select("*")
      .in("status", [
        "PENDING_CONTRACT",
        "ACTIVE",
        "TARGET_1",
        "TARGET_2",
        "TARGET_3",
        "STOPPED",
        "EXPIRED",
        "ERROR",
      ])
      .order("created_at", {
        ascending: false,
      })
      .limit(200);

    if (error) {
      throw error;
    }

    const refreshed =
      await Promise.all(
        (data || []).map(
          async (row) => {
            const id =
              numberValue(row.id);

            const status =
              textValue(
                row.status
              ).toUpperCase();

            if (
              status === "STOPPED" ||
              status === "EXPIRED"
            ) {
              return row;
            }

            try {
              const source =
                getProcessedSource(
                  row.source_snapshot
                );

              const symbol =
                textValue(
                  row.symbol ||
                    source.symbol
                ).toUpperCase();

              const originalTicker =
                normalizeTicker(
                  row.original_option_ticker ||
                    source.option_ticker
                );

              const originalSide =
                normalizeSide(
                  row.original_contract_type ||
                    source.contract_type
                );

              if (
                !id ||
                !symbol ||
                !originalTicker ||
                !originalSide
              ) {
                throw new Error(
                  "بيانات صفقة الحوت غير مكتملة"
                );
              }

              let trackingTicker =
                normalizeTicker(
                  row.tracking_option_ticker
                );

              let selected:
                | LiveContract
                | null = null;

              let isAlternative =
                Boolean(
                  row.is_alternative
                );

              let alternativeReason =
                textValue(
                  row.alternative_reason
                ) || null;

              if (trackingTicker) {
                selected =
                  await fetchContractSnapshot(
                    symbol,
                    trackingTicker,
                    massiveApiKey
                  );
              } else {
                const original =
                  await fetchContractSnapshot(
                    symbol,
                    originalTicker,
                    massiveApiKey
                  );

                const originalCostPrice =
                  original.ask > 0
                    ? original.ask
                    : original.currentPrice;

                if (
                  originalCostPrice <= 3
                ) {
                  selected = original;
                  trackingTicker =
                    original.ticker;
                  isAlternative = false;
                } else {
                  const alternative =
                    await findAlternativeContract(
                      {
                        symbol,
                        side: originalSide,
                        expiration:
                          original.expiration ||
                          getExpiration(
                            source
                          ),
                        originalStrike:
                          original.strike ||
                          getStrike(
                            source
                          ),
                        apiKey:
                          massiveApiKey,
                      }
                    );

                  if (!alternative) {
                    selected = original;
                    trackingTicker =
                      original.ticker;
                    isAlternative = false;
                    alternativeReason =
                      "لا يوجد عقد مناسب بسعر 3.00$ أو أقل";
                  } else {
                    selected =
                      alternative;
                    trackingTicker =
                      alternative.ticker;
                    isAlternative = true;
                    alternativeReason =
                      "تم اعتماد أفضل عقد متاح بسعر 3.00$ أو أقل";
                  }
                }
              }

              if (!selected) {
                throw new Error(
                  "تعذر تحديد عقد المتابعة"
                );
              }

              const savedEntry =
                numberValue(
                  row.entry_price
                );

              const entryPrice =
                savedEntry > 0
                  ? savedEntry
                  : selected.ask > 0
                    ? selected.ask
                    : selected.currentPrice;

              const previousBest =
                numberValue(
                  row.best_price
                );

              const bestPrice =
                Math.max(
                  previousBest,
                  entryPrice,
                  selected.currentPrice
                );

              const profitDollars =
                round(
                  (selected.currentPrice -
                    entryPrice) *
                    100
                );

              const profitPct =
                entryPrice > 0
                  ? round(
                      ((selected.currentPrice -
                        entryPrice) /
                        entryPrice) *
                        100
                    )
                  : 0;

              const bestProfitDollars =
                round(
                  (bestPrice -
                    entryPrice) *
                    100
                );

              const bestProfitPct =
                entryPrice > 0
                  ? round(
                      ((bestPrice -
                        entryPrice) /
                        entryPrice) *
                        100
                    )
                  : 0;

              const stockEntryPrice =
                numberValue(
                  row.stock_entry_price
                ) > 0
                  ? numberValue(
                      row.stock_entry_price
                    )
                  : selected.stockPrice;

              const whaleStockPlan =
                buildWhaleStockPlan(
                  stockEntryPrice,
                  originalSide,
                  numberValue(
                    source.gamma
                  )
                );

              const {
                data: updated,
                error: updateError,
              } = await supabase
                .from(
                  "whale_trade_setups"
                )
                .update({
                  tracking_option_ticker:
                    selected.ticker,
                  tracking_side:
                    selected.side,
                  tracking_strike:
                    selected.strike,
                  tracking_expiration:
                    selected.expiration,

                  is_alternative:
                    isAlternative,

                  alternative_reason:
                    alternativeReason,

                  entry_price:
                    entryPrice,

                  current_price:
                    selected.currentPrice,

                  best_price:
                    bestPrice,

                  best_price_at:
                    bestPrice !==
                    previousBest
                      ? selected.quoteAt
                      : row.best_price_at,

                  contract_bid:
                    selected.bid,

                  contract_ask:
                    selected.ask,

                  contract_profit_dollars:
                    profitDollars,

                  contract_profit_pct:
                    profitPct,

                  best_profit_dollars:
                    bestProfitDollars,

                  best_profit_pct:
                    bestProfitPct,

                  contract_quote_at:
                    selected.quoteAt,

                  stock_entry_price:
                    stockEntryPrice,

                  stop_price:
                    whaleStockPlan.stopPrice,

                  gamma_targets:
                    whaleStockPlan.targets,

                  highest_target_hit:
                    numberValue(
                      row.highest_target_hit
                    ),

                  stock_current_price:
                    selected.stockPrice,

                  stock_best_price:
                    originalSide === "PUT"
                      ? numberValue(
                          row.stock_best_price
                        ) > 0
                        ? Math.min(
                            numberValue(
                              row.stock_best_price
                            ),
                            selected.stockPrice
                          )
                        : selected.stockPrice
                      : Math.max(
                          numberValue(
                            row.stock_best_price
                          ),
                          selected.stockPrice
                        ),

                  status: "ACTIVE",
                  contract_status:
                    "ACTIVE",

                  activated_at:
                    row.activated_at ||
                    selected.quoteAt,

                  last_error: null,
                  updated_at:
                    selected.quoteAt,
                })
                .eq("id", id)
                .select("*")
                .single();

              if (
                updateError ||
                !updated
              ) {
                throw (
                  updateError ||
                  new Error(
                    "تعذر تحديث صفقة الحوت"
                  )
                );
              }

              return updated;
            } catch (tradeError) {
              const message =
                tradeError instanceof Error
                  ? tradeError.message
                  : "خطأ غير معروف";

              await supabase
                .from(
                  "whale_trade_setups"
                )
                .update({
                  status: "ERROR",
                  contract_status:
                    "ERROR",
                  last_error:
                    message,
                  updated_at:
                    new Date().toISOString(),
                })
                .eq("id", row.id);

              return {
                ...row,
                status: "ERROR",
                contract_status:
                  "ERROR",
                last_error:
                  message,
              };
            }
          }
        )
      );

    return NextResponse.json(
      {
        ok: true,
        count: refreshed.length,
        trades: refreshed,
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
      }
    );
  }
}
