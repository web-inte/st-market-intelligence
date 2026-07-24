import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const dynamic =
  "force-dynamic";

type RoundNumber =
  | "1"
  | "2"
  | "3";

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  return createClient(
    url,
    secret,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

async function requireAdmin(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    );

  const accessToken =
    authorization?.startsWith(
      "Bearer "
    )
      ? authorization.slice(7)
      : "";

  if (!accessToken) {
    return null;
  }

  const supabase =
    createAdminClient();

  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser(
    accessToken
  );

  if (
    userError ||
    !userData.user
  ) {
    return null;
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq(
      "id",
      userData.user.id
    )
    .maybeSingle();

  if (
    profileError ||
    profile?.role !== "admin"
  ) {
    return null;
  }

  return userData.user;
}

export async function POST(
  request: NextRequest
) {
  try {
    const admin =
      await requireAdmin(request);

    if (!admin) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "غير مصرح بتشغيل البحث",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      await request.json();

    const round =
      String(
        body?.round || ""
      ) as RoundNumber;

    if (
      !["1", "2", "3"].includes(
        round
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "رقم الدائرة غير صحيح",
        },
        {
          status: 400,
        }
      );
    }

    const githubToken =
      process.env
        .GITHUB_ACTIONS_TOKEN;

    if (!githubToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "متغير GITHUB_ACTIONS_TOKEN غير موجود في Vercel",
        },
        {
          status: 500,
        }
      );
    }

    const repository =
      process.env
        .GITHUB_ACTIONS_REPOSITORY ||
      "web-inte/st-market-intelligence";

    const response =
      await fetch(
        `https://api.github.com/repos/${repository}/actions/workflows/decision-trade-scan.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Accept:
              "application/vnd.github+json",
            Authorization:
              `Bearer ${githubToken}`,
            "X-GitHub-Api-Version":
              "2022-11-28",
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              round,
            },
          }),
          cache: "no-store",
        }
      );

    if (!response.ok) {
      const githubError =
        await response.text();

      console.error(
        "GitHub workflow dispatch failed:",
        response.status,
        githubError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            `فشل تشغيل البحث: GitHub HTTP ${response.status}`,
        },
        {
          status: 502,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      round,
      message:
        `تم بدء البحث في الدائرة ${round}`,
      triggeredBy:
        admin.email || admin.id,
      triggeredAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Admin decision scanner error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء تشغيل البحث",
      },
      {
        status: 500,
      }
    );
  }
}
