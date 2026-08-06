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

async function requireUser() {
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

  return {
    error: null,
    user,
  };
}

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

  const hosts = [
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

  return hosts.includes(
    originHost
  );
}

async function getLatestMessage() {
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
      .select(
        "id,created_at"
      )
      .eq(
        "is_deleted",
        false
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
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
      await requireUser();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const admin =
      createAdminClient();

    const {
      data: readState,
      error: stateError,
    } =
      await admin
        .from(
          "market_chat_read_state"
        )
        .select(
          "last_seen_message_id"
        )
        .eq(
          "user_id",
          authorization.user.id
        )
        .maybeSingle();

    if (stateError) {
      throw stateError;
    }

    /*
     * أول مرة يستخدم فيها العضو العداد:
     * نعتمد آخر رسالة حالية كبداية حتى لا
     * يظهر له رقم ضخم من الرسائل القديمة.
     */
    if (
      !readState
    ) {
      const latestMessage =
        await getLatestMessage();

      await admin
        .from(
          "market_chat_read_state"
        )
        .upsert(
          {
            user_id:
              authorization.user.id,
            last_seen_message_id:
              latestMessage?.id ||
              null,
            updated_at:
              new Date()
                .toISOString(),
          },
          {
            onConflict:
              "user_id",
          }
        );

      return NextResponse.json({
        ok: true,
        unreadCount: 0,
        latestMessageId:
          latestMessage?.id ||
          null,
      });
    }

    let lastSeenCreatedAt:
      | string
      | null = null;

    if (
      readState.last_seen_message_id
    ) {
      const {
        data: lastSeenMessage,
        error: lastSeenError,
      } =
        await admin
          .from(
            "market_chat_messages"
          )
          .select(
            "created_at"
          )
          .eq(
            "id",
            readState
              .last_seen_message_id
          )
          .maybeSingle();

      if (lastSeenError) {
        throw lastSeenError;
      }

      lastSeenCreatedAt =
        lastSeenMessage?.created_at ||
        null;
    }

    let countQuery =
      admin
        .from(
          "market_chat_messages"
        )
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .eq(
          "is_deleted",
          false
        )
        .neq(
          "user_id",
          authorization.user.id
        );

    if (lastSeenCreatedAt) {
      countQuery =
        countQuery.gt(
          "created_at",
          lastSeenCreatedAt
        );
    }

    const {
      count,
      error: countError,
    } =
      await countQuery;

    if (countError) {
      throw countError;
    }

    const latestMessage =
      await getLatestMessage();

    return NextResponse.json({
      ok: true,
      unreadCount:
        Math.max(
          0,
          count || 0
        ),
      latestMessageId:
        latestMessage?.id ||
        null,
    });
  } catch (error) {
    console.error(
      "GET /api/market-chat/unread failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر حساب الرسائل الجديدة",
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
      await requireUser();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const latestMessage =
      await getLatestMessage();

    const admin =
      createAdminClient();

    const {
      error,
    } =
      await admin
        .from(
          "market_chat_read_state"
        )
        .upsert(
          {
            user_id:
              authorization.user.id,
            last_seen_message_id:
              latestMessage?.id ||
              null,
            updated_at:
              new Date()
                .toISOString(),
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
      unreadCount: 0,
      lastSeenMessageId:
        latestMessage?.id ||
        null,
    });
  } catch (error) {
    console.error(
      "PATCH /api/market-chat/unread failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحديث حالة قراءة الرسائل",
      },
      {
        status: 500,
      }
    );
  }
}
