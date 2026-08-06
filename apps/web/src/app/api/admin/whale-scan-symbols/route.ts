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

function isAllowedRequestOrigin(
  request: Request
) {
  const origin =
    request.headers.get("origin");

  if (!origin) {
    return true;
  }

  let originHost = "";

  try {
    originHost =
      new URL(origin)
        .host
        .trim()
        .toLowerCase();
  } catch {
    return false;
  }

  const possibleHosts = [
    request.headers.get(
      "x-forwarded-host"
    ),
    request.headers.get("host"),
  ]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(",")
        .map((host) =>
          host
            .trim()
            .toLowerCase()
        )
    );

  return possibleHosts.includes(
    originHost
  );
}

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
      user: null,
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
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

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

export async function GET() {
  try {
    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const admin =
      createAdminClient();

    const {
      data,
      error,
    } =
      await admin
        .from(
          "whale_scan_symbols"
        )
        .select(
          "id,symbol,is_active,last_scanned_at,created_at,updated_at"
        )
        .order(
          "symbol",
          {
            ascending: true,
          }
        );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      symbols: data || [],
    });
  } catch (error) {
    console.error(
      "GET /api/admin/whale-scan-symbols failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل قائمة الشركات",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    if (
      !isAllowedRequestOrigin(
        request
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "طلب غير مسموح",
        },
        {
          status: 403,
        }
      );
    }

    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const body =
      await request.json();

    const symbol =
      normalizeSymbol(
        body.symbol
      );

    if (
      !symbol ||
      !/^[A-Z0-9.-]{1,10}$/.test(
        symbol
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "رمز الشركة غير صالح",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      createAdminClient();

    const now =
      new Date()
        .toISOString();

    const {
      data,
      error,
    } =
      await admin
        .from(
          "whale_scan_symbols"
        )
        .upsert(
          {
            symbol,
            is_active: true,
            updated_at: now,
          },
          {
            onConflict:
              "symbol",
          }
        )
        .select(
          "id,symbol,is_active,last_scanned_at,created_at,updated_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        symbol: data,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/admin/whale-scan-symbols failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر إضافة الشركة",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest
) {
  try {
    if (
      !isAllowedRequestOrigin(
        request
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "طلب غير مسموح",
        },
        {
          status: 403,
        }
      );
    }

    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const body =
      await request.json();

    const id =
      String(
        body.id || ""
      ).trim();

    const isActive =
      Boolean(
        body.isActive
      );

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "معرّف الشركة مطلوب",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      createAdminClient();

    const {
      data,
      error,
    } =
      await admin
        .from(
          "whale_scan_symbols"
        )
        .update({
          is_active:
            isActive,
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq("id", id)
        .select(
          "id,symbol,is_active,last_scanned_at,created_at,updated_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      symbol: data,
    });
  } catch (error) {
    console.error(
      "PATCH /api/admin/whale-scan-symbols failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحديث الشركة",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: NextRequest
) {
  try {
    if (
      !isAllowedRequestOrigin(
        request
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "طلب غير مسموح",
        },
        {
          status: 403,
        }
      );
    }

    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const body =
      await request.json();

    const id =
      String(
        body.id || ""
      ).trim();

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "معرّف الشركة مطلوب",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      createAdminClient();

    const {
      error,
    } =
      await admin
        .from(
          "whale_scan_symbols"
        )
        .delete()
        .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
    });
  } catch (error) {
    console.error(
      "DELETE /api/admin/whale-scan-symbols failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر حذف الشركة",
      },
      {
        status: 500,
      }
    );
  }
}
