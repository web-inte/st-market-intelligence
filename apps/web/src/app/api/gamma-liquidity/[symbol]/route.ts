import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MASSIVE_BASE_URL =
  process.env.MASSIVE_BASE_URL?.replace(/\/$/, "") ||
  "https://api.massive.com";

const EXPIRATION_DAYS = readPositiveEnv("GAMMA_EXPIRATION_DAYS", 75);
const MAX_PAGES = readPositiveEnv("GAMMA_MAX_PAGES", 12);
const STRIKE_RANGE_PCT = readPositiveEnv("GAMMA_STRIKE_RANGE_PCT", 35);

type ContractSide = "call" | "put";

type MassiveOption = {
  details?: {
    contract_type?: string;
    expiration_date?: string;
    shares_per_contract?: number;
    strike_price?: number;
    ticker?: string;
  };
  day?: {
    close?: number;
    volume?: number;
    vwap?: number;
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  implied_volatility?: number;
  last_quote?: {
    ask?: number;
    bid?: number;
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
    timeframe?: string;
  };
};

type MassiveChainResponse = {
  request_id?: string;
  next_url?: string;
  results?: MassiveOption[];
  status?: string;
  error?: string;
  message?: string;
};

type ContractRow = {
  ticker: string;
  side: ContractSide;
  strike: number;
  expiration: string;
  dte: number;
  price: number | null;
  bid: number | null;
  ask: number | null;
  midpoint: number | null;
  spreadPct: number | null;
  volume: number;
  openInterest: number;
  volumeOi: number | null;
  impliedVolatilityPct: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  gex: number;
  tradeSize: number | null;
  timeframe: string | null;
};

type StrikeInternal = {
  strike: number;
  callVolume: number;
  putVolume: number;
  callOi: number;
  putOi: number;
  callGex: number;
  putGex: number;
  callIvWeighted: number;
  callIvWeight: number;
  putIvWeighted: number;
  putIvWeight: number;
  expirations: Set<string>;
  contracts: number;
};

type RouteContext = {
  params: Promise<{ symbol: string }> | { symbol: string };
};

function readPositiveEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function asNumber(value: unknown): number | null {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function numberOrZero(value: unknown) {
  return asNumber(value) ?? 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;

  return (
    Math.round((value + Number.EPSILON) * factor) /
    factor
  );
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);

  copy.setUTCDate(copy.getUTCDate() + days);

  return copy;
}

function daysToExpiration(expiration: string) {
  const expirationTime = Date.parse(
    `${expiration}T23:59:59Z`,
  );

  if (!Number.isFinite(expirationTime)) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (expirationTime - Date.now()) / 86_400_000,
    ),
  );
}

function percent(part: number, total: number) {
  return total > 0
    ? round((part / total) * 100, 2)
    : 0;
}

