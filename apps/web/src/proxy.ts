import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC_ROUTES = [
  "/auth/recovery-callback",
  "/api/analysis",
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
  "/auth/recovery",
  "/auth/confirm",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
}

export async function proxy(
  request: NextRequest
) {
  // RECOVERY_ROUTE_BYPASS
  // لا تطرد المستخدم من صفحة تغيير كلمة المرور
  if (
    request.nextUrl.pathname === "/update-password" ||
    request.nextUrl.pathname === "/auth/confirm"
  ) {
    return NextResponse.next();
  }


  const pathname =
    request.nextUrl.pathname;

  // لا تمرر صفحات الدخول والاستعادة إلى حماية الاشتراك
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
