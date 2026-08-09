import { createHash } from "node:crypto";

import {
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";

import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient as createServerClient,
} from "@/lib/supabase/server";

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

export async function GET(
  request: NextRequest
) {
  const code =
    request.nextUrl.searchParams.get(
      "code"
    );

  const requestedNext =
    request.nextUrl.searchParams.get(
      "next"
    ) || "/account";

  const next =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/account";

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/login?error=missing_auth_code",
        "https://www.st-market.com"
      )
    );
  }

  const supabase =
    await createServerClient();

  const {
    data: exchangeData,
    error,
  } =
    await supabase.auth
      .exchangeCodeForSession(code);

  if (error) {
    console.error(
      "Auth callback error:",
      error.message
    );

    return NextResponse.redirect(
      new URL(
        `/login?error=auth_callback_failed&message=${encodeURIComponent(
          error.message
        )}`,
        "https://www.st-market.com"
      )
    );
  }

  /*
   * بعد تأكيد البريد وتكوين الجلسة،
   * نستخدم access_token نفسه لتشغيل RPC.
   *
   * بهذا تكون auth.uid() داخل PostgreSQL
   * هي هوية المستخدم المؤكد بشكل صريح،
   * ولا نعتمد على توقيت تحديث الكوكي.
   */
  const userId =
    exchangeData.user?.id || "";

  const accessToken =
    exchangeData.session?.access_token ||
    "";

  const clientIp =
    getClientIp(request);

  const ipHash =
    hashIp(clientIp);

  if (
    userId &&
    accessToken &&
    ipHash
  ) {
    const url =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const key =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && key) {
      const authenticatedSupabase =
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

      const {
        data: trialStarted,
        error: trialError,
      } =
        await authenticatedSupabase.rpc(
          "maybe_start_trial_with_ip",
          {
            p_user_id: userId,
            p_ip_hash: ipHash,
          }
        );

      if (trialError) {
        console.error(
          "Trial start after email confirmation failed:",
          trialError.message
        );
      } else {
        console.log(
          "Trial start after email confirmation:",
          {
            userId,
            started:
              Boolean(trialStarted),
          }
        );
      }
    } else {
      console.error(
        "Trial start skipped: Supabase environment variables missing"
      );
    }
  } else {
    console.error(
      "Trial start after confirmation skipped:",
      {
        hasUserId:
          Boolean(userId),
        hasAccessToken:
          Boolean(accessToken),
        hasClientIp:
          Boolean(clientIp),
      }
    );
  }

  return NextResponse.redirect(
    new URL(
      next,
      "https://www.st-market.com"
    )
  );
}
