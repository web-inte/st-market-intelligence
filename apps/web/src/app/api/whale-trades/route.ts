export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeLimit(value: string | null) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 200;
  }

  return Math.min(500, Math.max(1, Math.floor(number)));
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return Response.json(
        {
          ok: false,
          error: "متغيرات Supabase غير مكتملة.",
        },
        { status: 500 },
      );
    }

    const requestUrl = new URL(request.url);
    const limit = safeLimit(requestUrl.searchParams.get("limit"));

    const apiUrl = new URL(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/whale_trades`,
    );

    apiUrl.searchParams.set("select", "*");
    apiUrl.searchParams.set("is_active", "eq.true");
    apiUrl.searchParams.set("order", "last_seen_at.desc");
    apiUrl.searchParams.set("limit", String(limit));

    const symbol = requestUrl.searchParams
      .get("symbol")
      ?.trim()
      .toUpperCase();

    if (symbol) {
      apiUrl.searchParams.set("symbol", `eq.${symbol}`);
    }

    const response = await fetch(apiUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const body = await response.text();

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          error: "تعذر تحميل صفقات الحيتان.",
          details: body,
        },
        { status: response.status },
      );
    }

    const trades = JSON.parse(body);

    return Response.json(
      {
        ok: true,
        count: Array.isArray(trades) ? trades.length : 0,
        trades: Array.isArray(trades) ? trades : [],
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "حدث خطأ في API صفقات الحيتان.",
        details:
          error instanceof Error
            ? error.message
            : "خطأ غير معروف",
      },
      { status: 500 },
    );
  }
}
