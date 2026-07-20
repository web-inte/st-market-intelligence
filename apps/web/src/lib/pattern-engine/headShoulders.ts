import { calculateAtr } from "./atr";
import {
  distance,
  intercept,
  isFiniteNumber,
  isValidIndex,
  isValidPrice,
  linePriceAtIndex,
  relativeDifference,
  slope,
} from "./geometry";
import { detectPivots } from "./pivots";
import type {
  Candle,
  DrawingPoint,
  HeadShouldersOptions,
  PatternKind,
  PatternResult,
  Pivot,
} from "./types";
import { validateCandles, validatePatternResult, validatePivots } from "./validation";

interface Quintet {
  leftShoulder: Pivot;
  firstTrough: Pivot;
  head: Pivot;
  secondTrough: Pivot;
  rightShoulder: Pivot;
}

const DEFAULT_OPTIONS = {
  leftBars: 3,
  rightBars: 3,
  minPatternBars: 15,
  maxPatternBars: 180,
  minConfidence: 65,
  shoulderToleranceRatio: 0.08,
  headProminenceAtrMultiplier: 0.8,
  invalidationAtrMultiplier: 0.5,
} satisfies Required<HeadShouldersOptions>;

const MIN_PIVOT_GAP_BARS = 2;
const MAX_FORMING_AGE_BARS = 20;
const MAX_BREAKOUT_DELAY_BARS = 30;

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

function buildQuintets(pivots: Pivot[], inverse: boolean): Quintet[] {
  const quintets: Quintet[] = [];

  for (let a = 0; a < pivots.length - 4; a += 1) {
    for (let b = a + 1; b < pivots.length - 3; b += 1) {
      for (let c = b + 1; c < pivots.length - 2; c += 1) {
        for (let d = c + 1; d < pivots.length - 1; d += 1) {
          for (let e = d + 1; e < pivots.length; e += 1) {
            const p1 = pivots[a];
            const p2 = pivots[b];
            const p3 = pivots[c];
            const p4 = pivots[d];
            const p5 = pivots[e];

            const validKinds = inverse
              ? p1.kind === "LOW" &&
                p2.kind === "HIGH" &&
                p3.kind === "LOW" &&
                p4.kind === "HIGH" &&
                p5.kind === "LOW"
              : p1.kind === "HIGH" &&
                p2.kind === "LOW" &&
                p3.kind === "HIGH" &&
                p4.kind === "LOW" &&
                p5.kind === "HIGH";

            if (!validKinds) {
              continue;
            }

            quintets.push({
              leftShoulder: p1,
              firstTrough: p2,
              head: p3,
              secondTrough: p4,
              rightShoulder: p5,
            });
          }
        }
      }
    }
  }

  return quintets;
}

function computeConfidence(
  inverse: boolean,
  q: Quintet,
  atrSeries: Array<number | null>,
  shoulderToleranceRatio: number,
): number {
  const shoulderDiff = relativeDifference(q.leftShoulder.price, q.rightShoulder.price);
  const shoulderScore = Math.max(0, 1 - shoulderDiff / shoulderToleranceRatio);

  const shoulderMax = Math.max(q.leftShoulder.price, q.rightShoulder.price);
  const shoulderMin = Math.min(q.leftShoulder.price, q.rightShoulder.price);

  const headVsShoulders = inverse
    ? shoulderMin - q.head.price
    : q.head.price - shoulderMax;

  const headAtr = atrAt(atrSeries, q.head.index);
  const headScore = Math.max(0, Math.min(1, headVsShoulders / Math.max(headAtr * 2, 1e-9)));

  const troughDiff = relativeDifference(q.firstTrough.price, q.secondTrough.price);
  const necklineScore = Math.max(0, 1 - troughDiff / 0.2);

  const raw = 0.45 * shoulderScore + 0.4 * headScore + 0.15 * necklineScore;
  return Math.round(65 + Math.min(1, raw) * 30);
}

function buildDrawingPoints(q: Quintet, breakout: { index: number; time: number; price: number }): DrawingPoint[] {
  return [
    { label: "LS", index: q.leftShoulder.index, time: q.leftShoulder.time, price: q.leftShoulder.price },
    { label: "N1", index: q.firstTrough.index, time: q.firstTrough.time, price: q.firstTrough.price },
    { label: "H", index: q.head.index, time: q.head.time, price: q.head.price },
    { label: "N2", index: q.secondTrough.index, time: q.secondTrough.time, price: q.secondTrough.price },
    { label: "RS", index: q.rightShoulder.index, time: q.rightShoulder.time, price: q.rightShoulder.price },
    { label: "BO", index: breakout.index, time: breakout.time, price: breakout.price },
  ];
}

