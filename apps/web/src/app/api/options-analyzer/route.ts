import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ContractType = "call" | "put";

type MassiveOptionSnapshot = {
  break_even_price?: number;

  day?: {
    volume?: number;
    close?: number;
  };

  details?: {
    ticker?: string;
    contract_type?: ContractType;
    expiration_date?: string;
    strike_price?: number;
  };

  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };

  implied_volatility?: number;

  last_quote?: {
    bid?: number;
    ask?: number;
    midpoint?: number;
    timeframe?: string;
  };

  last_trade?: {
    price?: number;
    size?: number;
    timeframe?: string;
  };

  open_interest?: number;

  underlying_asset?: {
    price?: number;
  };
};

type MassiveResponse = {
  status?: string;
  results?: MassiveOptionSnapshot[];
  next_url?: string;
  error?: string;
  message?: string;
};

function safeNumber(
  value: unknown,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function calculateSpreadPct(
  bid: number,
  ask: number,
  midpoint: number
) {
  if (
    bid <= 0 ||
    ask <= 0 ||
    ask < bid ||
    midpoint <= 0
  ) {
    return null;
  }

  return ((ask - bid) / midpoint) * 100;
}

function calculateVolumeOiRatio(
  volume: number,
  openInterest: number
) {
  if (openInterest <= 0) {
    return null;
  }

  return volume / openInterest;
}

function calculateContractScore(contract: {
  volume: number;
  openInterest: number;
  spreadPct: number | null;
  delta: number;
  volumeOiRatio: number | null;
}) {
  const volumeScore = Math.min(
    25,
    Math.log10(contract.volume + 1) * 5.5
  );

  const openInterestScore = Math.min(
    20,
    Math.log10(contract.openInterest + 1) * 4.5
  );

  const spreadPct =
    contract.spreadPct ?? 100;

  let spreadScore = 0;

  if (spreadPct <= 2) {
    spreadScore = 25;
  } else if (spreadPct <= 5) {
    spreadScore = 22;
  } else if (spreadPct <= 8) {
    spreadScore = 18;
  } else if (spreadPct <= 12) {
    spreadScore = 14;
  } else if (spreadPct <= 18) {
    spreadScore = 8;
  } else if (spreadPct <= 25) {
    spreadScore = 4;
  }

  const absoluteDelta = Math.abs(
    contract.delta
  );

  const deltaDistance = Math.abs(
    absoluteDelta - 0.45
  );

  const deltaScore = Math.max(
    0,
    20 - deltaDistance * 65
  );

  const volumeOiScore = Math.min(
    10,
    (contract.volumeOiRatio ?? 0) * 2.5
  );

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        volumeScore +
          openInterestScore +
          spreadScore +
          deltaScore +
          volumeOiScore
      )
    )
  );
}

export async function GET(
  request: NextRequest
) {
  const apiKey =
    process.env.MASSIVE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "مفتاح MASSIVE_API_KEY غير موجود.",
      },
      {
        status: 500,
      }
    );
  }

  const searchParams =
    request.nextUrl.searchParams;

  const symbol = (
    searchParams.get("symbol") ?? ""
  )
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.-]/g, "");

  const type = (
    searchParams.get("type") ?? ""
  )
    .trim()
    .toLowerCase() as ContractType;

  const expiration = (
    searchParams.get("expiration") ?? ""
  ).trim();

  if (!symbol) {
    return NextResponse.json(
      {
        error: "رمز الشركة مطلوب.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    type !== "call" &&
    type !== "put"
  ) {
    return NextResponse.json(
      {
        error:
          "نوع العقد يجب أن يكون call أو put.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      expiration
    )
  ) {
    return NextResponse.json(
      {
        error:
          "تاريخ الانتهاء مطلوب بصيغة YYYY-MM-DD.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const url = new URL(
      `https://api.massive.com/v3/snapshot/options/${encodeURIComponent(
        symbol
      )}`
    );

    url.searchParams.set(
      "contract_type",
      type
    );

    url.searchParams.set(
      "expiration_date",
      expiration
    );

    url.searchParams.set(
      "limit",
      "250"
    );

    url.searchParams.set(
      "apiKey",
      apiKey
    );

    const response = await fetch(
      url.toString(),
      {
        cache: "no-store",
      }
    );

    const data =
      (await response.json()) as MassiveResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data.error ??
            data.message ??
            "تعذر جلب عقود Massive.",
        },
        {
          status: response.status,
        }
      );
    }

    const rawContracts =
      data.results ?? [];

    const contracts = rawContracts
      .map((item) => {
        const bid = safeNumber(
          item.last_quote?.bid
        );

        const ask = safeNumber(
          item.last_quote?.ask
        );

        const quotedMidpoint =
          safeNumber(
            item.last_quote?.midpoint
          );

        const midpoint =
          quotedMidpoint > 0
            ? quotedMidpoint
            : bid > 0 && ask > 0
              ? (bid + ask) / 2
              : safeNumber(
                  item.last_trade?.price ??
                    item.day?.close
                );

        const volume = safeNumber(
          item.day?.volume
        );

        const openInterest =
          safeNumber(
            item.open_interest
          );

        const spreadPct =
          calculateSpreadPct(
            bid,
            ask,
            midpoint
          );

        const volumeOiRatio =
          calculateVolumeOiRatio(
            volume,
            openInterest
          );

        const delta = safeNumber(
          item.greeks?.delta
        );

        const contract = {
          ticker:
            item.details?.ticker ?? "",

          type:
            item.details
              ?.contract_type ?? type,

          expiration:
            item.details
              ?.expiration_date ??
            expiration,

          strike: safeNumber(
            item.details?.strike_price
          ),

          stockPrice: safeNumber(
            item.underlying_asset?.price
          ),

          bid,
          ask,
          midpoint,
          spreadPct,

          volume,
          openInterest,
          volumeOiRatio,

          delta,

          gamma: safeNumber(
            item.greeks?.gamma
          ),

          theta: safeNumber(
            item.greeks?.theta
          ),

          vega: safeNumber(
            item.greeks?.vega
          ),

          iv: safeNumber(
            item.implied_volatility
          ),

          lastTradePrice:
            safeNumber(
              item.last_trade?.price
            ),

          lastTradeSize:
            safeNumber(
              item.last_trade?.size
            ),

          breakEvenPrice:
            safeNumber(
              item.break_even_price
            ),

          quoteTimeframe:
            item.last_quote
              ?.timeframe ?? null,

          tradeTimeframe:
            item.last_trade
              ?.timeframe ?? null,
        };

        return {
          ...contract,
          score:
            calculateContractScore(
              contract
            ),
        };
      })
      .filter((contract) => {
        return (
          contract.ticker &&
          contract.strike > 0 &&
          contract.midpoint > 0 &&
          contract.bid > 0 &&
          contract.ask > 0
        );
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        if (
          b.volume !== a.volume
        ) {
          return (
            b.volume - a.volume
          );
        }

        return (
          b.openInterest -
          a.openInterest
        );
      });

    return NextResponse.json({
      symbol,
      type,
      expiration,

      contractsReturned:
        contracts.length,

      stockPrice:
        contracts[0]?.stockPrice ??
        0,

      bestContracts:
        contracts.slice(0, 3),

      capturedAt:
        new Date().toISOString(),

      note:
        contracts.length > 0
          ? "تم ترتيب العقود حسب السيولة والسبريد والدلتا وVolume/OI."
          : "لم يتم العثور على عقود صالحة لهذا التاريخ والنوع.",
    });
  } catch (error) {
    console.error(
      "Options analyzer error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "حدث خطأ أثناء تحليل العقود.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}