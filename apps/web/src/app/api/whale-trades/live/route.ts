import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecret =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      !supabaseSecret
    ) {
      return NextResponse.json(
        {
          trades: [],
          error:
            "متغيرات Supabase غير مكتملة.",
        },
        {
          status: 500,
        },
      );
    }

    const url =
      `${supabaseUrl.replace(/\/+$/, "")}` +
      `/rest/v1/whale_trade_setups` +
      `?select=*` +
      `&status=in.(PENDING_CONTRACT,ACTIVE,TARGET_1,TARGET_2,TARGET_3,STOPPED,EXPIRED,ERROR)` +
      `&order=created_at.desc` +
      `&limit=200`;

    const response = await fetch(url, {
      headers: {
        apikey: supabaseSecret,
        Authorization:
          `Bearer ${supabaseSecret}`,
      },
      cache: "no-store",
    });

    const responseText =
      await response.text();

    if (!response.ok) {
      throw new Error(
        responseText ||
          "تعذر قراءة فرص الحيتان.",
      );
    }

    const data =
      responseText.trim()
        ? JSON.parse(responseText)
        : [];

    return NextResponse.json({
      trades:
        Array.isArray(data)
          ? data
          : [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        trades: [],
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحميل فرص الحيتان.",
      },
      {
        status: 500,
      },
    );
  }
}
