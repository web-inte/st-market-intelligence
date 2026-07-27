import {
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

const allowedResolutions =
  new Set([
    "1",
    "5",
    "15",
    "30",
    "60",
    "D",
    "W",
    "M",
  ]);

function normalizeResolution(
  value: string | null
) {
  const normalized =
    String(value || "15")
      .trim()
      .toUpperCase();

  return allowedResolutions.has(
    normalized
  )
    ? normalized
    : "15";
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { symbol: rawSymbol } =
      await context.params;

    const symbol =
      String(rawSymbol || "")
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z0-9.-]/g,
          ""
        );

    if (!symbol) {
      return NextResponse.json(
        {
          error:
            "رمز السهم غير صالح.",
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
          error:
            "FINNHUB_API_KEY غير موجود.",
        },
        {
          status: 500,
        }
      );
    }

    const requestUrl =
      new URL(request.url);

    const resolution =
      normalizeResolution(
        requestUrl.searchParams.get(
          "resolution"
        )
      );

    const url =
      "https://finnhub.io/api/v1/scan/support-resistance" +
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

    const payload =
      (await response.json()) as {
        levels?: unknown[];
        error?: string;
      };

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload.error ||
            `Finnhub HTTP ${response.status}`,
        },
        {
          status:
            response.status,
        }
      );
    }

    const levels =
      Array.isArray(
        payload.levels
      )
        ? payload.levels
            .map(Number)
            .filter(
              (level) =>
                Number.isFinite(
                  level
                ) &&
                level > 0
            )
            .sort(
              (first, second) =>
                first - second
            )
            .filter(
              (
                level,
                index,
                allLevels
              ) =>
                index === 0 ||
                Math.abs(
                  level -
                    allLevels[
                      index - 1
                    ]
                ) >= 0.001
            )
        : [];

    return NextResponse.json({
      symbol,
      resolution,
      levels,
      updatedAt:
        new Date()
          .toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذر جلب الدعم والمقاومة.",
      },
      {
        status: 500,
      }
    );
  }
}
