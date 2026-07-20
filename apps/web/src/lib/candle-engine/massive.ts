import { getEasternDateKey } from "./time";
import type { Candle, MassiveAggsPayload, MassiveRawBar, SupportedInterval } from "./types";

const BASE_URL = "https://api.massive.com";
const MAX_MINUTE_PAGES = 5;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_LOOKBACK_DAYS = 760;
const DAILY_LIMIT = 500;

export class CandleEngineHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CandleEngineHttpError";
    this.status = status;
  }
}

function sanitizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
}

function buildMinuteUrl(symbol: string, from: string, to: string, apiKey: string): string {
  const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${from}/${to}`;
  const url = new URL(path, BASE_URL);

  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  url.searchParams.set("apiKey", apiKey);

  return url.toString();
}

function buildDailyUrl(symbol: string, from: string, to: string, apiKey: string): string {
  const path = `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}`;
  const url = new URL(path, BASE_URL);

  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", String(DAILY_LIMIT));
  url.searchParams.set("apiKey", apiKey);

  return url.toString();
}

function withApiKey(nextUrl: string, apiKey: string): string {
  const url = new URL(nextUrl);
  if (!url.searchParams.has("apiKey")) {
    url.searchParams.set("apiKey", apiKey);
  }
  return url.toString();
}

function describeProviderError(status: number, payload: MassiveAggsPayload | null): string {
  if (status === 401 || status === 403) {
    return "تعذر التحقق من صلاحية الوصول إلى مزود البيانات.";
  }

  if (status === 429) {
    return "تم تجاوز حد طلبات مزود البيانات. انتظر قليلًا ثم أعد المحاولة.";
  }

  if (status >= 500) {
    return "خدمة مزود البيانات غير متاحة مؤقتًا.";
  }

  return "تعذر جلب بيانات الشموع من مزود البيانات.";
}

async function fetchPage(url: string): Promise<{ payload: MassiveAggsPayload; status: number; ok: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    let payload: MassiveAggsPayload;
    try {
      payload = (await response.json()) as MassiveAggsPayload;
    } catch {
      throw new Error("استجابة Massive غير صالحة (JSON).",);
    }

    return {
      payload,
      status: response.status,
      ok: response.ok,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال مع Massive (20 ثانية).");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBatchBars(params: {
  symbol: string;
  from: string;
  to: string;
  apiKey: string;
}): Promise<MassiveRawBar[]> {
  const batchBars: MassiveRawBar[] = [];
  let nextUrl: string | null = buildMinuteUrl(params.symbol, params.from, params.to, params.apiKey);

  for (let page = 0; page < MAX_MINUTE_PAGES && nextUrl; page += 1) {
    const normalizedUrl = withApiKey(nextUrl, params.apiKey);
    const { payload, status, ok } = await fetchPage(normalizedUrl);

    if (!ok) {
      throw new CandleEngineHttpError(
        status,
        describeProviderError(status, payload)
      );
    }

    if (Array.isArray(payload.results) && payload.results.length > 0) {
      batchBars.push(...payload.results);
    }

    nextUrl = typeof payload.next_url === "string" && payload.next_url.trim() ? payload.next_url : null;
  }

  if (nextUrl) {
    throw new CandleEngineHttpError(
      503,
      "تم تجاوز حد صفحات مزود البيانات لهذا الطلب. حاول لاحقًا."
    );
  }

  return batchBars;
}

function isValidDailyBar(bar: MassiveRawBar): bar is Required<MassiveRawBar> {
  const t = Number(bar.t);
  const o = Number(bar.o);
  const h = Number(bar.h);
  const l = Number(bar.l);
  const c = Number(bar.c);
  const v = Number(bar.v);

  if (!Number.isFinite(t) || t <= 0) {
    return false;
  }

  if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) {
    return false;
  }

  if (o <= 0 || h <= 0 || l <= 0 || c <= 0) {
    return false;
  }

  if (!Number.isFinite(v) || v < 0) {
    return false;
  }

  if (h < o || h < c) {
    return false;
  }

  if (l > o || l > c) {
    return false;
  }

  if (l > h) {
    return false;
  }

  return true;
}

function cleanDailyBars(rawBars: MassiveRawBar[]): Required<MassiveRawBar>[] {
  const validBars = rawBars.filter(isValidDailyBar);
  validBars.sort((left, right) => Number(left.t) - Number(right.t));

  const deduped: Required<MassiveRawBar>[] = [];
  let lastTimestamp = -1;

  for (const bar of validBars) {
    const timestamp = Number(bar.t);

    if (timestamp === lastTimestamp) {
      continue;
    }

    deduped.push(bar);
    lastTimestamp = timestamp;
  }

  if (deduped.length > DAILY_LIMIT) {
    return deduped.slice(-DAILY_LIMIT);
  }

  return deduped;
}

export async function fetchMassiveDailyCandles(params: {
  symbol: string;
  apiKey: string;
}): Promise<{ symbol: string; candles: Candle[]; sourceBars: number }> {
  const symbol = sanitizeSymbol(params.symbol);

  if (!symbol) {
    throw new Error("رمز السهم غير صالح.");
  }

  if (!params.apiKey) {
    throw new Error("MASSIVE_API_KEY غير موجود.");
  }

  const nowMs = Date.now();
  const fromMs = nowMs - DAILY_LOOKBACK_DAYS * DAY_MS;
  const from = getEasternDateKey(fromMs);
  const to = getEasternDateKey(nowMs);

  const url = buildDailyUrl(symbol, from, to, params.apiKey);
  const { payload, status, ok } = await fetchPage(url);

  if (!ok) {
    throw new CandleEngineHttpError(
      status,
      describeProviderError(status, payload)
    );
  }

  const rawBars = Array.isArray(payload.results) ? payload.results : [];
  const cleaned = cleanDailyBars(rawBars);

  const candles: Candle[] = cleaned.map((bar) => ({
    time: Math.floor(Number(bar.t) / 1000),
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c),
    volume: Number(bar.v),
  }));

  return {
    symbol,
    candles,
    sourceBars: cleaned.length,
  };
}

export async function fetchMassiveMinuteBars(params: {
  symbol: string;
  interval: SupportedInterval;
  apiKey: string;
}): Promise<{ symbol: string; bars: MassiveRawBar[] }> {
  const symbol = sanitizeSymbol(params.symbol);

  if (!symbol) {
    throw new Error("رمز السهم غير صالح.");
  }

  if (!params.apiKey) {
    throw new Error("MASSIVE_API_KEY غير موجود.");
  }

  if (params.interval === 1440) {
    throw new Error("فريم 1440 يستخدم مصدر Daily مباشر.");
  }

  const nowMs = Date.now();
  const fromMs = nowMs - 12 * DAY_MS;
  const results = await fetchBatchBars({
    symbol,
    from: getEasternDateKey(fromMs),
    to: getEasternDateKey(nowMs),
    apiKey: params.apiKey,
  });

  return { symbol, bars: results };
}
