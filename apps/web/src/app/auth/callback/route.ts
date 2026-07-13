import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  let next = request.nextUrl.searchParams.get("next") || "/account";

  if (!next.startsWith("/")) {
    next = "/account";
  }

  if (code) {
    const supabase = await createClient();
    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(
        new URL(next, request.nextUrl.origin)
      );
    }
  }

  return NextResponse.redirect(
    new URL(
      "/login?error=confirmation_failed",
      request.nextUrl.origin
    )
  );
}
