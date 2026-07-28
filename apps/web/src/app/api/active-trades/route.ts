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

type EngineCode =
  | "A"
  | "B"
  | "C"
  | "D";

function getEngineCode(
  gammaSnapshot: unknown
): EngineCode {
  if (
    !gammaSnapshot ||
    typeof gammaSnapshot !== "object" ||
    Array.isArray(gammaSnapshot)
  ) {
    return "C";
  }

  const snapshot =
    gammaSnapshot as Record<
      string,
      unknown
    >;

  const source =
    String(
      snapshot.source ||
      snapshot.engine ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    source.includes(
      "analysis.gammastructure"
    )
  ) {
    return "A";
  }

  if (
    source.includes(
      "decision.activetradeengine"
    )
  ) {
    return "D";
  }

  if (
    source.includes(
      "bot_decision"
    ) ||
    source.includes(
      "bot.decision"
    )
  ) {
    return "B";
  }

  return "C";
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

    engineCode:
      getEngineCode(
        row.gamma_snapshot
      ),

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

type FinnhubLiveQuote = {
  c?: number;
  t?: number;
};

type CachedFinnhubStockPrice = {
  price: number;
  timestampMs: number;
  expiresAtMs: number;
};

/*
  كاش قصير يمنع تكرار طلب Finnhub
  لنفس الرمز عند وجود عدة صفقات عليه.
*/
const finnhubStockPriceCache =
  new Map<
    string,
    CachedFinnhubStockPrice
  >();

const FINNHUB_STOCK_CACHE_MS =
  4_000;

async function fetchFinnhubLiveStockPrice(
  symbol: string,
  apiKey: string
): Promise<{
  price: number;
  timestampMs: number;
}> {
  const normalizedSymbol =
    String(symbol || "")
      .trim()
      .toUpperCase();

  const cached =
    finnhubStockPriceCache.get(
      normalizedSymbol
    );

  const now = Date.now();

  if (
    cached &&
    cached.expiresAtMs > now
  ) {
    return {
      price: cached.price,
      timestampMs:
        cached.timestampMs,
    };
  }

  const url =
    "https://finnhub.io/api/v1/quote" +
    `?symbol=${encodeURIComponent(
      normalizedSymbol
    )}` +
    `&token=${encodeURIComponent(
      apiKey
    )}`;

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
      `Finnhub HTTP ${response.status}`
    );
  }

  const payload =
    (await response.json()) as
      FinnhubLiveQuote;

  const price =
    activeTradeNumber(
      payload.c
    );

  const timestampMs =
    activeTradeNumber(
      payload.t
    ) > 0
      ? activeTradeNumber(
          payload.t
        ) * 1000
      : now;

  if (price <= 0) {
    throw new Error(
      `Finnhub لم يرجع سعرًا صالحًا لـ ${normalizedSymbol}`
    );
  }

  finnhubStockPriceCache.set(
    normalizedSymbol,
    {
      price,
      timestampMs,
      expiresAtMs:
        now +
        FINNHUB_STOCK_CACHE_MS,
    }
  );

  return {
    price,
    timestampMs,
  };
}

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

type NewYorkDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function getNewYorkDateTimeParts(
  timestampMs: number
): NewYorkDateTimeParts | null {
  if (
    !Number.isFinite(timestampMs) ||
    timestampMs <= 0
  ) {
    return null;
  }

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(
      new Date(timestampMs)
    );

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ]
      )
    );

  const result = {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };

  return Object.values(
    result
  ).every(Number.isFinite)
    ? result
    : null;
}

function normalizeMassiveTimestampMs(
  value: unknown
) {
  const timestamp =
    Number(value);

  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  ) {
    return 0;
  }

  /*
    Massive قد يعيد الوقت:
    - نانوثانية
    - ميكروثانية
    - مللي ثانية
    - ثانية
  */
  if (timestamp >= 1e17) {
    return Math.floor(
      timestamp / 1e6
    );
  }

  if (timestamp >= 1e14) {
    return Math.floor(
      timestamp / 1e3
    );
  }

  if (timestamp >= 1e12) {
    return Math.floor(
      timestamp
    );
  }

  return Math.floor(
    timestamp * 1000
  );
}

function isCurrentRegularSessionTimestamp(
  timestampMs: number
) {
  const quoteTime =
    getNewYorkDateTimeParts(
      timestampMs
    );

  const nowTime =
    getNewYorkDateTimeParts(
      Date.now()
    );

  if (!quoteTime || !nowTime) {
    return false;
  }

  const sameSessionDate =
    quoteTime.year ===
      nowTime.year &&
    quoteTime.month ===
      nowTime.month &&
    quoteTime.day ===
      nowTime.day;

  const quoteMinutes =
    quoteTime.hour * 60 +
    quoteTime.minute;

  const regularOpenMinutes =
    9 * 60 + 30;

  const regularCloseMinutes =
    16 * 60;

  return (
    sameSessionDate &&
    quoteMinutes >=
      regularOpenMinutes &&
    quoteMinutes <
      regularCloseMinutes
  );
}

