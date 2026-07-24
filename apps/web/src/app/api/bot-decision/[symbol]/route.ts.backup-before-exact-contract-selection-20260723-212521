import {
  NextRequest,
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";

export const revalidate = 0;
export const maxDuration = 300;

type Side =
  | "CALL"
  | "PUT"
  | "NEUTRAL";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

type BotApiResponse = {
  ok?: boolean;
  symbol?: string;
  text?: string;
  error?: string;
};

type ParsedGamma = {
  symbol: string;
  side: Side;
  score: number;
  decisionScore: number;
  gammaSupportBonus: number;
  gammaSupportRatio: number;
  entry: number | null;
  stop: number | null;
  strike: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
};

type ParsedRadar = {
  symbol: string;
  side: Side;
  score: number;
  suggestedExpiration:
    string | null;
};

const MIN_SCORE =
  Number(
    process.env.MIN_SCORE ||
    6
  );

const MAX_ENTRY_DISTANCE_PCT =
  Number(
    process.env
      .MAX_ENTRY_DISTANCE_PCT ||
    5
  );

function normalizeSymbol(
  value: string
) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.-]/g, "");
}

function isValidSymbol(
  symbol: string
) {
  return /^[A-Z]{1,6}$/.test(
    symbol
  );
}

function cleanBaseUrl(
  value: string
) {
  return value.replace(/\/+$/, "");
}

function round(
  value: number,
  digits = 2
) {
  const factor =
    10 ** digits;

  return (
    Math.round(value * factor) /
    factor
  );
}

function isAuthorized(
  request: NextRequest
) {
  const expectedSecret =
    process.env
      .DECISION_SCAN_SECRET;

  if (!expectedSecret) {
    return true;
  }

  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  return (
    authorization ===
    `Bearer ${expectedSecret}`
  );
}

async function requestBotReport({
  name,
  baseUrl,
  secret,
  path,
  symbol,
}: {
  name: string;
  baseUrl:
    | string
    | undefined;
  secret:
    | string
    | undefined;
  path: string;
  symbol: string;
}) {
  if (!baseUrl) {
    throw new Error(
      `${name}_API_URL_MISSING`
    );
  }

  if (!secret) {
    throw new Error(
      `${name}_API_SECRET_MISSING`
    );
  }

  const url =
    new URL(
      `${cleanBaseUrl(
        baseUrl
      )}${path}`
    );

  url.searchParams.set(
    "key",
    secret
  );

  url.searchParams.set(
    "symbol",
    symbol
  );

  const response =
    await fetch(
      url.toString(),
      {
        cache: "no-store",
        signal:
          AbortSignal.timeout(
            120_000
          ),
        headers: {
          Accept:
            "application/json",
        },
      }
    );

  let payload:
    BotApiResponse = {};

  try {
    payload =
      await response.json() as
        BotApiResponse;
  } catch {
    throw new Error(
      `${name}_INVALID_JSON`
    );
  }

  if (!response.ok) {
    throw new Error(
      `${name}_HTTP_` +
      `${response.status}:` +
      `${
        payload.error ||
        "UNKNOWN_ERROR"
      }`
    );
  }

  if (
    payload.ok !== true ||
    !payload.text
  ) {
    throw new Error(
      `${name}_INVALID_REPORT:` +
      `${
        payload.error ||
        "EMPTY_TEXT"
      }`
    );
  }

  return {
    symbol:
      normalizeSymbol(
        payload.symbol ||
        symbol
      ),
    text:
      payload.text,
  };
}

function getSymbolFromText(
  text: string
) {
  const patterns = [
    /📊\s*السهم:\s*([A-Z]{1,8})/i,
    /رادار السوق\s*—\s*([A-Z]{1,8})/i,
    /Symbol:\s*([A-Z]{1,8})/i,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return match[1]
        .toUpperCase();
    }
  }

  return null;
}

function extractScore(
  text: string
) {
  const match =
    text.match(
      /Score:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i
    ) ||
    text.match(
      /الثقة:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i
    ) ||
    text.match(
      /قوة السيطرة:\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*10/i
    );

  return match
    ? Number(match[1])
    : 0;
}

function extractGammaSide(
  text: string
): Side {
  if (
    text.includes(
      "CALL BIAS"
    )
  ) {
    return "CALL";
  }

  if (
    text.includes(
      "PUT BIAS"
    )
  ) {
    return "PUT";
  }

  return "NEUTRAL";
}

