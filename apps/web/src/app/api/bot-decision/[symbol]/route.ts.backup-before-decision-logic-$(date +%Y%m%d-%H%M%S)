import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

type BotApiResponse = {
  ok?: boolean;
  symbol?: string;
  text?: string;
  error?: string;
};

function normalizeSymbol(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.-]/g, "");
}

function isValidSymbol(symbol: string) {
  return /^[A-Z]{1,6}$/.test(symbol);
}

function cleanBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function isAuthorized(request: NextRequest) {
  const expectedSecret =
    process.env.DECISION_SCAN_SECRET;

  /*
    البحث اليدوي من داخل الموقع قد لا يرسل
    Authorization، لذلك لا نفرض المفتاح إذا
    لم يكن DECISION_SCAN_SECRET موجودًا.

    GitHub Actions يرسل:
    Authorization: Bearer <secret>
  */
  if (!expectedSecret) {
    return true;
  }

  const authorization =
    request.headers.get("authorization") || "";

  return authorization === `Bearer ${expectedSecret}`;
}

async function requestBotReport({
  name,
  baseUrl,
  secret,
  path,
  symbol,
}: {
  name: string;
  baseUrl: string | undefined;
  secret: string | undefined;
  path: string;
  symbol: string;
}) {
  if (!baseUrl) {
    throw new Error(`${name}_API_URL_MISSING`);
  }

  if (!secret) {
    throw new Error(`${name}_API_SECRET_MISSING`);
  }

  const url = new URL(
    `${cleanBaseUrl(baseUrl)}${path}`
  );

  url.searchParams.set(
    "key",
    secret
  );

  url.searchParams.set(
    "symbol",
    symbol
  );

  const response = await fetch(
    url.toString(),
    {
      cache: "no-store",
      signal: AbortSignal.timeout(
        120_000
      ),
      headers: {
        Accept: "application/json",
      },
    }
  );

  let payload: BotApiResponse = {};

  try {
    payload =
      (await response.json()) as
        BotApiResponse;
  } catch {
    throw new Error(
      `${name}_INVALID_JSON`
    );
  }

  if (!response.ok) {
    throw new Error(
      `${name}_HTTP_${response.status}:` +
      `${payload.error || "UNKNOWN_ERROR"}`
    );
  }

  if (
    payload.ok !== true ||
    !payload.text
  ) {
    throw new Error(
      `${name}_INVALID_REPORT:` +
      `${payload.error || "EMPTY_TEXT"}`
    );
  }

  return {
    symbol:
      normalizeSymbol(
        payload.symbol || symbol
      ),
    text: payload.text,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
      },
      {
        status: 401,
      }
    );
  }

  const params =
    await context.params;

  const symbol =
    normalizeSymbol(
      params.symbol
    );

  if (!isValidSymbol(symbol)) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_SYMBOL",
      },
      {
        status: 400,
      }
    );
  }

  const startedAt =
    Date.now();

  try {
    /*
      تشغيل نفس بوت القاما ونفس بوت السيولة
      على الرمز نفسه وفي اللحظة نفسها.
    */
    const [
      gamma,
      radar,
    ] = await Promise.all([
      requestBotReport({
        name: "GAMMA",
        baseUrl:
          process.env.GAMMA_API_URL,
        secret:
          process.env.GAMMA_API_SECRET,
        path: "/api/gamma",
        symbol,
      }),

      requestBotReport({
        name: "RADAR",
        baseUrl:
          process.env.RADAR_API_URL,
        secret:
          process.env.RADAR_API_SECRET,
        path: "/api/radar",
        symbol,
      }),
    ]);

    if (
      gamma.symbol !== symbol ||
      radar.symbol !== symbol
    ) {
      throw new Error(
        `SYMBOL_MISMATCH:` +
        `REQUEST=${symbol},` +
        `GAMMA=${gamma.symbol},` +
        `RADAR=${radar.symbol}`
      );
    }

    return NextResponse.json(
      {
        ok: true,

        engine:
          "BOT_DECISION",

        mode:
          request.nextUrl.searchParams
            .get("mode") === "auto"
            ? "AUTO"
            : "MANUAL",

        symbol,

        sources: {
          gamma: {
            ok: true,
            text: gamma.text,
          },

          radar: {
            ok: true,
            text: radar.text,
          },
        },

        elapsedMs:
          Date.now() -
          startedAt,

        analyzedAt:
          new Date()
            .toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `BOT DECISION ENGINE ERROR ${symbol}:`,
      message
    );

    return NextResponse.json(
      {
        ok: false,
        engine:
          "BOT_DECISION",
        symbol,
        error:
          "BOT_DECISION_ANALYSIS_FAILED",
        details:
          message,
        elapsedMs:
          Date.now() -
          startedAt,
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  }
}