function buildNeckline(q: Quintet): { m: number; b: number } | null {
  const m = slope(
    q.firstTrough.index,
    q.firstTrough.price,
    q.secondTrough.index,
    q.secondTrough.price,
  );
  const b = intercept(q.firstTrough.index, q.firstTrough.price, m);

  if (!isFiniteNumber(m) || !isFiniteNumber(b)) {
    return null;
  }

  return { m, b };
}

function breakoutBuffer(candles: Candle[], atrSeries: Array<number | null>, index: number): number {
  const price = candles[index]?.close;
  if (!isValidPrice(price)) {
    return Infinity;
  }

  return Math.max(atrAt(atrSeries, index) * 0.15, price * 0.0025);
}

function buildStructuralMetrics(
  q: Quintet,
  candles: Candle[],
  atrSeries: Array<number | null>,
  options: Required<HeadShouldersOptions>,
  inverse: boolean,
): {
  startIndex: number;
  rightShoulderConfirmation: number;
  patternBars: number;
  headAtr: number;
  headGap: number;
  shoulderGap: number;
  shoulderDiffRatio: number;
  height: number;
  neckline: { m: number; b: number };
  leftSideDuration: number;
  rightSideDuration: number;
  leftToRightRatio: number;
} | null {
  const ordered = [
    q.leftShoulder.index,
    q.firstTrough.index,
    q.head.index,
    q.secondTrough.index,
    q.rightShoulder.index,
  ];

  if (
    !(ordered[0] < ordered[1] &&
      ordered[1] < ordered[2] &&
      ordered[2] < ordered[3] &&
      ordered[3] < ordered[4])
  ) {
    return null;
  }

  const gaps = [
    q.firstTrough.index - q.leftShoulder.index,
    q.head.index - q.firstTrough.index,
    q.secondTrough.index - q.head.index,
    q.rightShoulder.index - q.secondTrough.index,
  ];

  if (gaps.some((gap) => gap < MIN_PIVOT_GAP_BARS)) {
    return null;
  }

  if (
    q.firstTrough.confirmedAtIndex >= q.head.index ||
    q.secondTrough.confirmedAtIndex >= q.rightShoulder.index
  ) {
    return null;
  }

  const startIndex = q.leftShoulder.index;
  const rightShoulderConfirmation = q.rightShoulder.confirmedAtIndex;

  if (
    !isValidIndex(startIndex, candles.length) ||
    !isValidIndex(rightShoulderConfirmation, candles.length) ||
    startIndex >= rightShoulderConfirmation
  ) {
    return null;
  }

  const patternBars = rightShoulderConfirmation - startIndex + 1;
  if (patternBars < options.minPatternBars || patternBars > options.maxPatternBars) {
    return null;
  }

  const previousAverageGap = (gaps[0] + gaps[1] + gaps[2]) / 3;
  if (gaps[3] > Math.max(MIN_PIVOT_GAP_BARS + 1, previousAverageGap * 2.5)) {
    return null;
  }

  const leftSideDuration = q.head.index - q.leftShoulder.index;
  const rightSideDuration = q.rightShoulder.index - q.head.index;
  if (leftSideDuration <= 0 || rightSideDuration <= 0) {
    return null;
  }

  const leftToRightRatio = leftSideDuration / rightSideDuration;
  if (leftToRightRatio < 0.35 || leftToRightRatio > 2.85) {
    return null;
  }

  const neckline = buildNeckline(q);
  if (!neckline) {
    return null;
  }

  const necklineAtHead = linePriceAtIndex(q.head.index, neckline.m, neckline.b);
  const necklineAtLeftShoulder = linePriceAtIndex(q.leftShoulder.index, neckline.m, neckline.b);
  const necklineAtRightShoulder = linePriceAtIndex(q.rightShoulder.index, neckline.m, neckline.b);

  if (
    !isValidPrice(necklineAtHead) ||
    !isValidPrice(necklineAtLeftShoulder) ||
    !isValidPrice(necklineAtRightShoulder)
  ) {
    return null;
  }

  const height = inverse
    ? necklineAtHead - q.head.price
    : q.head.price - necklineAtHead;

  if (!isFiniteNumber(height) || height <= 0) {
    return null;
  }

  const necklinePivotDifference = distance(q.firstTrough.price, q.secondTrough.price);
  if (necklinePivotDifference > height * 0.35) {
    return null;
  }

  const headAtr = atrAt(atrSeries, q.head.index);
  const shoulderReference = inverse
    ? Math.min(q.leftShoulder.price, q.rightShoulder.price)
    : Math.max(q.leftShoulder.price, q.rightShoulder.price);
  const headGap = inverse
    ? shoulderReference - q.head.price
    : q.head.price - shoulderReference;

  if (!(headGap >= Math.max(headAtr * 0.5, headAtr * options.headProminenceAtrMultiplier))) {
    return null;
  }

  const shoulderGap = distance(q.leftShoulder.price, q.rightShoulder.price);
  if (shoulderGap > height * 0.12) {
    return null;
  }

  const shoulderDiffRatio = relativeDifference(q.leftShoulder.price, q.rightShoulder.price);
  if (shoulderDiffRatio > options.shoulderToleranceRatio) {
    return null;
  }

  if (!inverse) {
    if (!(q.leftShoulder.price > necklineAtLeftShoulder && q.rightShoulder.price > necklineAtRightShoulder)) {
      return null;
    }
  } else if (!(q.leftShoulder.price < necklineAtLeftShoulder && q.rightShoulder.price < necklineAtRightShoulder)) {
    return null;
  }

  return {
    startIndex,
    rightShoulderConfirmation,
    patternBars,
    headAtr,
    headGap,
    shoulderGap,
    shoulderDiffRatio,
    height,
    neckline,
    leftSideDuration,
    rightSideDuration,
    leftToRightRatio,
  };
}

