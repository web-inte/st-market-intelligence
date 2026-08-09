import { createHash } from "node:crypto";

import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

function getClientIp(
  request: NextRequest
) {
  /*
   * Vercel يضيف x-vercel-forwarded-for.
   * نستخدم أول عنوان فقط إذا احتوى الهيدر
   * على أكثر من قيمة.
   */
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
    await createClient();

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
   * بعد نجاح تأكيد البريد وتكوين الجلسة
   * نبدأ التجربة من هنا حتى نستطيع ربطها
   * بعنوان IP الحقيقي للطلب.
   */
  const userId =
    exchangeData.user?.id || "";

  const clientIp =
    getClientIp(request);

  const ipHash =
    hashIp(clientIp);

  if (userId && ipHash) {
    const {
      data: trialStarted,
      error: trialError,
    } = await supabase.rpc(
      "maybe_start_trial_with_ip",
      {
        p_user_id: userId,
        p_ip_hash: ipHash,
      }
    );

    console.log(
      "Trial start result:",
      {
        userId,
        started: trialStarted,
        hasClientIp: Boolean(clientIp),
        ipHashLength: ipHash.length,
      }
    );

    if (trialError) {
      console.error(
        "Trial IP protection error:",
        trialError.message
      );
    }
  } else {
    console.error(
      "Trial IP protection skipped:",
      {
        hasUserId: Boolean(userId),
        hasClientIp: Boolean(clientIp),
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
