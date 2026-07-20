export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidPrice(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

export function isValidIndex(value: unknown, length?: number): value is number {
  if (!Number.isInteger(value)) {
    return false;
  }
  const index = value as number;
  if (typeof length === "number") {
    return index >= 0 && index < length;
  }
  return index >= 0;
}

export function slope(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (!isFiniteNumber(x1) || !isFiniteNumber(x2) || x1 === x2) {
    return NaN;
  }
  if (!isFiniteNumber(y1) || !isFiniteNumber(y2)) {
    return NaN;
  }
  return (y2 - y1) / (x2 - x1);
}

export function intercept(x: number, y: number, m: number): number {
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(m)) {
    return NaN;
  }
  return y - m * x;
}

export function linePriceAtIndex(index: number, m: number, b: number): number {
  if (!isFiniteNumber(index) || !isFiniteNumber(m) || !isFiniteNumber(b)) {
    return NaN;
  }
  return m * index + b;
}

export function relativeDifference(a: number, b: number): number {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
    return Infinity;
  }
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) {
    return 0;
  }
  return Math.abs(a - b) / base;
}

export function distance(a: number, b: number): number {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
    return Infinity;
  }
  return Math.abs(a - b);
}

export function convertToAbsoluteIndex(
  sourceIndex: number,
  offset: number,
  maxLength: number,
): number {
  if (
    !isValidIndex(sourceIndex, maxLength) ||
    !Number.isInteger(offset) ||
    !Number.isInteger(maxLength) ||
    maxLength <= 0
  ) {
    return -1;
  }
  const next = sourceIndex + offset;
  return isValidIndex(next, maxLength) ? next : -1;
}
