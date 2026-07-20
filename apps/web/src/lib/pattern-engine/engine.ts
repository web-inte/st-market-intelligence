import { calculateAtr } from "./atr";
import { detectFlags } from "./flags";
import { detectHeadAndShoulders } from "./headShoulders";
import { distance, intercept, isFiniteNumber, isValidPrice, linePriceAtIndex, slope } from "./geometry";
import { detectTriangles } from "./triangles";
import type { Candle, PatternEngineOptions, PatternKind, PatternResult } from "./types";
import { detectWedges } from "./wedges";
import { validateCandles, validatePatternResult } from "./validation";

const DEFAULT_MIN_CONFIDENCE = 65;
const DEFAULT_MAX_RESULTS = 10;
const NEAR_DUPLICATE_BAR_GAP = 3;
const MAX_CONFIRMED_AGE_BARS = 40;
const MAX_RESULTS_PER_KIND = 2;
const HS_KINDS: PatternKind[] = ["HEAD_AND_SHOULDERS", "INVERSE_HEAD_AND_SHOULDERS"];

function atrAt(series: Array<number | null>, index: number): number {
  const direct = series[index];
  if (isFiniteNumber(direct) && direct > 0) {
    return direct;
  }

  for (let i = index; i >= 0; i -= 1) {
    const value = series[i];
    if (isFiniteNumber(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function getDrawingPoint(pattern: PatternResult, label: string) {
  return pattern.drawingPoints.find((point) => point.label === label) ?? null;
}

function overlapRatio(a: PatternResult, b: PatternResult): number {
  const left = Math.max(a.startIndex, b.startIndex);
  const right = Math.min(a.endIndex, b.endIndex);
  if (right < left) {
    return 0;
  }

  const overlap = right - left + 1;
  const shortest = Math.min(
    a.endIndex - a.startIndex + 1,
    b.endIndex - b.startIndex + 1,
  );

  return shortest > 0 ? overlap / shortest : 0;
}

function isHeadShouldersKind(kind: PatternKind): boolean {
  return HS_KINDS.includes(kind);
}

function countSharedHeadShouldersPoints(a: PatternResult, b: PatternResult): number {
  const labels = ["LS", "N1", "H", "N2", "RS"];
  let shared = 0;

  for (const label of labels) {
    const pointA = getDrawingPoint(a, label);
    const pointB = getDrawingPoint(b, label);
    if (pointA && pointB && pointA.index === pointB.index) {
      shared += 1;
    }
  }

  return shared;
}

function hasSameHeadRightShoulderAndBreakout(a: PatternResult, b: PatternResult): boolean {
  const headA = getDrawingPoint(a, "H");
  const headB = getDrawingPoint(b, "H");
  const rsA = getDrawingPoint(a, "RS");
  const rsB = getDrawingPoint(b, "RS");

  return Boolean(
    headA &&
      headB &&
      rsA &&
      rsB &&
      headA.index === headB.index &&
      rsA.index === rsB.index &&
      Math.abs(a.breakout.index - b.breakout.index) <= NEAR_DUPLICATE_BAR_GAP,
  );
}

function sharesRightShoulderAndBreakout(a: PatternResult, b: PatternResult): boolean {
  const rsA = getDrawingPoint(a, "RS");
  const rsB = getDrawingPoint(b, "RS");

  return Boolean(
    rsA &&
      rsB &&
      rsA.index === rsB.index &&
      Math.abs(a.breakout.index - b.breakout.index) <= NEAR_DUPLICATE_BAR_GAP,
  );
}

function breakoutPriceWithinTolerance(
  a: PatternResult,
  b: PatternResult,
  atrSeries: Array<number | null>,
): boolean {
  const referenceIndex = Math.max(a.breakout.index, b.breakout.index);
  const atr = Math.max(atrAt(atrSeries, referenceIndex), 1e-9);
  const priceTolerance = Math.max(atr, Math.max(a.breakout.price, b.breakout.price) * 0.02);
  return Math.abs(a.breakout.price - b.breakout.price) <= priceTolerance;
}

function patternDuration(pattern: PatternResult): number {
  return pattern.endIndex - pattern.startIndex + 1;
}

function headShouldersStructuralQuality(
  pattern: PatternResult,
  atrSeries: Array<number | null>,
): number {
  const ls = getDrawingPoint(pattern, "LS");
  const n1 = getDrawingPoint(pattern, "N1");
  const head = getDrawingPoint(pattern, "H");
  const n2 = getDrawingPoint(pattern, "N2");
  const rs = getDrawingPoint(pattern, "RS");

  if (!ls || !n1 || !head || !n2 || !rs) {
    return Math.min(98, pattern.confidence);
  }

  const necklineSlope = slope(n1.index, n1.price, n2.index, n2.price);
  const necklineIntercept = intercept(n1.index, n1.price, necklineSlope);
  const necklineAtHead = linePriceAtIndex(head.index, necklineSlope, necklineIntercept);
  const necklineAtBreakout = linePriceAtIndex(
    pattern.breakout.index,
    necklineSlope,
    necklineIntercept,
  );

  if (
    !isFiniteNumber(necklineSlope) ||
    !isFiniteNumber(necklineIntercept) ||
    !isValidPrice(necklineAtHead) ||
    !isValidPrice(necklineAtBreakout)
  ) {
    return Math.min(98, pattern.confidence);
  }

  const leftDuration = head.index - ls.index;
  const rightDuration = rs.index - head.index;
  const timeBalance =
    leftDuration > 0 && rightDuration > 0
      ? Math.min(leftDuration, rightDuration) / Math.max(leftDuration, rightDuration)
      : 0;

  const height = Math.abs(head.price - necklineAtHead);
  const shoulderScore =
    height > 0 ? Math.max(0, 1 - distance(ls.price, rs.price) / (height * 0.12)) : 0;
  const headGap = pattern.kind === "INVERSE_HEAD_AND_SHOULDERS"
    ? Math.min(ls.price, rs.price) - head.price
    : head.price - Math.max(ls.price, rs.price);
  const headScore = Math.max(0, Math.min(1, headGap / Math.max(atrAt(atrSeries, head.index) * 1.5, 1e-9)));
  const necklineScore =
    height > 0 ? Math.max(0, 1 - distance(n1.price, n2.price) / (height * 0.35)) : 0;
  const breakoutThreshold = Math.max(atrAt(atrSeries, pattern.breakout.index) * 0.15, pattern.breakout.price * 0.0025);
  const breakoutClearance = pattern.kind === "INVERSE_HEAD_AND_SHOULDERS"
    ? pattern.breakout.price - necklineAtBreakout
    : necklineAtBreakout - pattern.breakout.price;
  const breakoutScore = Math.max(0, Math.min(1, breakoutClearance / Math.max(breakoutThreshold * 2, 1e-9)));
  const raw =
    0.28 * shoulderScore +
    0.24 * headScore +
    0.18 * necklineScore +
    0.18 * timeBalance +
    0.12 * breakoutScore;

  return Math.min(98, Math.max(0, 50 + raw * 48));
}

function patternQuality(pattern: PatternResult, atrSeries: Array<number | null>): number {
  if (isHeadShouldersKind(pattern.kind)) {
    return headShouldersStructuralQuality(pattern, atrSeries);
  }

  return Math.min(98, pattern.confidence);
}

function pickBetterPattern(
  a: PatternResult,
  b: PatternResult,
  atrSeries: Array<number | null>,
): PatternResult {
  if (a.confidence !== b.confidence) {
    if (Math.abs(a.confidence - b.confidence) < 2) {
      const durationA = patternDuration(a);
      const durationB = patternDuration(b);
      if (durationA !== durationB) {
        return durationA < durationB ? a : b;
      }

      if (a.startIndex !== b.startIndex) {
        return a.startIndex > b.startIndex ? a : b;
      }

      return a.breakout.index >= b.breakout.index ? a : b;
    }

    return a.confidence > b.confidence ? a : b;
  }

  const durationA = patternDuration(a);
  const durationB = patternDuration(b);
  if (durationA !== durationB) {
    return durationA < durationB ? a : b;
  }

  if (a.startIndex !== b.startIndex) {
    return a.startIndex > b.startIndex ? a : b;
  }

  return a.breakout.index >= b.breakout.index ? a : b;
}

function areSameKindDuplicates(
  a: PatternResult,
  b: PatternResult,
  atrSeries: Array<number | null>,
): boolean {
  if (a.kind !== b.kind) {
    return false;
  }

  if (isHeadShouldersKind(a.kind)) {
    if (hasSameHeadRightShoulderAndBreakout(a, b)) {
      return true;
    }

    if (
      countSharedHeadShouldersPoints(a, b) >= 3 &&
      breakoutPriceWithinTolerance(a, b, atrSeries)
    ) {
      return true;
    }
  }

  return overlapRatio(a, b) > 0.8 && breakoutPriceWithinTolerance(a, b, atrSeries);
}

function deduplicateByKind(
  patterns: PatternResult[],
  atrSeries: Array<number | null>,
): PatternResult[] {
  const best: PatternResult[] = [];

  for (const candidate of patterns) {
    let merged = false;

    for (let i = 0; i < best.length; i += 1) {
      const current = best[i];
      if (!areSameKindDuplicates(current, candidate, atrSeries)) {
        continue;
      }

      best[i] = pickBetterPattern(current, candidate, atrSeries);
      merged = true;
      break;
    }

    if (!merged) {
      best.push(candidate);
    }
  }

  return best;
}

function pickHeadShouldersConflictWinner(
  a: PatternResult,
  b: PatternResult,
  atrSeries: Array<number | null>,
): PatternResult {
  const qualityA = patternQuality(a, atrSeries);
  const qualityB = patternQuality(b, atrSeries);

  if (Math.abs(a.confidence - b.confidence) < 5) {
    return a.breakout.index >= b.breakout.index ? a : b;
  }

  if (qualityA !== qualityB) {
    return qualityA > qualityB ? a : b;
  }

  return a.confidence >= b.confidence ? a : b;
}

function resolveHeadShouldersConflicts(
  patterns: PatternResult[],
  atrSeries: Array<number | null>,
): PatternResult[] {
  const kept: PatternResult[] = [];

  for (const pattern of patterns) {
    if (!isHeadShouldersKind(pattern.kind)) {
      kept.push(pattern);
      continue;
    }

    let shouldAdd = true;

    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const current = kept[i];
      const isOppositeHeadShoulders =
        isHeadShouldersKind(current.kind) && current.kind !== pattern.kind;

      if (!isOppositeHeadShoulders || overlapRatio(current, pattern) <= 0.7) {
        continue;
      }

      const winner = pickHeadShouldersConflictWinner(current, pattern, atrSeries);
      if (winner === current) {
        shouldAdd = false;
        break;
      }

      kept.splice(i, 1);
    }

    if (shouldAdd) {
      kept.push(pattern);
    }
  }

  return kept;
}

function limitResultsPerKind(patterns: PatternResult[]): PatternResult[] {
  const counts = new Map<PatternKind, number>();
  const limited: PatternResult[] = [];

  for (const pattern of patterns) {
    const nextCount = counts.get(pattern.kind) ?? 0;
    if (nextCount >= MAX_RESULTS_PER_KIND) {
      continue;
    }

    counts.set(pattern.kind, nextCount + 1);
    limited.push(pattern);
  }

  return limited;
}

function pickConfirmedOverlapWinner(a: PatternResult, b: PatternResult): PatternResult {
  if (a.confidence !== b.confidence) {
    return a.confidence > b.confidence ? a : b;
  }

  if (a.breakout.index !== b.breakout.index) {
    return a.breakout.index > b.breakout.index ? a : b;
  }

  const durationA = patternDuration(a);
  const durationB = patternDuration(b);
  if (durationA !== durationB) {
    return durationA < durationB ? a : b;
  }

  return a;
}

function resolveSameKindStatusConflicts(patterns: PatternResult[]): PatternResult[] {
  const kept: PatternResult[] = [];

  for (const pattern of patterns) {
    let shouldAdd = true;

    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const current = kept[i];

      if (current.kind !== pattern.kind || current.direction !== pattern.direction) {
        continue;
      }

      const stronglyOverlaps = overlapRatio(current, pattern) >= 0.7;
      const sharedHsAnchor =
        isHeadShouldersKind(pattern.kind) &&
        (hasSameHeadRightShoulderAndBreakout(current, pattern) ||
          sharesRightShoulderAndBreakout(current, pattern));

      if (!stronglyOverlaps && !sharedHsAnchor) {
        continue;
      }

      const currentConfirmed = current.status === "CONFIRMED";
      const patternConfirmed = pattern.status === "CONFIRMED";

      if (currentConfirmed !== patternConfirmed) {
        if (currentConfirmed) {
          shouldAdd = false;
        } else {
          kept.splice(i, 1);
        }

        if (!shouldAdd) {
          break;
        }

        continue;
      }

      if (currentConfirmed && patternConfirmed) {
        const winner = pickConfirmedOverlapWinner(current, pattern);
        if (winner === current) {
          shouldAdd = false;
          break;
        }

        kept.splice(i, 1);
        continue;
      }

      if (pickBetterPattern(current, pattern, []) === current) {
        shouldAdd = false;
        break;
      }

      kept.splice(i, 1);
    }

    if (shouldAdd) {
      kept.push(pattern);
    }
  }

  return kept;
}

function hasFiniteValues(pattern: PatternResult): boolean {
  const values = [
    pattern.confidence,
    pattern.startIndex,
    pattern.endIndex,
    pattern.breakout.index,
    pattern.breakout.time,
    pattern.breakout.price,
    pattern.invalidation,
    pattern.target1,
    pattern.target2,
    pattern.target3,
  ];

  for (const value of values) {
    if (!Number.isFinite(value)) {
      return false;
    }
  }

  for (const point of pattern.drawingPoints) {
    if (
      !Number.isFinite(point.index) ||
      !Number.isFinite(point.time) ||
      !Number.isFinite(point.price)
    ) {
      return false;
    }
  }

  return true;
}

function isStatusEnabled(
  pattern: PatternResult,
  includeForming: boolean,
  includeConfirmed: boolean,
): boolean {
  if (pattern.status === "FORMING") {
    return includeForming;
  }
  return includeConfirmed;
}

function shouldRunDetector(
  enabledKindsSet: Set<PatternKind> | null,
  producedKinds: PatternKind[],
): boolean {
  if (!enabledKindsSet) {
    return true;
  }
  for (const kind of producedKinds) {
    if (enabledKindsSet.has(kind)) {
      return true;
    }
  }
  return false;
}

function sortPatterns(patterns: PatternResult[]): PatternResult[] {
  return [...patterns].sort((a, b) => {
    const aStatusRank = a.status === "CONFIRMED" ? 0 : 1;
    const bStatusRank = b.status === "CONFIRMED" ? 0 : 1;
    if (aStatusRank !== bStatusRank) {
      return aStatusRank - bStatusRank;
    }

    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }

    return b.endIndex - a.endIndex;
  });
}

export function detectPatterns(
  candles: Candle[],
  options: PatternEngineOptions = {},
): PatternResult[] {
  const candlesCheck = validateCandles(candles);
  if (!candlesCheck.valid) {
    return [];
  }

  const minConfidence = Math.max(
    DEFAULT_MIN_CONFIDENCE,
    Number.isFinite(options.minConfidence)
      ? (options.minConfidence as number)
      : DEFAULT_MIN_CONFIDENCE,
  );

  const maxResultsRaw = Number.isFinite(options.maxResults)
    ? Math.floor(options.maxResults as number)
    : DEFAULT_MAX_RESULTS;
  const maxResults = Math.max(1, maxResultsRaw);

  const includeForming = options.includeForming ?? true;
  const includeConfirmed = options.includeConfirmed ?? true;
  if (!includeForming && !includeConfirmed) {
    return [];
  }

  const enabledKindsSet =
    options.enabledKinds && options.enabledKinds.length > 0
      ? new Set<PatternKind>(options.enabledKinds)
      : null;
  const atrSeries = calculateAtr(candles, 14);

  const collected: PatternResult[] = [];

  if (
    shouldRunDetector(enabledKindsSet, [
      "HEAD_AND_SHOULDERS",
      "INVERSE_HEAD_AND_SHOULDERS",
    ])
  ) {
    collected.push(...detectHeadAndShoulders(candles));
  }

  if (shouldRunDetector(enabledKindsSet, ["RISING_WEDGE", "FALLING_WEDGE"])) {
    collected.push(...detectWedges(candles));
  }

  if (
    shouldRunDetector(enabledKindsSet, [
      "ASCENDING_TRIANGLE",
      "DESCENDING_TRIANGLE",
    ])
  ) {
    collected.push(...detectTriangles(candles));
  }

  if (shouldRunDetector(enabledKindsSet, ["BULL_FLAG", "BEAR_FLAG"])) {
    collected.push(...detectFlags(candles));
  }

  const filtered = collected.filter((pattern) => {
    if (enabledKindsSet && !enabledKindsSet.has(pattern.kind)) {
      return false;
    }

    if (!isStatusEnabled(pattern, includeForming, includeConfirmed)) {
      return false;
    }

    if (pattern.confidence < minConfidence) {
      return false;
    }

    if (
      pattern.status === "CONFIRMED" &&
      candles.length - 1 - pattern.breakout.index > MAX_CONFIRMED_AGE_BARS
    ) {
      return false;
    }

    if (!hasFiniteValues(pattern)) {
      return false;
    }

    const check = validatePatternResult(pattern, candles.length);
    if (!check.valid) {
      return false;
    }

    return true;
  });

  const deduped = deduplicateByKind(filtered, atrSeries);
  const resolvedConflicts = resolveHeadShouldersConflicts(deduped, atrSeries);
  const statusResolved = resolveSameKindStatusConflicts(resolvedConflicts);
  const sorted = sortPatterns(statusResolved);
  const limited = limitResultsPerKind(sorted);

  return limited.slice(0, maxResults);
}

export function detectTopPattern(
  candles: Candle[],
  options: PatternEngineOptions = {},
): PatternResult | null {
  const top = detectPatterns(candles, {
    ...options,
    maxResults: 1,
  });

  return top.length > 0 ? top[0] : null;
}
