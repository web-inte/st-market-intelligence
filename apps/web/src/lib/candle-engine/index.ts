import { aggregateCandles } from "./aggregate";
import { getCachedCandles, getCacheKey, getInFlightRequest, setCachedCandles, setInFlightRequest, clearInFlightRequest } from "./cache";
import { cleanMinuteBars } from "./clean";
import { fetchMassiveDailyCandles, fetchMassiveMinuteBars } from "./massive";
import type { CandleEngineResult, GetCandlesParams, SupportedInterval } from "./types";

const SUPPORTED_INTERVALS: SupportedInterval[] = [5, 15, 30, 60, 240, 1440];

function isSupportedInterval(interval: number): interval is SupportedInterval {
  return SUPPORTED_INTERVALS.includes(interval as SupportedInterval);
}

export async function getCandles(params: GetCandlesParams): Promise<CandleEngineResult> {
  if (!isSupportedInterval(params.interval)) {
    throw new Error("الفريم المطلوب غير مدعوم.");
  }

  const cacheKey = getCacheKey(params.symbol, params.interval);
  const cached = getCachedCandles(cacheKey);

  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  const inFlight = getInFlightRequest(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = (async () => {
    if (params.interval === 1440) {
      const dailyData = await fetchMassiveDailyCandles({
        symbol: params.symbol,
        apiKey: params.apiKey,
      });

      const result: CandleEngineResult = {
        symbol: dailyData.symbol,
        interval: params.interval,
        session: "regular",
        timezone: "America/New_York",
        candles: dailyData.candles,
        sourceBars: dailyData.sourceBars,
        source: "massive-1-day",
        cached: false,
        updatedAt: new Date().toISOString(),
      };

      setCachedCandles(cacheKey, params.interval, result);

      return result;
    }

    const massiveData = await fetchMassiveMinuteBars({
      symbol: params.symbol,
      interval: params.interval,
      apiKey: params.apiKey,
    });

    const minuteBars = cleanMinuteBars(massiveData.bars);
    const candles = aggregateCandles(minuteBars, params.interval);

    const result: CandleEngineResult = {
      symbol: massiveData.symbol,
      interval: params.interval,
      session: "regular",
      timezone: "America/New_York",
      candles,
      sourceBars: minuteBars.length,
      source: "massive-1-minute",
      cached: false,
      updatedAt: new Date().toISOString(),
    };

    setCachedCandles(cacheKey, params.interval, result);

    return result;
  })();

  setInFlightRequest(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    clearInFlightRequest(cacheKey);
  }
}

export type { Candle, CandleEngineResult, MinuteBar, SupportedInterval } from "./types";
