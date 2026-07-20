import type { Candle, PatternResult, Pivot } from "./types";
import { isFiniteNumber, isValidIndex, isValidPrice } from "./geometry";

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

export function validateCandle(candle: Candle): ValidationResult {
  const reasons: string[] = [];

  if (!isFiniteNumber(candle.time) || candle.time <= 0) {
    reasons.push("Invalid candle time");
  }
  if (!isValidPrice(candle.open)) {
    reasons.push("Invalid candle open");
  }
  if (!isValidPrice(candle.high)) {
    reasons.push("Invalid candle high");
  }
  if (!isValidPrice(candle.low)) {
    reasons.push("Invalid candle low");
  }
  if (!isValidPrice(candle.close)) {
    reasons.push("Invalid candle close");
  }
  if (!isFiniteNumber(candle.volume) || candle.volume < 0) {
    reasons.push("Invalid candle volume");
  }
  if (candle.high < Math.max(candle.open, candle.close)) {
    reasons.push("Candle high is below open/close");
  }
  if (candle.low > Math.min(candle.open, candle.close)) {
    reasons.push("Candle low is above open/close");
  }
  if (candle.low > candle.high) {
    reasons.push("Candle low is greater than high");
  }

  return { valid: reasons.length === 0, reasons };
}

export function isLikelyDailyCandles(candles: Candle[]): boolean {
  if (candles.length < 3) {
    return true;
  }

  const deltas: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const delta = candles[i].time - candles[i - 1].time;
    if (isFiniteNumber(delta) && delta > 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return false;
  }

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];

  const dayMs = 24 * 60 * 60 * 1000;
  const halfDayMs = 12 * 60 * 60 * 1000;
  const fourDaysMs = 4 * dayMs;

  const daySec = 24 * 60 * 60;
  const halfDaySec = 12 * 60 * 60;
  const fourDaysSec = 4 * daySec;

  const looksLikeMs = median > 1_000_000;

  if (looksLikeMs) {
    return median >= halfDayMs && median <= fourDaysMs;
  }

  return median >= halfDaySec && median <= fourDaysSec;
}

