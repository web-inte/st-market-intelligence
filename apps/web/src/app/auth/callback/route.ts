import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest
) {
  const code =
    request.nextUrl.searchParams.get("code");

  const requestedNext =
    request.nextUrl.searchParams.get("next") ||
    "/account";

  const next =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/account";

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/login?error=missing_auth_code",
        "https://st-market.com"
      )
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(
      code
    );

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
        "https://st-market.com"
      )
    );
  }

  return NextResponse.redirect(
    new URL(next, "https://st-market.com")
  );
}