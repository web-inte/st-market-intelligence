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

const PLUS_ONLY_ROUTES = [
  "/whale-trades",
  "/active-trades",
  "/gamma-liquidity",
  "/api/whale-trades",
  "/api/active-trades",
  "/api/gamma-liquidity",
  "/spx-whales",
  "/api/spx-0dte",
  "/api/spx-active-trade",
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

  /*
   * مسار فحص الحيتان يعمل من Cron أو GitHub Actions
   * باستخدام CRON_SECRET، ولا يحتاج جلسة مستخدم.
   * التحقق النهائي من السر يتم داخل route.ts نفسه.
   */
  if (
    pathname === "/api/whale-trades/scan"
  ) {
    const cronSecret =
      process.env.CRON_SECRET;

    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      cronSecret &&
      authorization ===
        `Bearer ${cronSecret}`
    ) {
      return response;
    }
  }

  if (
    pathname.startsWith("/api/analysis/") ||
    pathname.startsWith("/api/bot-decision/")
  ) {
    const decisionScanSecret =
      process.env.DECISION_SCAN_SECRET;

    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      decisionScanSecret &&
      authorization ===
        `Bearer ${decisionScanSecret}`
    ) {
      return response;
    }
  }

  // صفحات ومسارات عامة لا تتطلب تسجيل دخول أو اشتراكًا فعالًا.
  const PUBLIC_ROUTES = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/update-password",
    "/subscriptions",
    "/auth/callback",
    "/auth/confirm",
    "/auth/recovery",
    "/auth/recovery-callback",
  ];

  if (
    matchesRoute(pathname, PUBLIC_ROUTES) ||
    pathname === "/api/salla/webhook"
  ) {
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
    .select("id,plans(code)")
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

  const rawPlan = (
    subscription as {
      plans?:
        | { code?: string }
        | { code?: string }[]
        | null;
    }
  ).plans;

  const plan = Array.isArray(rawPlan)
    ? rawPlan[0]
    : rawPlan;

  const planCode = String(
    plan?.code || ""
  ).toLowerCase();

  const requiresPlus = matchesRoute(
    pathname,
    PLUS_ONLY_ROUTES
  );

  if (
    requiresPlus &&
    planCode !== "plus"
  ) {
    if (isApi) {
      return copyCookies(
        response,
        NextResponse.json(
          {
            error:
              "هذه الميزة متاحة لمشتركي Plus فقط",
            code: "PLUS_REQUIRED",
          },
          {
            status: 403,
          }
        )
      );
    }

    const upgradeUrl =
      new URL(
        "/subscriptions",
        request.url
      );

    upgradeUrl.searchParams.set(
      "upgrade",
      "plus"
    );

    upgradeUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    );

    return copyCookies(
      response,
      NextResponse.redirect(
        upgradeUrl
      )
    );
  }

  return response;
}
