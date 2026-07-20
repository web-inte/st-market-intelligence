import { NextResponse } from "next/server";
import { getCandles, type SupportedInterval } from "@/lib/candle-engine";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

const allowedIntervals: SupportedInterval[] = [
  5,
  15,
  30,
  60,
  240,
  1440,
];

function parseInterval(
  value: string | null
): SupportedInterval {
  const normalized = String(
    value || ""
  )
    .trim()
    .toLowerCase();

  if (normalized === "day") {
    return 1440;
  }

  const asNumber = Number(normalized || 15);

  return allowedIntervals.includes(
    asNumber as SupportedInterval
  )
    ? (asNumber as SupportedInterval)
    : 15;
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { symbol: rawSymbol } =
      await context.params;

    const symbol = String(
      rawSymbol || ""
    )
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
        { status: 400 }
      );
    }

    const apiKey =
      process.env.MASSIVE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "MASSIVE_API_KEY غير موجود.",
        },
        { status: 500 }
      );
    }

    const requestUrl =
      new URL(request.url);

    const interval = parseInterval(
      requestUrl.searchParams.get(
        "interval"
      )
    );

    const result = await getCandles({
      symbol,
      interval,
      apiKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    const fallbackBusyMessage =
      "تعذر تجهيز الشموع حاليًا بسبب ضغط البيانات. حاول مرة أخرى.";
    const providerRateLimitMessage =
      "تم تجاوز حد طلبات مزود البيانات. انتظر قليلًا ثم أعد المحاولة.";

    if (!(error instanceof Error)) {
      return NextResponse.json(
        {
          error: fallbackBusyMessage,
        },
        { status: 503 }
      );
    }

    const withStatus = error as Error & {
      status?: number;
    };

    if (withStatus.status === 429) {
      return NextResponse.json(
        {
          error: providerRateLimitMessage,
        },
        { status: 429 }
      );
    }

    const normalizedMessage =
      error.message.toLowerCase();

    const isMemoryPressureError =
      error instanceof RangeError ||
      normalizedMessage.includes(
        "out of memory"
      ) ||
      normalizedMessage.includes(
        "allocation failed"
      ) ||
      normalizedMessage.includes("heap");

    if (isMemoryPressureError) {
      return NextResponse.json(
        {
          error: fallbackBusyMessage,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: `تعذر جلب الشموع: ${error.message}`,
      },
      { status: 500 }
    );
  }
}
