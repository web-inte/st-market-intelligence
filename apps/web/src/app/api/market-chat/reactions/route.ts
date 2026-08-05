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

const ALLOWED_EMOJIS =
  new Set([
    "👍",
    "❤️",
    "😂",
    "🔥",
  ]);

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

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

function normalizeId(
  value: unknown
) {
  return String(value || "")
    .trim()
    .slice(0, 100);
}

function normalizeEmoji(
  value: unknown
) {
  return String(value || "")
    .trim();
}

function groupReactions(
  rows: ReactionRow[],
  currentUserId: string
) {
  const grouped =
    new Map<
      string,
      Map<
        string,
        {
          count: number;
          reactedByCurrentUser:
            boolean;
        }
      >
    >();

  for (const row of rows) {
    let messageMap =
      grouped.get(
        row.message_id
      );

    if (!messageMap) {
      messageMap =
        new Map();

      grouped.set(
        row.message_id,
        messageMap
      );
    }

    const current =
      messageMap.get(
        row.emoji
      ) || {
        count: 0,
        reactedByCurrentUser:
          false,
      };

    current.count += 1;

    if (
      row.user_id ===
      currentUserId
    ) {
      current.reactedByCurrentUser =
        true;
    }

    messageMap.set(
      row.emoji,
      current
    );
  }

  return Array.from(
    grouped.entries()
  ).reduce<
    Record<
      string,
      Record<
        string,
        {
          count: number;
          reactedByCurrentUser:
            boolean;
        }
      >
    >
  >(
    (
      result,
      [
        messageId,
        messageMap,
      ]
    ) => {
      result[messageId] =
        Object.fromEntries(
          messageMap.entries()
        );

      return result;
    },
    {}
  );
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
      data,
      error,
    } =
      await admin
        .from(
          "market_chat_reactions"
        )
        .select(
          [
            "id",
            "message_id",
            "user_id",
            "emoji",
            "created_at",
          ].join(",")
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

    if (error) {
      throw error;
    }

    const rows =
      (data || []) as unknown as
        ReactionRow[];

    return NextResponse.json({
      ok: true,
      reactions:
        groupReactions(
          rows,
          authorization.user.id
        ),
    });
  } catch (error) {
    console.error(
      "GET /api/market-chat/reactions failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل التفاعلات",
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
      await requireUser();

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

    const emoji =
      normalizeEmoji(
        body.emoji
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

    if (
      !ALLOWED_EMOJIS.has(
        emoji
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "التفاعل غير مدعوم",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      createAdminClient();

    const {
      data: messageData,
      error: messageError,
    } =
      await admin
        .from(
          "market_chat_messages"
        )
        .select(
          "id,is_deleted"
        )
        .eq(
          "id",
          messageId
        )
        .maybeSingle();

    if (messageError) {
      throw messageError;
    }

    if (
      !messageData ||
      messageData.is_deleted
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "الرسالة غير متاحة",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: existing,
      error: existingError,
    } =
      await admin
        .from(
          "market_chat_reactions"
        )
        .select("id")
        .eq(
          "message_id",
          messageId
        )
        .eq(
          "user_id",
          authorization.user.id
        )
        .eq(
          "emoji",
          emoji
        )
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const {
        error: deleteError,
      } =
        await admin
          .from(
            "market_chat_reactions"
          )
          .delete()
          .eq(
            "id",
            existing.id
          );

      if (deleteError) {
        throw deleteError;
      }
    } else {
      const {
        error: insertError,
      } =
        await admin
          .from(
            "market_chat_reactions"
          )
          .insert({
            message_id:
              messageId,
            user_id:
              authorization.user.id,
            emoji,
          });

      if (insertError) {
        throw insertError;
      }
    }

    const {
      data: updatedData,
      error: updatedError,
    } =
      await admin
        .from(
          "market_chat_reactions"
        )
        .select(
          [
            "id",
            "message_id",
            "user_id",
            "emoji",
            "created_at",
          ].join(",")
        )
        .eq(
          "message_id",
          messageId
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

    if (updatedError) {
      throw updatedError;
    }

    const updatedRows =
      (updatedData ||
        []) as unknown as
        ReactionRow[];

    return NextResponse.json({
      ok: true,
      messageId,
      emoji,
      active:
        !existing,
      reactions:
        groupReactions(
          updatedRows,
          authorization.user.id
        )[messageId] || {},
    });
  } catch (error) {
    console.error(
      "POST /api/market-chat/reactions failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحديث التفاعل",
      },
      {
        status: 500,
      }
    );
  }
}
