import type {
  Candle,
  SupportedInterval,
} from "./types";

type FinnhubCandlesPayload = {
  c?: number[];
  h?: number[];
  l?: number[];
  o?: number[];
  s?: string;
  t?: number[];
  v?: number[];
};

type FinnhubCandleResult = {
  symbol: string;
  candles: Candle[];
  sourceBars: number;
};

const FINNHUB_BASE_URL =
  "https://finnhub.io/api/v1";

const MAX_RETURNED_CANDLES = 600;

function normalizeSymbol(
  value: string
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
}

function safeNumber(
  value: unknown
): number | null {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function getFinnhubResolution(
  interval: SupportedInterval
) {
  if (interval === 1440) {
    return "D";
  }

  /*
    Finnhub لا يوفّر 240 دقيقة
    كفريم أصلي، لذلك نجلب 60 دقيقة
    ونجمعها لاحقًا إلى 4 ساعات.
  */
  if (interval === 240) {
    return "60";
  }

  return String(interval);
}

function getLookbackSeconds(
  interval: SupportedInterval
) {
  const day = 24 * 60 * 60;

  switch (interval) {
    case 5:
      return 14 * day;

    case 15:
      return 30 * day;

    case 30:
      return 60 * day;

    case 60:
      return 120 * day;

    case 240:
      return 240 * day;

    case 1440:
      return 3 * 365 * day;
  }
}

function parseFinnhubCandles(
  payload: FinnhubCandlesPayload
): Candle[] {
  if (
    payload.s !== "ok" ||
    !Array.isArray(payload.t) ||
    !Array.isArray(payload.o) ||
    !Array.isArray(payload.h) ||
    !Array.isArray(payload.l) ||
    !Array.isArray(payload.c) ||
    !Array.isArray(payload.v)
  ) {
    return [];
  }

  const length = Math.min(
    payload.t.length,
    payload.o.length,
    payload.h.length,
    payload.l.length,
    payload.c.length,
    payload.v.length
  );

  const candles: Candle[] = [];

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    const time =
      safeNumber(payload.t[index]);

    const open =
      safeNumber(payload.o[index]);

    const high =
      safeNumber(payload.h[index]);

    const low =
      safeNumber(payload.l[index]);

    const close =
      safeNumber(payload.c[index]);

    const volume =
      safeNumber(payload.v[index]);

    if (
      time === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null ||
      time <= 0 ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0 ||
      high < low
    ) {
      continue;
    }

    candles.push({
      time: Math.floor(time),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
    });
  }

  return candles
    .sort(
      (first, second) =>
        first.time - second.time
    )
    .filter(
      (
        candle,
        index,
        allCandles
      ) =>
        index === 0 ||
        candle.time !==
          allCandles[index - 1].time
    );
}

function aggregateFourHourCandles(
  hourlyCandles: Candle[]
): Candle[] {
  const grouped =
    new Map<number, Candle[]>();

  for (const candle of hourlyCandles) {
    /*
      نجمع كل أربع ساعات حسب
      Unix UTC لضمان ترتيب ثابت.
    */
    const bucketSeconds =
      4 * 60 * 60;

    const bucketTime =
      Math.floor(
        candle.time /
          bucketSeconds
      ) * bucketSeconds;

    const current =
      grouped.get(bucketTime) || [];

    current.push(candle);

    grouped.set(
      bucketTime,
      current
    );
  }

  return Array.from(
    grouped.entries()
  )
    .sort(
      ([firstTime], [secondTime]) =>
        firstTime - secondTime
    )
    .map(([time, group]) => {
      const sorted = [...group].sort(
        (first, second) =>
          first.time - second.time
      );

      return {
        time,
        open: sorted[0].open,
        high: Math.max(
          ...sorted.map(
            (candle) =>
              candle.high
          )
        ),
        low: Math.min(
          ...sorted.map(
            (candle) =>
              candle.low
          )
        ),
        close:
          sorted[
            sorted.length - 1
          ].close,
        volume: sorted.reduce(
          (total, candle) =>
            total +
            candle.volume,
          0
        ),
      };
    });
}

export async function fetchFinnhubCandles(
  params: {
    symbol: string;
    interval: SupportedInterval;
    apiKey: string;
  }
): Promise<FinnhubCandleResult> {
  const symbol =
    normalizeSymbol(params.symbol);

  if (!symbol) {
    throw new Error(
      "رمز السهم غير صالح."
    );
  }

  const apiKey =
    String(
      params.apiKey || ""
    ).trim();

  if (!apiKey) {
    throw new Error(
      "FINNHUB_API_KEY غير موجود."
    );
  }

  const nowSeconds =
    Math.floor(
      Date.now() / 1000
    );

  const fromSeconds =
    nowSeconds -
    getLookbackSeconds(
      params.interval
    );

  const resolution =
    getFinnhubResolution(
      params.interval
    );

  const url =
    `${FINNHUB_BASE_URL}/stock/candle` +
    `?symbol=${encodeURIComponent(
      symbol
    )}` +
    `&resolution=${encodeURIComponent(
      resolution
    )}` +
    `&from=${fromSeconds}` +
    `&to=${nowSeconds}` +
    `&token=${encodeURIComponent(
      apiKey
    )}`;

  const response =
    await fetch(url, {
      cache: "no-store",
      signal:
        AbortSignal.timeout(
          20_000
        ),
    });

  if (!response.ok) {
    const error =
      new Error(
        `Finnhub candles HTTP ${response.status}`
      ) as Error & {
        status?: number;
      };

    error.status =
      response.status;

    throw error;
  }

  const payload =
    (await response.json()) as
      FinnhubCandlesPayload;

  if (payload.s === "no_data") {
    return {
      symbol,
      candles: [],
      sourceBars: 0,
    };
  }

  let candles =
    parseFinnhubCandles(
      payload
    );

  const sourceBars =
    candles.length;

  if (params.interval === 240) {
    candles =
      aggregateFourHourCandles(
        candles
      );
  }

  candles =
    candles.slice(
      -MAX_RETURNED_CANDLES
    );

  return {
    symbol,
    candles,
    sourceBars,
  };
}
