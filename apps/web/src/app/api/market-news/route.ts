import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 60;

function normalizeSymbol(
  value: string | null
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 10);
}

function normalizeFilter(
  value: string | null
) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function parseLimit(
  value: string | null
) {
  const parsed =
    Number.parseInt(
      String(value || ""),
      10
    );

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    MAX_LIMIT,
    Math.max(1, parsed)
  );
}

export async function GET(
  request: NextRequest
) {
  try {
    const symbol =
      normalizeSymbol(
        request.nextUrl.searchParams.get(
          "symbol"
        )
      );

    const eventType =
      normalizeFilter(
        request.nextUrl.searchParams.get(
          "eventType"
        )
      );

    const impact =
      normalizeFilter(
        request.nextUrl.searchParams.get(
          "impact"
        )
      );

    const limit =
      parseLimit(
        request.nextUrl.searchParams.get(
          "limit"
        )
      );

    const supabase =
      createAdminClient();

    let query =
      supabase
        .from(
          "market_news_events"
        )
        .select(
          [
            "id",
            "external_id",
            "symbol",
            "headline",
            "summary",
            "source",
            "source_url",
            "image_url",
            "event_type",
            "impact",
            "importance",
            "classification_reason",
            "published_at",
            "detected_at",
          ].join(",")
        )
        .order(
          "importance",
          {
            ascending: false,
          }
        )
        .order(
          "published_at",
          {
            ascending: false,
          }
        )
        .limit(limit);

    if (symbol) {
      query =
        query.eq(
          "symbol",
          symbol
        );
    }

    if (
      eventType &&
      eventType !== "ALL"
    ) {
      query =
        query.eq(
          "event_type",
          eventType
        );
    }

    if (
      impact &&
      impact !== "ALL"
    ) {
      query =
        query.eq(
          "impact",
          impact
        );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw new Error(
        error.message
      );
    }

    return NextResponse.json({
      ok: true,
      news: data || [],
      count:
        data?.length || 0,
      filters: {
        symbol:
          symbol || null,
        eventType:
          eventType || "ALL",
        impact:
          impact || "ALL",
        limit,
      },
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
            : "تعذر تحميل أخبار السوق.",
      },
      {
        status: 500,
      }
    );
  }
}
