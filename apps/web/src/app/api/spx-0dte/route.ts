import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DataRecord = Record<string, unknown>;
type ContractSide = "CALL" | "PUT";
type MarketDirection = ContractSide | "NEUTRAL";

type RawContract = {
  ticker: string;
  expiration: string;
  side: ContractSide;
  strike: number;
  stockPrice: number;
  bid: number;
  ask: number;
  midpoint: number;
  executionPrice: number;
  spreadPct: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  ivPct: number;
  volume: number;
  openInterest: number;
  volumeOi: number;
  distancePoints: number;
  distancePct: number;
  flowValue: number;
};

type ScoredContract = {
  ticker: string;
  expiration: string;
  side: ContractSide;
  strike: number;
  stockPrice: number;
  bid: number;
  ask: number;
  midpoint: number;
  price: number;
  spreadPct: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  ivPct: number;
  volume: number;
  openInterest: number;
  volumeOi: number;
  distancePoints: number;
  distancePct: number;
  baseScore: number;
  finalScore: number;
  quality: "ممتاز" | "جيد" | "مقبول";
  reasons: string[];
  warnings: string[];
};

function asRecord(value: unknown): DataRecord {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function todayNewYork(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeSide(value: unknown): ContractSide | null {
  const side = textValue(value).toLowerCase();

  if (side === "call" || side === "c") {
    return "CALL";
  }

  if (side === "put" || side === "p") {
    return "PUT";
  }

  return null;
}

async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });

  const responseText = await response.text();

  let payload: unknown = {};

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { error: responseText };
  }

  if (!response.ok) {
    throw new Error(
      textValue(asRecord(payload).error) ||
        `فشل الطلب: HTTP ${response.status}`
    );
  }

  return payload;
}



function estimateSpxPriceFromChain(
  rawChain: unknown[],
  expiration: string
): number {
  const pairs = new Map<
    number,
    {
      call?: number;
      put?: number;
    }
  >();

  for (const value of rawChain) {
    const contract = asRecord(value);
    const details = asRecord(contract.details);
    const quote = asRecord(contract.last_quote);
    const trade = asRecord(contract.last_trade);

    const ticker = textValue(details.ticker);
    const contractExpiration =
      textValue(details.expiration_date);

    const side =
      normalizeSide(details.contract_type);

    const strike =
      numberValue(details.strike_price);

    if (
      !ticker.toUpperCase().includes("SPXW") ||
      contractExpiration !== expiration ||
      !side ||
      strike <= 0
    ) {
      continue;
    }

    const bid = numberValue(quote.bid);
    const ask = numberValue(quote.ask);

    const suppliedMidpoint =
      numberValue(quote.midpoint);

    const midpoint =
      suppliedMidpoint > 0
        ? suppliedMidpoint
        : bid > 0 && ask > 0
          ? (bid + ask) / 2
          : numberValue(trade.price);

    if (midpoint <= 0) {
      continue;
    }

    const pair =
      pairs.get(strike) || {};

    if (side === "CALL") {
      pair.call = midpoint;
    } else {
      pair.put = midpoint;
    }

    pairs.set(strike, pair);
  }

  /*
    Put–Call Parity لعقود 0DTE:

    SPX ≈ Strike + Call Mid - Put Mid

    نختار أقرب ثلاثة أزواج ATM، وهي الأزواج
    التي يكون فيها الفرق بين سعر CALL وPUT أقل،
    ثم نأخذ الوسيط لتقليل أثر الأسعار الشاذة.
  */
  const estimates = Array.from(
    pairs.entries()
  )
    .filter(
      (
        entry
      ): entry is [
        number,
        {
          call: number;
          put: number;
        },
      ] =>
        Number.isFinite(
          entry[1].call
        ) &&
        Number.isFinite(
          entry[1].put
        ) &&
        Number(entry[1].call) > 0 &&
        Number(entry[1].put) > 0
    )
    .map(([strike, pair]) => ({
      impliedPrice:
        strike +
        pair.call -
        pair.put,

      callPutDifference:
        Math.abs(
          pair.call -
          pair.put
        ),
    }))
    .filter(
      (row) =>
        row.impliedPrice >
          1000 &&
        row.impliedPrice <
          20000
    )
    .sort(
      (first, second) =>
        first.callPutDifference -
        second.callPutDifference
    )
    .slice(0, 3)
    .map(
      (row) =>
        row.impliedPrice
    )
    .sort(
      (first, second) =>
        first - second
    );

  if (
    estimates.length === 0
  ) {
    throw new Error(
      "تعذر استنتاج مستوى SPX من عقود SPXW اليومية"
    );
  }

  const middleIndex =
    Math.floor(
      estimates.length / 2
    );

  const estimatedPrice =
    estimates.length % 2 === 1
      ? estimates[middleIndex]
      : (
          estimates[
            middleIndex - 1
          ] +
          estimates[middleIndex]
        ) / 2;

  return round(
    estimatedPrice,
    2
  );
}

