import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActiveSide = "CALL" | "PUT";

type Target = {
  index: number;
  price: number;
};

type SetupRow = {
  id: string;
  symbol: string;
  side: ActiveSide;
  contract_ticker: string;

  entry_price: number | string;
  stop_price: number | string | null;

  contract_entry_price?:
  number | string | null;

contract_current_price?:
  number | string | null;

contract_best_price?:
  number | string | null;

contract_best_price_at?:
  string | null;

contract_stop_price?:
  number | string | null;

contract_bid?:
  number | string | null;

contract_ask?:
  number | string | null;

contract_profit_dollars?:
  number | string | null;

contract_profit_pct?:
  number | string | null;

contract_quote_at?:
  string | null;

last_profit_step?:
  number | string | null;

closed_at?:
  string | null;

close_reason?:
  string | null;

  gamma_targets: unknown;
  gamma_snapshot: unknown;

  activated_at: string | null;
  first_seen_at: string;

  contract_strike:
    | number
    | string
    | null;

  contract_expiration:
    | string
    | null;

  current_price:
    | number
    | string
    | null;

  best_price:
    | number
    | string
    | null;

  best_price_at:
    | string
    | null;

  current_profit_pct:
    | number
    | string
    | null;

  highest_target_hit:
    | number
    | null;

  contract_status:
    | string
    | null;

  status: string;

  invalidation_reason?: string | null;
  invalidated_at?: string | null;
};

function numberValue(
  value: unknown,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function round(
  value: number,
  digits = 2
) {
  const factor = 10 ** digits;

  return (
    Math.round(value * factor) /
    factor
  );
}

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ||
    process.env
      .SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  return createClient(
    url,
    secret,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function normalizeTargets(
  value: unknown
): Target[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const target =
        item &&
        typeof item === "object"
          ? (item as Record<
              string,
              unknown
            >)
          : {};

      return {
        index: numberValue(
          target.index,
          index + 1
        ),
        price: numberValue(
          target.price
        ),
      };
    })
    .filter(
      (target) =>
        target.price > 0
    )
    .sort(
      (first, second) =>
        first.index -
        second.index
    )
    .slice(0, 3);
}

function getSelectedContract(
  value: unknown
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const snapshot =
    value as Record<
      string,
      unknown
    >;

  const contract =
    snapshot.selectedContract;

  if (
    !contract ||
    typeof contract !== "object"
  ) {
    return null;
  }

  return contract as Record<
    string,
    unknown
  >;
}

function calculateHighestTarget(
  side: ActiveSide,
  bestPrice: number,
  targets: Target[],
  storedHighest: number
) {
  const calculatedHighest =
    targets.reduce(
      (highest, target) => {
        const reached =
          side === "CALL"
            ? bestPrice >=
              target.price
            : bestPrice <=
              target.price;

        return reached
          ? Math.max(
              highest,
              target.index
            )
          : highest;
      },
      0
    );

  return Math.max(
    storedHighest,
    calculatedHighest
  );
}

function calculateStatus(
  side: ActiveSide,
  currentPrice: number,
  stopPrice: number | null,
  highestTargetHit: number,
  storedStatus: string
) {
  const normalizedStoredStatus =
    storedStatus.toUpperCase();

  if (
    normalizedStoredStatus ===
      "EXPIRED" ||
    normalizedStoredStatus ===
      "STOPPED"
  ) {
    return normalizedStoredStatus;
  }

  const stopped =
    stopPrice !== null &&
    (
      side === "CALL"
        ? currentPrice <= stopPrice
        : currentPrice >= stopPrice
    );

  if (stopped) {
    return "STOPPED";
  }

  if (highestTargetHit >= 3) {
    return "TARGET_3";
  }

  if (highestTargetHit === 2) {
    return "TARGET_2";
  }

  if (highestTargetHit === 1) {
    return "TARGET_1";
  }

  return "ACTIVE";
}

function statusLabel(
  status: string
) {
  if (status === "TARGET_1") {
    return "تحقق الهدف الأول";
  }

  if (status === "TARGET_2") {
    return "تحقق الهدف الثاني";
  }

  if (status === "TARGET_3") {
    return "تحقق الهدف الثالث";
  }

  if (status === "STOPPED") {
    return "ضرب الوقف";
  }

  if (status === "EXPIRED") {
    return "منتهي";
  }

  return "نشط";
}

