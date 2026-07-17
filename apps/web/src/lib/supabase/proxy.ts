import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

const SUBSCRIPTION_BYPASS_ROUTES = [
  "/account",
  "/subscription-required",
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
    (cookie) => {
      target.cookies.set(cookie);
    }
  );

  return target;
}

export async function updateSession(
  request: NextRequest
) {
  let response = NextResponse.next({
    request,
  });

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const pathname =
    request.nextUrl.pathname;

  const isApi =
    pathname.startsWith("/api/");

  // سلة ترسل الطلب من خارج جلسة المستخدم.
  // هذا المسار عام، لكنه محمي بالتوكن داخل route.ts.
  if (pathname === "/api/salla/webhook") {
    return response;
  }

  if (!url || !key) {
    if (isApi) {
      return NextResponse.json(
        {
          error:
            "تعذر التحقق من صلاحية الحساب",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  const supabase =
    createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value }) => {
              request.cookies.set(
                name,
                value
              );
            }
          );

          response = NextResponse.next({
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
    });

  const {
    data,
    error,
  } = await supabase.auth.getClaims();

  const userId =
    data?.claims?.sub
      ? String(data.claims.sub)
      : null;

  if (error || !userId) {
    if (isApi) {
      return copyCookies(
        response,
        NextResponse.json(
          {
            error:
              "يجب تسجيل الدخول لاستخدام هذه الخدمة",
          },
          {
            status: 401,
          }
        )
      );
    }

    const loginUrl =
      new URL("/login", request.url);

    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    );

    return copyCookies(
      response,
      NextResponse.redirect(loginUrl)
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Profile check failed:",
      profileError.message
    );
  }

  if (profile?.role === "admin") {
    return response;
  }

  if (
    matchesRoute(
      pathname,
      SUBSCRIPTION_BYPASS_ROUTES
    )
  ) {
    return response;
  }

  const nowIso =
    new Date().toISOString();

  const {
    data: subscription,
    error: subscriptionError,
  } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("ends_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    console.error(
      "Subscription check failed:",
      subscriptionError.message
    );

    if (isApi) {
      return copyCookies(
        response,
        NextResponse.json(
          {
            error:
              "تعذر التحقق من الاشتراك",
          },
          {
            status: 500,
          }
        )
      );
    }

    return copyCookies(
      response,
      NextResponse.redirect(
        new URL(
          "/subscription-required",
          request.url
        )
      )
    );
  }

  if (!subscription) {
    if (isApi) {
      return copyCookies(
        response,
        NextResponse.json(
          {
            error:
              "انتهت التجربة أو لا يوجد اشتراك فعال",
            code:
              "SUBSCRIPTION_REQUIRED",
          },
          {
            status: 403,
          }
        )
      );
    }

    const subscriptionUrl =
      new URL(
        "/subscription-required",
        request.url
      );

    subscriptionUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    );

    return copyCookies(
      response,
      NextResponse.redirect(
        subscriptionUrl
      )
    );
  }

  return response;
}
