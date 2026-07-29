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

    if (authorization.error) {
      return authorization.error;
    }

    const announcement =
      await getCurrentAnnouncement();

    return NextResponse.json({
      announcement,
    });
  } catch (error) {
    console.error(
      "GET /api/admin/announcement failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "تعذر قراءة إعدادات الإعلان",
      },
      { status: 500 }
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

    const title = String(
      body.title || ""
    ).trim();

    const message = String(
      body.message || ""
    ).trim();

    if (!message) {
      return NextResponse.json(
        {
          error:
            "اكتب نص الإعلان أولًا",
        },
        { status: 400 }
      );
    }

    if (title.length > 120) {
      return NextResponse.json(
        {
          error:
            "عنوان الإعلان طويل جدًا",
        },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        {
          error:
            "نص الإعلان يجب ألا يتجاوز 2000 حرف",
        },
        { status: 400 }
      );
    }

    const admin =
      createAdminClient();

    const current =
      await getCurrentAnnouncement();

    let savedAnnouncement;

    if (current) {
      const { data, error } =
        await admin
          .from(
            "site_announcements"
          )
          .update({
            title,
            message,
            enabled: true,
            version:
              Number(
                current.version ||
                  0
              ) + 1,
            updated_at:
              new Date().toISOString(),
            created_by:
              authorization.user.id,
          })
          .eq("id", current.id)
          .select(
            "id,title,message,enabled,version,updated_at"
          )
          .single();

      if (error) {
        throw error;
      }

      savedAnnouncement = data;
    } else {
      const { data, error } =
        await admin
          .from(
            "site_announcements"
          )
          .insert({
            title,
            message,
            enabled: true,
            version: 1,
            created_by:
              authorization.user.id,
          })
          .select(
            "id,title,message,enabled,version,updated_at"
          )
          .single();

      if (error) {
        throw error;
      }

      savedAnnouncement = data;
    }

    return NextResponse.json({
      ok: true,
      announcement:
        savedAnnouncement,
    });
  } catch (error) {
    console.error(
      "POST /api/admin/announcement failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "تعذر نشر الإعلان",
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
          error:
            "طلب غير مسموح",
        },
        { status: 403 }
      );
    }

    const authorization =
      await requireAdmin();

    if (authorization.error) {
      return authorization.error;
    }

    const current =
      await getCurrentAnnouncement();

    if (!current) {
      return NextResponse.json({
        ok: true,
        announcement: null,
      });
    }

    const admin =
      createAdminClient();

    const { data, error } =
      await admin
        .from("site_announcements")
        .update({
          enabled: false,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", current.id)
        .select(
          "id,title,message,enabled,version,updated_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      announcement: data,
    });
  } catch (error) {
    console.error(
      "DELETE /api/admin/announcement failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "تعذر إيقاف الإعلان",
      },
      { status: 500 }
    );
  }
}
