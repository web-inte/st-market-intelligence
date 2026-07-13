import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
];

const AUTH_ONLY_ROUTES = [
  "/account",
  "/admin",
  "/api/admin",
];

const PROTECTED_API_ROUTES = [
  "/api/analysis",
  "/api/gamma-liquidity",
  "/api/market-overview",
  "/api/options-analyzer",
  "/api/whale-trades",
];

function matchesRoute(
  pathname: string,
  routes: string[]
) {
  return routes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
}

function copyCookies(
  source: NextResponse,
  target: NextResponse
) {
  source.cookies.getAll().forEach(
    ({ name, value }) => {
      target.cookies.set(name, value);
    }
  );

  return target;
}

function jsonResponse(
  source: NextResponse,
  message: string,
  status: number
) {
  return copyCookies(
    source,
    NextResponse.json(
      {
        error: message,
      },
      {
        status,
      }
    )
  );
}

function redirectResponse(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
  parameters?: Record<string, string>
) {
  const url = request.nextUrl.clone();

  url.pathname = pathname;
  url.search = "";

  Object.entries(parameters || {}).forEach(
    ([key, value]) => {
      url.searchParams.set(key, value);
    }
  );

  return copyCookies(
    source,
    NextResponse.redirect(url)
  );
}

export async function proxy(
  request: NextRequest
) {
  const pathname =
    request.nextUrl.pathname;

  const isPublicRoute =
    matchesRoute(
      pathname,
      PUBLIC_ROUTES
    );

  const isAuthOnlyRoute =
    matchesRoute(
      pathname,
      AUTH_ONLY_ROUTES
    );

  const isProtectedApi =
    matchesRoute(
      pathname,
      PROTECTED_API_ROUTES
    ) &&
    pathname !==
      "/api/whale-trades/scan";

  const isApiRoute =
    pathname.startsWith("/api/");

  // جميع صفحات الموقع الأخرى تتطلب اشتراكًا
  const requiresSubscription =
    isProtectedApi ||
    (
      !isApiRoute &&
      !isPublicRoute &&
      !isAuthOnlyRoute
    );

  let response = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseKey =
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (
      requiresSubscription ||
      isAuthOnlyRoute
    ) {
      return isApiRoute
        ? jsonResponse(
            response,
            "إعدادات تسجيل الدخول غير مكتملة",
            500
          )
        : redirectResponse(
            request,
            response,
            "/login"
          );
    }

    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({
              name,
              value,
            }) => {
              request.cookies.set(
                name,
                value
              );
            }
          );

          response =
            NextResponse.next({
              request,
            });

          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }) => {
              response.cookies.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // المستخدم المسجل لا يحتاج الرجوع لصفحات التسجيل
  if (
    user &&
    (
      pathname === "/login" ||
      pathname === "/register"
    )
  ) {
    return redirectResponse(
      request,
      response,
      "/account"
    );
  }

  if (
    !requiresSubscription &&
    !isAuthOnlyRoute
  ) {
    return response;
  }

  if (!user) {
    if (isApiRoute) {
      return jsonResponse(
        response,
        "يجب تسجيل الدخول أولًا",
        401
      );
    }

    return redirectResponse(
      request,
      response,
      "/login",
      {
        next:
          pathname +
          request.nextUrl.search,
      }
    );
  }

  // الحساب وصفحة المسؤول تحتاج تسجيل الدخول فقط
  if (isAuthOnlyRoute) {
    return response;
  }

  const adminKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  if (!adminKey) {
    return isApiRoute
      ? jsonResponse(
          response,
          "تعذر التحقق من الاشتراك",
          500
        )
      : redirectResponse(
          request,
          response,
          "/account",
          {
            error:
              "subscription_check_failed",
          }
        );
  }

  const admin = createAdminClient(
    supabaseUrl,
    adminKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const now =
    new Date().toISOString();

  const [
    profileResult,
    subscriptionResult,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("role,is_blocked")
      .eq("id", user.id)
      .maybeSingle(),

    admin
      .from("subscriptions")
      .select(
        "id,status,starts_at,ends_at"
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("ends_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    profileResult.error ||
    subscriptionResult.error
  ) {
    return isApiRoute
      ? jsonResponse(
          response,
          "تعذر التحقق من صلاحية الحساب",
          500
        )
      : redirectResponse(
          request,
          response,
          "/account",
          {
            error:
              "access_check_failed",
          }
        );
  }

  const profile =
    profileResult.data;

  const subscription =
    subscriptionResult.data;

  if (profile?.is_blocked) {
    return isApiRoute
      ? jsonResponse(
          response,
          "تم إيقاف هذا الحساب",
          403
        )
      : redirectResponse(
          request,
          response,
          "/account",
          {
            blocked: "1",
          }
        );
  }

  // المسؤول يدخل جميع الخدمات دون اشتراك
  if (profile?.role === "admin") {
    return response;
  }

  if (!subscription) {
    return isApiRoute
      ? jsonResponse(
          response,
          "لا يوجد اشتراك فعال",
          403
        )
      : redirectResponse(
          request,
          response,
          "/account",
          {
            subscription:
              "required",
          }
        );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
