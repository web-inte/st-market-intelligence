import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DataRecord = Record<string, unknown>;

type SpxSignal = {
  ok: boolean;
  status: string;
  message?: string;
  market?: {
    stockPrice?: number;
  } | null;
  gamma?: {
    zeroGamma?: number;
    callWall?: number;
    putWall?: number;
    magnet?: number;
  } | null;
  bestContract?: {
    ticker: string;
    side: "CALL" | "PUT";
    strike: number;
    expiration: string;
    ask: number;
    bid: number;
    midpoint: number;
    price: number;
    finalScore: number;
    quality: string;
  } | null;
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
    Math.round((value + Number.EPSILON) * factor) /
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

async function fetchSpxSignal(
  request: Request
): Promise<SpxSignal> {
  const requestOrigin =
    new URL(request.url).origin;

  const internalOrigin =
    process.env.NODE_ENV === "development"
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : requestOrigin;

  const response = await fetch(
    `${internalOrigin}/api/spx-0dte`,
    {
      cache: "no-store",
      headers: {
        cookie:
          request.headers.get("cookie") || "",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `تعذر جلب تحليل SPX: ${response.status}`
    );
  }

  return response.json();
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
    `https://api.massive.com/v3/snapshot/options/` +
    `I%3ASPX/${encodeURIComponent(normalizedTicker)}` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `تعذر جلب سعر العقد: ${response.status}`
    );
  }

  const payload = record(
    await response.json()
  );

  const result = record(payload.results);
  const quote = record(result.last_quote);
  const trade = record(result.last_trade);

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

  return {
    bid: round(bid),
    ask: round(ask),
    midpoint: round(midpoint),
    currentPrice: round(currentPrice),
    quoteAt:
      new Date().toISOString(),
  };
}

function chooseInvalidationLevel(input: {
  side: "CALL" | "PUT";
  stockPrice: number;
  gamma: NonNullable<SpxSignal["gamma"]>;
}) {
  const {
    side,
    stockPrice,
    gamma,
  } = input;

  const candidates =
    side === "CALL"
      ? [
          gamma.putWall,
          gamma.zeroGamma,
          gamma.magnet,
        ]
          .map(Number)
          .filter(
            (level) =>
              Number.isFinite(level) &&
              level > 0 &&
              level < stockPrice
          )
          .sort((a, b) => b - a)
      : [
          gamma.callWall,
          gamma.zeroGamma,
          gamma.magnet,
        ]
          .map(Number)
          .filter(
            (level) =>
              Number.isFinite(level) &&
              level > stockPrice
          )
          .sort((a, b) => a - b);

  return candidates[0] || 0;
}

