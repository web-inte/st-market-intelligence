import { createHash } from "node:crypto";

import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getClientIp(
  request: NextRequest
) {
  const forwardedFor =
    request.headers.get(
      "x-vercel-forwarded-for"
    ) ||
    request.headers.get(
      "x-forwarded-for"
    ) ||
    request.headers.get(
      "x-real-ip"
    ) ||
    "";

  return (
    forwardedFor
      .split(",")[0]
      ?.trim() || ""
  );
}

function hashIp(ip: string) {
  if (!ip) {
    return "";
  }

  return createHash("sha256")
    .update(
      `st-market-trial-ip:${ip}`,
      "utf8"
    )
    .digest("hex");
}

export async function POST(
  request: NextRequest
) {
  try {
    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "يجب تسجيل الدخول لبدء التجربة",
        },
        {
          status: 401,
        }
      );
    }

    const clientIp =
      getClientIp(request);

    const ipHash =
      hashIp(clientIp);

    if (!ipHash) {
      return NextResponse.json(
        {
          error:
            "تعذر التحقق من عنوان الشبكة",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "maybe_start_trial_with_ip",
      {
        p_user_id: user.id,
        p_ip_hash: ipHash,
      }
    );

    if (error) {
      console.error(
        "Trial start RPC error:",
        error.message
      );

      return NextResponse.json(
        {
          error:
            "تعذر التحقق من استحقاق التجربة",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      started: Boolean(data),
    });
  } catch (error) {
    console.error(
      "Trial start error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "تعذر بدء التجربة",
      },
      {
        status: 500,
      }
    );
  }
}
