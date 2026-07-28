import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  MARKET_NEWS_SYMBOLS,
  classifyMarketNews,
  createMarketNewsExternalId,
  normalizeNewsText,
  type FinnhubCompanyNewsItem,
} from "@/lib/market-news";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 15;
const NEWS_LOOKBACK_DAYS = 2;
const MAX_NEWS_PER_SYMBOL = 20;
const FETCH_CONCURRENCY = 4;

type ScanRow = {
  external_id: string;
  symbol: string;
  headline: string;
  summary: string | null;
  source: string | null;
  source_url: string | null;
  image_url: string | null;
  event_type:
    | "EARNINGS"
    | "GUIDANCE"
    | "CONTRACT"
    | "ACQUISITION"
    | "REGULATORY"
    | "LEGAL"
    | "MANAGEMENT"
    | "PRODUCT"
    | "ANALYST"
    | "GENERAL";
  impact:
    | "POSITIVE"
    | "NEGATIVE"
    | "NEUTRAL";
  importance: number;
  classification_reason: string;
  published_at: string;
  updated_at: string;
  raw: Record<string, unknown>;
};

function safeEquals(
  first: string,
  second: string
) {
  const firstBuffer =
    Buffer.from(first);

  const secondBuffer =
    Buffer.from(second);

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

function isAuthorized(
  request: NextRequest
) {
  const expectedSecret =
    process.env
      .MARKET_NEWS_CRON_SECRET ||
    process.env.CRON_SECRET;

  if (!expectedSecret) {
    return false;
  }

  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  const suppliedSecret =
    authorization.startsWith(
      "Bearer "
    )
      ? authorization.slice(7)
      : "";

  return (
    suppliedSecret.length > 0 &&
    safeEquals(
      suppliedSecret,
      expectedSecret
    )
  );
}

function toIsoDate(
  date: Date
) {
  return date
    .toISOString()
    .slice(0, 10);
}

function parseInteger(
  value: string | null,
  fallback: number
) {
  const parsed =
    Number.parseInt(
      String(value || ""),
      10
    );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

async function fetchCompanyNews(
  symbol: string,
  apiKey: string,
  from: string,
  to: string
): Promise<
  FinnhubCompanyNewsItem[]
> {
  const url =
    "https://finnhub.io/api/v1/company-news" +
    `?symbol=${encodeURIComponent(
      symbol
    )}` +
    `&from=${encodeURIComponent(
      from
    )}` +
    `&to=${encodeURIComponent(
      to
    )}` +
    `&token=${encodeURIComponent(
      apiKey
    )}`;

  const response =
    await fetch(url, {
      cache: "no-store",
      signal:
        AbortSignal.timeout(
          15_000
        ),
    });

  const payload =
    (await response.json()) as
      | FinnhubCompanyNewsItem[]
      | {
          error?: string;
        };

  if (!response.ok) {
    const message =
      !Array.isArray(payload)
        ? payload.error
        : null;

    throw new Error(
      message ||
        `Finnhub HTTP ${response.status}`
    );
  }

  return Array.isArray(payload)
    ? payload
    : [];
}

function convertNewsToRows(
  symbol: string,
  items:
    FinnhubCompanyNewsItem[]
) {
  const rows: ScanRow[] = [];

  const seen =
    new Set<string>();

  for (
    const item of items.slice(
      0,
      MAX_NEWS_PER_SYMBOL
    )
  ) {
    const headline =
      normalizeNewsText(
        item.headline
      );

    const summary =
      normalizeNewsText(
        item.summary
      );

    const timestamp =
      Number(
        item.datetime || 0
      );

    if (
      !headline ||
      !Number.isFinite(
        timestamp
      ) ||
      timestamp <= 0
    ) {
      continue;
    }

    const classification =
      classifyMarketNews(
        headline,
        summary
      );

    if (
      !classification.isMaterial
    ) {
      continue;
    }

    const externalId =
      createMarketNewsExternalId(
        symbol,
        item
      );

    if (seen.has(externalId)) {
      continue;
    }

    seen.add(externalId);

    rows.push({
      external_id:
        externalId,

      symbol,

      headline,

      summary:
        summary || null,

      source:
        normalizeNewsText(
          item.source
        ) || null,

      source_url:
        normalizeNewsText(
          item.url
        ) || null,

      image_url:
        normalizeNewsText(
          item.image
        ) || null,

      event_type:
        classification
          .eventType,

      impact:
        classification.impact,

      importance:
        classification
          .importance,

      classification_reason:
        classification.reason,

      published_at:
        new Date(
          timestamp * 1000
        ).toISOString(),

      updated_at:
        new Date()
          .toISOString(),

      raw: {
        provider: "finnhub",
        symbol,
        category:
          item.category ?? null,
        related:
          item.related ?? null,
        provider_id:
          item.id ?? null,
        original: item,
      },
    });
  }

  return rows;
}

async function runWithConcurrency<T>(
  items: readonly string[],
  concurrency: number,
  worker: (
    item: string
  ) => Promise<T>
) {
  const results:
    Array<
      PromiseSettledResult<T>
    > = [];

  let nextIndex = 0;

  async function runWorker() {
    while (
      nextIndex < items.length
    ) {
      const currentIndex =
        nextIndex;

      nextIndex += 1;

      try {
        const value =
          await worker(
            items[currentIndex]
          );

        results[currentIndex] = {
          status: "fulfilled",
          value,
        };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          concurrency,
          items.length
        ),
      },
      () => runWorker()
    )
  );

  return results;
}

export async function GET(
  request: NextRequest
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "غير مصرح بتشغيل ماسح الأخبار.",
      },
      {
        status: 401,
      }
    );
  }

  const apiKey =
    process.env
      .FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "FINNHUB_API_KEY غير موجود.",
      },
      {
        status: 500,
      }
    );
  }

  const cursor =
    Math.max(
      0,
      parseInteger(
        request.nextUrl
          .searchParams
          .get("cursor"),
        0
      )
    );

  const requestedLimit =
    parseInteger(
      request.nextUrl
        .searchParams
        .get("limit"),
      DEFAULT_BATCH_SIZE
    );

  const limit =
    Math.min(
      MAX_BATCH_SIZE,
      Math.max(
        1,
        requestedLimit
      )
    );

  const symbols =
    MARKET_NEWS_SYMBOLS.slice(
      cursor,
      cursor + limit
    );

  if (symbols.length === 0) {
    return NextResponse.json({
      ok: true,
      completed: true,
      cursor,
      nextCursor: null,
      totalSymbols:
        MARKET_NEWS_SYMBOLS
          .length,
      scannedSymbols: [],
      fetchedNews: 0,
      materialNews: 0,
      savedRows: 0,
      failures: [],
    });
  }

  const now =
    new Date();

  const fromDate =
    new Date(
      now.getTime() -
        NEWS_LOOKBACK_DAYS *
          24 *
          60 *
          60_000
    );

  const from =
    toIsoDate(fromDate);

  const to =
    toIsoDate(now);

  const fetchResults =
    await runWithConcurrency(
      symbols,
      FETCH_CONCURRENCY,
      async (symbol) => {
        const news =
          await fetchCompanyNews(
            symbol,
            apiKey,
            from,
            to
          );

        return {
          symbol,
          fetched:
            news.length,
          rows:
            convertNewsToRows(
              symbol,
              news
            ),
        };
      }
    );

  const rows: ScanRow[] = [];

  let fetchedNews = 0;

  const failures:
    Array<{
      symbol: string;
      error: string;
    }> = [];

  fetchResults.forEach(
    (result, index) => {
      const symbol =
        symbols[index];

      if (
        result.status ===
        "fulfilled"
      ) {
        fetchedNews +=
          result.value.fetched;

        rows.push(
          ...result.value.rows
        );

        return;
      }

      failures.push({
        symbol,
        error:
          result.reason instanceof
          Error
            ? result.reason.message
            : String(
                result.reason
              ),
      });
    }
  );

  let savedRows = 0;

  if (rows.length > 0) {
    const supabase =
      createAdminClient();

    const {
      data,
      error,
    } = await supabase
      .from(
        "market_news_events"
      )
      .upsert(rows, {
        onConflict:
          "external_id",
        /*
         * الأخبار الموجودة لا يتم تحديثها
         * أو احتسابها كمحفوظة من جديد.
         */
        ignoreDuplicates:
          true,
      })
      .select("external_id");

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `فشل حفظ الأخبار: ${error.message}`,
          cursor,
          symbols,
          fetchedNews,
          materialNews:
            rows.length,
          failures,
        },
        {
          status: 500,
        }
      );
    }

    savedRows =
      data?.length || 0;
  }

  const nextCursor =
    cursor +
      symbols.length <
    MARKET_NEWS_SYMBOLS.length
      ? cursor +
        symbols.length
      : null;

  return NextResponse.json({
    ok: true,
    completed:
      nextCursor === null,

    cursor,
    nextCursor,

    limit,

    totalSymbols:
      MARKET_NEWS_SYMBOLS
        .length,

    scannedSymbols:
      symbols,

    dateRange: {
      from,
      to,
    },

    fetchedNews,

    materialNews:
      rows.length,

    savedRows,

    failures,

    updatedAt:
      new Date()
        .toISOString(),
  });
}
