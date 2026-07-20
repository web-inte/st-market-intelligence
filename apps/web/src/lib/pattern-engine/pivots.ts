import type { Candle, Pivot, PivotEngineOptions } from "./types";
import { isValidIndex, isValidPrice } from "./geometry";

function isPivotHigh(
  candles: Candle[],
  index: number,
  leftBars: number,
  rightBars: number,
): boolean {
  const pivotHigh = candles[index].high;

  for (let i = index - leftBars; i <= index + rightBars; i += 1) {
    if (i === index) {
      continue;
    }
    if (candles[i].high >= pivotHigh) {
      return false;
    }
  }

  return true;
}

function isPivotLow(
  candles: Candle[],
  index: number,
  leftBars: number,
  rightBars: number,
): boolean {
  const pivotLow = candles[index].low;

  for (let i = index - leftBars; i <= index + rightBars; i += 1) {
    if (i === index) {
      continue;
    }
    if (candles[i].low <= pivotLow) {
      return false;
    }
  }

  return true;
}

export function detectPivots(
  candles: Candle[],
  options: PivotEngineOptions = {},
): Pivot[] {
  const leftBars = options.leftBars ?? 3;
  const rightBars = options.rightBars ?? 3;

  if (
    !Number.isInteger(leftBars) ||
    !Number.isInteger(rightBars) ||
    leftBars <= 0 ||
    rightBars <= 0
  ) {
    throw new Error("leftBars and rightBars must be positive integers");
  }

  const pivots: Pivot[] = [];
  const length = candles.length;

  if (length < leftBars + rightBars + 1) {
    return pivots;
  }

  for (let index = leftBars; index < length - rightBars; index += 1) {
    const candle = candles[index];
    const confirmedAtIndex = index + rightBars;

    if (!isValidIndex(confirmedAtIndex, length)) {
      continue;
    }

    if (isPivotHigh(candles, index, leftBars, rightBars)) {
      if (isValidPrice(candle.high)) {
        pivots.push({
          index,
          time: candle.time,
          price: candle.high,
          kind: "HIGH",
          confirmedAtIndex,
        });
      }
    }

    if (isPivotLow(candles, index, leftBars, rightBars)) {
      if (isValidPrice(candle.low)) {
        pivots.push({
          index,
          time: candle.time,
          price: candle.low,
          kind: "LOW",
          confirmedAtIndex,
        });
      }
    }
  }

  pivots.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    if (a.time !== b.time) {
      return a.time - b.time;
    }
    return a.kind === "HIGH" ? -1 : 1;
  });

  return pivots.filter((pivot) => {
    return (
      isValidIndex(pivot.index, length) &&
      isValidIndex(pivot.confirmedAtIndex, length) &&
      pivot.confirmedAtIndex >= pivot.index &&
      isValidPrice(pivot.price)
    );
  });
}
