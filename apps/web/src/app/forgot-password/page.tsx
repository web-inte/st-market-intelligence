import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

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
        request.url
      )
    );
  }

  const supabase =
    await createClient();

  const { error } =
    await supabase.auth
      .exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        "/login?error=auth_callback_failed",
        request.url
      )
    );
  }

  const forwardedHost =
    request.headers.get(
      "x-forwarded-host"
    );

  const forwardedProto =
    request.headers.get(
      "x-forwarded-proto"
    ) || "https";

  if (forwardedHost) {
    return NextResponse.redirect(
      `${forwardedProto}://${forwardedHost}${next}`
    );
  }

  return NextResponse.redirect(
    new URL(next, request.url)
  );
}
