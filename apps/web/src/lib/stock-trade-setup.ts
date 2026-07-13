import { createClient } from "@supabase/supabase-js";

export type SetupSide = "CALL" | "PUT";

export type GammaTarget = {
  index: number;
  price: number;
  movePct: number;
  probability: number;
  strength: number;
  level: string;
  source: "GAMMA";
};

export type StockTradeSetup = {
  id: string;
  symbol: string;
  side: SetupSide;
  contractTicker: string;
  entryPrice: number;
  entryScore: number;
  stopPrice: number | null;
  targets: GammaTarget[];
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isNew: boolean;
};

type GammaRow = {
  strike: number;
  strength: number;
  callGex: number;
  putGex: number;
  callOi: number;
  putOi: number;
  totalAbsGex: number;
  level: string;
};

type SetupRow = {
  id: string;
  symbol: string;
  side: SetupSide;
  contract_ticker: string;
  entry_price: number | string;
  entry_score: number | null;
  stop_price: number | string | null;
  gamma_targets: unknown;
  first_seen_at: string;
  last_seen_at: string;
  expires_at: string;
};

function numberValue(value: unknown, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue
    : fallback;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeGammaRow(
  value: unknown
): GammaRow | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const row = value as Record<string, unknown>;

  const hasGammaData =
    "totalAbsGex" in row ||
    "callGex" in row ||
    "putGex" in row ||
    "strength" in row ||
    "level" in row;

  if (!hasGammaData) {
    return null;
  }

  const strike = numberValue(row.strike);

  if (strike <= 0) {
    return null;
  }

  return {
    strike,
    strength: clamp(
      numberValue(row.strength),
      0,
      100
    ),
    callGex: numberValue(row.callGex),
    putGex: numberValue(row.putGex),
    callOi: numberValue(row.callOi),
    putOi: numberValue(row.putOi),
    totalAbsGex: Math.abs(
      numberValue(row.totalAbsGex)
    ),
    level: String(row.level || "NORMAL"),
  };
}

