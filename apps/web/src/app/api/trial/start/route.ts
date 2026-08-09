import { createHash } from "node:crypto";

import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";

import {
  createClient as createServerClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getClientIp(
  request: NextRequest
) {
  const forwardedFor =
    request.headers.get(
      "x-vercel-forwarded-for"
    ) ||
    request.headers.get(
      "x-forwarded-for"
    ) ||
    request.headers.get(
      "x-real-ip"
    ) ||
    "";

  return (
    forwardedFor
      .split(",")[0]
      ?.trim() || ""
  );
}

function hashIp(ip: string) {
  if (!ip) {
    return "";
  }

  return createHash("sha256")
    .update(
      `st-market-trial-ip:${ip}`,
      "utf8"
    )
    .digest("hex");
}

export async function POST(
  request: NextRequest
) {
  try {
    const serverSupabase =
        await createServerClient();

      const authorization =
        request.headers.get("authorization")?.trim() || "";

      const accessToken =
        authorization
          .toLowerCase()
          .startsWith("bearer ")
          ? authorization.slice(7).trim()
          : "";

      let supabase = serverSupabase;
      let user;

      if (accessToken) {
        const {
          data: { user: tokenUser },
          error: tokenError,
        } =
          await serverSupabase.auth.getUser(
            accessToken
          );

        if (tokenError || !tokenUser) {
          return NextResponse.json(
            {
              error:
                "جلسة المستخدم غير صالحة",
            },
            {
              status: 401,
            }
          );
        }

        const url =
          process.env.NEXT_PUBLIC_SUPABASE_URL;

        const key =
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          return NextResponse.json(
            {
              error:
                "إعدادات Supabase غير مكتملة",
            },
            {
              status: 500,
            }
          );
        }

        supabase =
          createSupabaseClient(
            url,
            key,
            {
              global: {
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                },
              },
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
              },
            }
          );

        user = tokenUser;
      } else {
        const {
          data: { user: cookieUser },
          error: userError,
        } =
          await serverSupabase.auth.getUser();

        if (userError || !cookieUser) {
          return NextResponse.json(
            {
              error:
                "يجب تسجيل الدخول لبدء التجربة",
            },
            {
              status: 401,
            }
          );
        }

        user = cookieUser;
      }

    const clientIp =
      getClientIp(request);

    const ipHash =
      hashIp(clientIp);

    if (!ipHash) {
      return NextResponse.json(
        {
          error:
            "تعذر التحقق من عنوان الشبكة",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "maybe_start_trial_with_ip",
      {
        p_user_id: user.id,
        p_ip_hash: ipHash,
      }
    );

    if (error) {
      console.error(
        "Trial start RPC error:",
        error.message
      );

      return NextResponse.json(
        {
          error:
            "تعذر التحقق من استحقاق التجربة",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      started: Boolean(data),
    });
  } catch (error) {
    console.error(
      "Trial start error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "تعذر بدء التجربة",
      },
      {
        status: 500,
      }
    );
  }
}
