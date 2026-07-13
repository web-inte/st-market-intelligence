export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MarketPhase =
  | "REGULAR"
  | "PRE_MARKET"
  | "AFTER_HOURS"
  | "CLOSED";

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function GET() {
  try {
    const apiKey = process.env.MASSIVE_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          ok: false,
          error: "MASSIVE_API_KEY غير موجود.",
        },
        { status: 500 },
      );
    }

    const response = await fetch(
      "https://api.massive.com/v1/marketstatus/now",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          ok: false,
          error: "تعذر تحميل حالة السوق من Massive.",
          details:
            data?.error ||
            data?.message ||
            `HTTP ${response.status}`,
        },
        { status: response.status },
      );
    }

    const market = normalize(data?.market);
    const nyse = normalize(data?.exchanges?.nyse);
    const nasdaq = normalize(data?.exchanges?.nasdaq);

    const isRegularOpen =
      market === "open" ||
      nyse === "open" ||
      nasdaq === "open";

    const isPreMarket =
      Boolean(data?.earlyHours) &&
      !isRegularOpen;

    const isAfterHours =
      Boolean(data?.afterHours) &&
      !isRegularOpen;

    let phase: MarketPhase = "CLOSED";
    let label = "السوق مغلق";
    let note = "بيانات الأوبشن من آخر جلسة مكتملة";

    if (isRegularOpen) {
      phase = "REGULAR";
      label = "السوق الأمريكي مفتوح";
      note = "بيانات الأوبشن من الجلسة الحالية";
    } else if (isPreMarket) {
      phase = "PRE_MARKET";
      label = "ما قبل السوق";
      note = "بيانات الأوبشن من آخر جلسة مكتملة";
    } else if (isAfterHours) {
      phase = "AFTER_HOURS";
      label = "ما بعد السوق";
      note = "انتهت جلسة الأوبشن — البيانات من الجلسة المكتملة";
    }

    return Response.json(
      {
        ok: true,
        isOpen: isRegularOpen,
        phase,
        label,
        note,
        earlyHours: Boolean(data?.earlyHours),
        afterHours: Boolean(data?.afterHours),
        exchanges: data?.exchanges ?? null,
        serverTime: data?.serverTime ?? null,
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
        error: "حدث خطأ أثناء تحديد حالة السوق.",
        details:
          error instanceof Error
            ? error.message
            : "خطأ غير معروف",
      },
      { status: 500 },
    );
  }
}
