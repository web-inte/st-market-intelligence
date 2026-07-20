import type { CandleEngineResult, SupportedInterval } from "./types";

type CacheEntry = {
  expiresAt: number;
  value: CandleEngineResult;
};

const intervalTtlMs: Record<SupportedInterval, number> = {
  5: 20_000,
  15: 30_000,
  30: 45_000,
  60: 60_000,
  240: 5 * 60_000,
  1440: 15 * 60_000,
};

const candlesCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<CandleEngineResult>>();

export function getCacheKey(symbol: string, interval: SupportedInterval): string {
  return `${symbol}|${interval}`;
}

export function getCachedCandles(key: string): CandleEngineResult | null {
  const existing = candlesCache.get(key);

  if (!existing) {
    return null;
  }

  if (existing.expiresAt <= Date.now()) {
    candlesCache.delete(key);
    return null;
  }

  return {
    ...existing.value,
    candles: existing.value.candles.map((candle) => ({ ...candle })),
  };
}

export function setCachedCandles(key: string, interval: SupportedInterval, value: CandleEngineResult): void {
  candlesCache.set(key, {
    value: {
      ...value,
      candles: value.candles.map((candle) => ({ ...candle })),
    },
    expiresAt: Date.now() + intervalTtlMs[interval],
  });
}

export function getInFlightRequest(key: string): Promise<CandleEngineResult> | null {
  return inFlightRequests.get(key) ?? null;
}

export function setInFlightRequest(key: string, requestPromise: Promise<CandleEngineResult>): void {
  inFlightRequests.set(key, requestPromise);
}

export function clearInFlightRequest(key: string): void {
  inFlightRequests.delete(key);
}
