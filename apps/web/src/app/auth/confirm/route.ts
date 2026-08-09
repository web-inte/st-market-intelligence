import { createHash } from "node:crypto";

import type {
  EmailOtpType,
} from "@supabase/supabase-js";

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
  const url =
    new URL(request.url);

  const tokenHash =
    url.searchParams.get(
      "token_hash"
    );

  const type =
    url.searchParams.get(
      "type"
    ) as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      new URL(
        "/login?error=invalid_confirmation_link",
        request.url
      )
    );
  }

  const supabase =
    await createServerClient();

  const {
    data,
    error,
  } =
    await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

  if (error) {
    console.error(
      "Email verification failed:",
      error.message
    );

    return NextResponse.redirect(
      new URL(
        "/login?error=invalid_confirmation_link",
        request.url
      )
    );
  }

  /*
   * استعادة كلمة المرور لا تبدأ تجربة.
   */
  if (type === "recovery") {
    return NextResponse.redirect(
      new URL(
        "/update-password",
        request.url
      )
    );
  }

  const userId =
    data.user?.id || "";

  const accessToken =
    data.session?.access_token || "";

  const clientIp =
    getClientIp(request);

  const ipHash =
    hashIp(clientIp);

  if (
    userId &&
    accessToken &&
    ipHash
  ) {
    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      supabaseUrl &&
      supabaseKey
    ) {
      const authenticatedSupabase =
        createSupabaseClient(
          supabaseUrl,
          supabaseKey,
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
      "/account",
      request.url
    )
  );
}
