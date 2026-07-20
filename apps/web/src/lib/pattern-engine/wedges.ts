import { calculateAtr } from "./atr";
import {
  intercept,
  isFiniteNumber,
  isValidIndex,
  isValidPrice,
  linePriceAtIndex,
  slope,
} from "./geometry";
import { detectPivots } from "./pivots";
import type { Candle, PatternResult, Pivot, PivotEngineOptions } from "./types";
import { validateCandles, validatePatternResult, validatePivots } from "./validation";

interface WedgeDetectionOptions extends PivotEngineOptions {
  minPatternBars?: number;
  maxPatternBars?: number;
  minConfidence?: number;
  invalidationAtrMultiplier?: number;
  minConvergenceRatio?: number;
}

interface WedgeCandidate {
  pivots: Pivot[];
  highs: Pivot[];
  lows: Pivot[];
}

const DEFAULT_OPTIONS: Required<WedgeDetectionOptions> = {
  leftBars: 3,
  rightBars: 3,
  minPatternBars: 15,
  maxPatternBars: 180,
  minConfidence: 65,
  invalidationAtrMultiplier: 0.5,
  minConvergenceRatio: 0.1,
};

function atrAt(atr: Array<number | null>, index: number): number {
  const direct = atr[index];
  if (isFiniteNumber(direct) && direct > 0) {
    return direct;
  }

  for (let i = index; i >= 0; i -= 1) {
    const v = atr[i];
    if (isFiniteNumber(v) && v > 0) {
      return v;
    }
  }

  return 0;
}

function hasAlternatingKinds(pivots: Pivot[]): boolean {
  for (let i = 1; i < pivots.length; i += 1) {
    if (pivots[i].kind === pivots[i - 1].kind) {
      return false;
    }
  }
  return true;
}

function buildCandidates(pivots: Pivot[]): WedgeCandidate[] {
  const candidates: WedgeCandidate[] = [];

  for (let i = 0; i <= pivots.length - 6; i += 1) {
    const seq = pivots.slice(i, i + 6);
    if (!hasAlternatingKinds(seq)) {
      continue;
    }

    const highs = seq.filter((p) => p.kind === "HIGH");
    const lows = seq.filter((p) => p.kind === "LOW");

    if (highs.length < 3 || lows.length < 3) {
      continue;
    }

    candidates.push({ pivots: seq, highs, lows });
  }

  return candidates;
}

function strictlyIncreasing(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (!(values[i] > values[i - 1])) {
      return false;
    }
  }
  return true;
}

function strictlyDecreasing(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (!(values[i] < values[i - 1])) {
      return false;
    }
  }
  return true;
}

function isContractingSwings(highs: Pivot[], lows: Pivot[]): boolean {
  const len = Math.min(highs.length, lows.length);
  if (len < 3) {
    return false;
  }

  const swings: number[] = [];
  for (let i = 0; i < len; i += 1) {
    const swing = Math.abs(highs[i].price - lows[i].price);
    if (!isFiniteNumber(swing) || swing <= 0) {
      return false;
    }
    swings.push(swing);
  }

  // Require gradual contraction instead of a single abrupt drop.
  return (
    swings[0] > swings[1] * 1.03 &&
    swings[1] >= swings[2] * 0.98 &&
    swings[0] > swings[2] * 1.1
  );
}

function maxWedgeWidth(
  startIndex: number,
  endIndex: number,
  resistanceSlope: number,
  resistanceIntercept: number,
  supportSlope: number,
  supportIntercept: number,
): number {
  let maxWidth = 0;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const resistance = linePriceAtIndex(i, resistanceSlope, resistanceIntercept);
    const support = linePriceAtIndex(i, supportSlope, supportIntercept);
    const width = resistance - support;
    if (isFiniteNumber(width) && width > maxWidth) {
      maxWidth = width;
    }
  }
  return maxWidth;
}

function buildConfidence(
  widthStart: number,
  widthEnd: number,
  maxWidth: number,
  startIndex: number,
  endIndex: number,
): number {
  const contraction = widthStart > 0 ? (widthStart - widthEnd) / widthStart : 0;
  const duration = endIndex - startIndex + 1;
  const durationScore = Math.min(1, duration / 90);
  const widthScore = maxWidth > 0 ? Math.min(1, contraction / 0.35) : 0;

  const score = 65 + Math.round((0.6 * widthScore + 0.4 * durationScore) * 30);
  return Math.max(65, Math.min(95, score));
}

