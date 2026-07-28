import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type QuoteRequestItem = {
  id: string;
  symbol: string;
  contractTicker: string;
  contractEntryPrice: number;
};

type DataRecord =
  Record<string, unknown>;

function asRecord(
  value: unknown
): DataRecord {
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

async function fetchContractQuote(
  item: QuoteRequestItem,
  apiKey: string
) {
  const url =
    "https://api.massive.com/v3/snapshot/options/" +
    `${encodeURIComponent(item.symbol)}/` +
    `${encodeURIComponent(item.contractTicker)}` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control":
        "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Massive HTTP ${response.status}`
    );
  }

  const payload =
    asRecord(await response.json());

  const results =
    asRecord(payload.results);

  const quote =
    asRecord(results.last_quote);

  const trade =
    asRecord(results.last_trade);

  const bid =
    numberValue(quote.bid);

  const ask =
    numberValue(quote.ask);

  const snapshotMidpoint =
    numberValue(quote.midpoint);

  const lastTradePrice =
    numberValue(trade.price);

  const midpoint =
    bid > 0 && ask > 0
      ? (bid + ask) / 2
      : snapshotMidpoint;

  const currentPrice =
    midpoint > 0
      ? midpoint
      : lastTradePrice > 0
        ? lastTradePrice
        : bid;

  if (currentPrice <= 0) {
    throw new Error(
      "لم يرجع Massive سعرًا صالحًا"
    );
  }

  const entryPrice =
    numberValue(
      item.contractEntryPrice
    );

  const profitDollars =
    entryPrice > 0
      ? (currentPrice -
          entryPrice) *
        100
      : 0;

  const profitPct =
    entryPrice > 0
      ? ((currentPrice -
          entryPrice) /
          entryPrice) *
        100
      : 0;

  return {
    id: item.id,
    contractCurrentPrice:
      round(currentPrice),
    contractBid:
      round(bid),
    contractAsk:
      round(ask),
    contractProfitDollars:
      round(profitDollars),
    contractProfitPct:
      round(profitPct),
    contractQuoteAt:
      new Date().toISOString(),
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    const apiKey =
      process.env.MASSIVE_API_KEY;

    if (!apiKey) {
      throw new Error(
        "متغير MASSIVE_API_KEY غير موجود"
      );
    }

    const body =
      asRecord(await request.json());

    const rawTrades =
      Array.isArray(body.trades)
        ? body.trades
        : [];

    const trades: QuoteRequestItem[] =
      rawTrades
        .map((value) => {
          const item =
            asRecord(value);

          return {
            id: String(
              item.id || ""
            ),
            symbol: String(
              item.symbol || ""
            ).toUpperCase(),
            contractTicker: String(
              item.contractTicker || ""
            ),
            contractEntryPrice:
              numberValue(
                item.contractEntryPrice
              ),
          };
        })
        .filter(
          (item) =>
            item.id &&
            item.symbol &&
            item.contractTicker.startsWith(
              "O:"
            )
        )
        .slice(0, 20);

    const settled =
      await Promise.allSettled(
        trades.map((item) =>
          fetchContractQuote(
            item,
            apiKey
          )
        )
      );

    const quotes =
      settled.flatMap((result) =>
        result.status === "fulfilled"
          ? [result.value]
          : []
      );

    return NextResponse.json(
      {
        ok: true,
        quotes,
        updatedAt:
          new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
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
            : "تعذر تحديث أسعار العقود",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }
}