function findGammaRows(
  value: unknown,
  depth = 0
): GammaRow[] {
  if (depth > 8 || value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map(normalizeGammaRow)
      .filter(
        (row): row is GammaRow =>
          row !== null
      );

    if (normalized.length > 0) {
      return normalized;
    }

    for (const item of value) {
      const nested = findGammaRows(
        item,
        depth + 1
      );

      if (nested.length > 0) {
        return nested;
      }
    }

    return [];
  }

  if (typeof value === "object") {
    const record =
      value as Record<string, unknown>;

    if (Array.isArray(record.strikeRows)) {
      const rows = findGammaRows(
        record.strikeRows,
        depth + 1
      );

      if (rows.length > 0) {
        return rows;
      }
    }

    for (const nestedValue of Object.values(
      record
    )) {
      const nested = findGammaRows(
        nestedValue,
        depth + 1
      );

      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function directionalForce(
  row: GammaRow,
  side: SetupSide
) {
  if (side === "CALL") {
    return Math.max(
      Math.abs(row.callGex),
      row.callOi,
      row.totalAbsGex
    );
  }

  return Math.max(
    Math.abs(row.putGex),
    row.putOi,
    row.totalAbsGex
  );
}

function selectGammaTargets(
  rows: GammaRow[],
  side: SetupSide,
  entryPrice: number,
  score: number
): GammaTarget[] {
  const directionalRows = rows
    .filter((row) => {
      const isCorrectDirection =
        side === "CALL"
          ? row.strike > entryPrice
          : row.strike < entryPrice;

      const distancePct =
        Math.abs(
          (row.strike - entryPrice) /
            entryPrice
        ) * 100;

      return (
        isCorrectDirection &&
        distancePct >= 0.15 &&
        distancePct <= 4 &&
        directionalForce(row, side) > 0
      );
    })
    .map((row) => ({
      row,
      distancePct:
        Math.abs(
          (row.strike - entryPrice) /
            entryPrice
        ) * 100,
    }));

  const strongRows = directionalRows.filter(
    ({ row }) =>
      row.strength >= 30 ||
      row.level !== "NORMAL"
  );

  const selectedPool =
    strongRows.length > 0
      ? strongRows
      : directionalRows.filter(
          ({ row }) => row.strength >= 15
        );

  return selectedPool
    .sort((left, right) => {
      const distanceDifference =
        left.distancePct -
        right.distancePct;

      if (
        Math.abs(distanceDifference) > 0.05
      ) {
        return distanceDifference;
      }

      return (
        right.row.strength -
        left.row.strength
      );
    })
    .filter(
      (item, index, allItems) =>
        allItems.findIndex(
          (other) =>
            other.row.strike ===
            item.row.strike
        ) === index
    )
    .slice(0, 3)
    .map(({ row, distancePct }, index) => ({
      index: index + 1,
      price: round(row.strike, 2),
      movePct: round(distancePct, 2),
      probability: clamp(
        Math.round(
          score * 0.72 +
            row.strength * 0.28 -
            distancePct * 3
        ),
        10,
        95
      ),
      strength: Math.round(row.strength),
      level: row.level,
      source: "GAMMA" as const,
    }));
}

function selectGammaStop(
  rows: GammaRow[],
  side: SetupSide,
  entryPrice: number
) {
  const candidates = rows
    .filter((row) => {
      const isOppositeLevel =
        side === "CALL"
          ? row.strike < entryPrice
          : row.strike > entryPrice;

      const distancePct =
        Math.abs(
          (row.strike - entryPrice) /
            entryPrice
        ) * 100;

      const oppositeForce =
        side === "CALL"
          ? Math.max(
              Math.abs(row.putGex),
              row.putOi
            )
          : Math.max(
              Math.abs(row.callGex),
              row.callOi
            );

      return (
        isOppositeLevel &&
        distancePct >= 0.15 &&
        distancePct <= 4 &&
        oppositeForce > 0 &&
        (
          row.strength >= 20 ||
          row.level !== "NORMAL"
        )
      );
    })
    .map((row) => ({
      row,
      distancePct:
        Math.abs(
          (row.strike - entryPrice) /
            entryPrice
        ) * 100,
    }))
    .sort((left, right) => {
      const distanceDifference =
        left.distancePct -
        right.distancePct;

      if (
        Math.abs(distanceDifference) > 0.05
      ) {
        return distanceDifference;
      }

      return (
        right.row.strength -
        left.row.strength
      );
    });

  const wall = candidates[0]?.row;

  if (!wall) {
    return null;
  }

  return side === "CALL"
    ? round(wall.strike * 0.9985, 2)
    : round(wall.strike * 1.0015, 2);
}

function normalizeStoredTargets(
  value: unknown
): GammaTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item) =>
        item &&
        typeof item === "object"
    )
    .map((item, index) => {
      const target =
        item as Record<string, unknown>;

      return {
        index:
          numberValue(
            target.index,
            index + 1
          ),
        price: numberValue(target.price),
        movePct: numberValue(
          target.movePct
        ),
        probability: numberValue(
          target.probability
        ),
        strength: numberValue(
          target.strength
        ),
        level: String(
          target.level || "NORMAL"
        ),
        source: "GAMMA" as const,
      };
    })
    .filter((target) => target.price > 0);
}

function mapSetup(
  row: SetupRow,
  isNew: boolean
): StockTradeSetup {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    contractTicker:
      row.contract_ticker,
    entryPrice: numberValue(
      row.entry_price
    ),
    entryScore: numberValue(
      row.entry_score
    ),
    stopPrice:
      row.stop_price == null
        ? null
        : numberValue(row.stop_price),
    targets: normalizeStoredTargets(
      row.gamma_targets
    ),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    isNew,
  };
}

