import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  return createClient(
    url,
    secret,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function GET() {
  try {
    const supabase =
      createAdminClient();

    /*
      هذا المسار مخصص للجرس فقط.

      لا يجلب Massive.
      لا يجلب أسعار الأسهم.
      لا يجلب أسعار العقود.
      لا يحسب الأرباح.
      لا يكتب أي تحديث في Supabase.

      نعيد فقط البيانات التي يحتاجها
      جرس التنبيه لاكتشاف الصفقة الجديدة.
    */
    const {
      data,
      error,
    } = await supabase
      .from(
        "stock_trade_setups"
      )
      .select(
        "id,symbol,side,activated_at,status"
      )
      .in(
        "status",
        [
          "active",
          "ACTIVE",
          "stopped",
          "STOPPED",
        ]
      )
      .not(
        "activated_at",
        "is",
        null
      )
      .order(
        "activated_at",
        {
          ascending: false,
        }
      )
      .limit(500);

    if (error) {
      throw error;
    }

    const trades =
      (data || []).map(
        (row) => ({
          id: row.id,
          symbol: row.symbol,
          side: row.side,
          activatedAt:
            row.activated_at,
        })
      );

    return NextResponse.json(
      {
        ok: true,
        trades,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
          Pragma:
            "no-cache",
          Expires:
            "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "Active trade notification lookup failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل تنبيهات الصفقات",
      },
      {
        status: 500,
      }
    );
  }
}
