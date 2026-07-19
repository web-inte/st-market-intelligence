import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

type MassiveBar = {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const easternFormatter =
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

function getEasternParts(
  timestampMs: number
) {
  const parts =
    easternFormatter.formatToParts(
      new Date(timestampMs)
    );

  const values =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function easternDateString(
  date: Date
) {
  const parts =
    getEasternParts(date.getTime());

  return [
    parts.year,
    String(parts.month).padStart(
      2,
      "0"
    ),
    String(parts.day).padStart(
      2,
      "0"
    ),
  ].join("-");
}

function aggregateRegularSession(
  bars: MassiveBar[],
  interval: number
): Candle[] {
  const buckets =
    new Map<string, Candle>();

  const sortedBars = [...bars].sort(
    (left, right) =>
      Number(left.t || 0) -
      Number(right.t || 0)
  );

  for (const bar of sortedBars) {
    const timestampMs =
      Number(bar.t || 0);

    const open = Number(bar.o || 0);
    const high = Number(bar.h || 0);
    const low = Number(bar.l || 0);
    const close = Number(bar.c || 0);
    const volume = Number(bar.v || 0);

    if (
      timestampMs <= 0 ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0
    ) {
      continue;
    }

    const eastern =
      getEasternParts(timestampMs);

    const minuteOfDay =
      eastern.hour * 60 +
      eastern.minute;

    /*
     * الجلسة الرسمية الأمريكية:
     * 09:30 ET حتى 16:00 ET.
     */
    const sessionStart = 9 * 60 + 30;
    const sessionEnd = 16 * 60;

    if (
      minuteOfDay < sessionStart ||
      minuteOfDay >= sessionEnd
    ) {
      continue;
    }

    const minutesFromOpen =
      minuteOfDay - sessionStart;

    const bucketIndex =
      Math.floor(
        minutesFromOpen / interval
      );

    const sessionDate = [
      eastern.year,
      String(eastern.month).padStart(
        2,
        "0"
      ),
      String(eastern.day).padStart(
        2,
        "0"
      ),
    ].join("-");

    const bucketKey =
      `${sessionDate}-${bucketIndex}`;

    const existing =
      buckets.get(bucketKey);

    if (!existing) {
      buckets.set(bucketKey, {
        time: Math.floor(
          timestampMs / 1000
        ),
        open,
        high,
        low,
        close,
        volume,
      });

      continue;
    }

    existing.high = Math.max(
      existing.high,
      high
    );

    existing.low = Math.min(
      existing.low,
      low
    );

    /*
     * لأن البيانات مرتبة زمنيًا،
     * إغلاق آخر دقيقة هو إغلاق الشمعة.
     */
    existing.close = close;
    existing.volume += volume;
  }

  return Array.from(
    buckets.values()
  ).sort(
    (left, right) =>
      left.time - right.time
  );
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

    const requestedInterval =
      Number(
        requestUrl.searchParams.get(
          "interval"
        ) || 15
      );

    const allowedIntervals = [
      5,
      15,
      30,
      60,
    ];

    const interval =
      allowedIntervals.includes(
        requestedInterval
      )
        ? requestedInterval
        : 15;

    const toDate = new Date();

    const fromDate = new Date(
      toDate.getTime() -
        12 *
          24 *
          60 *
          60 *
          1000
    );

    const from =
      easternDateString(fromDate);

    const to =
      easternDateString(toDate);

    /*
     * نجلب دقيقة واحدة دائمًا،
     * ثم نبني الفريم داخل الخادم
     * من افتتاح جلسة نيويورك.
     */
    const massiveUrl =
      `https://api.massive.com/v2/aggs/ticker/` +
      `${encodeURIComponent(symbol)}` +
      `/range/1/minute/${from}/${to}` +
      `?adjusted=true` +
      `&sort=asc` +
      `&limit=50000` +
      `&apiKey=${encodeURIComponent(
        apiKey
      )}`;

    const response = await fetch(
      massiveUrl,
      {
        cache: "no-store",
        headers: {
          Accept:
            "application/json",
        },
      }
    );

    const payload =
      await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error ||
            payload?.message ||
            "تعذر جلب شموع السهم.",
        },
        {
          status: response.status,
        }
      );
    }

    const minuteBars:
      MassiveBar[] =
      Array.isArray(
        payload?.results
      )
        ? payload.results
        : [];

    const candles =
      aggregateRegularSession(
        minuteBars,
        interval
      );

    return NextResponse.json({
      symbol,
      interval,
      session: "regular",
      timezone:
        "America/New_York",
      candles,
      sourceBars:
        minuteBars.length,
      updatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Stock candles error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء جلب الشموع.",
      },
      { status: 500 }
    );
  }
}
