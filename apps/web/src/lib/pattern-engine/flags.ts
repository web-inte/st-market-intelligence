import { calculateAtr } from "./atr";
import { intercept, isFiniteNumber, isValidIndex, isValidPrice, linePriceAtIndex, slope } from "./geometry";
import { detectPivots } from "./pivots";
import type { Candle, PatternResult, Pivot, PivotEngineOptions } from "./types";
import { validateCandles, validatePatternResult, validatePivots } from "./validation";

interface FlagDetectionOptions extends PivotEngineOptions {
  minPatternBars?: number;
  maxPatternBars?: number;
  minConfidence?: number;
  invalidationAtrMultiplier?: number;
  parallelToleranceRatio?: number;
}

interface FlagCandidate {
  poleStart: Pivot;
  poleEnd: Pivot;
  channelPivots: Pivot[];
}

const DEFAULT_OPTIONS: Required<FlagDetectionOptions> = {
  leftBars: 3,
  rightBars: 3,
  minPatternBars: 5,
  maxPatternBars: 60,
  minConfidence: 65,
  invalidationAtrMultiplier: 0.5,
  parallelToleranceRatio: 0.5,
};

function atrAt(series: Array<number | null>, index: number): number {
  const direct = series[index];
  if (isFiniteNumber(direct) && direct > 0) {
    return direct;
  }

  for (let i = index; i >= 0; i -= 1) {
    const v = series[i];
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

function buildCandidates(pivots: Pivot[]): FlagCandidate[] {
  const out: FlagCandidate[] = [];

  for (let i = 0; i <= pivots.length - 6; i += 1) {
    const poleStart = pivots[i];
    const poleEnd = pivots[i + 1];
    const channelPivots = pivots.slice(i + 2, i + 6);

    if (!hasAlternatingKinds([poleStart, poleEnd, ...channelPivots])) {
      continue;
    }

    const highs = channelPivots.filter((p) => p.kind === "HIGH");
    const lows = channelPivots.filter((p) => p.kind === "LOW");
    if (highs.length < 2 || lows.length < 2) {
      continue;
    }

    out.push({ poleStart, poleEnd, channelPivots });
  }

  return out;
}

function closePathEfficiency(candles: Candle[], startIndex: number, endIndex: number): number {
  if (!isValidIndex(startIndex, candles.length) || !isValidIndex(endIndex, candles.length) || startIndex >= endIndex) {
    return 0;
  }

  const net = Math.abs(candles[endIndex].close - candles[startIndex].close);
  let path = 0;
  for (let i = startIndex + 1; i <= endIndex; i += 1) {
    path += Math.abs(candles[i].close - candles[i - 1].close);
  }

  if (!isFiniteNumber(path) || path <= 0) {
    return 0;
  }

  return net / path;
}

function lineFromTwoPivots(first: Pivot, second: Pivot): { m: number; b: number } | null {
  const m = slope(first.index, first.price, second.index, second.price);
  if (!isFiniteNumber(m)) {
    return null;
  }
  const b = intercept(first.index, first.price, m);
  if (!isFiniteNumber(b)) {
    return null;
  }
  return { m, b };
}

function areParallelEnough(m1: number, m2: number, toleranceRatio: number): boolean {
  const base = Math.max(Math.abs(m1), Math.abs(m2), 1e-9);
  return Math.abs(m1 - m2) <= base * toleranceRatio;
}

function channelWidths(
  startIndex: number,
  endIndex: number,
  upperM: number,
  upperB: number,
  lowerM: number,
  lowerB: number,
): { start: number; end: number; max: number } | null {
  const startWidth = linePriceAtIndex(startIndex, upperM, upperB) - linePriceAtIndex(startIndex, lowerM, lowerB);
  const endWidth = linePriceAtIndex(endIndex, upperM, upperB) - linePriceAtIndex(endIndex, lowerM, lowerB);

  if (!isFiniteNumber(startWidth) || !isFiniteNumber(endWidth) || startWidth <= 0 || endWidth <= 0) {
    return null;
  }

  let maxWidth = 0;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const width = linePriceAtIndex(i, upperM, upperB) - linePriceAtIndex(i, lowerM, lowerB);
    if (isFiniteNumber(width) && width > maxWidth) {
      maxWidth = width;
    }
  }

  if (!(maxWidth > 0)) {
    return null;
  }

  return { start: startWidth, end: endWidth, max: maxWidth };
}

function preferredRetracementScore(retracementRatio: number): number {
  if (retracementRatio < 0 || retracementRatio > 0.5) {
    return 0;
  }

  if (retracementRatio >= 0.2 && retracementRatio <= 0.382) {
    return 1;
  }

  if (retracementRatio < 0.2) {
    return Math.max(0, retracementRatio / 0.2);
  }

  return Math.max(0, (0.5 - retracementRatio) / (0.5 - 0.382));
}

function confidenceFromStructure(
  poleEfficiency: number,
  retracementRatio: number,
  widthContraction: number,
): number {
  const efficiencyScore = Math.max(0, Math.min(1, (poleEfficiency - 0.55) / 0.35));
  const retracementScore = preferredRetracementScore(retracementRatio);
  const contractionScore = Math.max(0, Math.min(1, widthContraction / 0.25));

  const weighted = 0.45 * efficiencyScore + 0.35 * retracementScore + 0.2 * contractionScore;
  return Math.max(65, Math.min(95, 65 + Math.round(weighted * 30)));
}

function evaluateBullFlag(
  candles: Candle[],
  atrSeries: Array<number | null>,
  candidate: FlagCandidate,
  options: Required<FlagDetectionOptions>,
): PatternResult | null {
  const { poleStart, poleEnd, channelPivots } = candidate;

  if (!(poleStart.kind === "LOW" && poleEnd.kind === "HIGH")) {
    return null;
  }

  const poleLength = poleEnd.price - poleStart.price;
  if (!(isFiniteNumber(poleLength) && poleLength > 0)) {
    return null;
  }

  const poleBars = poleEnd.index - poleStart.index + 1;
  if (poleBars < 3 || poleBars > 30) {
    return null;
  }

  const poleAtr = atrAt(atrSeries, poleEnd.index);
  const minStrongMove = Math.max(poleAtr * 2, poleStart.price * 0.03);
  if (!(poleLength >= minStrongMove)) {
    return null;
  }

  const poleEfficiency = closePathEfficiency(candles, poleStart.index, poleEnd.index);
  if (!(poleEfficiency >= 0.6)) {
    return null;
  }

  const highs = channelPivots.filter((p) => p.kind === "HIGH");
  const lows = channelPivots.filter((p) => p.kind === "LOW");
  if (highs.length < 2 || lows.length < 2) {
    return null;
  }

  if (!(channelPivots[0].index > poleEnd.index)) {
    return null;
  }

  const upperLine = lineFromTwoPivots(highs[0], highs[highs.length - 1]);
  const lowerLine = lineFromTwoPivots(lows[0], lows[lows.length - 1]);
  if (!upperLine || !lowerLine) {
    return null;
  }

  // Bull flag channel should be sideways to slightly down.
  if (!(upperLine.m <= 0.01 && lowerLine.m <= 0.01)) {
    return null;
  }

  if (!areParallelEnough(upperLine.m, lowerLine.m, options.parallelToleranceRatio)) {
    return null;
  }

  const channelStart = channelPivots[0].index;
  const channelEndConfirmed = channelPivots[channelPivots.length - 1].confirmedAtIndex;

  if (!isValidIndex(channelStart, candles.length) || !isValidIndex(channelEndConfirmed, candles.length)) {
    return null;
  }

  const widths = channelWidths(
    channelStart,
    channelEndConfirmed,
    upperLine.m,
    upperLine.b,
    lowerLine.m,
    lowerLine.b,
  );
  if (!widths) {
    return null;
  }

  // Reject widening channels.
  if (widths.end > widths.start * 1.02) {
    return null;
  }

  if (!(widths.max <= poleLength * 0.5)) {
    return null;
  }

  const minLowInFlag = Math.min(...lows.map((p) => p.price));
  const retracement = poleEnd.price - minLowInFlag;
  if (!(retracement > 0)) {
    return null;
  }

  const retracementRatio = retracement / poleLength;
  if (!(retracementRatio <= 0.5)) {
    return null;
  }

  let breakoutIndex = -1;
  for (let i = channelEndConfirmed; i < candles.length; i += 1) {
    const upperAtI = linePriceAtIndex(i, upperLine.m, upperLine.b);
    if (!isValidPrice(upperAtI)) {
      continue;
    }
    if (candles[i].close > upperAtI) {
      breakoutIndex = i;
      break;
    }
  }

  const isConfirmed = breakoutIndex >= 0;
  const endIndex = isConfirmed ? breakoutIndex : channelEndConfirmed;

  if (!isValidIndex(endIndex, candles.length) || !(poleStart.index < endIndex)) {
    return null;
  }

  const duration = endIndex - poleStart.index + 1;
  if (duration < options.minPatternBars || duration > options.maxPatternBars) {
    return null;
  }

  const breakoutPrice = isConfirmed
    ? candles[breakoutIndex].close
    : linePriceAtIndex(endIndex, upperLine.m, upperLine.b);
  if (!isValidPrice(breakoutPrice)) {
    return null;
  }

  const lastLowPivot = lows[lows.length - 1];
  const invalidation = lastLowPivot.price - atrAt(atrSeries, lastLowPivot.index) * options.invalidationAtrMultiplier;
  if (!isValidPrice(invalidation)) {
    return null;
  }

  const target3 = breakoutPrice + poleLength;
  const target1 = breakoutPrice + poleLength * 0.33;
  const target2 = breakoutPrice + poleLength * 0.66;
  if (![target1, target2, target3].every((v) => isValidPrice(v))) {
    return null;
  }

  const widthContraction = (widths.start - widths.end) / widths.start;
  const confidence = confidenceFromStructure(poleEfficiency, retracementRatio, widthContraction);
  if (confidence < options.minConfidence) {
    return null;
  }

  const result: PatternResult = {
    kind: "BULL_FLAG",
    status: isConfirmed ? "CONFIRMED" : "FORMING",
    direction: "CALL",
    confidence,
    startIndex: poleStart.index,
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
      { label: "PS", index: poleStart.index, time: poleStart.time, price: poleStart.price },
      { label: "PE", index: poleEnd.index, time: poleEnd.time, price: poleEnd.price },
      ...channelPivots.map((p, i) => ({ label: `C${i + 1}`, index: p.index, time: p.time, price: p.price })),
      { label: "BO", index: endIndex, time: candles[endIndex].time, price: breakoutPrice },
    ],
    rejectionReasons: [],
  };

  const check = validatePatternResult(result, candles.length);
  return check.valid ? result : null;
}