function extractRadarSide(
  text: string
): Side {
  if (
    text.includes(
      "حسب المعطيات الحالية: انتظر"
    ) ||
    text.includes(
      "لا يوجد توافق كاف"
    ) ||
    text.includes(
      "تدفق العقود غير حاسم"
    )
  ) {
    return "NEUTRAL";
  }

  if (
    text.includes(
      "مراقبة كول"
    ) ||
    text.includes(
      "تابع الكول"
    ) ||
    text.includes(
      "متابعة كول"
    ) ||
    text.includes(
      "دخول كول"
    )
  ) {
    return "CALL";
  }

  if (
    text.includes(
      "مراقبة بوت"
    ) ||
    text.includes(
      "تابع البوت"
    ) ||
    text.includes(
      "متابعة بوت"
    ) ||
    text.includes(
      "دخول بوت"
    )
  ) {
    return "PUT";
  }

  if (
    text.includes(
      "سيطرة الكول"
    ) ||
    text.includes(
      "المشترون يسيطرون"
    ) ||
    text.includes(
      "التحوط الشرائي مسيطر"
    )
  ) {
    return "CALL";
  }

  if (
    text.includes(
      "سيطرة البوت"
    ) ||
    text.includes(
      "البائعون يضغطون"
    ) ||
    text.includes(
      "التحوط البيعي مسيطر"
    )
  ) {
    return "PUT";
  }

  return "NEUTRAL";
}

function extractEntry(
  text: string,
  side: Side
) {
  if (side === "CALL") {
    const match =
      text.match(
        /اختراق\s+([0-9]+(?:\.[0-9]+)?)/
      ) ||
      text.match(
        /الدخول\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/
      );

    return match
      ? Number(match[1])
      : null;
  }

  if (side === "PUT") {
    const match =
      text.match(
        /كسر\s+([0-9]+(?:\.[0-9]+)?)/
      ) ||
      text.match(
        /الدخول\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/
      );

    return match
      ? Number(match[1])
      : null;
  }

  return null;
}

