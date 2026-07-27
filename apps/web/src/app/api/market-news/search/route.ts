import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
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

export const maxDuration = 30;

const NEWS_LOOKBACK_DAYS = 7;
const MAX_RESULTS = 30;

function normalizeSymbol(
  value: string | null
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9.-]/g,
      ""
    )
    .slice(0, 10);
}

function toIsoDate(
  date: Date
) {
  return date
    .toISOString()
    .slice(0, 10);
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
    const errorMessage =
      !Array.isArray(payload)
        ? payload.error
        : null;

    throw new Error(
      errorMessage ||
        `Finnhub HTTP ${response.status}`
    );
  }

  return Array.isArray(payload)
    ? payload
    : [];
}

export async function GET(
  request: NextRequest
) {
  try {
    const symbol =
      normalizeSymbol(
        request.nextUrl
          .searchParams
          .get("symbol")
      );

    if (!symbol) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "اكتب رمز سهم صالح.",
        },
        {
          status: 400,
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

    const news =
      await fetchCompanyNews(
        symbol,
        apiKey,
        toIsoDate(fromDate),
        toIsoDate(now)
      );

    const rows =
      news
        .slice(0, MAX_RESULTS)
        .map((item) => {
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
            return null;
          }

          const classification =
            classifyMarketNews(
              headline,
              summary
            );

          return {
            external_id:
              createMarketNewsExternalId(
                symbol,
                item
              ),

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
              classification
                .impact,

            importance:
              classification
                .importance,

            classification_reason:
              classification
                .reason,

            published_at:
              new Date(
                timestamp * 1000
              ).toISOString(),

            updated_at:
              new Date()
                .toISOString(),

            raw: {
              provider:
                "finnhub",
              requested_by:
                "market-news-search",
              symbol,
              original: item,
            },
          };
        })
        .filter(
          (
            row
          ): row is NonNullable<
            typeof row
          > => Boolean(row)
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
          ignoreDuplicates:
            true,
        })
        .select(
          "external_id"
        );

      if (error) {
        throw new Error(
          `فشل حفظ أخبار ${symbol}: ${error.message}`
        );
      }

      savedRows =
        data?.length || 0;
    }

    return NextResponse.json({
      ok: true,
      symbol,
      fetchedNews:
        news.length,
      returnedNews:
        rows.length,
      savedRows,
      news: rows,
      updatedAt:
        new Date()
          .toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر جلب أخبار الشركة.",
      },
      {
        status: 500,
      }
    );
  }
}
