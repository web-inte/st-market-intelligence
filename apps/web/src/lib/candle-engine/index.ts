import { aggregateCandles } from "./aggregate";
import { getCachedCandles, getCacheKey, getInFlightRequest, setCachedCandles, setInFlightRequest, clearInFlightRequest } from "./cache";
import { cleanMinuteBars } from "./clean";
import { fetchMassiveDailyCandles, fetchMassiveMinuteBars } from "./massive";
import {
  fetchFinnhubCandles,
} from "./finnhub";
import type { CandleEngineResult, GetCandlesParams, SupportedInterval } from "./types";

const SUPPORTED_INTERVALS: SupportedInterval[] = [5, 15, 30, 60, 240, 1440];

function isSupportedInterval(interval: number): interval is SupportedInterval {
  return SUPPORTED_INTERVALS.includes(interval as SupportedInterval);
}

export async function getCandles(
  params: GetCandlesParams
): Promise<CandleEngineResult> {
  if (
    !isSupportedInterval(
      params.interval
    )
  ) {
    throw new Error(
      "الفريم المطلوب غير مدعوم."
    );
  }

  const cacheKey =
    getCacheKey(
      params.symbol,
      params.interval
    );

  const cached =
    getCachedCandles(
      cacheKey
    );

  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  const inFlight =
    getInFlightRequest(
      cacheKey
    );

  if (inFlight) {
    return inFlight;
  }

  const requestPromise =
    (async () => {
      const finnhubData =
        await fetchFinnhubCandles({
          symbol: params.symbol,
          interval:
            params.interval,
          apiKey: params.apiKey,
        });

      const source =
        params.interval === 1440
          ? "finnhub-daily"
          : params.interval === 240
            ? "finnhub-60-minute-aggregated-4h"
            : "finnhub-intraday";

      const result:
        CandleEngineResult = {
          symbol:
            finnhubData.symbol,
          interval:
            params.interval,
          session: "regular",
          timezone:
            "America/New_York",
          candles:
            finnhubData.candles,
          sourceBars:
            finnhubData.sourceBars,
          source,
          cached: false,
          updatedAt:
            new Date()
              .toISOString(),
        };

      setCachedCandles(
        cacheKey,
        params.interval,
        result
      );

      return result;
    })();

  setInFlightRequest(
    cacheKey,
    requestPromise
  );

  try {
    return await requestPromise;
  } finally {
    clearInFlightRequest(
      cacheKey
    );
  }
}

export type { Candle, CandleEngineResult, MinuteBar, SupportedInterval } from "./types";
