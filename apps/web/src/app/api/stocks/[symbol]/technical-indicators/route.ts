import {
  NextRequest,
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

type FinnhubTechnicalResponse = {
  technicalAnalysis?: {
    count?: {
      buy?: number;
      neutral?: number;
      sell?: number;
    };
    signal?: string;
  };
  trend?: {
    adx?: number;
    trending?: boolean;
  };
  error?: string;
};

const CACHE_TTL_MS =
  60_000;

const cache =
  new Map<
    string,
    {
      expiresAt: number;
      payload: unknown;
    }
  >();

function normalizeSymbol(
  value: unknown
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

function normalizeInterval(
  value: string | null
) {
  const parsed =
    Number.parseInt(
      String(value || ""),
      10
    );

  if (
    [
      5,
      15,
      30,
      60,
      240,
      1440,
    ].includes(parsed)
  ) {
    return parsed;
  }

  return 15;
}

function resolveFinnhubResolution(
  interval: number
) {
  if (interval === 1440) {
    return {
      resolution: "D",
      effectiveInterval: 1440,
      fallback: false,
    };
  }

  /*
   * Finnhub Aggregate Indicator لا يوفر
   * فريم 240 دقيقة مباشرة.
   * نعرض 1H مع تنبيه واضح بدل اختراع بيانات.
   */
  if (interval === 240) {
    return {
      resolution: "60",
      effectiveInterval: 60,
      fallback: true,
    };
  }

  return {
    resolution:
      String(interval),
    effectiveInterval:
      interval,
    fallback: false,
  };
}

function normalizeSignal(
  value: unknown
) {
  const signal =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    signal === "buy" ||
    signal === "sell" ||
    signal === "neutral"
  ) {
    return signal;
  }

  return "neutral";
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const params =
      await context.params;

    const symbol =
      normalizeSymbol(
        params.symbol
      );

    if (!symbol) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "رمز السهم غير صالح.",
        },
        {
          status: 400,
        }
      );
    }

    const interval =
      normalizeInterval(
        request.nextUrl
          .searchParams
          .get("interval")
      );

    const {
      resolution,
      effectiveInterval,
      fallback,
    } =
      resolveFinnhubResolution(
        interval
      );

    const cacheKey =
      `${symbol}:${resolution}`;

    const cached =
      cache.get(cacheKey);

    if (
      cached &&
      cached.expiresAt >
        Date.now()
    ) {
      return NextResponse.json({
        ...(cached.payload as object),
        cached: true,
      });
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

    const url =
      "https://finnhub.io/api/v1/scan/technical-indicator" +
      `?symbol=${encodeURIComponent(
        symbol
      )}` +
      `&resolution=${encodeURIComponent(
        resolution
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

    const data =
      (await response.json()) as
        FinnhubTechnicalResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            data.error ||
            `Finnhub HTTP ${response.status}`,
        },
        {
          status:
            response.status,
        }
      );
    }

    if (data.error) {
      return NextResponse.json(
        {
          ok: false,
          error: data.error,
        },
        {
          status: 502,
        }
      );
    }

    const buy =
      Math.max(
        0,
        Number(
          data
            .technicalAnalysis
            ?.count
            ?.buy || 0
        )
      );

    const neutral =
      Math.max(
        0,
        Number(
          data
            .technicalAnalysis
            ?.count
            ?.neutral || 0
        )
      );

    const sell =
      Math.max(
        0,
        Number(
          data
            .technicalAnalysis
            ?.count
            ?.sell || 0
        )
      );

    const total =
      buy +
      neutral +
      sell;

    const buyPercent =
      total > 0
        ? (buy / total) * 100
        : 0;

    const neutralPercent =
      total > 0
        ? (neutral / total) *
          100
        : 0;

    const sellPercent =
      total > 0
        ? (sell / total) *
          100
        : 0;

    const adx =
      Number(
        data.trend?.adx || 0
      );

    const trending =
      Boolean(
        data.trend
          ?.trending
      );

    const payload = {
      ok: true,
      symbol,
      requestedInterval:
        interval,
      effectiveInterval,
      resolution,
      fallback,
      fallbackMessage:
        fallback
          ? "Finnhub لا يوفر مؤشرًا مجمعًا مباشرًا لفريم 4H؛ المعروض حاليًا هو فريم 1H."
          : null,
      technicalAnalysis: {
        signal:
          normalizeSignal(
            data
              .technicalAnalysis
              ?.signal
          ),
        count: {
          buy,
          neutral,
          sell,
          total,
        },
        percentages: {
          buy:
            Number(
              buyPercent.toFixed(
                1
              )
            ),
          neutral:
            Number(
              neutralPercent.toFixed(
                1
              )
            ),
          sell:
            Number(
              sellPercent.toFixed(
                1
              )
            ),
        },
      },
      trend: {
        adx:
          Number(
            adx.toFixed(2)
          ),
        trending,
        strength:
          adx >= 40
            ? "STRONG"
            : adx >= 25
              ? "TRENDING"
              : "RANGING",
      },
      updatedAt:
        new Date()
          .toISOString(),
      cached: false,
      source: "finnhub",
    };

    cache.set(
      cacheKey,
      {
        expiresAt:
          Date.now() +
          CACHE_TTL_MS,
        payload,
      }
    );

    return NextResponse.json(
      payload
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحميل المؤشرات الفنية.",
      },
      {
        status: 500,
      }
    );
  }
}
