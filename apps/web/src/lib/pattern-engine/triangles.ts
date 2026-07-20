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

interface TriangleDetectionOptions extends PivotEngineOptions {
  minPatternBars?: number;
  maxPatternBars?: number;
  minConfidence?: number;
  invalidationAtrMultiplier?: number;
  horizontalSlopeTolerance?: number;
  minConvergenceRatio?: number;
}

interface TriangleCandidate {
  pivots: Pivot[];
  highs: Pivot[];
  lows: Pivot[];
}

const DEFAULT_OPTIONS: Required<TriangleDetectionOptions> = {
  leftBars: 3,
  rightBars: 3,
  minPatternBars: 15,
  maxPatternBars: 180,
  minConfidence: 65,
  invalidationAtrMultiplier: 0.5,
  horizontalSlopeTolerance: 0.02,
  minConvergenceRatio: 0.1,
};

function atrAt(atrSeries: Array<number | null>, index: number): number {
  const direct = atrSeries[index];
  if (isFiniteNumber(direct) && direct > 0) {
    return direct;
  }

  for (let i = index; i >= 0; i -= 1) {
    const v = atrSeries[i];
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

function buildCandidates(pivots: Pivot[]): TriangleCandidate[] {
  const out: TriangleCandidate[] = [];

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

    out.push({ pivots: seq, highs, lows });
  }

  return out;
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

function relativeRange(valueA: number, valueB: number): number {
  const base = Math.max(Math.abs(valueA), Math.abs(valueB));
  if (base <= 0) {
    return Infinity;
  }
  return Math.abs(valueA - valueB) / base;
}

function nearHorizontal(values: number[], tolerance: number): boolean {
  if (values.length < 2) {
    return false;
  }

  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < min) {
      min = values[i];
    }
    if (values[i] > max) {
      max = values[i];
    }
  }

  return relativeRange(min, max) <= tolerance;
}

function shrinkingRange(
  startIndex: number,
  endIndex: number,
  resistanceSlope: number,
  resistanceIntercept: number,
  supportSlope: number,
  supportIntercept: number,
): { ok: boolean; widthStart: number; widthEnd: number; maxInitialWidth: number } {
  const widthStart =
    linePriceAtIndex(startIndex, resistanceSlope, resistanceIntercept) -
    linePriceAtIndex(startIndex, supportSlope, supportIntercept);
  const widthEnd =
    linePriceAtIndex(endIndex, resistanceSlope, resistanceIntercept) -
    linePriceAtIndex(endIndex, supportSlope, supportIntercept);

  if (!isFiniteNumber(widthStart) || !isFiniteNumber(widthEnd) || widthStart <= 0 || widthEnd <= 0) {
    return { ok: false, widthStart: 0, widthEnd: 0, maxInitialWidth: 0 };
  }

  if (!(widthEnd < widthStart)) {
    return { ok: false, widthStart, widthEnd, maxInitialWidth: 0 };
  }

  const span = endIndex - startIndex + 1;
  const initialEnd = startIndex + Math.max(1, Math.floor(span / 3));

  let maxInitialWidth = 0;
  for (let i = startIndex; i <= initialEnd; i += 1) {
    const res = linePriceAtIndex(i, resistanceSlope, resistanceIntercept);
    const sup = linePriceAtIndex(i, supportSlope, supportIntercept);
    const width = res - sup;
    if (isFiniteNumber(width) && width > maxInitialWidth) {
      maxInitialWidth = width;
    }
  }

  if (!(maxInitialWidth > 0)) {
    return { ok: false, widthStart, widthEnd, maxInitialWidth: 0 };
  }

  return { ok: true, widthStart, widthEnd, maxInitialWidth };
}

function buildConfidence(
  widthStart: number,
  widthEnd: number,
  startIndex: number,
  endIndex: number,
): number {
  const contraction = widthStart > 0 ? (widthStart - widthEnd) / widthStart : 0;
  const duration = endIndex - startIndex + 1;
  const contractionScore = Math.min(1, Math.max(0, contraction / 0.45));
  const durationScore = Math.min(1, duration / 90);
  const confidence = 65 + Math.round((0.65 * contractionScore + 0.35 * durationScore) * 30);
  return Math.max(65, Math.min(95, confidence));
}

