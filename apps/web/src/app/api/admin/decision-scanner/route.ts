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
  | "3"
  | "4";

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

    const action =
      String(
        body?.action || "start"
      );

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

    if (action === "stop") {
      const runsResponse =
        await fetch(
          `https://api.github.com/repos/${repository}/actions/workflows/decision-trade-scan.yml/runs?event=workflow_dispatch&per_page=20`,
          {
            headers: {
              Accept:
                "application/vnd.github+json",
              Authorization:
                `Bearer ${githubToken}`,
              "X-GitHub-Api-Version":
                "2022-11-28",
            },
            cache: "no-store",
          }
        );

      if (!runsResponse.ok) {
        const githubError =
          await runsResponse.text();

        console.error(
          "GitHub workflow runs lookup failed:",
          runsResponse.status,
          githubError
        );

        return NextResponse.json(
          {
            ok: false,
            error:
              `تعذر البحث عن التشغيل الجاري: GitHub HTTP ${runsResponse.status}`,
          },
          {
            status: 502,
          }
        );
      }

      const runsPayload =
        await runsResponse.json() as {
          workflow_runs?: Array<{
            id: number;
            status: string;
            created_at?: string;
          }>;
        };

      const activeRun =
        (
          runsPayload.workflow_runs ||
          []
        )
          .filter((run) =>
            [
              "queued",
              "in_progress",
              "pending",
              "waiting",
              "requested",
            ].includes(
              String(
                run.status || ""
              )
            )
          )
          .sort((a, b) =>
            String(
              b.created_at || ""
            ).localeCompare(
              String(
                a.created_at || ""
              )
            )
          )[0];

      if (!activeRun) {
        return NextResponse.json({
          ok: true,
          stopped: false,
          message:
            "لا يوجد بحث جارٍ لإيقافه",
        });
      }

      const cancelResponse =
        await fetch(
          `https://api.github.com/repos/${repository}/actions/runs/${activeRun.id}/cancel`,
          {
            method: "POST",
            headers: {
              Accept:
                "application/vnd.github+json",
              Authorization:
                `Bearer ${githubToken}`,
              "X-GitHub-Api-Version":
                "2022-11-28",
            },
            cache: "no-store",
          }
        );

      if (!cancelResponse.ok) {
        const githubError =
          await cancelResponse.text();

        console.error(
          "GitHub workflow cancellation failed:",
          cancelResponse.status,
          githubError
        );

        return NextResponse.json(
          {
            ok: false,
            error:
              `فشل إيقاف البحث: GitHub HTTP ${cancelResponse.status}`,
          },
          {
            status: 502,
          }
        );
      }

      return NextResponse.json({
        ok: true,
        stopped: true,
        message:
          "تم إرسال أمر إيقاف البحث",
        stoppedBy:
          admin.email || admin.id,
        stoppedAt:
          new Date().toISOString(),
      });
    }

    if (action !== "start") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "إجراء البحث غير صحيح",
        },
        {
          status: 400,
        }
      );
    }

    const round =
      String(
        body?.round || ""
      ) as RoundNumber;

    if (
      !["1", "2", "3", "4"].includes(
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
            `فشل تشغيل البحث: GitHub HTTP ${response.status} — ${githubError}`,
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
