import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

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

  if (!url || !key) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error:
            "تعذر التحقق من تسجيل الدخول",
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
    data?.claims?.sub;

  if (error || !userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error:
            "يجب تسجيل الدخول لاستخدام هذه الخدمة",
        },
        {
          status: 401,
        }
      );
    }

    const loginUrl =
      new URL("/login", request.url);

    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    );

    return NextResponse.redirect(
      loginUrl
    );
  }

  return response;
}