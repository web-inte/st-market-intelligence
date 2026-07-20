import type { Candle } from "./types";
import { isFiniteNumber } from "./geometry";

function trueRange(current: Candle, previousClose?: number): number {
  const range = current.high - current.low;
  if (!isFiniteNumber(previousClose)) {
    return range;
  }

  const highToPrevClose = Math.abs(current.high - previousClose);
  const lowToPrevClose = Math.abs(current.low - previousClose);

  return Math.max(range, highToPrevClose, lowToPrevClose);
}

export function calculateTrueRangeSeries(candles: Candle[]): number[] {
  const tr: number[] = [];

  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : undefined;
    tr.push(trueRange(current, prevClose));
  }

  return tr;
}

export function calculateAtr(
  candles: Candle[],
  period = 14,
): Array<number | null> {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error("ATR period must be a positive integer");
  }

  const length = candles.length;
  const result: Array<number | null> = new Array(length).fill(null);

  if (length === 0 || length < period) {
    return result;
  }

  const tr = calculateTrueRangeSeries(candles);

  let trSum = 0;
  for (let i = 0; i < period; i += 1) {
    trSum += tr[i];
  }

  let prevAtr = trSum / period;
  result[period - 1] = prevAtr;

  for (let i = period; i < length; i += 1) {
    prevAtr = ((prevAtr * (period - 1)) + tr[i]) / period;
    result[i] = prevAtr;
  }

  return result;
}