function mapTrade(
  row: SetupRow
) {
  const selectedContract =
    getSelectedContract(
      row.gamma_snapshot
    );

  const entryPrice =
    numberValue(
      row.entry_price
    );

  const currentPrice =
    numberValue(
      row.current_price,
      entryPrice
    );

  const bestPrice =
    numberValue(
      row.best_price,
      entryPrice
    );

  const stopPrice =
    row.stop_price === null
      ? null
      : numberValue(
          row.stop_price
        );

  const targets =
    normalizeTargets(
      row.gamma_targets
    );

  const highestTargetHit =
    calculateHighestTarget(
      row.side,
      bestPrice,
      targets,
      numberValue(
        row.highest_target_hit
      )
    );

  const contractStatus =
    calculateStatus(
      row.side,
      currentPrice,
      stopPrice,
      highestTargetHit,
      String(
        row.contract_status ||
          "ACTIVE"
      )
    );

  const rawCurrentMove =
    entryPrice > 0
      ? ((currentPrice -
          entryPrice) /
          entryPrice) *
        100
      : 0;

  const currentProfitPct =
    row.side === "PUT"
      ? -rawCurrentMove
      : rawCurrentMove;

  const rawBestMove =
    entryPrice > 0
      ? ((bestPrice -
          entryPrice) /
          entryPrice) *
        100
      : 0;

  const bestProfitPct =
    row.side === "PUT"
      ? -rawBestMove
      : rawBestMove;

  return {
    id: row.id,

    activatedAt:
      row.activated_at ||
      row.first_seen_at,

    symbol:
      row.symbol,

    side:
      row.side,

    sideLabel:
      row.side === "CALL"
        ? "كول"
        : "بوت",

    contractTicker:
      row.contract_ticker,

    contractStrike:
      numberValue(
        row.contract_strike,
        numberValue(
          selectedContract?.strike
        )
      ),

    contractExpiration:
      row.contract_expiration ||
      String(
        selectedContract
          ?.expiration ||
          ""
      ),

    entryPrice:
      round(entryPrice),

    stopPrice:
      stopPrice === null
        ? null
        : round(stopPrice),

    targets: targets.map(
      (target) => ({
        ...target,
        price: round(
          target.price
        ),
      })
    ),

    currentPrice:
      round(currentPrice),

    bestPrice:
      round(bestPrice),

    bestPriceAt:
      row.best_price_at,

    currentProfitPct:
      round(
        currentProfitPct
      ),

    bestProfitPct:
      round(
        bestProfitPct
      ),

      contractEntryPrice:
  numberValue(
    row.contract_entry_price
  ),

contractCurrentPrice:
  numberValue(
    row.contract_current_price
  ),

contractBestPrice:
  numberValue(
    row.contract_best_price
  ),

contractBid:
  numberValue(
    row.contract_bid
  ),

contractAsk:
  numberValue(
    row.contract_ask
  ),

contractProfitDollars:
  numberValue(
    row.contract_profit_dollars
  ),

contractProfitPct:
  numberValue(
    row.contract_profit_pct
  ),

contractStopPrice:
  numberValue(
    row.contract_stop_price
  ),

contractQuoteAt:
  row.contract_quote_at,

closedAt:
  row.closed_at,

closeReason:
  row.close_reason,

    warningMessage:
      String(row.contract_status || "") === "STOPPED"
        ? null
        : row.invalidation_reason || null,

    warningAt:
      row.invalidated_at || null,

    highestTargetHit,

    contractStatus,

    statusLabel:
      statusLabel(
        contractStatus
      ),
  };
}

type MassiveContractLivePrice = {
  bid: number;
  ask: number;
  midpoint: number;
  currentPrice: number;
  stockPrice: number;
  quoteAt: string;
};