function detectOneDirection(
  candles: Candle[],
  pivots: Pivot[],
  atrSeries: Array<number | null>,
  options: Required<HeadShouldersOptions>,
  inverse: boolean,
): PatternResult[] {
  const results: PatternResult[] = [];
  const quintets = buildQuintets(pivots, inverse);

  for (const q of quintets) {
    const metrics = buildStructuralMetrics(q, candles, atrSeries, options, inverse);
    if (!metrics) {
      continue;
    }

    let breakoutIndex = -1;
    const breakoutSearchStart = Math.max(metrics.rightShoulderConfirmation, q.rightShoulder.index + 1);
    const breakoutDelayLimit = Math.min(
      MAX_BREAKOUT_DELAY_BARS,
      Math.max(1, Math.floor(metrics.patternBars * 0.35)),
    );
    const breakoutSearchEnd = Math.min(candles.length - 1, breakoutSearchStart + breakoutDelayLimit);

    for (let i = breakoutSearchStart; i <= breakoutSearchEnd; i += 1) {
      const close = candles[i].close;
      const necklineAtI = linePriceAtIndex(i, metrics.neckline.m, metrics.neckline.b);
      if (!isValidPrice(necklineAtI)) {
        continue;
      }

      const minimumBreakout = breakoutBuffer(candles, atrSeries, i);

      if (!inverse && close <= necklineAtI - minimumBreakout) {
        breakoutIndex = i;
        break;
      }

      if (inverse && close >= necklineAtI + minimumBreakout) {
        breakoutIndex = i;
        break;
      }
    }

    const isConfirmed = breakoutIndex >= 0;
    if (!isConfirmed && candles.length - 1 - metrics.rightShoulderConfirmation > MAX_FORMING_AGE_BARS) {
      continue;
    }

    const startIndex = metrics.startIndex;
    const endIndex = isConfirmed ? breakoutIndex : metrics.rightShoulderConfirmation;

    if (!isValidIndex(endIndex, candles.length) || startIndex >= endIndex) {
      continue;
    }

    const endBars = endIndex - startIndex + 1;
    if (endBars < options.minPatternBars || endBars > options.maxPatternBars) {
      continue;
    }

    const breakoutPrice = isConfirmed
      ? candles[breakoutIndex].close
      : linePriceAtIndex(endIndex, metrics.neckline.m, metrics.neckline.b);

    if (!isValidPrice(breakoutPrice)) {
      continue;
    }

    const atrForInvalidation = Math.max(atrAt(atrSeries, q.rightShoulder.index), 1e-9);
    const invalidation = inverse
      ? q.rightShoulder.price - atrForInvalidation * options.invalidationAtrMultiplier
      : q.rightShoulder.price + atrForInvalidation * options.invalidationAtrMultiplier;

    if (!isValidPrice(invalidation)) {
      continue;
    }

    const fullTarget = inverse ? breakoutPrice + metrics.height : breakoutPrice - metrics.height;
    const targetDistance = Math.abs(fullTarget - breakoutPrice);
    const target1 = inverse
      ? breakoutPrice + targetDistance * 0.33
      : breakoutPrice - targetDistance * 0.33;
    const target2 = inverse
      ? breakoutPrice + targetDistance * 0.66
      : breakoutPrice - targetDistance * 0.66;
    const target3 = fullTarget;

    if (![target1, target2, target3].every((v) => isValidPrice(v))) {
      continue;
    }

    const necklineAtBreakout = linePriceAtIndex(endIndex, metrics.neckline.m, metrics.neckline.b);
    if (!isValidPrice(necklineAtBreakout)) {
      continue;
    }

    const breakoutStrength = inverse
      ? breakoutPrice - necklineAtBreakout
      : necklineAtBreakout - breakoutPrice;

    if (!isFiniteNumber(breakoutStrength) || (isConfirmed && breakoutStrength <= 0)) {
      continue;
    }

    const confidence = (() => {
      const shoulderScore = Math.max(0, 1 - metrics.shoulderDiffRatio / options.shoulderToleranceRatio);
      const headScore = Math.max(
        0,
        Math.min(1, metrics.headGap / Math.max(metrics.headAtr * 1.5, 1e-9)),
      );
      const necklineScore = Math.max(
        0,
        1 - distance(q.firstTrough.price, q.secondTrough.price) / Math.max(metrics.height * 0.35, 1e-9),
      );
      const timeBalanceScore = Math.max(
        0,
        Math.min(
          metrics.leftToRightRatio,
          1 / Math.max(metrics.leftToRightRatio, 1e-9),
        ),
      );
      const breakoutThreshold = isConfirmed ? breakoutBuffer(candles, atrSeries, endIndex) : 1;
      const breakoutScore = isConfirmed
        ? Math.max(0, Math.min(1, breakoutStrength / Math.max(breakoutThreshold * 2, 1e-9)))
        : 0.45;

      const raw =
        0.24 * shoulderScore +
        0.24 * headScore +
        0.18 * necklineScore +
        0.18 * timeBalanceScore +
        0.16 * breakoutScore;

      let nextConfidence = Math.round(65 + Math.min(1, raw) * 33);
      const strongStructure =
        isConfirmed &&
        shoulderScore >= 0.85 &&
        headScore >= 0.8 &&
        necklineScore >= 0.8 &&
        timeBalanceScore >= 0.72 &&
        breakoutScore >= 0.72;

      if (!strongStructure) {
        nextConfidence = Math.min(nextConfidence, 89);
      }

      return Math.min(98, nextConfidence);
    })();

    if (!isFiniteNumber(confidence) || confidence < options.minConfidence) {
      continue;
    }

    const breakoutPoint = {
      index: endIndex,
      time: candles[endIndex].time,
      price: breakoutPrice,
    };

    const kind: PatternKind = inverse
      ? "INVERSE_HEAD_AND_SHOULDERS"
      : "HEAD_AND_SHOULDERS";

    const result: PatternResult = {
      kind,
      status: isConfirmed ? "CONFIRMED" : "FORMING",
      direction: inverse ? "CALL" : "PUT",
      confidence,
      startIndex,
      endIndex,
      breakout: breakoutPoint,
      invalidation,
      target1,
      target2,
      target3,
      drawingPoints: buildDrawingPoints(q, breakoutPoint),
      rejectionReasons: [],
    };

    const check = validatePatternResult(result, candles.length);
    if (!check.valid) {
      continue;
    }

    results.push(result);
  }

  return results;
}

function uniquePatterns(patterns: PatternResult[]): PatternResult[] {
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

export function detectHeadAndShoulders(
  candles: Candle[],
  options: HeadShouldersOptions = {},
): PatternResult[] {
  const merged: Required<HeadShouldersOptions> = {
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

  const pivotCheck = validatePivots(pivots, candles.length);
  if (!pivotCheck.valid) {
    return [];
  }

  const atrSeries = calculateAtr(candles, 14);

  const normal = detectOneDirection(candles, pivots, atrSeries, merged, false);
  const inverse = detectOneDirection(candles, pivots, atrSeries, merged, true);

  return uniquePatterns([...normal, ...inverse]);
}