async function fetchTodaySpxwChain(
  massiveApiKey: string,
  expiration: string
): Promise<unknown[]> {
  const baseUrl =
    process.env.MASSIVE_BASE_URL?.replace(/\/+$/, "") ||
    "https://api.massive.com";

  const rows: unknown[] = [];

  let nextUrl: string | null =
    `${baseUrl}/v3/snapshot/options/I%3ASPX` +
    `?expiration_date=${encodeURIComponent(expiration)}` +
    `&limit=250` +
    `&apiKey=${encodeURIComponent(massiveApiKey)}`;

  let page = 0;

  while (nextUrl && page < 12) {
    const payload = asRecord(await fetchJson(nextUrl));

    rows.push(...asArray(payload.results));

    const returnedNextUrl = textValue(payload.next_url);

    if (!returnedNextUrl) {
      nextUrl = null;
    } else if (returnedNextUrl.includes("apiKey=")) {
      nextUrl = returnedNextUrl;
    } else {
      nextUrl =
        `${returnedNextUrl}${returnedNextUrl.includes("?") ? "&" : "?"}` +
        `apiKey=${encodeURIComponent(massiveApiKey)}`;
    }

    page += 1;
  }

  return rows;
}

function readContract(
  value: unknown,
  today: string,
  stockPrice: number
): RawContract | null {
  const contract = asRecord(value);
  const details = asRecord(contract.details);
  const quote = asRecord(contract.last_quote);
  const lastTrade = asRecord(contract.last_trade);
  const greeks = asRecord(contract.greeks);
  const day = asRecord(contract.day);

  const ticker = textValue(details.ticker);
  const expiration = textValue(details.expiration_date);
  const side = normalizeSide(details.contract_type);

  // SPXW فقط + انتهاء اليوم فقط.
  if (
    !ticker ||
    !ticker.toUpperCase().includes("SPXW") ||
    expiration !== today ||
    !side
  ) {
    return null;
  }

  const strike = numberValue(details.strike_price);

  const bid = numberValue(quote.bid);
  const ask = numberValue(quote.ask);
  const suppliedMidpoint = numberValue(quote.midpoint);

  const midpoint =
    suppliedMidpoint > 0
      ? suppliedMidpoint
      : bid > 0 && ask > 0
        ? (bid + ask) / 2
        : 0;

  const lastPrice = numberValue(lastTrade.price);

  const referencePrice =
    midpoint > 0
      ? midpoint
      : lastPrice > 0
        ? lastPrice
        : bid > 0
          ? bid
          : ask;

  const executionPrice = ask > 0 ? ask : referencePrice;

  const spreadPct =
    midpoint > 0 && ask > bid && bid > 0
      ? ((ask - bid) / midpoint) * 100
      : 999;

  const delta = numberValue(greeks.delta);
  const gamma = numberValue(greeks.gamma);
  const theta = numberValue(greeks.theta);
  const vega = numberValue(greeks.vega);

  const rawIv = numberValue(contract.implied_volatility);
  const ivPct = rawIv > 0 && rawIv <= 3 ? rawIv * 100 : rawIv;

  const volume = numberValue(day.volume);
  const openInterest = numberValue(contract.open_interest);

  const volumeOi =
    openInterest > 0 ? volume / openInterest : volume > 0 ? volume : 0;

  const distancePoints = Math.abs(strike - stockPrice);
  const distancePct =
    stockPrice > 0 ? (distancePoints / stockPrice) * 100 : 999;

  if (
    strike <= 0 ||
    stockPrice <= 0 ||
    executionPrice <= 0 ||
    !Number.isFinite(delta)
  ) {
    return null;
  }

  // Flow تقديري من حجم وقيمة عقود اليوم نفسها، وليس من الحيتان.
  const flowValue =
    volume > 0 && referencePrice > 0
      ? volume * referencePrice * 100
      : 0;

  return {
    ticker,
    expiration,
    side,
    strike,
    stockPrice,
    bid,
    ask,
    midpoint,
    executionPrice,
    spreadPct,
    delta,
    gamma,
    theta,
    vega,
    ivPct,
    volume,
    openInterest,
    volumeOi,
    distancePoints,
    distancePct,
    flowValue,
  };
}