async function isRegularMarketOpen(
  apiKey: string
) {
  try {
    const response =
      await fetch(
        "https://api.massive.com/v1/marketstatus/now",
        {
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            Accept:
              "application/json",
          },
          cache: "no-store",
        }
      );

    if (!response.ok) {
      /*
        عند تعذر معرفة حالة السوق:
        نتجمّد احترازيًا بدل تحديث
        الصفقات بسعر غير موثوق.
      */
      return false;
    }

    const payload =
      activeTradeRecord(
        await response.json()
      );

    const exchanges =
      activeTradeRecord(
        payload.exchanges
      );

    const market =
      String(
        payload.market || ""
      )
        .trim()
        .toLowerCase();

    const nyse =
      String(
        exchanges.nyse || ""
      )
        .trim()
        .toLowerCase();

    const nasdaq =
      String(
        exchanges.nasdaq || ""
      )
        .trim()
        .toLowerCase();

    return (
      market === "open" ||
      nyse === "open" ||
      nasdaq === "open"
    );
  } catch {
    return false;
  }
}

async function fetchMassiveContractLivePrice(
  symbol: string,
  contractTicker: string,
  apiKey: string
): Promise<
  MassiveContractLivePrice & {
    marketDataAtMs: number;
  }
> {
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

  const quoteTimestampMs =
    normalizeMassiveTimestampMs(
      quote.sip_timestamp ||
      quote.participant_timestamp ||
      quote.timestamp
    );

  const tradeTimestampMs =
    normalizeMassiveTimestampMs(
      trade.sip_timestamp ||
      trade.participant_timestamp ||
      trade.timestamp
    );

  const marketDataAtMs =
    Math.max(
      quoteTimestampMs,
      tradeTimestampMs
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
      marketDataAtMs > 0
        ? new Date(
            marketDataAtMs
          ).toISOString()
        : new Date().toISOString(),

    marketDataAtMs,
  };
}

export async function GET() {
  try {
    const supabase =
      createAdminClient();

      const massiveApiKey =
  process.env.MASSIVE_API_KEY;

const finnhubApiKey =
  process.env.FINNHUB_API_KEY;

if (!massiveApiKey) {
  throw new Error(
    "متغير MASSIVE_API_KEY غير موجود"
  );
}

if (!finnhubApiKey) {
  throw new Error(
    "متغير FINNHUB_API_KEY غير موجود"
  );
}

/*
  الصفقات تتجمّد بالكامل خارج
  الجلسة الرسمية الأمريكية.

  PRE_MARKET و AFTER_HOURS و CLOSED
  لا تحدث السعر أو الربح أو الأعلى.
*/
const regularMarketOpen =
  await isRegularMarketOpen(
    massiveApiKey
  );

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

    /*
      نجلب سعر كل سهم من Finnhub مرة واحدة
      فقط في الدورة، حتى لو كان عليه عدة صفقات.
    */
    const activeSymbols =
      Array.from(
        new Set(
          (data || [])
            .map((rawRow) =>
              String(
                activeTradeRecord(
                  rawRow
                ).symbol || ""
              )
                .trim()
                .toUpperCase()
            )
            .filter(Boolean)
        )
      );

    const finnhubPrices =
      new Map<
        string,
        {
          price: number;
          timestampMs: number;
        }
      >();

    if (regularMarketOpen) {
      const settledStockPrices =
        await Promise.allSettled(
          activeSymbols.map(
            async (symbol) => {
              const quote =
                await fetchFinnhubLiveStockPrice(
                  symbol,
                  finnhubApiKey
                );

              return {
                symbol,
                ...quote,
              };
            }
          )
        );

      for (
        const result of
        settledStockPrices
      ) {
        if (
          result.status ===
          "fulfilled"
        ) {
          finnhubPrices.set(
            result.value.symbol,
            {
              price:
                result.value.price,
              timestampMs:
                result.value
                  .timestampMs,
            }
          );
        } else {
          console.warn(
            "تعذر تحديث سعر سهم من Finnhub:",
            result.reason
          );
        }
      }
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

        /*
          بعد اعتماد الوقف النهائي من بوت القرار،
          تتجمّد بيانات العقد عند سعر الإغلاق المحفوظ.
          لا نطلب سعرًا حيًا ولا نعيد حساب الربح والخسارة.
        */
        if (
          savedStatus === "STOPPED" ||
          savedContractStatus === "STOPPED"
        ) {
          return rawRow;
        }

        /*
          لا نجلب أي سعر ولا نكتب أي تحديث
          خارج جلسة السوق الرسمية.
        */
        if (!regularMarketOpen) {
          return rawRow;
        }

        try {
          const live =
            await fetchMassiveContractLivePrice(
              symbol,
              contractTicker,
              massiveApiKey
            );

          /*
            عند افتتاح السوق قد يعيد Massive
            آخر Quote أو Trade من جلسة أمس.

            لذلك لا نفك تجميد الصفقة حتى تصل
            أول بيانات فعلية من جلسة اليوم
            بعد 09:30 بتوقيت نيويورك.
          */
          if (
            !isCurrentRegularSessionTimestamp(
              live.marketDataAtMs
            )
          ) {
            return rawRow;
          }

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

          const finnhubStockQuote =
            finnhubPrices.get(
              symbol
                .trim()
                .toUpperCase()
            );

          /*
            Finnhub هو مصدر سعر السهم المباشر.
            لا نعتمد على underlying_asset
            الموجود داخل Snapshot الأوبشن.
          */
          const stockPrice =
            finnhubStockQuote &&
            finnhubStockQuote.price > 0
              ? finnhubStockQuote.price
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

          /*
            صفقة بوت القرار لا تُغلق محليًا من الموقع.
            بوت القرار هو مصدر الحقيقة للوقف النهائي،
            ويحدّث contract_status عند اعتماد الوقف.
          */
          const stopped = false;

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