function ratio(
  numerator: number,
  denominator: number,
) {
  return denominator > 0
    ? round(numerator / denominator, 2)
    : null;
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function isValidSymbol(symbol: string) {
  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
}

function normalizeTimeframe(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : null;
}

function optionPrice(option: MassiveOption) {
  const midpoint = asNumber(
    option.last_quote?.midpoint,
  );

  const bid = asNumber(
    option.last_quote?.bid,
  );

  const ask = asNumber(
    option.last_quote?.ask,
  );

  const trade = asNumber(
    option.last_trade?.price,
  );

  const close = asNumber(
    option.day?.close,
  );

  if (midpoint !== null && midpoint > 0) {
    return midpoint;
  }

  if (
    bid !== null &&
    ask !== null &&
    bid >= 0 &&
    ask >= bid
  ) {
    return (bid + ask) / 2;
  }

  if (trade !== null && trade > 0) {
    return trade;
  }

  if (close !== null && close > 0) {
    return close;
  }

  return null;
}

function spreadPercent(option: MassiveOption) {
  const bid = asNumber(
    option.last_quote?.bid,
  );

  const ask = asNumber(
    option.last_quote?.ask,
  );

  const midpoint = optionPrice(option);

  if (
    bid === null ||
    ask === null ||
    midpoint === null ||
    midpoint <= 0 ||
    bid < 0 ||
    ask < bid
  ) {
    return null;
  }

  return round(
    ((ask - bid) / midpoint) * 100,
    2,
  );
}

function ivToPercent(value: number | null) {
  return value === null
    ? null
    : round(value * 100, 2);
}

function logScore(
  value: number,
  reference: number,
) {
  if (value <= 0) {
    return 0;
  }

  return clamp(
    (Math.log1p(value) /
      Math.log1p(reference)) *
      100,
    0,
    100,
  );
}

function qualityLabel(score: number) {
  if (score >= 82) {
    return "ممتازة";
  }

  if (score >= 70) {
    return "قوية";
  }

  if (score >= 58) {
    return "جيدة";
  }

  return "متوسطة";
}

function contractReasons(
  contract: ContractRow,
) {
  const reasons: string[] = [];

  const absDelta = Math.abs(
    contract.delta ?? 0,
  );

  if (
    contract.spreadPct !== null &&
    contract.spreadPct <= 8
  ) {
    reasons.push("سبريد ممتاز");
  } else if (
    contract.spreadPct !== null &&
    contract.spreadPct <= 15
  ) {
    reasons.push("سبريد مقبول");
  }

  if (contract.volume >= 500) {
    reasons.push("حجم تداول قوي");
  }

  if (contract.openInterest >= 1000) {
    reasons.push("اهتمام مفتوح مرتفع");
  }

  if ((contract.volumeOi ?? 0) >= 1) {
    reasons.push(
      "نشاط اليوم مرتفع مقابل OI",
    );
  }

  if (
    absDelta >= 0.3 &&
    absDelta <= 0.6
  ) {
    reasons.push("دلتا مناسبة");
  }

  if (
    contract.dte >= 7 &&
    contract.dte <= 35
  ) {
    reasons.push("انتهاء مناسب");
  }

  return reasons.length > 0
    ? reasons.slice(0, 4)
    : [
        "أفضل عقد متاح حسب السيولة واليونانيات الحالية",
      ];
}

function scoreContract(
  contract: ContractRow,
) {
  const volumeScore = logScore(
    contract.volume,
    5000,
  );

  const oiScore = logScore(
    contract.openInterest,
    10_000,
  );

  const spreadScore =
    contract.spreadPct === null
      ? 35
      : clamp(
          100 - contract.spreadPct * 4,
          0,
          100,
        );

  const absDelta = Math.abs(
    contract.delta ?? 0,
  );

  const deltaScore =
    contract.delta === null
      ? 35
      : clamp(
          100 -
            (Math.abs(absDelta - 0.45) /
              0.35) *
              100,
          0,
          100,
        );

  const dteScore = clamp(
    100 - Math.abs(contract.dte - 21) * 3,
    15,
    100,
  );

  const activityScore = clamp(
    (contract.volumeOi ?? 0) * 55,
    0,
    100,
  );

  return round(
    volumeScore * 0.22 +
      oiScore * 0.2 +
      spreadScore * 0.2 +
      deltaScore * 0.18 +
      dteScore * 0.1 +
      activityScore * 0.1,
    1,
  );
}

function selectBestContracts(
  contracts: ContractRow[],
  side: ContractSide,
) {
  return contracts
    .filter((contract) => {
      if (contract.side !== side) {
        return false;
      }

      if (
        contract.dte < 1 ||
        contract.dte > 60
      ) {
        return false;
      }

      if ((contract.price ?? 0) <= 0) {
        return false;
      }

      if (
        contract.spreadPct !== null &&
        contract.spreadPct > 35
      ) {
        return false;
      }

      if (
        contract.volume <= 0 &&
        contract.openInterest <= 0
      ) {
        return false;
      }

      return true;
    })
    .map((contract) => {
      const score = scoreContract(contract);

      return {
        ...contract,
        score,
        quality: qualityLabel(score),
        reasons: contractReasons(contract),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function wallRole(
  side: ContractSide,
  strike: number,
  spot: number,
) {
  if (side === "call") {
    return strike >= spot
      ? "مقاومة"
      : "دعم";
  }

  return strike <= spot
    ? "دعم"
    : "مقاومة";
}

async function fetchMassive(
  url: string,
  apiKey: string,
) {
  const requestUrl = new URL(url);

  requestUrl.searchParams.set(
    "apiKey",
    apiKey,
  );

  const response = await fetch(
    requestUrl.toString(),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const payload =
    (await response
      .json()
      .catch(() => ({}))) as MassiveChainResponse;

  if (!response.ok) {
    throw new Error(
      payload.error ||
        payload.message ||
        `Massive request failed with status ${response.status}`,
    );
  }

  return payload;
}

async function discoverSpot(
  symbol: string,
  apiKey: string,
  fromDate: string,
) {
  const url = new URL(
    `${MASSIVE_BASE_URL}/v3/snapshot/options/${encodeURIComponent(
      symbol,
    )}`,
  );

  url.searchParams.set("limit", "1");
  url.searchParams.set("order", "asc");
  url.searchParams.set("sort", "ticker");

  url.searchParams.set(
    "expiration_date.gte",
    fromDate,
  );

  const payload = await fetchMassive(
    url.toString(),
    apiKey,
  );

  const option = payload.results?.[0];

  return asNumber(
    option?.underlying_asset?.price,
  );
}

async function fetchOptionChain(
  symbol: string,
  apiKey: string,
  spot: number | null,
  fromDate: string,
  toDate: string,
) {
  const url = new URL(
    `${MASSIVE_BASE_URL}/v3/snapshot/options/${encodeURIComponent(
      symbol,
    )}`,
  );

  url.searchParams.set("limit", "250");
  url.searchParams.set("order", "asc");
  url.searchParams.set("sort", "ticker");

  url.searchParams.set(
    "expiration_date.gte",
    fromDate,
  );

  url.searchParams.set(
    "expiration_date.lte",
    toDate,
  );

  if (spot !== null && spot > 0) {
    const range =
      STRIKE_RANGE_PCT / 100;

    url.searchParams.set(
      "strike_price.gte",
      String(
        round(
          spot * (1 - range),
          2,
        ),
      ),
    );

    url.searchParams.set(
      "strike_price.lte",
      String(
        round(
          spot * (1 + range),
          2,
        ),
      ),
    );
  }

  const contracts =
    new Map<string, MassiveOption>();

  const requestIds: string[] = [];

  let nextUrl: string | null =
    url.toString();

  let pagesFetched = 0;

  while (
    nextUrl &&
    pagesFetched < MAX_PAGES
  ) {
    const payload = await fetchMassive(
      nextUrl,
      apiKey,
    );

    pagesFetched += 1;

    if (payload.request_id) {
      requestIds.push(
        payload.request_id,
      );
    }

    for (
      const option of payload.results ?? []
    ) {
      const ticker =
        option.details?.ticker;

      if (ticker) {
        contracts.set(
          ticker,
          option,
        );
      }
    }

    nextUrl =
      payload.next_url || null;
  }

  return {
    options: [...contracts.values()],
    requestIds,
    pagesFetched,
    truncated: Boolean(nextUrl),
  };
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const apiKey =
    process.env.MASSIVE_API_KEY;

  const {
    symbol: rawSymbol,
  } = await Promise.resolve(
    context.params,
  );

  const symbol = normalizeSymbol(
    rawSymbol || "",
  );

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "MASSIVE_API_KEY غير موجود داخل متغيرات البيئة.",
      },
      {
        status: 500,
      },
    );
  }

  if (!isValidSymbol(symbol)) {
    return NextResponse.json(
      {
        ok: false,
        error: "رمز السهم غير صالح.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const now = new Date();

    const fromDate =
      dateOnly(now);

    const toDate = dateOnly(
      addDays(
        now,
        EXPIRATION_DAYS,
      ),
    );

    const discoveredSpot =
      await discoverSpot(
        symbol,
        apiKey,
        fromDate,
      );

    const chain =
      await fetchOptionChain(
        symbol,
        apiKey,
        discoveredSpot,
        fromDate,
        toDate,
      );

    if (chain.options.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          symbol,
          error:
            "لم ترجع Massive أي عقود أوبشن ضمن النطاق الحالي.",
        },
        {
          status: 404,
        },
      );
    }

    const optionSpots =
      chain.options
        .map((option) =>
          asNumber(
            option
              .underlying_asset
              ?.price,
          ),
        )
        .filter(
          (
            value,
          ): value is number =>
            value !== null &&
            value > 0,
        );

    const spotPrice =
      discoveredSpot ??
      optionSpots[0] ??
      0;

    if (spotPrice <= 0) {
      return NextResponse.json(
        {
          ok: false,
          symbol,
          error:
            "تعذر تحديد السعر الحالي للسهم من بيانات Massive.",
        },
        {
          status: 502,
        },
      );
    }

    const contracts:
      ContractRow[] = [];

    const strikes =
      new Map<
        number,
        StrikeInternal
      >();

    const expirationMap =
      new Map<
        string,
        {
          expiration: string;
          dte: number;
          contracts: number;
          callVolume: number;
          putVolume: number;
          callOi: number;
          putOi: number;
        }
      >();

    let callVolume = 0;
    let putVolume = 0;

    let callOi = 0;
    let putOi = 0;

    let callGex = 0;
    let putGex = 0;

    let gammaContracts = 0;
    let quoteContracts = 0;

    let callIvWeighted = 0;
    let putIvWeighted = 0;

    let callIvWeight = 0;
    let putIvWeight = 0;

    const timeframes =
      new Set<string>();

    for (
      const option of chain.options
    ) {
      const details =
        option.details;

      const sideValue =
        details?.contract_type
          ?.toLowerCase();

      if (
        sideValue !== "call" &&
        sideValue !== "put"
      ) {
        continue;
      }

      const side =
        sideValue as ContractSide;

      const ticker =
        details?.ticker || "";

      const strike =
        numberOrZero(
          details?.strike_price,
        );

      const expiration =
        details?.expiration_date ||
        "";

      if (
        !ticker ||
        strike <= 0 ||
        !expiration
      ) {
        continue;
      }

      const volume = Math.max(
        0,
        numberOrZero(
          option.day?.volume,
        ),
      );

      const openInterest =
        Math.max(
          0,
          numberOrZero(
            option.open_interest,
          ),
        );

      const gammaValue =
        asNumber(
          option.greeks?.gamma,
        );

      const deltaValue =
        asNumber(
          option.greeks?.delta,
        );

      const thetaValue =
        asNumber(
          option.greeks?.theta,
        );

      const vegaValue =
        asNumber(
          option.greeks?.vega,
        );

      const ivValue =
        asNumber(
          option.implied_volatility,
        );

      const sharesPerContract =
        Math.max(
          1,
          numberOrZero(
            details?.shares_per_contract,
          ) || 100,
        );

      /*
        Dollar GEX تقديري لحركة 1%.

        CALL موجب.
        PUT سالب.

        هذا تقدير هيكلي وليس
        تمركز صانع السوق المؤكد.
      */
      const signedGex =
        Math.abs(
          gammaValue ?? 0,
        ) *
        openInterest *
        sharesPerContract *
        spotPrice *
        spotPrice *
        0.01 *
        (side === "call"
          ? 1
          : -1);

      const bid =
        asNumber(
          option.last_quote?.bid,
        );

      const ask =
        asNumber(
          option.last_quote?.ask,
        );

      const midpoint =
        asNumber(
          option.last_quote
            ?.midpoint,
        );

      const price =
        optionPrice(option);

      const spreadPct =
        spreadPercent(option);

      const timeframe =
        normalizeTimeframe(
          option.last_quote
            ?.timeframe,
        ) ||
        normalizeTimeframe(
          option.last_trade
            ?.timeframe,
        ) ||
        normalizeTimeframe(
          option
            .underlying_asset
            ?.timeframe,
        );

      if (timeframe) {
        timeframes.add(
          timeframe,
        );
      }

      if (gammaValue !== null) {
        gammaContracts += 1;
      }

      if (
        bid !== null ||
        ask !== null ||
        midpoint !== null
      ) {
        quoteContracts += 1;
      }

      const row: ContractRow = {
        ticker,
        side,
        strike: round(
          strike,
          2,
        ),
        expiration,
        dte:
          daysToExpiration(
            expiration,
          ),
        price:
          price === null
            ? null
            : round(price, 2),
        bid:
          bid === null
            ? null
            : round(bid, 2),
        ask:
          ask === null
            ? null
            : round(ask, 2),
        midpoint:
          midpoint === null
            ? null
            : round(
                midpoint,
                2,
              ),
        spreadPct,
        volume,
        openInterest,
        volumeOi: ratio(
          volume,
          openInterest,
        ),
        impliedVolatilityPct:
          ivToPercent(
            ivValue,
          ),
        delta:
          deltaValue === null
            ? null
            : round(
                deltaValue,
                4,
              ),
        gamma:
          gammaValue === null
            ? null
            : round(
                gammaValue,
                6,
              ),
        theta:
          thetaValue === null
            ? null
            : round(
                thetaValue,
                4,
              ),
        vega:
          vegaValue === null
            ? null
            : round(
                vegaValue,
                4,
              ),
        gex: round(
          signedGex,
          2,
        ),
        tradeSize:
          asNumber(
            option.last_trade
              ?.size,
          ),
        timeframe,
      };

      contracts.push(row);

      const strikeBucket =
        strikes.get(strike) ?? {
          strike,
          callVolume: 0,
          putVolume: 0,
          callOi: 0,
          putOi: 0,
          callGex: 0,
          putGex: 0,
          callIvWeighted: 0,
          callIvWeight: 0,
          putIvWeighted: 0,
          putIvWeight: 0,
          expirations:
            new Set<string>(),
          contracts: 0,
        };

      const ivWeight =
        Math.max(
          1,
          openInterest +
            volume,
        );

      strikeBucket.expirations.add(
        expiration,
      );

      strikeBucket.contracts += 1;

      if (side === "call") {
        callVolume += volume;
        callOi += openInterest;
        callGex += signedGex;

        strikeBucket.callVolume +=
          volume;

        strikeBucket.callOi +=
          openInterest;

        strikeBucket.callGex +=
          signedGex;

        if (ivValue !== null) {
          callIvWeighted +=
            ivValue *
            ivWeight;

          callIvWeight +=
            ivWeight;

          strikeBucket.callIvWeighted +=
            ivValue *
            ivWeight;

          strikeBucket.callIvWeight +=
            ivWeight;
        }
      } else {
        putVolume += volume;
        putOi += openInterest;
        putGex += signedGex;

        strikeBucket.putVolume +=
          volume;

        strikeBucket.putOi +=
          openInterest;

        strikeBucket.putGex +=
          signedGex;

        if (ivValue !== null) {
          putIvWeighted +=
            ivValue *
            ivWeight;

          putIvWeight +=
            ivWeight;

          strikeBucket.putIvWeighted +=
            ivValue *
            ivWeight;

          strikeBucket.putIvWeight +=
            ivWeight;
        }
      }

      strikes.set(
        strike,
        strikeBucket,
      );

      const expirationBucket =
        expirationMap.get(
          expiration,
        ) ?? {
          expiration,
          dte:
            daysToExpiration(
              expiration,
            ),
          contracts: 0,
          callVolume: 0,
          putVolume: 0,
          callOi: 0,
          putOi: 0,
        };

      expirationBucket.contracts +=
        1;

      if (side === "call") {
        expirationBucket.callVolume +=
          volume;

        expirationBucket.callOi +=
          openInterest;
      } else {
        expirationBucket.putVolume +=
          volume;

        expirationBucket.putOi +=
          openInterest;
      }

      expirationMap.set(
        expiration,
        expirationBucket,
      );
    }

    const totalVolume =
      callVolume + putVolume;

    const totalOi =
      callOi + putOi;

    const netGex =
      callGex + putGex;

    const totalAbsGex =
      Math.abs(callGex) +
      Math.abs(putGex);

    const baseStrikeRows =
      [...strikes.values()]
        .map((strike) => ({
          strike: round(
            strike.strike,
            2,
          ),

          callVolume:
            strike.callVolume,

          putVolume:
            strike.putVolume,

          totalVolume:
            strike.callVolume +
            strike.putVolume,

          callOi:
            strike.callOi,

          putOi:
            strike.putOi,

          totalOi:
            strike.callOi +
            strike.putOi,

          callGex: round(
            strike.callGex,
            2,
          ),

          putGex: round(
            strike.putGex,
            2,
          ),

          netGex: round(
            strike.callGex +
              strike.putGex,
            2,
          ),

          totalAbsGex: round(
            Math.abs(
              strike.callGex,
            ) +
              Math.abs(
                strike.putGex,
              ),
            2,
          ),

          callIvPct:
            strike.callIvWeight >
            0
              ? round(
                  (strike.callIvWeighted /
                    strike.callIvWeight) *
                    100,
                  2,
                )
              : null,

          putIvPct:
            strike.putIvWeight >
            0
              ? round(
                  (strike.putIvWeighted /
                    strike.putIvWeight) *
                    100,
                  2,
                )
              : null,

          expirations: [
            ...strike.expirations,
          ].sort(),

          contracts:
            strike.contracts,
        }))
        .sort(
          (a, b) =>
            a.strike -
            b.strike,
        );

    const maxStrikeOi =
      Math.max(
        1,
        ...baseStrikeRows.map(
          (row) =>
            row.totalOi,
        ),
      );

    const maxStrikeGex =
      Math.max(
        1,
        ...baseStrikeRows.map(
          (row) =>
            row.totalAbsGex,
        ),
      );

    const callWallRow =
      [...baseStrikeRows].sort(
        (a, b) =>
          (b.callGex ||
            b.callOi) -
          (a.callGex ||
            a.callOi),
      )[0];

    const putWallRow =
      [...baseStrikeRows].sort(
        (a, b) =>
          (Math.abs(
            b.putGex,
          ) ||
            b.putOi) -
          (Math.abs(
            a.putGex,
          ) ||
            a.putOi),
      )[0];

    const magnetRow =
      [...baseStrikeRows].sort(
        (a, b) =>
          b.totalOi -
          a.totalOi,
      )[0];

    const flipCandidates:
      number[] = [];

    for (
      let index = 0;
      index <
      baseStrikeRows.length - 1;
      index += 1
    ) {
      const left =
        baseStrikeRows[index];

      const right =
        baseStrikeRows[index + 1];

      if (left.netGex === 0) {
        flipCandidates.push(
          left.strike,
        );
      }

      if (
        left.netGex *
          right.netGex <
        0
      ) {
        const denominator =
          right.netGex -
          left.netGex;

        if (denominator !== 0) {
          const interpolated =
            left.strike +
            ((0 -
              left.netGex) /
              denominator) *
              (right.strike -
                left.strike);

          flipCandidates.push(
            interpolated,
          );
        }
      }
    }

    const gammaFlip =
      flipCandidates.length > 0
        ? round(
            flipCandidates.sort(
              (a, b) =>
                Math.abs(
                  a -
                    spotPrice,
                ) -
                Math.abs(
                  b -
                    spotPrice,
                ),
            )[0],
            2,
          )
        : null;

    const strikeRows =
      baseStrikeRows.map(
        (row) => {
          const labels:
            string[] = [];

          if (
            callWallRow &&
            row.strike ===
              callWallRow.strike
          ) {
            labels.push(
              "CALL_WALL",
            );
          }

          if (
            putWallRow &&
            row.strike ===
              putWallRow.strike
          ) {
            labels.push(
              "PUT_WALL",
            );
          }

          if (
            magnetRow &&
            row.strike ===
              magnetRow.strike
          ) {
            labels.push(
              "MAGNET",
            );
          }

          const strength =
            clamp(
              (row.totalOi /
                maxStrikeOi) *
                55 +
                (row.totalAbsGex /
                  maxStrikeGex) *
                  45,
              0,
              100,
            );

          return {
            ...row,

            distanceFromSpotPct:
              round(
                ((row.strike -
                  spotPrice) /
                  spotPrice) *
                  100,
                2,
              ),

            strength: round(
              strength,
              0,
            ),

            level:
              labels.length > 0
                ? labels.join(
                    "+",
                  )
                : "NORMAL",
          };
        },
      );

    const callIv =
      callIvWeight > 0
        ? callIvWeighted /
          callIvWeight
        : null;

    const putIv =
      putIvWeight > 0
        ? putIvWeighted /
          putIvWeight
        : null;

    const ivSkewPoints =
      callIv !== null &&
      putIv !== null
        ? round(
            (putIv -
              callIv) *
              100,
            2,
          )
        : null;

    const volumeImbalance =
      totalVolume > 0
        ? (callVolume -
            putVolume) /
          totalVolume
        : 0;

    const oiImbalance =
      totalOi > 0
        ? (callOi -
            putOi) /
          totalOi
        : 0;

    const skewSignal =
      ivSkewPoints === null
        ? 0
        : clamp(
            -ivSkewPoints /
              15,
            -1,
            1,
          );

    const directionalScore =
      round(
        clamp(
          (volumeImbalance *
            0.6 +
            oiImbalance *
              0.25 +
            skewSignal *
              0.15) *
            100,
          -100,
          100,
        ),
        1,
      );

    const bias =
      directionalScore >= 12
        ? "CALL"
        : directionalScore <=
            -12
          ? "PUT"
          : "NEUTRAL";

    const confidence =
      Math.abs(
        directionalScore,
      ) >= 35
        ? "مرتفعة"
        : Math.abs(
              directionalScore,
            ) >= 22
          ? "جيدة"
          : Math.abs(
                directionalScore,
              ) >= 12
            ? "متوسطة"
            : "ضعيفة";

    const gammaRatio =
      totalAbsGex > 0
        ? netGex /
          totalAbsGex
        : 0;

    const gammaRegime =
      gammaRatio >= 0.15
        ? "POSITIVE"
        : gammaRatio <= -0.15
          ? "NEGATIVE"
          : "NEUTRAL";

    const reasons: string[] =
      [];

    if (
      callVolume >
      putVolume
    ) {
      reasons.push(
        "حجم CALL أعلى من PUT",
      );
    }

    if (
      putVolume >
      callVolume
    ) {
      reasons.push(
        "حجم PUT أعلى من CALL",
      );
    }

    if (callOi > putOi) {
      reasons.push(
        "اهتمام CALL المفتوح أعلى",
      );
    }

    if (putOi > callOi) {
      reasons.push(
        "اهتمام PUT المفتوح أعلى",
      );
    }

    if (
      ivSkewPoints !== null &&
      ivSkewPoints >= 2
    ) {
      reasons.push(
        "IV عقود PUT أعلى من CALL",
      );
    }

    if (
      ivSkewPoints !== null &&
      ivSkewPoints <= -2
    ) {
      reasons.push(
        "IV عقود CALL أعلى من PUT",
      );
    }

    if (
      gammaRegime ===
      "POSITIVE"
    ) {
      reasons.push(
        "صافي القاما موجب ويميل إلى تهدئة الحركة",
      );
    }

    if (
      gammaRegime ===
      "NEGATIVE"
    ) {
      reasons.push(
        "صافي القاما سالب وقد يضخم الحركة",
      );
    }

    const risks: string[] = [];

    const gammaCoveragePct =
      percent(
        gammaContracts,
        contracts.length,
      );

    const quoteCoveragePct =
      percent(
        quoteContracts,
        contracts.length,
      );

    if (
      gammaCoveragePct < 70
    ) {
      risks.push(
        "تغطية Gamma ناقصة لبعض العقود",
      );
    }

    if (
      quoteCoveragePct < 70
    ) {
      risks.push(
        "بيانات Bid/Ask غير متوفرة لكل العقود",
      );
    }

    if (chain.truncated) {
      risks.push(
        "تم إيقاف Pagination عند الحد المحدد؛ قد توجد عقود إضافية",
      );
    }

    if (
      timeframes.has(
        "DELAYED",
      )
    ) {
      risks.push(
        "بعض بيانات Massive متأخرة حسب الباقة",
      );
    }

    risks.push(
      "Volume وOI لا يحددان وحدهما هل العقود مشتراة أو مباعة",
    );

    risks.push(
      "GEX تقديري ولا يمثل تمركز صانع السوق المؤكد",
    );

    const expirations =
      [...expirationMap.values()]
        .sort((a, b) =>
          a.expiration.localeCompare(
            b.expiration,
          ),
        )
        .map(
          (expiration) => ({
            ...expiration,

            totalVolume:
              expiration.callVolume +
              expiration.putVolume,

            totalOi:
              expiration.callOi +
              expiration.putOi,

            callVolumePct:
              percent(
                expiration.callVolume,
                expiration.callVolume +
                  expiration.putVolume,
              ),

            putVolumePct:
              percent(
                expiration.putVolume,
                expiration.callVolume +
                  expiration.putVolume,
              ),
          }),
        );

    const bestCalls =
      selectBestContracts(
        contracts,
        "call",
      );

    const bestPuts =
      selectBestContracts(
        contracts,
        "put",
      );

    return NextResponse.json(
      {
        ok: true,
        symbol,

        updatedAt:
          new Date().toISOString(),

        spotPrice: round(
          spotPrice,
          2,
        ),

        source:
          "Massive Option Chain Snapshot",

        timeframe: [
          ...timeframes,
        ],

        summary: {
          bias,
          directionalScore,
          confidence,

          callVolume,
          putVolume,
          totalVolume,

          callVolumePct:
            percent(
              callVolume,
              totalVolume,
            ),

          putVolumePct:
            percent(
              putVolume,
              totalVolume,
            ),

          callPutVolumeRatio:
            ratio(
              callVolume,
              putVolume,
            ),

          callOpenInterest:
            callOi,

          putOpenInterest:
            putOi,

          totalOpenInterest:
            totalOi,

          callOpenInterestPct:
            percent(
              callOi,
              totalOi,
            ),

          putOpenInterestPct:
            percent(
              putOi,
              totalOi,
            ),

          callPutOpenInterestRatio:
            ratio(
              callOi,
              putOi,
            ),

          reasons,
          risks,
        },

        gamma: {
          callGex: round(
            callGex,
            2,
          ),

          putGex: round(
            putGex,
            2,
          ),

          netGex: round(
            netGex,
            2,
          ),

          regime:
            gammaRegime,

          regimeRatio:
            round(
              gammaRatio,
              4,
            ),

          estimatedGammaFlip:
            gammaFlip,

          formula:
            "gamma × openInterest × sharesPerContract × spot² × 0.01; CALL موجب وPUT سالب",

          coveragePct:
            gammaCoveragePct,
        },

        ivSkew: {
          callIvPct:
            callIv === null
              ? null
              : round(
                  callIv *
                    100,
                  2,
                ),

          putIvPct:
            putIv === null
              ? null
              : round(
                  putIv *
                    100,
                  2,
                ),

          putMinusCallPoints:
            ivSkewPoints,

          direction:
            ivSkewPoints === null
              ? "UNKNOWN"
              : ivSkewPoints >= 2
                ? "PUT_PREMIUM"
                : ivSkewPoints <=
                    -2
                  ? "CALL_PREMIUM"
                  : "BALANCED",
        },

        walls: {
          callWall:
            callWallRow
              ? {
                  strike:
                    callWallRow.strike,

                  role:
                    wallRole(
                      "call",
                      callWallRow.strike,
                      spotPrice,
                    ),

                  gex:
                    callWallRow.callGex,

                  openInterest:
                    callWallRow.callOi,

                  volume:
                    callWallRow.callVolume,
                }
              : null,

          putWall:
            putWallRow
              ? {
                  strike:
                    putWallRow.strike,

                  role:
                    wallRole(
                      "put",
                      putWallRow.strike,
                      spotPrice,
                    ),

                  gex:
                    putWallRow.putGex,

                  openInterest:
                    putWallRow.putOi,

                  volume:
                    putWallRow.putVolume,
                }
              : null,

          magnet:
            magnetRow
              ? {
                  strike:
                    magnetRow.strike,

                  totalOpenInterest:
                    magnetRow.totalOi,

                  totalVolume:
                    magnetRow.totalVolume,

                  netGex:
                    magnetRow.netGex,
                }
              : null,
        },

        bestContracts: {
          calls: bestCalls,
          puts: bestPuts,
        },

        expirations,
        strikes: strikeRows,

        meta: {
          contractsProcessed:
            contracts.length,

          pagesFetched:
            chain.pagesFetched,

          paginationTruncated:
            chain.truncated,

          requestIds:
            chain.requestIds,

          expirationWindow: {
            from: fromDate,
            to: toDate,
            days:
              EXPIRATION_DAYS,
          },

          strikeWindowPct:
            STRIKE_RANGE_PCT,

          gammaCoveragePct,
          quoteCoveragePct,

          disclaimer:
            "النتائج تحليل تقديري لبيانات سلسلة الأوبشن وليست توصية شراء أو بيع.",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "خطأ غير معروف";

    return NextResponse.json(
      {
        ok: false,
        symbol,

        error:
          "فشل جلب أو تحليل سلسلة الأوبشن من Massive.",

        details: message,
      },
      {
        status: 502,
      },
    );
  }
}