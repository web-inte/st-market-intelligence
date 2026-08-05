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

  const {
    data: profile,
  } =
    await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

  if (
    profile?.role !== "admin"
  ) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error:
            "ليست لديك صلاحية المسؤول",
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

function normalizeId(
  value: unknown
) {
  return String(value || "")
    .trim()
    .slice(0, 100);
}

function normalizeAction(
  value: unknown
) {
  return String(value || "")
    .trim()
    .toUpperCase();
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

    const action =
      normalizeAction(
        body.action
      );

    const admin =
      createAdminClient();

    if (
      action === "PIN" ||
      action === "UNPIN"
    ) {
      const messageId =
        normalizeId(
          body.messageId
        );

      if (!messageId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "معرّف الرسالة مطلوب",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data,
        error,
      } =
        await admin
          .from(
            "market_chat_messages"
          )
          .update({
            is_pinned:
              action === "PIN",
          })
          .eq(
            "id",
            messageId
          )
          .select(
            "id,is_pinned"
          )
          .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        message: data,
      });
    }

    if (
      action === "MUTE" ||
      action === "UNMUTE"
    ) {
      const userId =
        normalizeId(
          body.userId
        );

      if (!userId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "معرّف المستخدم مطلوب",
          },
          {
            status: 400,
          }
        );
      }

      if (
        action === "UNMUTE"
      ) {
        const {
          error,
        } =
          await admin
            .from(
              "market_chat_mutes"
            )
            .delete()
            .eq(
              "user_id",
              userId
            );

        if (error) {
          throw error;
        }

        return NextResponse.json({
          ok: true,
          userId,
          muted: false,
        });
      }

      const durationMinutes =
        Number.parseInt(
          String(
            body.durationMinutes ||
              "0"
          ),
          10
        );

      const reason =
        String(
          body.reason ||
            "تم كتم الحساب من الكتابة في غرفة السوق"
        )
          .trim()
          .slice(0, 500);

      const mutedUntil =
        Number.isFinite(
          durationMinutes
        ) &&
        durationMinutes > 0
          ? new Date(
              Date.now() +
                durationMinutes *
                  60_000
            ).toISOString()
          : null;

      const {
        error,
      } =
        await admin
          .from(
            "market_chat_mutes"
          )
          .upsert(
            {
              user_id:
                userId,
              muted_by:
                authorization.user.id,
              reason,
              muted_until:
                mutedUntil,
            },
            {
              onConflict:
                "user_id",
            }
          );

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        userId,
        muted: true,
        mutedUntil,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "الإجراء غير مدعوم",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "PATCH /api/admin/market-chat failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تنفيذ الإجراء",
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

    const messageId =
      normalizeId(
        body.messageId
      );

    if (!messageId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "معرّف الرسالة مطلوب",
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
          "market_chat_messages"
        )
        .update({
          is_deleted:
            true,
          is_pinned:
            false,
          message:
            "تم حذف هذه الرسالة بواسطة الإدارة.",
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          messageId
        )
        .select(
          "id,is_deleted,is_pinned,updated_at"
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      message: data,
    });
  } catch (error) {
    console.error(
      "DELETE /api/admin/market-chat failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر حذف الرسالة",
      },
      {
        status: 500,
      }
    );
  }
}
