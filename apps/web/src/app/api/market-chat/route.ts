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

const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES = 500;

type ChatProfile = {
  role: string | null;
  full_name: string | null;
};

type ChatMessageRow = {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  is_admin: boolean;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
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

async function getAuthenticatedUser() {
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
            "يجب تسجيل الدخول للدخول إلى غرفة السوق",
        },
        {
          status: 401,
        }
      ),
      user: null,
      profile: null,
    };
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("profiles")
      .select(
        "role,full_name"
      )
      .eq("id", user.id)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    error: null,
    user,
    profile:
      data as ChatProfile | null,
  };
}

function normalizeMessage(
  value: unknown
) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function containsBlockedLink(
  value: string
) {
  const normalized =
    value
      .toLowerCase()
      .replace(/\s+/g, "");

  const blockedPatterns = [
    /https?:\/\//i,
    /www\./i,
    /t\.me\//i,
    /telegram\.me/i,
    /wa\.me\//i,
    /whatsapp\.com/i,
    /discord\.gg/i,
    /discord\.com/i,
    /bit\.ly/i,
    /tinyurl\.com/i,
    /goo\.gl/i,
    /linktr\.ee/i,
    /@[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    /(?:^|[^a-z0-9])(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|me|app|ai|site|online|store|xyz|gg|tv|info|biz)(?:\/|$)/i,
  ];

  return blockedPatterns.some(
    (pattern) =>
      pattern.test(normalized)
  );
}

function visibleMessage(
  row: ChatMessageRow
) {
  if (!row.is_deleted) {
    return row;
  }

  return {
    ...row,
    message:
      "تم حذف هذه الرسالة بواسطة الإدارة.",
    user_name: "إدارة الغرفة",
  };
}

export async function GET() {
  try {
    const authorization =
      await getAuthenticatedUser();

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
          "market_chat_messages"
        )
        .select(
          [
            "id",
            "user_id",
            "user_name",
            "message",
            "is_admin",
            "is_pinned",
            "is_deleted",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .order(
          "is_pinned",
          {
            ascending: false,
          }
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(MAX_MESSAGES);

    if (error) {
      throw error;
    }

    const rows =
      (data || []) as unknown as
        ChatMessageRow[];

    /*
      نعيد ترتيب الرسائل العادية زمنيًا
      حتى تظهر الأقدم في الأعلى والأحدث في الأسفل،
      مع بقاء الرسائل المثبتة في البداية.
    */
    const pinned =
      rows
        .filter(
          (row) =>
            row.is_pinned
        )
        .sort(
          (a, b) =>
            new Date(
              b.created_at
            ).getTime() -
            new Date(
              a.created_at
            ).getTime()
        );

    const regular =
      rows
        .filter(
          (row) =>
            !row.is_pinned
        )
        .sort(
          (a, b) =>
            new Date(
              a.created_at
            ).getTime() -
            new Date(
              b.created_at
            ).getTime()
        );

    return NextResponse.json({
      ok: true,
      isAdmin:
        authorization.profile
          ?.role === "admin",
      currentUserId:
        authorization.user.id,
      messages: [
        ...pinned,
        ...regular,
      ].map(visibleMessage),
    });
  } catch (error) {
    console.error(
      "GET /api/market-chat failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل رسائل غرفة السوق",
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
      await getAuthenticatedUser();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const body =
      await request.json();

    const message =
      normalizeMessage(
        body.message
      );

    if (!message) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "اكتب الرسالة أولًا",
        },
        {
          status: 400,
        }
      );
    }

    if (
      message.length >
      MAX_MESSAGE_LENGTH
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "الرسالة يجب ألا تتجاوز 500 حرف",
        },
        {
          status: 400,
        }
      );
    }

    const isAdmin =
      authorization.profile
        ?.role === "admin";

    if (
      !isAdmin &&
      containsBlockedLink(
        message
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "لا يُسمح بإرسال الروابط أو وسائل التواصل داخل غرفة السوق",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      createAdminClient();

    const now =
      new Date();

    const {
      data: muteData,
      error: muteError,
    } =
      await admin
        .from(
          "market_chat_mutes"
        )
        .select(
          "muted_until,reason"
        )
        .eq(
          "user_id",
          authorization.user.id
        )
        .maybeSingle();

    if (muteError) {
      throw muteError;
    }

    if (muteData) {
      const mutedUntil =
        muteData.muted_until
          ? new Date(
              muteData.muted_until
            )
          : null;

      const muteIsActive =
        !mutedUntil ||
        mutedUntil.getTime() >
          now.getTime();

      if (muteIsActive) {
        return NextResponse.json(
          {
            ok: false,
            error:
              muteData.reason ||
              "تم كتم حسابك من الكتابة في غرفة السوق",
            mutedUntil:
              muteData.muted_until ||
              null,
          },
          {
            status: 403,
          }
        );
      }

      await admin
        .from(
          "market_chat_mutes"
        )
        .delete()
        .eq(
          "user_id",
          authorization.user.id
        );
    }

    const fallbackName =
      authorization.user.email
        ?.split("@")[0]
        ?.trim() ||
      "مستخدم";

    const userName =
      isAdmin
        ? "إدارة ST Market Intelligence"
        : authorization.profile
            ?.full_name?.trim()
            .slice(0, 80) ||
          fallbackName.slice(
            0,
            80
          );

    const {
      data,
      error,
    } =
      await admin
        .from(
          "market_chat_messages"
        )
        .insert({
          user_id:
            authorization.user.id,
          user_name:
            userName,
          message,
          is_admin:
            isAdmin,
          is_pinned:
            false,
          is_deleted:
            false,
        })
        .select(
          [
            "id",
            "user_id",
            "user_name",
            "message",
            "is_admin",
            "is_pinned",
            "is_deleted",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          data as unknown as
            ChatMessageRow,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/market-chat failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر إرسال الرسالة",
      },
      {
        status: 500,
      }
    );
  }
}
