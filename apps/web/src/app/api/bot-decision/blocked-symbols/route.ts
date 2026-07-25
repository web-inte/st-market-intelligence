import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const dynamic =
  "force-dynamic";

const OPEN_STATUSES = new Set([
  "WATCHING",
  "ACTIVE",
  "TARGET_1",
  "TARGET_2",
  "TARGET_3",
]);

const CLOSED_CONTRACT_STATUSES =
  new Set([
    "STOPPED",
    "EXPIRED",
    "CLOSED",
    "CANCELLED",
  ]);

function isAuthorized(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    );

  const suppliedSecret =
    authorization?.startsWith(
      "Bearer "
    )
      ? authorization.slice(7)
      : "";

  const expectedSecret =
    process.env
      .DECISION_SCAN_SECRET ||
    process.env.CRON_SECRET;

  return Boolean(
    expectedSecret &&
    suppliedSecret &&
    suppliedSecret ===
      expectedSecret
  );
}

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ||
    process.env
      .SUPABASE_SECRET_KEY;

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

export async function GET(
  request: NextRequest
) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "UNAUTHORIZED",
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      createAdminClient();

    const {
      data,
      error,
    } = await supabase
      .from("stock_trade_setups")
      .select(
        "symbol,status,contract_status"
      )
      .or(
        [
          "status.in.(watching,active,WATCHING,ACTIVE,TARGET_1,TARGET_2,TARGET_3)",
          "contract_status.in.(WATCHING,ACTIVE,TARGET_1,TARGET_2,TARGET_3)",
        ].join(",")
      );

    if (error) {
      throw error;
    }

    const symbols =
      Array.from(
        new Set(
          (data || [])
            .filter((row) => {
              const status =
                String(
                  row.status || ""
                ).toUpperCase();

              const contractStatus =
                String(
                  row.contract_status ||
                  ""
                ).toUpperCase();

              if (
                CLOSED_CONTRACT_STATUSES.has(
                  contractStatus
                )
              ) {
                return false;
              }

              return (
                OPEN_STATUSES.has(
                  status
                ) ||
                OPEN_STATUSES.has(
                  contractStatus
                )
              );
            })
            .map((row) =>
              String(
                row.symbol || ""
              )
                .trim()
                .toUpperCase()
            )
            .filter(Boolean)
        )
      ).sort();

    return NextResponse.json({
      ok: true,
      count: symbols.length,
      symbols,
      generatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Blocked decision symbols error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر جلب الرموز المستبعدة",
      },
      {
        status: 500,
      }
    );
  }
}
