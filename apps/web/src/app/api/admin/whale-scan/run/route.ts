import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  createClient,
} from "@/lib/supabase/server";

export const dynamic =
  "force-dynamic";

export const maxDuration = 60;

async function requireAdmin() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error:
            "يجب تسجيل الدخول",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const admin =
    createAdminClient();

  const {
    data: profile,
    error,
  } =
    await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

  if (
    error ||
    profile?.role !== "admin"
  ) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error:
            "هذه العملية متاحة للأدمن فقط",
        },
        {
          status: 403,
        }
      ),
    };
  }

  return {
    error: null,
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    const authorization =
      await requireAdmin();

    if (authorization.error) {
      return authorization.error;
    }

    const cronSecret =
      process.env
        .WHALE_CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "متغير WHALE_CRON_SECRET غير موجود",
        },
        {
          status: 500,
        }
      );
    }

    const scanUrl =
      new URL(
        "/api/whale-trades/scan?force=1",
        request.url
      );

    const response =
      await fetch(
        scanUrl,
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${cronSecret}`,
          },
          cache: "no-store",
          signal:
            AbortSignal.timeout(
              58_000
            ),
        }
      );

    const text =
      await response.text();

    let body:
      Record<string, unknown>;

    try {
      body =
        JSON.parse(text);
    } catch {
      body = {
        error:
          text ||
          "استجابة غير صالحة من الفحص",
      };
    }

    return NextResponse.json(
      body,
      {
        status:
          response.status,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/admin/whale-scan/run failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تشغيل فحص الحيتان",
      },
      {
        status: 500,
      }
    );
  }
}