function activeTradeRecord(
  value: unknown
): Record<string, unknown> {
  return value !== null &&
    typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function activeTradeNumber(
  value: unknown
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

async function fetchMassiveContractLivePrice(
  symbol: string,
  contractTicker: string,
  apiKey: string
): Promise<MassiveContractLivePrice> {
  const url =
    `https://api.massive.com/v3/snapshot/options/` +
    `${encodeURIComponent(symbol)}/` +
    `${encodeURIComponent(contractTicker)}` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `تعذر جلب سعر العقد من Massive: ${response.status}`
    );
  }

  const payload =
    activeTradeRecord(
      await response.json()
    );

  const results =
    activeTradeRecord(
      payload.results
    );

  const quote =
    activeTradeRecord(
      results.last_quote
    );

  const trade =
    activeTradeRecord(
      results.last_trade
    );

  const underlying =
    activeTradeRecord(
      results.underlying_asset
    );

  const bid =
    activeTradeNumber(quote.bid);

  const ask =
    activeTradeNumber(quote.ask);

  const midpoint =
    activeTradeNumber(
      quote.midpoint
    );

  const lastTradePrice =
    activeTradeNumber(
      trade.price
    );

  const calculatedMidpoint =
    bid > 0 && ask > 0
      ? (bid + ask) / 2
      : midpoint;

  const currentPrice =
    calculatedMidpoint > 0
      ? calculatedMidpoint
      : lastTradePrice > 0
        ? lastTradePrice
        : bid;

  if (currentPrice <= 0) {
    throw new Error(
      "لم يرجع Massive سعرًا صالحًا للعقد"
    );
  }

  return {
    bid,
    ask,
    midpoint:
      calculatedMidpoint,
    currentPrice,
    stockPrice:
      activeTradeNumber(
        underlying.price
      ),
    quoteAt:
      new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const supabase =
      createAdminClient();

      const massiveApiKey =
  process.env.MASSIVE_API_KEY;

if (!massiveApiKey) {
  throw new Error(
    "متغير MASSIVE_API_KEY غير موجود"
  );
}

    const {
      data,
      error,
    } = await supabase
      .from(
        "stock_trade_setups"
      )
      .select("*")
      .in(
        "status",
        [
          "active",
          "stopped",
          "ACTIVE",
          "STOPPED",
        ]
      )
      .order(
        "activated_at",
        {
          ascending: false,
          nullsFirst: false,
        }
      );

    if (error) {
      throw error;
    }

    const refreshedRows =
  await Promise.all(
    (data || []).map(
      async (rawRow) => {
        const row =
          activeTradeRecord(
            rawRow
          );

        const id =
          String(row.id || "");

        const symbol =
          String(
            row.symbol || ""
          );

        const contractTicker =
          String(
            row.contract_ticker ||
              ""
          );

          const savedStatus =
            String(
              row.status || ""
            ).toUpperCase();

          const savedContractStatus =
            String(
              row.contract_status || ""
            ).toUpperCase();

        if (
          !id ||
          !symbol ||
          !contractTicker.startsWith(
            "O:"
          )
        ) {
          return rawRow;
        }

        try {
          const live =
            await fetchMassiveContractLivePrice(
              symbol,
              contractTicker,
              massiveApiKey
            );

          const gammaSnapshot =
            activeTradeRecord(
              row.gamma_snapshot
            );

          const selectedContract =
            activeTradeRecord(
              gammaSnapshot
                .selectedContract
            );

          const savedEntry =
            activeTradeNumber(
              row.contract_entry_price
            );

          const originalAsk =
            activeTradeNumber(
              selectedContract.ask
            );

          const originalMidpoint =
            activeTradeNumber(
              selectedContract.midpoint
            );

          const contractEntryPrice =
            savedEntry > 0
              ? savedEntry
              : originalAsk > 0
                ? originalAsk
                : originalMidpoint >
                    0
                  ? originalMidpoint
                  : live.ask > 0
                    ? live.ask
                    : live.currentPrice;

          const previousContractBest =
            activeTradeNumber(
              row.contract_best_price
            );

          const contractBestPrice =
            Math.max(
              previousContractBest,
              contractEntryPrice,
              live.currentPrice
            );

          const profitDollars =
            Math.round(
              (live.currentPrice -
                contractEntryPrice) *
                100 *
                100
            ) / 100;

          const profitPct =
            contractEntryPrice > 0
              ? Math.round(
                  ((live.currentPrice -
                    contractEntryPrice) /
                    contractEntryPrice) *
                    100 *
                    100
                ) / 100
              : 0;

          const previousStockPrice =
            activeTradeNumber(
              row.current_price
            );

          const stockPrice =
            live.stockPrice > 0
              ? live.stockPrice
              : previousStockPrice;

          const side =
            String(row.side || "");

          const previousBestStock =
            activeTradeNumber(
              row.best_price
            );

          const bestStockPrice =
            side === "PUT"
              ? previousBestStock > 0
                ? Math.min(
                    previousBestStock,
                    stockPrice
                  )
                : stockPrice
              : Math.max(
                  previousBestStock,
                  stockPrice
                );

          const stopPrice =
            activeTradeNumber(
              row.stop_price
            );

          const stopped =
            stopPrice > 0 &&
            stockPrice > 0 &&
            (side === "CALL"
              ? stockPrice <=
                stopPrice
              : side === "PUT"
                ? stockPrice >=
                  stopPrice
                : false);

          const nowIso =
            live.quoteAt;

          const {
            data: updated,
            error: updateError,
          } = await supabase
            .from(
              "stock_trade_setups"
            )
            .update({
              current_price:
                stockPrice,

              best_price:
                bestStockPrice,

              best_price_at:
                bestStockPrice !==
                previousBestStock
                  ? nowIso
                  : row.best_price_at,

              contract_entry_price:
                contractEntryPrice,

              contract_current_price:
                live.currentPrice,

              contract_best_price:
                contractBestPrice,

              contract_best_price_at:
                contractBestPrice !==
                previousContractBest
                  ? nowIso
                  : row.contract_best_price_at,

              contract_bid:
                live.bid,

              contract_ask:
                live.ask,

              contract_profit_dollars:
                profitDollars,

              contract_profit_pct:
                profitPct,

              contract_quote_at:
                nowIso,

              contract_stop_price:
                stopped
                  ? live.currentPrice
                  : row.contract_stop_price,

              contract_status:
                stopped
                  ? "STOPPED"
                  : row.contract_status ||
                    "ACTIVE",

              closed_at:
                stopped
                  ? nowIso
                  : row.closed_at,

              close_reason:
                stopped
                  ? "ضرب وقف القاما"
                  : row.close_reason,
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
                "تعذر تحديث الصفقة"
              )
            );
          }

          if (stopped) {
            await supabase
              .from(
                "stock_trade_updates"
              )
              .insert({
                setup_id: id,
                event_type:
                  "STOPPED",
                contract_price:
                  live.currentPrice,
                profit_dollars:
                  profitDollars,
                profit_pct:
                  profitPct,
                message:
                  "ضرب وقف القاما وانتهت متابعة الصفقة",
              });
          }

          return updated;
        } catch (
          refreshError
        ) {
          const errorRecord =
            refreshError &&
            typeof refreshError === "object"
              ? (refreshError as Record<
                  string,
                  unknown
                >)
              : {};

          const errorDetails = {
            message:
              refreshError instanceof Error
                ? refreshError.message
                : errorRecord.message,
            details:
              errorRecord.details,
            hint:
              errorRecord.hint,
            code:
              errorRecord.code,
            status:
              errorRecord.status,
          };

          console.error(
            `تعذر تحديث عقد ${contractTicker}: ${JSON.stringify(
              errorDetails
            )}`
          );

          return rawRow;
        }
      }
    )
  );

    const trades =
      (
        (refreshedRows || []) as
          SetupRow[]
      )
        .map(mapTrade)
        .filter((trade) => {
      if (trade.contractStatus === "STOPPED") {
        const closedTime =
          Date.parse(trade.closedAt || "");

        if (!Number.isFinite(closedTime)) {
          return true;
        }

        return (
          Date.now() - closedTime <=
          24 * 60 * 60 * 1000
        );
      }

      return (
        trade.contractStatus === "ACTIVE" ||
        trade.contractStatus === "TARGET_1" ||
        trade.contractStatus === "TARGET_2" ||
        trade.contractStatus === "TARGET_3"
      );
    });

    return NextResponse.json(
      {
        ok: true,
        updatedAt:
          new Date()
            .toISOString(),
        count:
          trades.length,
        trades,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Active trades API error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل الصفقات النشطة",
      },
      {
        status: 500,
      }
    );
  }
}