import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActiveSide = "CALL" | "PUT";

type Target = {
  index: number;
  price: number;
};

type SetupRow = {
  id: string;
  symbol: string;
  side: ActiveSide;
  contract_ticker: string;

  entry_price: number | string;
  stop_price: number | string | null;

  gamma_targets: unknown;
  gamma_snapshot: unknown;

  activated_at: string | null;
  first_seen_at: string;

  contract_strike:
    | number
    | string
    | null;

  contract_expiration:
    | string
    | null;

  current_price:
    | number
    | string
    | null;

  best_price:
    | number
    | string
    | null;

  best_price_at:
    | string
    | null;

  current_profit_pct:
    | number
    | string
    | null;

  highest_target_hit:
    | number
    | null;

  contract_status:
    | string
    | null;

  status: string;
};

function numberValue(
  value: unknown,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function round(
  value: number,
  digits = 2
) {
  const factor = 10 ** digits;

  return (
    Math.round(value * factor) /
    factor
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

function normalizeTargets(
  value: unknown
): Target[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const target =
        item &&
        typeof item === "object"
          ? (item as Record<
              string,
              unknown
            >)
          : {};

      return {
        index: numberValue(
          target.index,
          index + 1
        ),
        price: numberValue(
          target.price
        ),
      };
    })
    .filter(
      (target) =>
        target.price > 0
    )
    .sort(
      (first, second) =>
        first.index -
        second.index
    )
    .slice(0, 3);
}

function getSelectedContract(
  value: unknown
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const snapshot =
    value as Record<
      string,
      unknown
    >;

  const contract =
    snapshot.selectedContract;

  if (
    !contract ||
    typeof contract !== "object"
  ) {
    return null;
  }

  return contract as Record<
    string,
    unknown
  >;
}

function calculateHighestTarget(
  side: ActiveSide,
  bestPrice: number,
  targets: Target[],
  storedHighest: number
) {
  const calculatedHighest =
    targets.reduce(
      (highest, target) => {
        const reached =
          side === "CALL"
            ? bestPrice >=
              target.price
            : bestPrice <=
              target.price;

        return reached
          ? Math.max(
              highest,
              target.index
            )
          : highest;
      },
      0
    );

  return Math.max(
    storedHighest,
    calculatedHighest
  );
}

function calculateStatus(
  side: ActiveSide,
  currentPrice: number,
  stopPrice: number | null,
  highestTargetHit: number,
  storedStatus: string
) {
  const normalizedStoredStatus =
    storedStatus.toUpperCase();

  if (
    normalizedStoredStatus ===
      "EXPIRED" ||
    normalizedStoredStatus ===
      "STOPPED"
  ) {
    return normalizedStoredStatus;
  }

  const stopped =
    stopPrice !== null &&
    (
      side === "CALL"
        ? currentPrice <= stopPrice
        : currentPrice >= stopPrice
    );

  if (stopped) {
    return "STOPPED";
  }

  if (highestTargetHit >= 3) {
    return "TARGET_3";
  }

  if (highestTargetHit === 2) {
    return "TARGET_2";
  }

  if (highestTargetHit === 1) {
    return "TARGET_1";
  }

  return "ACTIVE";
}

function statusLabel(
  status: string
) {
  if (status === "TARGET_1") {
    return "تحقق الهدف الأول";
  }

  if (status === "TARGET_2") {
    return "تحقق الهدف الثاني";
  }

  if (status === "TARGET_3") {
    return "تحقق الهدف الثالث";
  }

  if (status === "STOPPED") {
    return "ضرب الوقف";
  }

  if (status === "EXPIRED") {
    return "منتهي";
  }

  return "نشط";
}

function mapTrade(
  row: SetupRow
) {
  const selectedContract =
    getSelectedContract(
      row.gamma_snapshot
    );

  const entryPrice =
    numberValue(
      row.entry_price
    );

  const currentPrice =
    numberValue(
      row.current_price,
      entryPrice
    );

  const bestPrice =
    numberValue(
      row.best_price,
      entryPrice
    );

  const stopPrice =
    row.stop_price === null
      ? null
      : numberValue(
          row.stop_price
        );

  const targets =
    normalizeTargets(
      row.gamma_targets
    );

  const highestTargetHit =
    calculateHighestTarget(
      row.side,
      bestPrice,
      targets,
      numberValue(
        row.highest_target_hit
      )
    );

  const contractStatus =
    calculateStatus(
      row.side,
      currentPrice,
      stopPrice,
      highestTargetHit,
      String(
        row.contract_status ||
          "ACTIVE"
      )
    );

  const rawCurrentMove =
    entryPrice > 0
      ? ((currentPrice -
          entryPrice) /
          entryPrice) *
        100
      : 0;

  const currentProfitPct =
    row.side === "PUT"
      ? -rawCurrentMove
      : rawCurrentMove;

  const rawBestMove =
    entryPrice > 0
      ? ((bestPrice -
          entryPrice) /
          entryPrice) *
        100
      : 0;

  const bestProfitPct =
    row.side === "PUT"
      ? -rawBestMove
      : rawBestMove;

  return {
    id: row.id,

    activatedAt:
      row.activated_at ||
      row.first_seen_at,

    symbol:
      row.symbol,

    side:
      row.side,

    sideLabel:
      row.side === "CALL"
        ? "كول"
        : "بوت",

    contractTicker:
      row.contract_ticker,

    contractStrike:
      numberValue(
        row.contract_strike,
        numberValue(
          selectedContract?.strike
        )
      ),

    contractExpiration:
      row.contract_expiration ||
      String(
        selectedContract
          ?.expiration ||
          ""
      ),

    entryPrice:
      round(entryPrice),

    stopPrice:
      stopPrice === null
        ? null
        : round(stopPrice),

    targets: targets.map(
      (target) => ({
        ...target,
        price: round(
          target.price
        ),
      })
    ),

    currentPrice:
      round(currentPrice),

    bestPrice:
      round(bestPrice),

    bestPriceAt:
      row.best_price_at,

    currentProfitPct:
      round(
        currentProfitPct
      ),

    bestProfitPct:
      round(
        bestProfitPct
      ),

    highestTargetHit,

    contractStatus,

    statusLabel:
      statusLabel(
        contractStatus
      ),
  };
}

export async function GET() {
  try {
    const supabase =
      createAdminClient();

    const {
      data,
      error,
    } = await supabase
      .from(
        "stock_trade_setups"
      )
      .select("*")
      .eq(
        "status",
        "active"
      )
      .order(
        "activated_at",
        {
          ascending: false,
          nullsFirst: false,
        }
      );

    if (error) {
      throw error;
    }

    const trades =
      (
        (data || []) as
          SetupRow[]
      )
        .map(mapTrade)
        .filter(
          (trade) =>
            trade.contractStatus ===
              "ACTIVE" ||
            trade.contractStatus ===
              "TARGET_1" ||
            trade.contractStatus ===
              "TARGET_2"
        );

    return NextResponse.json(
      {
        ok: true,
        updatedAt:
          new Date()
            .toISOString(),
        count:
          trades.length,
        trades,
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
      "Active trades API error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل الصفقات النشطة",
      },
      {
        status: 500,
      }
    );
  }
}