export function validateCandles(candles: Candle[]): ValidationResult {
  const reasons: string[] = [];

  if (!Array.isArray(candles) || candles.length === 0) {
    return { valid: false, reasons: ["Candles must be a non-empty array"] };
  }

  for (let i = 0; i < candles.length; i += 1) {
    const check = validateCandle(candles[i]);
    if (!check.valid) {
      reasons.push(`Candle ${i}: ${check.reasons.join(", ")}`);
    }

    if (i > 0 && candles[i].time <= candles[i - 1].time) {
      reasons.push(`Candle ${i}: time must be strictly increasing`);
    }
  }

  if (!isLikelyDailyCandles(candles)) {
    reasons.push("Candles do not appear to be daily timeframe");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validatePivot(pivot: Pivot, candlesLength: number): ValidationResult {
  const reasons: string[] = [];

  if (!isValidIndex(pivot.index, candlesLength)) {
    reasons.push("Pivot index is out of range");
  }
  if (!isValidIndex(pivot.confirmedAtIndex, candlesLength)) {
    reasons.push("Pivot confirmedAtIndex is out of range");
  }
  if (pivot.confirmedAtIndex < pivot.index) {
    reasons.push("Pivot confirmedAtIndex cannot be before index");
  }
  if (!isFiniteNumber(pivot.time) || pivot.time <= 0) {
    reasons.push("Pivot time is invalid");
  }
  if (!isValidPrice(pivot.price)) {
    reasons.push("Pivot price is invalid");
  }
  if (pivot.kind !== "HIGH" && pivot.kind !== "LOW") {
    reasons.push("Pivot kind is invalid");
  }

  return { valid: reasons.length === 0, reasons };
}

export function validatePivots(pivots: Pivot[], candlesLength: number): ValidationResult {
  const reasons: string[] = [];

  for (let i = 0; i < pivots.length; i += 1) {
    const check = validatePivot(pivots[i], candlesLength);
    if (!check.valid) {
      reasons.push(`Pivot ${i}: ${check.reasons.join(", ")}`);
    }

    if (i > 0 && pivots[i].index < pivots[i - 1].index) {
      reasons.push("Pivots are not sorted by index");
    }
  }

  return { valid: reasons.length === 0, reasons };
}

export function validatePatternResult(
  pattern: PatternResult,
  candlesLength: number,
): ValidationResult {
  const reasons: string[] = [];

  if (
    pattern.kind !== "HEAD_AND_SHOULDERS" &&
    pattern.kind !== "INVERSE_HEAD_AND_SHOULDERS" &&
    pattern.kind !== "RISING_WEDGE" &&
    pattern.kind !== "FALLING_WEDGE" &&
    pattern.kind !== "ASCENDING_TRIANGLE" &&
    pattern.kind !== "DESCENDING_TRIANGLE" &&
    pattern.kind !== "BULL_FLAG" &&
    pattern.kind !== "BEAR_FLAG"
  ) {
    reasons.push("Pattern kind is invalid");
  }
  if (pattern.status !== "FORMING" && pattern.status !== "CONFIRMED") {
    reasons.push("Pattern status is invalid");
  }
  if (pattern.direction !== "CALL" && pattern.direction !== "PUT") {
    reasons.push("Pattern direction is invalid");
  }
  if (!isFiniteNumber(pattern.confidence) || pattern.confidence < 65) {
    reasons.push("Pattern confidence must be finite and >= 65");
  }
  if (!isValidIndex(pattern.startIndex, candlesLength)) {
    reasons.push("Pattern startIndex is out of range");
  }
  if (!isValidIndex(pattern.endIndex, candlesLength)) {
    reasons.push("Pattern endIndex is out of range");
  }
  if (pattern.startIndex >= pattern.endIndex) {
    reasons.push("Pattern startIndex must be smaller than endIndex");
  }

  const duration = pattern.endIndex - pattern.startIndex + 1;
  const isFlag = pattern.kind === "BULL_FLAG" || pattern.kind === "BEAR_FLAG";
  const minDuration = isFlag ? 5 : 15;
  const maxDuration = isFlag ? 60 : 180;
  if (duration < minDuration || duration > maxDuration) {
    reasons.push(`Pattern duration must be between ${minDuration} and ${maxDuration} candles`);
  }

  if (!isValidIndex(pattern.breakout.index, candlesLength)) {
    reasons.push("Pattern breakout index is out of range");
  }
  if (!isFiniteNumber(pattern.breakout.time) || pattern.breakout.time <= 0) {
    reasons.push("Pattern breakout time is invalid");
  }
  if (!isValidPrice(pattern.breakout.price)) {
    reasons.push("Pattern breakout price is invalid");
  }

  if (!isValidPrice(pattern.invalidation)) {
    reasons.push("Pattern invalidation is invalid");
  }
  if (!isValidPrice(pattern.target1)) {
    reasons.push("Pattern target1 is invalid");
  }
  if (!isValidPrice(pattern.target2)) {
    reasons.push("Pattern target2 is invalid");
  }
  if (!isValidPrice(pattern.target3)) {
    reasons.push("Pattern target3 is invalid");
  }

  for (const point of pattern.drawingPoints) {
    if (!isValidIndex(point.index, candlesLength)) {
      reasons.push(`Drawing point ${point.label} has out-of-range index`);
    }
    if (!isFiniteNumber(point.time) || point.time <= 0) {
      reasons.push(`Drawing point ${point.label} has invalid time`);
    }
    if (!isValidPrice(point.price)) {
      reasons.push(`Drawing point ${point.label} has invalid price`);
    }
  }

  return { valid: reasons.length === 0, reasons };
}