function dedupeAndSort(patterns: PatternResult[]): PatternResult[] {
  const seen = new Set<string>();
  const out: PatternResult[] = [];

  for (const pattern of patterns) {
    const key = [
      pattern.kind,
      pattern.status,
      pattern.startIndex,
      pattern.endIndex,
      pattern.breakout.index,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(pattern);
  }

  return out.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    return a.endIndex - b.endIndex;
  });
}

function evaluateRisingWedge(
  candles: Candle[],
  atrSeries: Array<number | null>,
  candidate: WedgeCandidate,
  options: Required<WedgeDetectionOptions>,
): PatternResult | null {
  const highs = candidate.highs;
  const lows = candidate.lows;

  if (
    !strictlyIncreasing(highs.map((p) => p.price)) ||
    !strictlyIncreasing(lows.map((p) => p.price))
  ) {
    return null;
  }

  const resistanceSlope = slope(
    highs[0].index,
    highs[0].price,
    highs[highs.length - 1].index,
    highs[highs.length - 1].price,
  );
  const supportSlope = slope(
    lows[0].index,
    lows[0].price,
    lows[lows.length - 1].index,
    lows[lows.length - 1].price,
  );

  if (!isFiniteNumber(resistanceSlope) || !isFiniteNumber(supportSlope)) {
    return null;
  }

  if (!(resistanceSlope > 0 && supportSlope > 0 && supportSlope > resistanceSlope)) {
    return null;
  }

  const resistanceIntercept = intercept(highs[0].index, highs[0].price, resistanceSlope);
  const supportIntercept = intercept(lows[0].index, lows[0].price, supportSlope);

  if (!isFiniteNumber(resistanceIntercept) || !isFiniteNumber(supportIntercept)) {
    return null;
  }

  const startIndex = candidate.pivots[0].index;
  const structureEndPivot = candidate.pivots[candidate.pivots.length - 1];
  const structureEndIndex = structureEndPivot.confirmedAtIndex;

  if (!isValidIndex(startIndex, candles.length) || !isValidIndex(structureEndIndex, candles.length)) {
    return null;
  }

  if (startIndex >= structureEndIndex) {
    return null;
  }

  const duration = structureEndIndex - startIndex + 1;
  if (duration < options.minPatternBars || duration > options.maxPatternBars) {
    return null;
  }

  const widthStart =
    linePriceAtIndex(startIndex, resistanceSlope, resistanceIntercept) -
    linePriceAtIndex(startIndex, supportSlope, supportIntercept);
  const widthEnd =
    linePriceAtIndex(structureEndIndex, resistanceSlope, resistanceIntercept) -
    linePriceAtIndex(structureEndIndex, supportSlope, supportIntercept);

  if (!isFiniteNumber(widthStart) || !isFiniteNumber(widthEnd) || widthStart <= 0 || widthEnd <= 0) {
    return null;
  }

  if (!(widthEnd < widthStart)) {
    return null;
  }

  const convergenceRatio = (widthStart - widthEnd) / widthStart;
  if (!(convergenceRatio >= options.minConvergenceRatio)) {
    return null;
  }

  if (!isContractingSwings(highs, lows)) {
    return null;
  }

  const maxWidth = maxWedgeWidth(
    startIndex,
    structureEndIndex,
    resistanceSlope,
    resistanceIntercept,
    supportSlope,
    supportIntercept,
  );

  if (!isFiniteNumber(maxWidth) || maxWidth <= 0) {
    return null;
  }

  let breakoutIndex = -1;
  for (let i = structureEndIndex; i < candles.length; i += 1) {
    const close = candles[i].close;
    const supportLine = linePriceAtIndex(i, supportSlope, supportIntercept);
    if (!isValidPrice(supportLine)) {
      continue;
    }
    if (close < supportLine) {
      breakoutIndex = i;
      break;
    }
  }

  const isConfirmed = breakoutIndex >= 0;
  const endIndex = isConfirmed ? breakoutIndex : structureEndIndex;

  if (!isValidIndex(endIndex, candles.length) || startIndex >= endIndex) {
    return null;
  }

  const finalDuration = endIndex - startIndex + 1;
  if (finalDuration < options.minPatternBars || finalDuration > options.maxPatternBars) {
    return null;
  }

  const breakoutPrice = isConfirmed
    ? candles[breakoutIndex].close
    : linePriceAtIndex(endIndex, supportSlope, supportIntercept);

  if (!isValidPrice(breakoutPrice)) {
    return null;
  }

  const lastHigh = highs[highs.length - 1];
  const invalidation =
    lastHigh.price + atrAt(atrSeries, lastHigh.index) * options.invalidationAtrMultiplier;

  if (!isValidPrice(invalidation)) {
    return null;
  }

  const target3 = breakoutPrice - maxWidth;
  const targetDistance = breakoutPrice - target3;
  const target1 = breakoutPrice - targetDistance * 0.33;
  const target2 = breakoutPrice - targetDistance * 0.66;

  if (![target1, target2, target3].every((v) => isValidPrice(v))) {
    return null;
  }

  const confidence = buildConfidence(
    widthStart,
    widthEnd,
    maxWidth,
    startIndex,
    endIndex,
  );

  if (confidence < options.minConfidence) {
    return null;
  }

  const result: PatternResult = {
    kind: "RISING_WEDGE",
    status: isConfirmed ? "CONFIRMED" : "FORMING",
    direction: "PUT",
    confidence,
    startIndex,
    endIndex,
    breakout: {
      index: endIndex,
      time: candles[endIndex].time,
      price: breakoutPrice,
    },
    invalidation,
    target1,
    target2,
    target3,
    drawingPoints: [
      ...lows.map((p, i) => ({ label: `L${i + 1}`, index: p.index, time: p.time, price: p.price })),
      ...highs.map((p, i) => ({ label: `H${i + 1}`, index: p.index, time: p.time, price: p.price })),
      {
        label: "BO",
        index: endIndex,
        time: candles[endIndex].time,
        price: breakoutPrice,
      },
    ],
    rejectionReasons: [],
  };

  const check = validatePatternResult(result, candles.length);
  return check.valid ? result : null;
}

