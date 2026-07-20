import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  detectPatterns,
  detectTopPattern,
  type Candle,
  type PatternResult,
} from "@/lib/pattern-engine";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

type MassiveDailyBar = {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
};

type PatternsResponse = {
  symbol: string;
  timeframe: "1D";
  candleCount: number;
  patterns: PatternResult[];
  topPattern: PatternResult | null;
  cached: boolean;
  updatedAt: string;
  reason?: string;
};

type CacheEntry = {
  expiresAt: number;
  data: Omit<PatternsResponse, "cached">;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CANDLES = 500;
const MIN_CANDLES_TO_ANALYZE = 60;
const FETCH_TIMEOUT_MS = 15000;

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<PatternsResponse>>();

function sanitizeSymbol(input: string): string | null {
  const symbol = String(input || "").trim().toUpperCase();

  if (!symbol) {
    return null;
  }

  if (!/^[A-Z0-9.-]+$/.test(symbol)) {
    return null;
  }

  return symbol;
}

function getDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toSafeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function cleanDailyCandles(rawBars: MassiveDailyBar[]): Candle[] {
  const validBars: Candle[] = [];

  for (const bar of rawBars) {
    const timestampMs = toSafeNumber(bar.t);
    const open = toSafeNumber(bar.o);
    const high = toSafeNumber(bar.h);
    const low = toSafeNumber(bar.l);
    const close = toSafeNumber(bar.c);
    const volume = toSafeNumber(bar.v);

    if (
      !Number.isFinite(timestampMs) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }

    if (
      timestampMs <= 0 ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0 ||
      volume < 0
    ) {
      continue;
    }

    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
      continue;
    }

    validBars.push({
      time: Math.floor(timestampMs / 1000),
      open,
      high,
      low,
      close,
      volume,
    });
  }

  validBars.sort((a, b) => a.time - b.time);

  const deduped: Candle[] = [];
  const seenTimes = new Set<number>();

  for (const candle of validBars) {
    if (seenTimes.has(candle.time)) {
      continue;
    }
    seenTimes.add(candle.time);
    deduped.push(candle);
  }

  if (deduped.length <= MAX_CANDLES) {
    return deduped;
  }

  return deduped.slice(deduped.length - MAX_CANDLES);
}

function parseMassiveErrorMessage(payload: unknown): string {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const message = String(record.error || record.message || "").trim();
  return message || "تعذر جلب الشموع اليومية من مزود البيانات.";
}

async function fetchDailyCandlesFromMassive(symbol: string, apiKey: string): Promise<Candle[]> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 500 * 24 * 60 * 60 * 1000);

  const from = getDateString(fromDate);
  const to = getDateString(toDate);

  const massiveUrl =
    `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
    `/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=500&apiKey=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(massiveUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const upstreamMessage = parseMassiveErrorMessage(payload);

      if (response.status === 429) {
        throw {
          status: 429,
          message: "تم تجاوز حد الطلبات من مزود البيانات. حاول لاحقًا.",
          details: upstreamMessage,
        };
      }

      const mappedStatus = response.status >= 500 ? 502 : response.status;
      throw {
        status: mappedStatus,
        message: `فشل جلب بيانات الشموع اليومية: ${upstreamMessage}`,
      };
    }

    const results = Array.isArray((payload as { results?: unknown[] })?.results)
      ? ((payload as { results: MassiveDailyBar[] }).results)
      : [];

    return cleanDailyCandles(results);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw {
        status: 504,
        message: "انتهت مهلة الاتصال بمزود البيانات أثناء جلب الشموع اليومية.",
      };
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json(
    {
      error: message,
    },
    { status },
  );
}

async function buildFreshResult(symbol: string, apiKey: string): Promise<PatternsResponse> {
  let candles: Candle[] = [];

  try {
    candles = await fetchDailyCandlesFromMassive(symbol, apiKey);
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 502;

    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "تعذر جلب الشموع اليومية من مزود البيانات.";

    throw {
      status: Number.isFinite(status) ? status : 502,
      message,
    };
  }

  if (candles.length < MIN_CANDLES_TO_ANALYZE) {
    return {
      symbol,
      timeframe: "1D",
      candleCount: candles.length,
      patterns: [],
      topPattern: null,
      cached: false,
      updatedAt: new Date().toISOString(),
      reason: "لا توجد شموع يومية كافية لتحليل النماذج.",
    };
  }

  try {
    const engineOptions = {
      minConfidence: 65,
      maxResults: 10,
      includeForming: true,
      includeConfirmed: true,
    } as const;

    const patterns = detectPatterns(candles, engineOptions);
    const topPattern = detectTopPattern(candles, engineOptions);

    return {
      symbol,
      timeframe: "1D",
      candleCount: candles.length,
      patterns,
      topPattern,
      cached: false,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    throw {
      status: 500,
      message: "حدث خطأ أثناء تشغيل محرك النماذج الفنية.",
    };
  }
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("يجب تسجيل الدخول", 401);
    }

    const { symbol: rawSymbol } = await context.params;
    const symbol = sanitizeSymbol(rawSymbol);

    if (!symbol) {
      return errorResponse("رمز السهم غير صالح.", 400);
    }

    const apiKey = process.env.MASSIVE_API_KEY;

    if (!apiKey) {
      return errorResponse("مفتاح خدمة البيانات غير موجود على الخادم (MASSIVE_API_KEY).", 500);
    }

    const now = Date.now();
    const cached = responseCache.get(symbol);

    if (cached && cached.expiresAt > now) {
      return NextResponse.json({
        ...cached.data,
        cached: true,
      });
    }

    if (cached && cached.expiresAt <= now) {
      responseCache.delete(symbol);
    }

    const existingInflight = inflightRequests.get(symbol);

    if (existingInflight) {
      try {
        const shared = await existingInflight;
        return NextResponse.json(shared);
      } catch (error) {
        const status =
          error && typeof error === "object" && "status" in error
            ? Number((error as { status?: unknown }).status)
            : 500;

        const message =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message)
            : "حدث خطأ أثناء تحليل النماذج الفنية.";

        return errorResponse(message, Number.isFinite(status) ? status : 500);
      }
    }

    const task = buildFreshResult(symbol, apiKey)
      .then((result) => {
        if (result.candleCount >= MIN_CANDLES_TO_ANALYZE) {
          const dataToCache: Omit<PatternsResponse, "cached"> = {
            ...result,
          };

          responseCache.set(symbol, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            data: dataToCache,
          });
        }

        return result;
      })
      .finally(() => {
        inflightRequests.delete(symbol);
      });

    inflightRequests.set(symbol, task);

    const freshResult = await task;

    return NextResponse.json(freshResult);
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 500;

    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : "حدث خطأ غير متوقع أثناء تحليل النماذج الفنية.";

    return errorResponse(message, Number.isFinite(status) ? status : 500);
  }
}