function evaluateAscendingTriangle(
  candles: Candle[],
  atrSeries: Array<number | null>,
  candidate: TriangleCandidate,
  options: Required<TriangleDetectionOptions>,
): PatternResult | null {
  const highs = candidate.highs;
  const lows = candidate.lows;

  if (!strictlyIncreasing(lows.map((p) => p.price))) {
    return null;
  }

  const highPrices = highs.map((p) => p.price);
  if (!nearHorizontal(highPrices, options.horizontalSlopeTolerance)) {
    return null;
  }

  const supportSlope = slope(
    lows[0].index,
    lows[0].price,
    lows[lows.length - 1].index,
    lows[lows.length - 1].price,
  );
  if (!isFiniteNumber(supportSlope) || !(supportSlope > 0)) {
    return null;
  }

  const resistanceLevel = highPrices.reduce((acc, v) => acc + v, 0) / highPrices.length;
  if (!isValidPrice(resistanceLevel)) {
    return null;
  }

  const supportIntercept = intercept(lows[0].index, lows[0].price, supportSlope);
  if (!isFiniteNumber(supportIntercept)) {
    return null;
  }

  const startIndex = candidate.pivots[0].index;
  const structureEndIndex = candidate.pivots[candidate.pivots.length - 1].confirmedAtIndex;

  if (!isValidIndex(startIndex, candles.length) || !isValidIndex(structureEndIndex, candles.length)) {
    return null;
  }
  if (!(startIndex < structureEndIndex)) {
    return null;
  }

  const duration = structureEndIndex - startIndex + 1;
  if (duration < options.minPatternBars || duration > options.maxPatternBars) {
    return null;
  }

  const rangeCheck = shrinkingRange(
    startIndex,
    structureEndIndex,
    0,
    resistanceLevel,
    supportSlope,
    supportIntercept,
  );
  if (!rangeCheck.ok) {
    return null;
  }

  const convergenceRatio = (rangeCheck.widthStart - rangeCheck.widthEnd) / rangeCheck.widthStart;
  if (!(convergenceRatio >= options.minConvergenceRatio)) {
    return null;
  }

  let breakoutIndex = -1;
  for (let i = structureEndIndex; i < candles.length; i += 1) {
    if (candles[i].close > resistanceLevel) {
      breakoutIndex = i;
      break;
    }
  }

  const isConfirmed = breakoutIndex >= 0;
  const endIndex = isConfirmed ? breakoutIndex : structureEndIndex;

  if (!isValidIndex(endIndex, candles.length) || !(startIndex < endIndex)) {
    return null;
  }

  const finalDuration = endIndex - startIndex + 1;
  if (finalDuration < options.minPatternBars || finalDuration > options.maxPatternBars) {
    return null;
  }

  const breakoutPrice = isConfirmed
    ? candles[breakoutIndex].close
    : resistanceLevel;

  if (!isValidPrice(breakoutPrice)) {
    return null;
  }

  const lastLow = lows[lows.length - 1];
  const invalidation =
    lastLow.price - atrAt(atrSeries, lastLow.index) * options.invalidationAtrMultiplier;

  if (!isValidPrice(invalidation)) {
    return null;
  }

  const height = rangeCheck.maxInitialWidth;
  const target1 = breakoutPrice + height * 0.33;
  const target2 = breakoutPrice + height * 0.66;
  const target3 = breakoutPrice + height;

  if (![target1, target2, target3].every((x) => isValidPrice(x))) {
    return null;
  }

  const confidence = buildConfidence(
    rangeCheck.widthStart,
    rangeCheck.widthEnd,
    startIndex,
    endIndex,
  );

  if (confidence < options.minConfidence) {
    return null;
  }

  const result: PatternResult = {
    kind: "ASCENDING_TRIANGLE",
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
      ...highs.map((p, i) => ({ label: `R${i + 1}`, index: p.index, time: p.time, price: p.price })),
      ...lows.map((p, i) => ({ label: `S${i + 1}`, index: p.index, time: p.time, price: p.price })),
      { label: "BO", index: endIndex, time: candles[endIndex].time, price: breakoutPrice },
    ],
    rejectionReasons: [],
  };

  const check = validatePatternResult(result, candles.length);
  return check.valid ? result : null;
}