function evaluateFallingWedge(
  candles: Candle[],
  atrSeries: Array<number | null>,
  candidate: WedgeCandidate,
  options: Required<WedgeDetectionOptions>,
): PatternResult | null {
  const highs = candidate.highs;
  const lows = candidate.lows;

  if (
    !strictlyDecreasing(highs.map((p) => p.price)) ||
    !strictlyDecreasing(lows.map((p) => p.price))
  ) {
    return null;
  }

  const resistanceSlope = slope(
    highs[0].index,
    highs[0].price,
    highs[highs.length - 1].index,
    highs[highs.length - 1].price,
  );
  const supportSlope = slope(
    lows[0].index,
    lows[0].price,
    lows[lows.length - 1].index,
    lows[lows.length - 1].price,
  );

  if (!isFiniteNumber(resistanceSlope) || !isFiniteNumber(supportSlope)) {
    return null;
  }

  if (!(resistanceSlope < 0 && supportSlope < 0 && resistanceSlope < supportSlope)) {
    return null;
  }

  const resistanceIntercept = intercept(highs[0].index, highs[0].price, resistanceSlope);
  const supportIntercept = intercept(lows[0].index, lows[0].price, supportSlope);

  if (!isFiniteNumber(resistanceIntercept) || !isFiniteNumber(supportIntercept)) {
    return null;
  }

  const startIndex = candidate.pivots[0].index;
  const structureEndPivot = candidate.pivots[candidate.pivots.length - 1];
  const structureEndIndex = structureEndPivot.confirmedAtIndex;

  if (!isValidIndex(startIndex, candles.length) || !isValidIndex(structureEndIndex, candles.length)) {
    return null;
  }

  if (startIndex >= structureEndIndex) {
    return null;
  }

  const duration = structureEndIndex - startIndex + 1;
  if (duration < options.minPatternBars || duration > options.maxPatternBars) {
    return null;
  }

  const widthStart =
    linePriceAtIndex(startIndex, resistanceSlope, resistanceIntercept) -
    linePriceAtIndex(startIndex, supportSlope, supportIntercept);
  const widthEnd =
    linePriceAtIndex(structureEndIndex, resistanceSlope, resistanceIntercept) -
    linePriceAtIndex(structureEndIndex, supportSlope, supportIntercept);

  if (!isFiniteNumber(widthStart) || !isFiniteNumber(widthEnd) || widthStart <= 0 || widthEnd <= 0) {
    return null;
  }

  if (!(widthEnd < widthStart)) {
    return null;
  }

  const convergenceRatio = (widthStart - widthEnd) / widthStart;
  if (!(convergenceRatio >= options.minConvergenceRatio)) {
    return null;
  }

  if (!isContractingSwings(highs, lows)) {
    return null;
  }

  const maxWidth = maxWedgeWidth(
    startIndex,
    structureEndIndex,
    resistanceSlope,
    resistanceIntercept,
    supportSlope,
    supportIntercept,
  );

  if (!isFiniteNumber(maxWidth) || maxWidth <= 0) {
    return null;
  }

  let breakoutIndex = -1;
  for (let i = structureEndIndex; i < candles.length; i += 1) {
    const close = candles[i].close;
    const resistanceLine = linePriceAtIndex(i, resistanceSlope, resistanceIntercept);
    if (!isValidPrice(resistanceLine)) {
      continue;
    }
    if (close > resistanceLine) {
      breakoutIndex = i;
      break;
    }
  }

  const isConfirmed = breakoutIndex >= 0;
  const endIndex = isConfirmed ? breakoutIndex : structureEndIndex;

  if (!isValidIndex(endIndex, candles.length) || startIndex >= endIndex) {
    return null;
  }

  const finalDuration = endIndex - startIndex + 1;
  if (finalDuration < options.minPatternBars || finalDuration > options.maxPatternBars) {
    return null;
  }

  const breakoutPrice = isConfirmed
    ? candles[breakoutIndex].close
    : linePriceAtIndex(endIndex, resistanceSlope, resistanceIntercept);

  if (!isValidPrice(breakoutPrice)) {
    return null;
  }

  const lastLow = lows[lows.length - 1];
  const invalidation =
    lastLow.price - atrAt(atrSeries, lastLow.index) * options.invalidationAtrMultiplier;

  if (!isValidPrice(invalidation)) {
    return null;
  }

  const target3 = breakoutPrice + maxWidth;
  const targetDistance = target3 - breakoutPrice;
  const target1 = breakoutPrice + targetDistance * 0.33;
  const target2 = breakoutPrice + targetDistance * 0.66;

  if (![target1, target2, target3].every((v) => isValidPrice(v))) {
    return null;
  }

  const confidence = buildConfidence(
    widthStart,
    widthEnd,
    maxWidth,
    startIndex,
    endIndex,
  );

  if (confidence < options.minConfidence) {
    return null;
  }

  const result: PatternResult = {
    kind: "FALLING_WEDGE",
    status: isConfirmed ? "CONFIRMED" : "FORMING",
    direction: "CALL",
    confidence,
    startIndex,
    endIndex,
    breakout: {
      index: endIndex,
      time: candles[endIndex].time,
      price: breakoutPrice,
    },
    invalidation,
    target1,
    target2,
    target3,
    drawingPoints: [
      ...lows.map((p, i) => ({ label: `L${i + 1}`, index: p.index, time: p.time, price: p.price })),
      ...highs.map((p, i) => ({ label: `H${i + 1}`, index: p.index, time: p.time, price: p.price })),
      {
        label: "BO",
        index: endIndex,
        time: candles[endIndex].time,
        price: breakoutPrice,
      },
    ],
    rejectionReasons: [],
  };

  const check = validatePatternResult(result, candles.length);
  return check.valid ? result : null;
}

export function detectWedges(
  candles: Candle[],
  options: WedgeDetectionOptions = {},
): PatternResult[] {
  const merged: Required<WedgeDetectionOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const candlesCheck = validateCandles(candles);
  if (!candlesCheck.valid) {
    return [];
  }

  const pivots = detectPivots(candles, {
    leftBars: merged.leftBars,
    rightBars: merged.rightBars,
  });

  const pivotsCheck = validatePivots(pivots, candles.length);
  if (!pivotsCheck.valid) {
    return [];
  }

  const atrSeries = calculateAtr(candles, 14);
  const candidates = buildCandidates(pivots);

  const patterns: PatternResult[] = [];
  for (const candidate of candidates) {
    const rising = evaluateRisingWedge(candles, atrSeries, candidate, merged);
    if (rising) {
      patterns.push(rising);
    }

    const falling = evaluateFallingWedge(candles, atrSeries, candidate, merged);
    if (falling) {
      patterns.push(falling);
    }
  }

  return dedupeAndSort(patterns);
}
