import type { MassiveRawBar, MinuteBar } from "./types";

function isFinitePositivePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function cleanMinuteBars(rawBars: MassiveRawBar[]): MinuteBar[] {
  const validBars: MinuteBar[] = [];

  for (const bar of rawBars) {
    const timeMs = Number(bar.t);
    const open = Number(bar.o);
    const high = Number(bar.h);
    const low = Number(bar.l);
    const close = Number(bar.c);
    const volume = Number(bar.v);

    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      continue;
    }

    if (!isFinitePositivePrice(open) || !isFinitePositivePrice(high) || !isFinitePositivePrice(low) || !isFinitePositivePrice(close)) {
      continue;
    }

    if (!Number.isFinite(volume) || volume < 0) {
      continue;
    }

    if (high < open || high < close) {
      continue;
    }

    if (low > open || low > close) {
      continue;
    }

    if (low > high) {
      continue;
    }

    validBars.push({
      timeMs,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  validBars.sort((left, right) => left.timeMs - right.timeMs);

  const deduped: MinuteBar[] = [];
  let lastTimeMs = -1;

  for (const bar of validBars) {
    if (bar.timeMs === lastTimeMs) {
      continue;
    }

    deduped.push(bar);
    lastTimeMs = bar.timeMs;
  }

  return deduped;
}