function evaluateDescendingTriangle(
  candles: Candle[],
  atrSeries: Array<number | null>,
  candidate: TriangleCandidate,
  options: Required<TriangleDetectionOptions>,
): PatternResult | null {
  const highs = candidate.highs;
  const lows = candidate.lows;

  if (!strictlyDecreasing(highs.map((p) => p.price))) {
    return null;
  }

  const lowPrices = lows.map((p) => p.price);
  if (!nearHorizontal(lowPrices, options.horizontalSlopeTolerance)) {
    return null;
  }

  const resistanceSlope = slope(
    highs[0].index,
    highs[0].price,
    highs[highs.length - 1].index,
    highs[highs.length - 1].price,
  );
  if (!isFiniteNumber(resistanceSlope) || !(resistanceSlope < 0)) {
    return null;
  }

  const supportLevel = lowPrices.reduce((acc, v) => acc + v, 0) / lowPrices.length;
  if (!isValidPrice(supportLevel)) {
    return null;
  }

  const resistanceIntercept = intercept(highs[0].index, highs[0].price, resistanceSlope);
  if (!isFiniteNumber(resistanceIntercept)) {
    return null;
  }

  const startIndex = candidate.pivots[0].index;
  const structureEndIndex = candidate.pivots[candidate.pivots.length - 1].confirmedAtIndex;

  if (!isValidIndex(startIndex, candles.length) || !isValidIndex(structureEndIndex, candles.length)) {
    return null;
  }
  if (!(startIndex < structureEndIndex)) {
    return null;
  }

  const duration = structureEndIndex - startIndex + 1;
  if (duration < options.minPatternBars || duration > options.maxPatternBars) {
    return null;
  }

  const rangeCheck = shrinkingRange(
    startIndex,
    structureEndIndex,
    resistanceSlope,
    resistanceIntercept,
    0,
    supportLevel,
  );
  if (!rangeCheck.ok) {
    return null;
  }

  const convergenceRatio = (rangeCheck.widthStart - rangeCheck.widthEnd) / rangeCheck.widthStart;
  if (!(convergenceRatio >= options.minConvergenceRatio)) {
    return null;
  }

  let breakoutIndex = -1;
  for (let i = structureEndIndex; i < candles.length; i += 1) {
    if (candles[i].close < supportLevel) {
      breakoutIndex = i;
      break;
    }
  }

  const isConfirmed = breakoutIndex >= 0;
  const endIndex = isConfirmed ? breakoutIndex : structureEndIndex;

  if (!isValidIndex(endIndex, candles.length) || !(startIndex < endIndex)) {
    return null;
  }

  const finalDuration = endIndex - startIndex + 1;
  if (finalDuration < options.minPatternBars || finalDuration > options.maxPatternBars) {
    return null;
  }

  const breakoutPrice = isConfirmed
    ? candles[breakoutIndex].close
    : supportLevel;

  if (!isValidPrice(breakoutPrice)) {
    return null;
  }

  const lastHigh = highs[highs.length - 1];
  const invalidation =
    lastHigh.price + atrAt(atrSeries, lastHigh.index) * options.invalidationAtrMultiplier;

  if (!isValidPrice(invalidation)) {
    return null;
  }

  const height = rangeCheck.maxInitialWidth;
  const target1 = breakoutPrice - height * 0.33;
  const target2 = breakoutPrice - height * 0.66;
  const target3 = breakoutPrice - height;

  if (![target1, target2, target3].every((x) => isValidPrice(x))) {
    return null;
  }

  const confidence = buildConfidence(
    rangeCheck.widthStart,
    rangeCheck.widthEnd,
    startIndex,
    endIndex,
  );

  if (confidence < options.minConfidence) {
    return null;
  }

  const result: PatternResult = {
    kind: "DESCENDING_TRIANGLE",
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
      ...highs.map((p, i) => ({ label: `R${i + 1}`, index: p.index, time: p.time, price: p.price })),
      ...lows.map((p, i) => ({ label: `S${i + 1}`, index: p.index, time: p.time, price: p.price })),
      { label: "BO", index: endIndex, time: candles[endIndex].time, price: breakoutPrice },
    ],
    rejectionReasons: [],
  };

  const check = validatePatternResult(result, candles.length);
  return check.valid ? result : null;
}

function dedupeAndSort(patterns: PatternResult[]): PatternResult[] {
  const seen = new Set<string>();
  const out: PatternResult[] = [];

  for (const p of patterns) {
    const key = [p.kind, p.status, p.startIndex, p.endIndex, p.breakout.index].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(p);
  }

  return out.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    return a.endIndex - b.endIndex;
  });
}

export function detectTriangles(
  candles: Candle[],
  options: TriangleDetectionOptions = {},
): PatternResult[] {
  const merged: Required<TriangleDetectionOptions> = {
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
  const out: PatternResult[] = [];

  for (const candidate of candidates) {
    const asc = evaluateAscendingTriangle(candles, atrSeries, candidate, merged);
    if (asc) {
      out.push(asc);
    }

    const desc = evaluateDescendingTriangle(candles, atrSeries, candidate, merged);
    if (desc) {
      out.push(desc);
    }
  }

  return dedupeAndSort(out);
}