export async function GET(
  request: Request
) {
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

    const nowIso =
      new Date().toISOString();

    const {
      data: visibleTrades,
      error: visibleError,
    } = await supabase
      .from("spx_trade_setups")
      .select("*")
      .or(
        `status.in.(WATCH,ACTIVE),and(status.eq.STOPPED,hidden_after.gt.${nowIso})`
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(20);

    if (visibleError) {
      throw visibleError;
    }

    const liveTrade =
      (visibleTrades || []).find(
        (row) =>
          row.status === "WATCH" ||
          row.status === "ACTIVE"
      );

    const sessionOrigin =
      process.env.NODE_ENV === "development"
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : new URL(request.url).origin;

    const sessionResponse =
      await fetch(
        `${sessionOrigin}/api/market-session`,
        {
          cache: "no-store",
          headers: {
            cookie:
              request.headers.get("cookie") || "",
          },
        }
      );

    const session =
      await sessionResponse.json();

    const signal =
      await fetchSpxSignal(request);

    if (
      !liveTrade &&
      session?.isOpen === false
    ) {
      return NextResponse.json(
        {
          ok: true,
          created: false,
          activeTrade: null,
          trades:
            visibleTrades || [],
          signal,
          message:
            "السوق مغلق — لا يتم إصدار فرصة SPX جديدة.",
          marketSession:
            session,
          updatedAt:
            nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    if (liveTrade) {
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

      const currentPrice =
        snapshot.currentPrice;

      const previousBest =
        numberValue(
          liveTrade.best_price,
          entryPrice
        );

      const bestPrice =
        Math.max(
          previousBest,
          currentPrice
        );

      const currentProfitDollars =
        round(
          (currentPrice - entryPrice) *
            100
        );

      const currentProfitPct =
        entryPrice > 0
          ? round(
              ((currentPrice -
                entryPrice) /
                entryPrice) *
                100
            )
          : 0;

      const bestProfitDollars =
        round(
          (bestPrice - entryPrice) *
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

      const spxCurrentPrice =
        numberValue(
          signal.market?.stockPrice
        );

      const invalidationLevel =
        numberValue(
          liveTrade.invalidation_level
        );

      const side =
        textValue(
          liveTrade.side
        ).toUpperCase();

      const stopped =
        invalidationLevel > 0 &&
        spxCurrentPrice > 0 &&
        (
          (
            side === "CALL" &&
            spxCurrentPrice <=
              invalidationLevel
          ) ||
          (
            side === "PUT" &&
            spxCurrentPrice >=
              invalidationLevel
          )
        );

      const stoppedAt =
        stopped ? nowIso : null;

      const hiddenAfter =
        stopped
          ? new Date(
              Date.now() +
                30 *
                  60 *
                  60 *
                  1000
            ).toISOString()
          : null;

      const updatePayload = {
        current_price:
          currentPrice,

        current_bid:
          snapshot.bid,

        current_ask:
          snapshot.ask,

        best_price:
          bestPrice,

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

        spx_current_price:
          spxCurrentPrice || null,

        last_quote_at:
          snapshot.quoteAt,

        last_error:
          null,

        ...(stopped
          ? {
              status: "STOPPED",
              stopped_at:
                stoppedAt,
              closed_at:
                stoppedAt,
              hidden_after:
                hiddenAfter,
              stop_contract_price:
                currentPrice,
              stop_profit_dollars:
                currentProfitDollars,
              stop_profit_pct:
                currentProfitPct,
              stop_reason:
                `كسر مستوى الإبطال ${invalidationLevel}`,
              close_reason:
                "SPX_INVALIDATION",
            }
          : {
              status: "ACTIVE",
            }),
      };

      const {
        data: updatedTrade,
        error: updateError,
      } = await supabase
        .from("spx_trade_setups")
        .update(updatePayload)
        .eq("id", liveTrade.id)
        .select("*")
        .single();

      if (
        updateError ||
        !updatedTrade
      ) {
        throw (
          updateError ||
          new Error(
            "تعذر تحديث صفقة SPX"
          )
        );
      }

      await supabase
        .from("spx_trade_updates")
        .insert({
          setup_id:
            updatedTrade.id,

          event_type:
            stopped
              ? "STOPPED"
              : "UPDATED",

          contract_price:
            currentPrice,

          profit_dollars:
            currentProfitDollars,

          profit_pct:
            currentProfitPct,

          message:
            stopped
              ? `ضرب وقف SPX عند مستوى ${invalidationLevel}`
              : "تم تحديث صفقة SPX",

          metadata: {
            spxCurrentPrice,
            invalidationLevel,
            bid: snapshot.bid,
            ask: snapshot.ask,
            bestPrice,
            bestProfitDollars,
            bestProfitPct,
          },
        });

      const {
        data: latestTrades,
        error: latestError,
      } = await supabase
        .from("spx_trade_setups")
        .select("*")
        .or(
          `status.in.(WATCH,ACTIVE),and(status.eq.STOPPED,hidden_after.gt.${nowIso})`
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(20);

      if (latestError) {
        throw latestError;
      }

      return NextResponse.json(
        {
          ok: true,
          created: false,
          stopped,
          activeTrade:
            stopped
              ? null
              : updatedTrade,
          trades:
            latestTrades || [],
          signal,
          updatedAt: nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    if (
      signal.status !== "ACTIVE" ||
      !signal.bestContract ||
      !signal.market ||
      !signal.gamma
    ) {
      return NextResponse.json(
        {
          ok: true,
          created: false,
          activeTrade: null,
          trades:
            visibleTrades || [],
          signal,
          message:
            signal.message ||
            "لا توجد فرصة SPX مفعّلة حاليًا.",
          updatedAt: nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    const contract =
      signal.bestContract;

    const spxEntryPrice =
      numberValue(
        signal.market.stockPrice
      );

    const invalidationLevel =
      chooseInvalidationLevel({
        side:
          contract.side,

        stockPrice:
          spxEntryPrice,

        gamma:
          signal.gamma,
      });

    if (
      spxEntryPrice <= 0 ||
      invalidationLevel <= 0
    ) {
      return NextResponse.json(
        {
          ok: true,
          created: false,
          activeTrade: null,
          trades:
            visibleTrades || [],
          signal,
          message:
            "ظهرت فرصة لكن لم يتوفر مستوى إبطال صالح من بيانات القاما.",
          updatedAt: nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    const entryPrice =
      numberValue(
        contract.midpoint,
        numberValue(
          contract.ask,
          numberValue(
            contract.price
          )
        )
      );

    const {
      data: createdTrade,
      error: createError,
    } = await supabase
      .from("spx_trade_setups")
      .insert({
        option_ticker:
          contract.ticker,

        side:
          contract.side,

        strike:
          contract.strike,

        expiration:
          contract.expiration,

        entry_price:
          entryPrice,

        current_price:
          entryPrice,

        current_bid:
          contract.bid,

        current_ask:
          contract.ask,

        best_price:
          entryPrice,

        best_price_at:
          nowIso,

        current_profit_dollars:
          0,

        current_profit_pct:
          0,

        best_profit_dollars:
          0,

        best_profit_pct:
          0,

        spx_entry_price:
          spxEntryPrice,

        spx_current_price:
          spxEntryPrice,

        invalidation_level:
          invalidationLevel,

        score:
          contract.finalScore,

        quality:
          contract.quality,

        analysis_snapshot:
          signal,

        status:
          "ACTIVE",

        activated_at:
          nowIso,

        last_quote_at:
          nowIso,
      })
      .select("*")
      .single();

    if (
      createError ||
      !createdTrade
    ) {
      throw (
        createError ||
        new Error(
          "تعذر إنشاء صفقة SPX"
        )
      );
    }

    await supabase
      .from("spx_trade_updates")
      .insert({
        setup_id:
          createdTrade.id,

        event_type:
          "CREATED",

        contract_price:
          entryPrice,

        profit_dollars:
          0,

        profit_pct:
          0,

        message:
          `تم تفعيل صفقة ${contract.side} عند مستوى إبطال ${invalidationLevel}`,

        metadata: {
          score:
            contract.finalScore,
          quality:
            contract.quality,
          spxEntryPrice,
          invalidationLevel,
        },
      });

    const {
      data: latestTrades,
      error: latestError,
    } = await supabase
      .from("spx_trade_setups")
      .select("*")
      .or(
        `status.in.(WATCH,ACTIVE),and(status.eq.STOPPED,hidden_after.gt.${nowIso})`
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(20);

    if (latestError) {
      throw latestError;
    }

    return NextResponse.json(
      {
        ok: true,
        created: true,
        activeTrade:
          createdTrade,
        trades:
          latestTrades || [],
        signal,
        updatedAt: nowIso,
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
