import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

function appUrl(
  request: NextRequest,
  path: string
) {
  const host =
    request.headers.get("x-forwarded-host");

  const protocol =
    request.headers.get("x-forwarded-proto") ||
    "https";

  if (host) {
    return `${protocol}://${host}${path}`;
  }

  return new URL(path, request.url);
}

export async function GET(
  request: NextRequest
) {
  const code =
    request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(
      appUrl(
        request,
        "/forgot-password?error=missing_recovery_code"
      )
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(
      code
    );

  if (error) {
    return NextResponse.redirect(
      appUrl(
        request,
        "/forgot-password?error=recovery_failed"
      )
    );
  }

  return NextResponse.redirect(
    appUrl(request, "/update-password")
  );
}
