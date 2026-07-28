import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function createSupabaseClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL!,
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
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
}

export async function GET(
  request: NextRequest
) {
  const response =
    NextResponse.json({
      ok: true,
      favoriteTradeIds: [],
    });

  try {
    const supabase =
      createSupabaseClient(
        request,
        response
      );

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (
      authError ||
      !authData.user
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "يجب تسجيل الدخول لعرض المفضلة",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "active_trade_favorites"
      )
      .select(
        "trade_id, created_at"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        favoriteTradeIds:
          (data || []).map(
            (item) =>
              String(item.trade_id)
          ),
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Active trade favorites GET error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل المفضلة",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  const response =
    NextResponse.json({
      ok: true,
    });

  try {
    const supabase =
      createSupabaseClient(
        request,
        response
      );

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (
      authError ||
      !authData.user
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "يجب تسجيل الدخول لتعديل المفضلة",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as {
        tradeId?: unknown;
        favorite?: unknown;
      };

    const tradeId =
      String(
        body.tradeId || ""
      ).trim();

    const favorite =
      body.favorite === true;

    if (!tradeId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "معرّف الصفقة غير موجود",
        },
        {
          status: 400,
        }
      );
    }

    if (favorite) {
      const {
        error,
      } = await supabase
        .from(
          "active_trade_favorites"
        )
        .upsert(
          {
            user_id:
              authData.user.id,
            trade_id:
              tradeId,
          },
          {
            onConflict:
              "user_id,trade_id",
          }
        );

      if (error) {
        throw error;
      }
    } else {
      const {
        error,
      } = await supabase
        .from(
          "active_trade_favorites"
        )
        .delete()
        .eq(
          "user_id",
          authData.user.id
        )
        .eq(
          "trade_id",
          tradeId
        );

      if (error) {
        throw error;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        tradeId,
        favorite,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Active trade favorites POST error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحديث المفضلة",
      },
      {
        status: 500,
      }
    );
  }
}
