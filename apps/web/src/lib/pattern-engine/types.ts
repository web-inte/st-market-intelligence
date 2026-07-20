export type PivotKind = "HIGH" | "LOW";

export type PatternKind =
  | "HEAD_AND_SHOULDERS"
  | "INVERSE_HEAD_AND_SHOULDERS"
  | "RISING_WEDGE"
  | "FALLING_WEDGE"
  | "ASCENDING_TRIANGLE"
  | "DESCENDING_TRIANGLE"
  | "BULL_FLAG"
  | "BEAR_FLAG";

export type PatternStatus = "FORMING" | "CONFIRMED";

export type PatternDirection = "CALL" | "PUT";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pivot {
  index: number;
  time: number;
  price: number;
  kind: PivotKind;
  confirmedAtIndex: number;
}

export interface BreakoutPoint {
  index: number;
  time: number;
  price: number;
}

export interface DrawingPoint {
  label: string;
  index: number;
  time: number;
  price: number;
}

export interface PatternResult {
  kind: PatternKind;
  status: PatternStatus;
  direction: PatternDirection;
  confidence: number;
  startIndex: number;
  endIndex: number;
  breakout: BreakoutPoint;
  invalidation: number;
  target1: number;
  target2: number;
  target3: number;
  drawingPoints: DrawingPoint[];
  rejectionReasons: string[];
}

export interface PivotEngineOptions {
  leftBars?: number;
  rightBars?: number;
}

export interface HeadShouldersOptions extends PivotEngineOptions {
  minPatternBars?: number;
  maxPatternBars?: number;
  minConfidence?: number;
  shoulderToleranceRatio?: number;
  headProminenceAtrMultiplier?: number;
  invalidationAtrMultiplier?: number;
}

export interface PatternEngineOptions {
  minConfidence?: number;
  maxResults?: number;
  includeForming?: boolean;
  includeConfirmed?: boolean;
  enabledKinds?: PatternKind[];
}
