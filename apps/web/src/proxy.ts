import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  updateSession,
} from "@/lib/supabase/proxy";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/auth/callback",
  "/auth/recovery",
  "/auth/confirm",
];

function isPublicRoute(
  pathname: string
) {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(
        `${route}/`
      )
  );
}

export async function proxy(
  request: NextRequest
) {
  const pathname =
    request.nextUrl.pathname;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};