function evaluateBearFlag(
  candles: Candle[],
  atrSeries: Array<number | null>,
  candidate: FlagCandidate,
  options: Required<FlagDetectionOptions>,
): PatternResult | null {
  const { poleStart, poleEnd, channelPivots } = candidate;

  if (!(poleStart.kind === "HIGH" && poleEnd.kind === "LOW")) {
    return null;
  }

  const poleLength = poleStart.price - poleEnd.price;
  if (!(isFiniteNumber(poleLength) && poleLength > 0)) {
    return null;
  }

  const poleBars = poleEnd.index - poleStart.index + 1;
  if (poleBars < 3 || poleBars > 30) {
    return null;
  }

  const poleAtr = atrAt(atrSeries, poleEnd.index);
  const minStrongMove = Math.max(poleAtr * 2, poleStart.price * 0.03);
  if (!(poleLength >= minStrongMove)) {
    return null;
  }

  const poleEfficiency = closePathEfficiency(candles, poleStart.index, poleEnd.index);
  if (!(poleEfficiency >= 0.6)) {
    return null;
  }

  const highs = channelPivots.filter((p) => p.kind === "HIGH");
  const lows = channelPivots.filter((p) => p.kind === "LOW");
  if (highs.length < 2 || lows.length < 2) {
    return null;
  }

  if (!(channelPivots[0].index > poleEnd.index)) {
    return null;
  }

  const upperLine = lineFromTwoPivots(highs[0], highs[highs.length - 1]);
  const lowerLine = lineFromTwoPivots(lows[0], lows[lows.length - 1]);
  if (!upperLine || !lowerLine) {
    return null;
  }

  // Bear flag channel should be sideways to slightly up.
  if (!(upperLine.m >= -0.01 && lowerLine.m >= -0.01)) {
    return null;
  }

  if (!areParallelEnough(upperLine.m, lowerLine.m, options.parallelToleranceRatio)) {
    return null;
  }

  const channelStart = channelPivots[0].index;
  const channelEndConfirmed = channelPivots[channelPivots.length - 1].confirmedAtIndex;

  if (!isValidIndex(channelStart, candles.length) || !isValidIndex(channelEndConfirmed, candles.length)) {
    return null;
  }

  const widths = channelWidths(
    channelStart,
    channelEndConfirmed,
    upperLine.m,
    upperLine.b,
    lowerLine.m,
    lowerLine.b,
  );
  if (!widths) {
    return null;
  }

  if (widths.end > widths.start * 1.02) {
    return null;
  }

  if (!(widths.max <= poleLength * 0.5)) {
    return null;
  }

  const maxHighInFlag = Math.max(...highs.map((p) => p.price));
  const retracement = maxHighInFlag - poleEnd.price;
  if (!(retracement > 0)) {
    return null;
  }

  const retracementRatio = retracement / poleLength;
  if (!(retracementRatio <= 0.5)) {
    return null;
  }

  let breakoutIndex = -1;
  for (let i = channelEndConfirmed; i < candles.length; i += 1) {
    const lowerAtI = linePriceAtIndex(i, lowerLine.m, lowerLine.b);
    if (!isValidPrice(lowerAtI)) {
      continue;
    }
    if (candles[i].close < lowerAtI) {
      breakoutIndex = i;
      break;
    }
  }

  const isConfirmed = breakoutIndex >= 0;
  const endIndex = isConfirmed ? breakoutIndex : channelEndConfirmed;

  if (!isValidIndex(endIndex, candles.length) || !(poleStart.index < endIndex)) {
    return null;
  }

  const duration = endIndex - poleStart.index + 1;
  if (duration < options.minPatternBars || duration > options.maxPatternBars) {
    return null;
  }

  const breakoutPrice = isConfirmed
    ? candles[breakoutIndex].close
    : linePriceAtIndex(endIndex, lowerLine.m, lowerLine.b);
  if (!isValidPrice(breakoutPrice)) {
    return null;
  }

  const lastHighPivot = highs[highs.length - 1];
  const invalidation = lastHighPivot.price + atrAt(atrSeries, lastHighPivot.index) * options.invalidationAtrMultiplier;
  if (!isValidPrice(invalidation)) {
    return null;
  }

  const target3 = breakoutPrice - poleLength;
  const target1 = breakoutPrice - poleLength * 0.33;
  const target2 = breakoutPrice - poleLength * 0.66;
  if (![target1, target2, target3].every((v) => isValidPrice(v))) {
    return null;
  }

  const widthContraction = (widths.start - widths.end) / widths.start;
  const confidence = confidenceFromStructure(poleEfficiency, retracementRatio, widthContraction);
  if (confidence < options.minConfidence) {
    return null;
  }

  const result: PatternResult = {
    kind: "BEAR_FLAG",
    status: isConfirmed ? "CONFIRMED" : "FORMING",
    direction: "PUT",
    confidence,
    startIndex: poleStart.index,
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
      { label: "PS", index: poleStart.index, time: poleStart.time, price: poleStart.price },
      { label: "PE", index: poleEnd.index, time: poleEnd.time, price: poleEnd.price },
      ...channelPivots.map((p, i) => ({ label: `C${i + 1}`, index: p.index, time: p.time, price: p.price })),
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

export function detectFlags(
  candles: Candle[],
  options: FlagDetectionOptions = {},
): PatternResult[] {
  const merged: Required<FlagDetectionOptions> = {
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
    const bull = evaluateBullFlag(candles, atrSeries, candidate, merged);
    if (bull) {
      out.push(bull);
    }

    const bear = evaluateBearFlag(candles, atrSeries, candidate, merged);
    if (bear) {
      out.push(bear);
    }
  }

  return dedupeAndSort(out);
}