function extractCurrentPrice(
  text: string
) {
  const patterns = [
    /سعر السهم الحالي:\s*([0-9]+(?:\.[0-9]+)?)/,
    /السعر الحالي:\s*([0-9]+(?:\.[0-9]+)?)/,
    /💵\s*السعر الحالي:\s*([0-9]+(?:\.[0-9]+)?)/,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function extractNumberAfter(
  label: string,
  text: string
) {
  const escaped =
    label.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const match =
    text.match(
      new RegExp(
        `${escaped}\\s*:?\\s*\\$?([0-9]+(?:\\.[0-9]+)?)`,
        "i"
      )
    );

  return match
    ? Number(match[1])
    : null;
}

function extractStop(
  text: string
) {
  const match =
    text.match(
      /الوقف الفني:\s*\n?\s*([0-9]+(?:\.[0-9]+)?)/
    ) ||
    text.match(
      /الوقف:\s*\n?\s*([0-9]+(?:\.[0-9]+)?)/
    );

  return match
    ? Number(match[1])
    : null;
}

function extractExpiration(
  text: string
) {
  const match =
    text.match(
      /الانتهاء المقترح:\s*\n?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/
    ) ||
    text.match(
      /الانتهاء المسيطر:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/
    );

  return match
    ? match[1]
    : null;
}

function getStrikeStep(
  price: number
) {
  if (price >= 1000) {
    return 10;
  }

  if (price >= 500) {
    return 5;
  }

  if (price >= 100) {
    return 2.5;
  }

  return 1;
}

function getStrikeFromEntry(
  entry: number,
  side: Side
) {
  const step =
    getStrikeStep(entry);

  if (side === "CALL") {
    return (
      Math.ceil(entry / step) *
      step
    );
  }

  if (side === "PUT") {
    return (
      Math.floor(entry / step) *
      step
    );
  }

  return null;
}

function buildAutoStop(
  entry: number,
  side: Side
) {
  if (side === "CALL") {
    return round(
      entry * 0.985,
      4
    );
  }

  if (side === "PUT") {
    return round(
      entry * 1.015,
      4
    );
  }

  return null;
}

function parseSignedNumber(
  value:
    | string
    | undefined
) {
  if (!value) {
    return null;
  }

  const parsed =
    Number(
      value.replace(
        /,/g,
        ""
      )
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}

function extractGammaLevelPower(
  text: string,
  label: string
) {
  const match =
    text.match(
      new RegExp(
        `${label}[^\\n]*\\n\\s*القوة:\\s*([+-]?[0-9,]+(?:\\.[0-9]+)?)`,
        "i"
      )
    );

  return parseSignedNumber(
    match?.[1]
  );
}

function calculateGammaSupportBonus(
  text: string,
  side: Side
) {
  const r1 =
    extractGammaLevelPower(
      text,
      "R1️⃣"
    );

  const r2 =
    extractGammaLevelPower(
      text,
      "R2️⃣"
    );

  const r3 =
    extractGammaLevelPower(
      text,
      "R3️⃣"
    );

  const s1 =
    extractGammaLevelPower(
      text,
      "S1️⃣"
    );

  const s2 =
    extractGammaLevelPower(
      text,
      "S2️⃣"
    );

  const s3 =
    extractGammaLevelPower(
      text,
      "S3️⃣"
    );

  if (side === "CALL") {
    const supports =
      [s1, s2, s3]
        .filter(
          (
            value
          ): value is number =>
            value !== null &&
            value > 0
        )
        .map(Math.abs);

    const resistance =
      Math.abs(r1 || 0);

    if (
      !supports.length ||
      !resistance
    ) {
      return {
        bonus: 0,
        ratio: 0,
      };
    }

    const ratio =
      Math.max(...supports) /
      resistance;

    if (ratio >= 10) {
      return {
        bonus: 2,
        ratio,
      };
    }

    if (ratio >= 5) {
      return {
        bonus: 1,
        ratio,
      };
    }

    return {
      bonus: 0,
      ratio,
    };
  }

  if (side === "PUT") {
    const resistances =
      [r1, r2, r3]
        .filter(
          (
            value
          ): value is number =>
            value !== null &&
            value < 0
        )
        .map(Math.abs);

    const support =
      Math.abs(s1 || 0);

    if (
      !resistances.length ||
      !support
    ) {
      return {
        bonus: 0,
        ratio: 0,
      };
    }

    const ratio =
      Math.max(
        ...resistances
      ) / support;

    if (ratio >= 10) {
      return {
        bonus: 2,
        ratio,
      };
    }

    if (ratio >= 5) {
      return {
        bonus: 1,
        ratio,
      };
    }

    return {
      bonus: 0,
      ratio,
    };
  }

  return {
    bonus: 0,
    ratio: 0,
  };
}

function parseGamma(
  text: string
): ParsedGamma {
  const symbol =
    getSymbolFromText(text) ||
    "";

  const side =
    extractGammaSide(text);

  const score =
    extractScore(text);

  const gammaSupport =
    calculateGammaSupportBonus(
      text,
      side
    );

  const decisionScore =
    Math.min(
      10,
      score +
      gammaSupport.bonus
    );

  const explicitEntry =
    extractEntry(
      text,
      side
    );

  const currentPrice =
    extractCurrentPrice(text);

  const entry =
    explicitEntry ||
    currentPrice;

  let stop =
    extractStop(text);

  if (
    stop &&
    entry
  ) {
    const stopDistancePct =
      Math.abs(
        stop - entry
      ) /
      entry *
      100;

    if (
      stopDistancePct > 10
    ) {
      stop = null;
    }
  }

  if (
    !stop &&
    entry
  ) {
    stop =
      buildAutoStop(
        entry,
        side
      );
  }

  return {
    symbol,
    side,
    score,
    decisionScore,
    gammaSupportBonus:
      gammaSupport.bonus,
    gammaSupportRatio:
      gammaSupport.ratio,
    entry,
    stop,
    strike:
      entry
        ? getStrikeFromEntry(
            entry,
            side
          )
        : null,
    tp1:
      extractNumberAfter(
        "TP1",
        text
      ),
    tp2:
      extractNumberAfter(
        "TP2",
        text
      ),
    tp3:
      extractNumberAfter(
        "TP3",
        text
      ),
  };
}

function parseRadar(
  text: string
): ParsedRadar {
  return {
    symbol:
      getSymbolFromText(
        text
      ) || "",
    side:
      extractRadarSide(
        text
      ),
    score:
      extractScore(text),
    suggestedExpiration:
      extractExpiration(
        text
      ),
  };
}

function createDecision(
  requestedSymbol: string,
  gamma: ParsedGamma,
  radar: ParsedRadar
) {
  const rejectionReasons:
    string[] = [];

  if (
    gamma.symbol !==
    requestedSymbol
  ) {
    rejectionReasons.push(
      `رمز القاما مختلف: ${gamma.symbol || "غير متوفر"}`
    );
  }

  if (
    radar.symbol !==
    requestedSymbol
  ) {
    rejectionReasons.push(
      `رمز السيولة مختلف: ${radar.symbol || "غير متوفر"}`
    );
  }

  if (
    !["CALL", "PUT"].includes(
      gamma.side
    )
  ) {
    rejectionReasons.push(
      "القاما لا يعطي اتجاهًا واضحًا"
    );
  }

  if (
    !["CALL", "PUT"].includes(
      radar.side
    )
  ) {
    rejectionReasons.push(
      "الرادار لا يعطي اتجاهًا واضحًا أو يقول انتظر"
    );
  }

  if (
    gamma.side !==
    radar.side
  ) {
    rejectionReasons.push(
      `تعارض الاتجاه: GEX=${gamma.side}, RADAR=${radar.side}`
    );
  }

  if (
    gamma.decisionScore <
    MIN_SCORE
  ) {
    rejectionReasons.push(
      `Score ضعيف: ${gamma.decisionScore}/10`
    );
  }

  if (!gamma.entry) {
    rejectionReasons.push(
      "لا يوجد مستوى دخول واضح"
    );
  }

  if (!gamma.stop) {
    rejectionReasons.push(
      "لا يوجد وقف ولا يمكن حساب وقف تلقائي"
    );
  }

  if (
    !gamma.strike
  ) {
    rejectionReasons.push(
      "لا يوجد سترايك واضح"
    );
  }

  if (
    !radar
      .suggestedExpiration
  ) {
    rejectionReasons.push(
      "لا يوجد انتهاء مقترح من الرادار"
    );
  }

  const gammaPrice =
    gamma.entry || 0;

  const entryDistancePct =
    gamma.entry &&
    gammaPrice
      ? Math.abs(
          gammaPrice -
          gamma.entry
        ) /
        gammaPrice *
        100
      : 0;

  if (
    entryDistancePct >
    MAX_ENTRY_DISTANCE_PCT
  ) {
    rejectionReasons.push(
      `الدخول بعيد عن السعر الحالي: ${round(
        entryDistancePct,
        2
      )}%`
    );
  }

  return {
    qualifies:
      rejectionReasons.length ===
      0,

    symbol:
      requestedSymbol,

    side:
      gamma.side,

    gexSide:
      gamma.side,

    radarSide:
      radar.side,

    score:
      gamma.decisionScore,

    baseScore:
      gamma.score,

    gammaSupportBonus:
      gamma
        .gammaSupportBonus,

    gammaSupportRatio:
      round(
        gamma
          .gammaSupportRatio,
        2
      ),

    entry:
      gamma.entry,

    stop:
      gamma.stop,

    strike:
      gamma.strike,

    tp1:
      gamma.tp1,

    tp2:
      gamma.tp2,

    tp3:
      gamma.tp3,

    expiration:
      radar
        .suggestedExpiration,

    rejectionReasons,
  };
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  if (
    !isAuthorized(request)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "UNAUTHORIZED",
      },
      {
        status: 401,
      }
    );
  }

  const params =
    await context.params;

  const symbol =
    normalizeSymbol(
      params.symbol
    );

  if (
    !isValidSymbol(symbol)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "INVALID_SYMBOL",
      },
      {
        status: 400,
      }
    );
  }

  const startedAt =
    Date.now();

  try {
    const [
      gammaReport,
      radarReport,
    ] = await Promise.all([
      requestBotReport({
        name:
          "GAMMA",
        baseUrl:
          process.env
            .GAMMA_API_URL,
        secret:
          process.env
            .GAMMA_API_SECRET,
        path:
          "/api/gamma",
        symbol,
      }),

      requestBotReport({
        name:
          "RADAR",
        baseUrl:
          process.env
            .RADAR_API_URL,
        secret:
          process.env
            .RADAR_API_SECRET,
        path:
          "/api/radar",
        symbol,
      }),
    ]);

    const gamma =
      parseGamma(
        gammaReport.text
      );

    const radar =
      parseRadar(
        radarReport.text
      );

    const decision =
      createDecision(
        symbol,
        gamma,
        radar
      );

    return NextResponse.json(
      {
        ok: true,

        engine:
          "BOT_DECISION",

        mode:
          request.nextUrl
            .searchParams
            .get("mode") ===
          "auto"
            ? "AUTO"
            : "MANUAL",

        symbol,

        decision,

        parsed: {
          gamma,
          radar,
        },

        sources: {
          gamma: {
            ok: true,
            text:
              gammaReport.text,
          },

          radar: {
            ok: true,
            text:
              radarReport.text,
          },
        },

        elapsedMs:
          Date.now() -
          startedAt,

        analyzedAt:
          new Date()
            .toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `BOT DECISION ENGINE ERROR ${symbol}:`,
      message
    );

    return NextResponse.json(
      {
        ok: false,
        engine:
          "BOT_DECISION",
        symbol,
        error:
          "BOT_DECISION_ANALYSIS_FAILED",
        details:
          message,
        elapsedMs:
          Date.now() -
          startedAt,
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