function calculateBaseScore(input: {
  price: number;
  spreadPct: number;
  delta: number;
  volume: number;
  openInterest: number;
  volumeOi: number;
  distancePct: number;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const absoluteDelta = Math.abs(input.delta);

  if (absoluteDelta >= 0.35 && absoluteDelta <= 0.5) {
    score += 22;
    reasons.push("دلتا ممتازة للمضاربة السريعة");
  } else if (absoluteDelta >= 0.28 && absoluteDelta <= 0.55) {
    score += 14;
    reasons.push("دلتا ضمن النطاق المقبول");
  }

  if (input.spreadPct <= 4) {
    score += 20;
    reasons.push("سبريد ممتاز");
  } else if (input.spreadPct <= 7) {
    score += 15;
    reasons.push("سبريد جيد");
  } else if (input.spreadPct <= 12) {
    score += 8;
    reasons.push("السبريد ضمن الحد المقبول");
  }

  if (input.volume >= 1500) {
    score += 16;
    reasons.push("حجم تداول مرتفع جدًا");
  } else if (input.volume >= 600) {
    score += 12;
    reasons.push("حجم تداول قوي");
  } else if (input.volume >= 200) {
    score += 7;
  }

  if (input.openInterest >= 1500) {
    score += 12;
    reasons.push("اهتمام مفتوح مرتفع");
  } else if (input.openInterest >= 500) {
    score += 9;
    reasons.push("اهتمام مفتوح جيد");
  } else if (input.openInterest >= 100) {
    score += 5;
  }

  if (input.distancePct <= 0.1) {
    score += 17;
    reasons.push("العقد قريب جدًا من ATM");
  } else if (input.distancePct <= 0.2) {
    score += 13;
    reasons.push("العقد قريب من ATM");
  } else if (input.distancePct <= 0.35) {
    score += 8;
  } else {
    score += 3;
  }

  if (input.volumeOi >= 1) {
    score += 8;
    reasons.push("الحجم قوي مقارنة بالاهتمام المفتوح");
  } else if (input.volumeOi >= 0.5) {
    score += 5;
  }

  if (input.price >= 1 && input.price <= 6) {
    score += 5;
    reasons.push("سعر العقد مناسب للمضاربة");
  } else if (input.price > 0 && input.price <= 10) {
    score += 3;
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons,
  };
}


function calculateGammaFromContracts(
  contracts: RawContract[],
  stockPrice: number
) {
  const nearContracts = contracts.filter(
    (contract) =>
      Math.abs(contract.strike - stockPrice) <= 150
  );
  const byStrike = new Map<
    number,
    {
      callGex: number;
      putGex: number;
      netGex: number;
      totalOpenInterest: number;
      totalVolume: number;
    }
  >();

  let totalNetGex = 0;

  for (const contract of nearContracts) {
    const unsignedGex =
      contract.gamma *
      contract.openInterest *
      100 *
      stockPrice *
      stockPrice *
      0.01;

    const signedGex =
      contract.side === "CALL"
        ? unsignedGex
        : -unsignedGex;

    totalNetGex += signedGex;

    const current = byStrike.get(contract.strike) || {
      callGex: 0,
      putGex: 0,
      netGex: 0,
      totalOpenInterest: 0,
      totalVolume: 0,
    };

    if (contract.side === "CALL") {
      current.callGex += unsignedGex;
    } else {
      current.putGex += unsignedGex;
    }

    current.netGex += signedGex;
    current.totalOpenInterest += contract.openInterest;
    current.totalVolume += contract.volume;

    byStrike.set(contract.strike, current);
  }

  const rows = Array.from(byStrike.entries())
    .map(([strike, values]) => ({
      strike,
      ...values,
    }))
    .sort((first, second) => first.strike - second.strike);

  const emptyRow = {
    strike: 0,
    callGex: 0,
    putGex: 0,
    netGex: 0,
    totalOpenInterest: 0,
    totalVolume: 0,
  };

  /*
    Call Wall يجب أن يكون عند السعر أو فوقه،
    وPut Wall عند السعر أو تحته.
  */
  const callWallCandidates = rows.filter(
    (row) => row.strike >= stockPrice
  );

  const putWallCandidates = rows.filter(
    (row) => row.strike <= stockPrice
  );

  const strongestCallGammaRow =
    rows.length > 0
      ? rows.reduce(
          (best, row) =>
            row.callGex > best.callGex
              ? row
              : best,
          rows[0]
        )
      : emptyRow;

  const strongestPutGammaRow =
    rows.length > 0
      ? rows.reduce(
          (best, row) =>
            row.putGex > best.putGex
              ? row
              : best,
          rows[0]
        )
      : emptyRow;

  const callWall =
    callWallCandidates.length > 0
      ? callWallCandidates.reduce(
          (best, row) =>
            row.callGex > best.callGex
              ? row
              : best,
          callWallCandidates[0]
        ).strike
      : 0;

  const putWall =
    putWallCandidates.length > 0
      ? putWallCandidates.reduce(
          (best, row) =>
            row.putGex > best.putGex
              ? row
              : best,
          putWallCandidates[0]
        ).strike
      : 0;

  /*
    Magnet لحظي لـ0DTE:
    نبحث ضمن 50 نقطة من السعر فقط،
    ونوازن بين OI وحجم تداول اليوم.
  */
  const magnetCandidates = rows.filter(
    (row) =>
      Math.abs(row.strike - stockPrice) <= 50
  );

  const magnet =
    magnetCandidates.length > 0
      ? magnetCandidates.reduce(
          (best, row) => {
            const rowScore =
              row.totalOpenInterest +
              row.totalVolume * 0.5;

            const bestScore =
              best.totalOpenInterest +
              best.totalVolume * 0.5;

            if (rowScore !== bestScore) {
              return rowScore > bestScore
                ? row
                : best;
            }

            return Math.abs(row.strike - stockPrice) <
              Math.abs(best.strike - stockPrice)
              ? row
              : best;
          },
          magnetCandidates[0]
        ).strike
      : 0;

  let zeroGamma = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];

    const crossed =
      (previous.netGex <= 0 && current.netGex >= 0) ||
      (previous.netGex >= 0 && current.netGex <= 0);

    if (crossed) {
      zeroGamma =
        Math.abs(previous.netGex) <= Math.abs(current.netGex)
          ? previous.strike
          : current.strike;

      break;
    }
  }

  if (zeroGamma === 0 && rows.length > 0) {
    zeroGamma = rows.reduce(
      (best, row) =>
        Math.abs(row.netGex) < Math.abs(best.netGex)
          ? row
          : best,
      rows[0]
    ).strike;
  }

  return {
    netGex: totalNetGex,
    zeroGamma,
    callWall,
    putWall,
    magnet,
    strongestCallGammaStrike:
      strongestCallGammaRow.strike,
    strongestCallGammaValue:
      strongestCallGammaRow.callGex,
    strongestPutGammaStrike:
      strongestPutGammaRow.strike,
    strongestPutGammaValue:
      strongestPutGammaRow.putGex,
  };
}


