import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

const APP_URL = "https://st-market.com";

export async function GET(
  request: NextRequest
) {
  const tokenHash =
    request.nextUrl.searchParams.get(
      "token_hash"
    );

  if (!tokenHash) {
    return NextResponse.redirect(
      new URL(
        "/forgot-password?error=missing_recovery_token",
        APP_URL
      )
    );
  }

  const supabase =
    await createClient();

  const { error } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

  if (error) {
    console.error(
      "Recovery verification error:",
      error.message
    );

    return NextResponse.redirect(
      new URL(
        `/forgot-password?error=recovery_failed&message=${encodeURIComponent(
          error.message
        )}`,
        APP_URL
      )
    );
  }

  return NextResponse.redirect(
    new URL(
      "/update-password",
      APP_URL
    )
  );
}
