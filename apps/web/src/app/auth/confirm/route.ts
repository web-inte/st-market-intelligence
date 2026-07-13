import type {
  EmailOtpType,
} from "@supabase/supabase-js";

import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest
) {
  const url = new URL(request.url);

  const tokenHash =
    url.searchParams.get("token_hash");

  const type =
    url.searchParams.get(
      "type"
    ) as EmailOtpType | null;

  const requestedNext =
    url.searchParams.get("next") ||
    "/update-password";

  const next =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/update-password";

  if (tokenHash && type) {
    const supabase =
      await createClient();

    const { error } =
      await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });

    if (!error) {
      return NextResponse.redirect(
        new URL(next, request.url)
      );
    }

    console.error(
      "Recovery verification failed:",
      error.message
    );
  }

  return NextResponse.redirect(
    new URL(
      "/forgot-password?error=invalid_recovery_link",
      request.url
    )
  );
}
