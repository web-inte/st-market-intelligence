import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    /*
      الإعلان مخصص للمستخدمين المسجلين فقط.
      الزائر غير المسجل يستلم إعلانًا فارغًا.
    */
    if (!user) {
      return NextResponse.json(
        { announcement: null },
        {
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        }
      );
    }

    const { data, error } =
      await supabase
        .from("site_announcements")
        .select(
          "id,title,message,enabled,version,updated_at"
        )
        .eq("enabled", true)
        .neq("message", "")
        .order("updated_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { announcement: null },
        {
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        }
      );
    }

    return NextResponse.json(
      {
        announcement: {
          id: data.id,
          title: data.title,
          message: data.message,
          version: data.version,
          updatedAt: data.updated_at,
        },
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
      "GET /api/announcement failed:",
      error
    );

    return NextResponse.json(
      {
        announcement: null,
        error: "تعذر قراءة الإعلان",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  }
}