export async function getOrCreateStockTradeSetup(input: {
  symbol: string;
  side: SetupSide;
  contractTicker: string;
  entryPrice: number;
  score: number;
  baseUrl: string;
}): Promise<StockTradeSetup> {
  const symbol = input.symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.-]/g, "");

  const contractTicker =
    input.contractTicker.trim();

  const entryPrice = numberValue(
    input.entryPrice
  );

  const score = clamp(
    Math.round(numberValue(input.score)),
    0,
    100
  );

  if (
    !symbol ||
    !contractTicker ||
    entryPrice <= 0
  ) {
    throw new Error(
      "بيانات إنشاء فرصة السهم غير مكتملة"
    );
  }

  const supabase = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  await supabase
    .from("stock_trade_setups")
    .update({
      status: "expired",
      invalidated_at: nowIso,
      invalidation_reason:
        "انتهت مدة الفرصة",
    })
    .eq("symbol", symbol)
    .eq("status", "active")
    .lte("expires_at", nowIso);

  const { data: existingSetup } =
    await supabase
      .from("stock_trade_setups")
      .select("*")
      .eq("symbol", symbol)
      .eq("side", input.side)
      .eq(
        "contract_ticker",
        contractTicker
      )
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(1)
      .maybeSingle();

  if (existingSetup) {
    await supabase
      .from("stock_trade_setups")
      .update({
        last_seen_at: nowIso,
      })
      .eq("id", existingSetup.id);

    return mapSetup(
      {
        ...existingSetup,
        last_seen_at: nowIso,
      } as SetupRow,
      false
    );
  }

  const { data: activeSetups } =
    await supabase
      .from("stock_trade_setups")
      .select(
        "id,side,contract_ticker"
      )
      .eq("symbol", symbol)
      .eq("status", "active");

  const invalidSetupIds = (
    activeSetups || []
  )
    .filter(
      (setup) =>
        setup.side !== input.side ||
        setup.contract_ticker !==
          contractTicker
    )
    .map((setup) => setup.id);

  if (invalidSetupIds.length > 0) {
    await supabase
      .from("stock_trade_setups")
      .update({
        status: "invalidated",
        invalidated_at: nowIso,
        invalidation_reason:
          "تغير اتجاه الفرصة أو العقد",
      })
      .in("id", invalidSetupIds);
  }

  const gammaResponse = await fetch(
    `${input.baseUrl.replace(
      /\/+$/,
      ""
    )}/api/gamma-liquidity/${encodeURIComponent(
      symbol
    )}`,
    {
      cache: "no-store",
    }
  );

  if (!gammaResponse.ok) {
    throw new Error(
      "تعذر جلب مستويات القاما"
    );
  }

  const gammaData: unknown =
    await gammaResponse.json();

  const gammaRows =
    findGammaRows(gammaData);

  if (gammaRows.length === 0) {
    throw new Error(
      "لا توجد مستويات قاما كافية لبناء الخطة"
    );
  }

  const targets = selectGammaTargets(
    gammaRows,
    input.side,
    entryPrice,
    score
  );

  const stopPrice = selectGammaStop(
    gammaRows,
    input.side,
    entryPrice
  );

  const expiresAt = new Date(
    now.getTime() + 3 * 60 * 60 * 1000
  ).toISOString();

  const { data: insertedSetup, error } =
    await supabase
      .from("stock_trade_setups")
      .insert({
        symbol,
        side: input.side,
        contract_ticker:
          contractTicker,
        entry_price: round(
          entryPrice,
          4
        ),
        entry_score: score,
        stop_price: stopPrice,
        gamma_targets: targets,
        gamma_snapshot: {
          source: "gamma-liquidity",
          capturedAt: nowIso,
          entryPrice,
          rowsCount: gammaRows.length,
          selectedTargets: targets,
          stopPrice,
        },
        status: "active",
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

  if (error || !insertedSetup) {
    const { data: concurrentSetup } =
      await supabase
        .from("stock_trade_setups")
        .select("*")
        .eq("symbol", symbol)
        .eq("side", input.side)
        .eq(
          "contract_ticker",
          contractTicker
        )
        .eq("status", "active")
        .gt("expires_at", nowIso)
        .limit(1)
        .maybeSingle();

    if (concurrentSetup) {
      return mapSetup(
        concurrentSetup as SetupRow,
        false
      );
    }

    throw new Error(
      error?.message ||
        "تعذر حفظ خطة الفرصة"
    );
  }

  return mapSetup(
    insertedSetup as SetupRow,
    true
  );
}
