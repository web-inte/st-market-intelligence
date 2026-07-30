import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isAllowedRequestOrigin(
  request: Request
) {
  const origin =
    request.headers.get("origin");

  /*
    بعض الطلبات الداخلية من Next.js
    لا تحتوي على Origin.
  */
  if (!origin) {
    return true;
  }

  let originHost = "";

  try {
    originHost = new URL(origin)
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
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        {
          error:
            "يجب تسجيل الدخول",
        },
        { status: 401 }
      ),
      user: null,
    };
  }

  const { data: profile } =
    await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json(
        {
          error:
            "ليست لديك صلاحية المسؤول",
        },
        { status: 403 }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

async function getCurrentAnnouncement() {
  const admin =
    createAdminClient();

  const { data, error } =
    await admin
      .from("site_announcements")
      .select(
        "id,title,message,enabled,version,created_at,updated_at"
      )
      .order("id", {
        ascending: true,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

    return NextResponse.json({
      ok: true,
      isAdmin: true,
    });
  } catch (error) {
    console.error(
      "GET /api/admin/active-trades failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر التحقق من صلاحية الأدمن",
      },
      { status: 500 }
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
        { status: 403 }
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

    const tradeId =
      String(
        body.tradeId || ""
      ).trim();

    const stopPrice =
      Number(
        body.stopPrice
      );

    if (!tradeId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "معرّف الصفقة غير موجود",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(
        stopPrice
      ) ||
      stopPrice <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "سعر الوقف غير صالح",
        },
        { status: 400 }
      );
    }

    const admin =
      createAdminClient();

    const {
      data: existingTrade,
      error: existingError,
    } = await admin
      .from(
        "stock_trade_setups"
      )
      .select(
        "id, symbol, stop_price, contract_status, closed_at"
      )
      .eq(
        "id",
        tradeId
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existingTrade) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "الصفقة غير موجودة",
        },
        { status: 404 }
      );
    }

    if (
      existingTrade.closed_at ||
      String(
        existingTrade.contract_status ||
        ""
      ).toUpperCase() ===
        "STOPPED"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "لا يمكن تعديل وقف صفقة متوقفة أو مغلقة",
        },
        { status: 409 }
      );
    }

    const normalizedStopPrice =
      Number(
        stopPrice.toFixed(4)
      );

    const {
      data: updatedTrade,
      error: updateError,
    } = await admin
      .from(
        "stock_trade_setups"
      )
      .update({
        stop_price:
          normalizedStopPrice,
      })
      .eq(
        "id",
        tradeId
      )
      .select(
        "id, symbol, stop_price"
      )
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      ok: true,
      tradeId:
        updatedTrade.id,
      symbol:
        updatedTrade.symbol,
      stopPrice:
        Number(
          updatedTrade.stop_price
        ),
    });
  } catch (error) {
    console.error(
      "PATCH /api/admin/active-trades failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تعديل وقف الصفقة",
      },
      { status: 500 }
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
        { status: 403 }
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

    const tradeId =
      String(
        body.tradeId || ""
      ).trim();

    if (!tradeId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "معرّف الصفقة غير موجود",
        },
        { status: 400 }
      );
    }

    const admin =
      createAdminClient();

    const {
      data: existingTrade,
      error: existingError,
    } = await admin
      .from(
        "stock_trade_setups"
      )
      .select(
        "id, symbol, contract_ticker"
      )
      .eq(
        "id",
        tradeId
      )
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existingTrade) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "الصفقة غير موجودة أو حُذفت مسبقًا",
        },
        { status: 404 }
      );
    }

    const {
      error: deleteError,
    } = await admin
      .from(
        "stock_trade_setups"
      )
      .delete()
      .eq(
        "id",
        tradeId
      );

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      ok: true,
      deletedTradeId:
        tradeId,
    });
  } catch (error) {
    console.error(
      "DELETE /api/admin/active-trades failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر حذف الصفقة",
      },
      { status: 500 }
    );
  }
}