export async function GET() {
  try {
    const massiveApiKey =
      process.env.MASSIVE_API_KEY;

    if (!massiveApiKey) {
      throw new Error(
        "متغير MASSIVE_API_KEY غير موجود"
      );
    }

    const today =
      todayNewYork();

    const rawChain =
      await fetchTodaySpxwChain(
        massiveApiKey,
        today
      );

    const stockPrice =
      estimateSpxPriceFromChain(
        rawChain,
        today
      );

    const allContracts = rawChain
      .map((row) => readContract(row, today, stockPrice))
      .filter((row): row is RawContract => row !== null);

    if (allContracts.length === 0) {
      return NextResponse.json({
        ok: true,
        date: today,
        status: "NO_CONTRACTS",
        message: "لا توجد عقود SPXW منتهية اليوم حاليًا.",
        market: null,
        gamma: null,
        bestContract: null,
        contracts: [],
        updatedAt: new Date().toISOString(),
      });
    }


    const callFlow = allContracts
      .filter((row) => row.side === "CALL")
      .reduce((total, row) => total + row.flowValue, 0);

    const putFlow = allContracts
      .filter((row) => row.side === "PUT")
      .reduce((total, row) => total + row.flowValue, 0);

    const totalFlow = callFlow + putFlow;

    const callFlowPct =
      totalFlow > 0 ? (callFlow / totalFlow) * 100 : 0;

    const putFlowPct =
      totalFlow > 0 ? (putFlow / totalFlow) * 100 : 0;

    const flowGap = Math.abs(callFlowPct - putFlowPct);

    let flowDirection: MarketDirection = "NEUTRAL";

    if (callFlowPct >= 58) {
      flowDirection = "CALL";
    } else if (putFlowPct >= 58) {
      flowDirection = "PUT";
    }

    const gamma = calculateGammaFromContracts(allContracts, stockPrice);

    const magnetDistance =
      gamma.magnet > 0 && stockPrice > 0
        ? Math.abs(stockPrice - gamma.magnet)
        : 999;

    const nearMagnet =
      magnetDistance <= Math.max(5, stockPrice * 0.0008);

    const betweenWalls =
      gamma.callWall > 0 &&
      gamma.putWall > 0 &&
      stockPrice < gamma.callWall &&
      stockPrice > gamma.putWall;

    const wallWidth =
      gamma.callWall > 0 && gamma.putWall > 0
        ? gamma.callWall - gamma.putWall
        : 999;

    const gammaChop =
      (nearMagnet && flowGap < 14) ||
      (gamma.netGex > 0 &&
        betweenWalls &&
        wallWidth > 0 &&
        wallWidth <= 35 &&
        flowGap < 18);

    const eligibleContracts = allContracts.filter((row) => {
      const absoluteDelta = Math.abs(row.delta);

      return (
        row.expiration === today &&
        row.ticker.toUpperCase().includes("SPXW") &&
        absoluteDelta >= 0.28 &&
        absoluteDelta <= 0.55 &&
        row.spreadPct <= 12 &&
        row.volume >= 100 &&
        (row.openInterest >= 20 || row.volume >= 500) &&
        row.executionPrice >= 0.8 &&
        row.executionPrice <= 50 &&
        row.distancePct <= 0.45
      );
    });

    const scoredContracts: ScoredContract[] = eligibleContracts
      .map((row) => {
        const base = calculateBaseScore({
          price: row.executionPrice,
          spreadPct: row.spreadPct,
          delta: row.delta,
          volume: row.volume,
          openInterest: row.openInterest,
          volumeOi: row.volumeOi,
          distancePct: row.distancePct,
        });

        let finalScore = base.score;
        const reasons = [...base.reasons];
        const warnings: string[] = [];

        const relevantFlowPct =
          row.side === "CALL" ? callFlowPct : putFlowPct;

        if (row.side === flowDirection) {
          if (relevantFlowPct >= 65) {
            finalScore += 12;
            reasons.push("توافق قوي مع اتجاه Flow اليومي");
          } else {
            finalScore += 8;
            reasons.push("العقد متوافق مع اتجاه Flow");
          }
        } else {
          finalScore -= 20;
          warnings.push("العقد عكس اتجاه Flow اليومي");
        }

        if (gamma.netGex < 0) {
          finalScore += 8;
          reasons.push("Net GEX سالب يدعم توسع الحركة");
        } else if (gamma.netGex > 0) {
          const alignedWithMagnetSide =
            (row.side === "CALL" && stockPrice > gamma.magnet) ||
            (row.side === "PUT" && stockPrice < gamma.magnet);

          if (alignedWithMagnetSide) {
            finalScore += 3;
          } else {
            finalScore -= 6;
            warnings.push("Net GEX موجب وقد يعيد السعر نحو Magnet");
          }
        }

        if (gamma.magnet > 0) {
          const directionMatchesMagnet =
            (row.side === "CALL" && stockPrice > gamma.magnet) ||
            (row.side === "PUT" && stockPrice < gamma.magnet);

          if (directionMatchesMagnet && !nearMagnet) {
            finalScore += 8;
            reasons.push("السعر يتحرك في الجهة الصحيحة من Magnet");
          } else if (!directionMatchesMagnet) {
            finalScore -= 12;
            warnings.push("العقد ضد موقع السعر بالنسبة إلى Magnet");
          }
        }

        if (row.side === "CALL" && gamma.callWall > 0) {
          const distanceToWall = gamma.callWall - stockPrice;

          if (distanceToWall > 0 && distanceToWall <= 8) {
            finalScore -= 8;
            warnings.push("Call Wall قريب وقد يحد الصعود");
          }
        }

        if (row.side === "PUT" && gamma.putWall > 0) {
          const distanceToWall = stockPrice - gamma.putWall;

          if (distanceToWall > 0 && distanceToWall <= 8) {
            finalScore -= 8;
            warnings.push("Put Wall قريب وقد يحد الهبوط");
          }
        }

        finalScore = clamp(Math.round(finalScore), 0, 100);

        const quality: ScoredContract["quality"] =
          finalScore >= 85
            ? "ممتاز"
            : finalScore >= 72
              ? "جيد"
              : "مقبول";

        return {
          ticker: row.ticker,
          expiration: row.expiration,
          side: row.side,
          strike: round(row.strike),
          stockPrice: round(row.stockPrice),
          bid: round(row.bid),
          ask: round(row.ask),
          midpoint: round(row.midpoint),
          price: round(row.executionPrice),
          spreadPct: round(row.spreadPct),
          delta: round(row.delta, 4),
          gamma: round(row.gamma, 6),
          theta: round(row.theta, 4),
          vega: round(row.vega, 4),
          ivPct: round(row.ivPct),
          volume: Math.round(row.volume),
          openInterest: Math.round(row.openInterest),
          volumeOi: round(row.volumeOi),
          distancePoints: round(row.distancePoints),
          distancePct: round(row.distancePct, 3),
          baseScore: base.score,
          finalScore,
          quality,
          reasons,
          warnings,
        };
      })
      .sort(
        (first, second) =>
          second.finalScore - first.finalScore ||
          second.volume - first.volume ||
          first.spreadPct - second.spreadPct
      );

    let status: "ACTIVE" | "WATCH" | "NO_TRADE";
    let message: string;
    let bestContract: ScoredContract | null = null;

    if (gammaChop) {
      status = "NO_TRADE";
      message =
        "لا توجد صفقة: السعر داخل Gamma Chop وقريب من Magnet مع غياب أفضلية قوية.";
    } else if (flowDirection === "NEUTRAL") {
      status = "NO_TRADE";
      message =
        "لا توجد صفقة: تدفق CALL وPUT متقارب ولا يوجد اتجاه واضح.";
    } else {
      bestContract =
        scoredContracts.find(
          (contract) => contract.side === flowDirection
        ) || null;

      if (!bestContract) {
        status = "NO_TRADE";
        message =
          "لا يوجد عقد SPXW 0DTE يطابق شروط الجودة والسيولة حاليًا.";
      } else if (bestContract.finalScore >= 80) {
        status = "ACTIVE";
        message =
          `فرصة ${flowDirection} مفعّلة وفق Flow والقاما وجودة العقد.`;
      } else {
        status = "WATCH";
        message =
          `فرصة ${flowDirection} تحت المراقبة ولم تصل إلى درجة التفعيل.`;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        date: today,
        status,
        message,

        market: {
          direction: flowDirection,

          priceSource:
            "SPXW put-call parity",
          flowMethod: "0DTE volume × midpoint × 100",
          stockPrice: round(stockPrice),
          callFlow: round(callFlow),
          putFlow: round(putFlow),
          totalFlow: round(totalFlow),
          callFlowPct: round(callFlowPct),
          putFlowPct: round(putFlowPct),
          flowGap: round(flowGap),
          gammaChop,
          nearMagnet,
          magnetDistance: round(magnetDistance),
        },

        gamma: {
          netGex: round(gamma.netGex),
          zeroGamma: round(gamma.zeroGamma),
          callWall: round(gamma.callWall),
          putWall: round(gamma.putWall),
          magnet: round(gamma.magnet),
          strongestCallGammaStrike: round(
            gamma.strongestCallGammaStrike
          ),
          strongestCallGammaValue: round(
            gamma.strongestCallGammaValue
          ),
          strongestPutGammaStrike: round(
            gamma.strongestPutGammaStrike
          ),
          strongestPutGammaValue: round(
            gamma.strongestPutGammaValue
          ),
        },

        filters: {
          expiration: today,
          symbol: "SPXW",
          delta: "0.28 - 0.55",
          maxSpreadPct: 12,
          minimumVolume: 100,
          minimumOpenInterest: 20,
          maximumDistancePct: 0.45,
          contractPrice: "0.80 - 50.00",
        },

        bestContract,
        contracts: scoredContracts.slice(0, 30),

        counts: {
          allTodayContracts: allContracts.length,
          eligibleContracts: eligibleContracts.length,
          scoredContracts: scoredContracts.length,
        },

        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير معروف",
      },
      { status: 500 }
    );
  }
}