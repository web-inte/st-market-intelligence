import { getEasternSessionInfo } from "./time";
import type { Candle, MinuteBar, SupportedInterval } from "./types";

const SUPPORTED_INTERVALS: SupportedInterval[] = [5, 15, 30, 60, 240, 1440];

type CandleBucket = {
  dateKey: string;
  bucketIndex: number;
  candle: Candle;
};

function ensureSupportedInterval(interval: number): asserts interval is SupportedInterval {
  if (!SUPPORTED_INTERVALS.includes(interval as SupportedInterval)) {
    throw new Error("الفريم المطلوب غير مدعوم في محرك الشموع.");
  }
}

function getBucketIndex(interval: SupportedInterval, minutesFromOpen: number): number {
  if (interval === 240) {
    return minutesFromOpen < 240 ? 0 : 1;
  }

  if (interval === 1440) {
    return 0;
  }

  return Math.floor(minutesFromOpen / interval);
}

export function aggregateCandles(minuteBars: MinuteBar[], interval: SupportedInterval): Candle[] {
  ensureSupportedInterval(interval);

  const sorted = [...minuteBars].sort((left, right) => left.timeMs - right.timeMs);
  const buckets = new Map<string, CandleBucket>();

  for (const bar of sorted) {
    const sessionInfo = getEasternSessionInfo(bar.timeMs);

    if (!sessionInfo.isRegularSession) {
      continue;
    }

    const bucketIndex = getBucketIndex(interval, sessionInfo.minutesFromOpen);
    const bucketKey = `${sessionInfo.dateKey}|${bucketIndex}`;
    const existing = buckets.get(bucketKey);

    if (!existing) {
      buckets.set(bucketKey, {
        dateKey: sessionInfo.dateKey,
        bucketIndex,
        candle: {
          time: Math.floor(bar.timeMs / 1000),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        },
      });
      continue;
    }

    existing.candle.high = Math.max(existing.candle.high, bar.high);
    existing.candle.low = Math.min(existing.candle.low, bar.low);
    existing.candle.close = bar.close;
    existing.candle.volume += bar.volume;
  }

  const candles = Array.from(buckets.values())
    .sort((left, right) => {
      if (left.candle.time !== right.candle.time) {
        return left.candle.time - right.candle.time;
      }
      if (left.dateKey !== right.dateKey) {
        return left.dateKey.localeCompare(right.dateKey);
      }
      return left.bucketIndex - right.bucketIndex;
    })
    .map((entry) => entry.candle);

  if (interval === 1440 && candles.length > 500) {
    return candles.slice(-500);
  }

  return candles;
}
