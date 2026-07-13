// @ts-nocheck

import { GET as getGammaLiquidity } from "../gamma-liquidity/[symbol]/route";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INDEXES = [
  { symbol: "SPY", name: "S&P 500", weight: 0.4 },
  { symbol: "QQQ", name: "Nasdaq 100", weight: 0.3 },
  { symbol: "IWM", name: "Russell 2000", weight: 0.15 },
  { symbol: "DIA", name: "Dow Jones", weight: 0.15 },
];

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(part, total) {
  return total > 0 ? round((part / total) * 100, 2) : 0;
}

function marketBias(score) {
  if (score >= 15) return "CALL";
  if (score <= -15) return "PUT";
  return "NEUTRAL";
}

function marketStatus(score) {
  if (score >= 45) return "إيجابي قوي";
  if (score >= 15) return "إيجابي بحذر";
  if (score <= -45) return "سلبي قوي";
  if (score <= -15) return "سلبي بحذر";
  return "محايد";
}

function confidence(score, agreement) {
  const strength = Math.abs(score);

  if (strength >= 40 && agreement >= 70) return "مرتفعة";
  if (strength >= 25 && agreement >= 55) return "جيدة";
  if (strength >= 15) return "متوسطة";

  return "ضعيفة";
}

async function fetchIndex(_baseUrl, index) {
  const response = await getGammaLiquidity(
    new Request(
      `http://internal/api/gamma-liquidity/${index.symbol}`,
    ),
    {
      params: Promise.resolve({
        symbol: index.symbol,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error ||
        data.details ||
        `تعذر تحليل ${index.symbol}`,
    );
  }

  return {
    symbol: index.symbol,
    name: index.name,
    weight: index.weight,

    spotPrice: num(data.spotPrice),
    updatedAt: data.updatedAt,

    bias: data.summary?.bias || "NEUTRAL",
    score: num(data.summary?.directionalScore),
    confidence: data.summary?.confidence || "ضعيفة",

    callVolume: num(data.summary?.callVolume),
    putVolume: num(data.summary?.putVolume),

    callOpenInterest: num(
      data.summary?.callOpenInterest,
    ),

    putOpenInterest: num(
      data.summary?.putOpenInterest,
    ),

    netGex: num(data.gamma?.netGex),
    gammaRegime: data.gamma?.regime || "NEUTRAL",

    gammaRegimeRatio: num(
      data.gamma?.regimeRatio,
    ),

    gammaFlip:
      data.gamma?.estimatedGammaFlip ?? null,

    ivSkewPoints:
      data.ivSkew?.putMinusCallPoints ?? null,

    ivSkewDirection:
      data.ivSkew?.direction || "UNKNOWN",

    callWall:
      data.walls?.callWall?.strike ?? null,

    putWall:
      data.walls?.putWall?.strike ?? null,

    magnet:
      data.walls?.magnet?.strike ?? null,

    reasons: Array.isArray(data.summary?.reasons)
      ? data.summary.reasons
      : [],

    risks: Array.isArray(data.summary?.risks)
      ? data.summary.risks
      : [],
  };
}

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);

    const baseUrl = requestUrl.hostname.endsWith(
      ".app.github.dev",
    )
      ? "http://127.0.0.1:3000"
      : requestUrl.origin;

    const settled = await Promise.allSettled(
      INDEXES.map((index) =>
        fetchIndex(baseUrl, index),
      ),
    );

    const indices = [];
    const failed = [];

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        indices.push(result.value);
      } else {
        failed.push({
          symbol: INDEXES[index].symbol,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : "خطأ غير معروف",
        });
      }
    });

    if (indices.length === 0) {
      return Response.json(
        {
          ok: false,
          error: "تعذر تحميل مؤشرات السوق.",
          failed,
        },
        {
          status: 502,
        },
      );
    }

    const totalWeight = indices.reduce(
      (sum, item) => sum + item.weight,
      0,
    );

    const score = round(
      indices.reduce(
        (sum, item) =>
          sum + item.score * item.weight,
        0,
      ) / totalWeight,
      1,
    );

    const callWeight = indices
      .filter((item) => item.bias === "CALL")
      .reduce(
        (sum, item) => sum + item.weight,
        0,
      );

    const putWeight = indices
      .filter((item) => item.bias === "PUT")
      .reduce(
        (sum, item) => sum + item.weight,
        0,
      );

    const neutralWeight = indices
      .filter((item) => item.bias === "NEUTRAL")
      .reduce(
        (sum, item) => sum + item.weight,
        0,
      );

    const callWeightPct = percentage(
      callWeight,
      totalWeight,
    );

    const putWeightPct = percentage(
      putWeight,
      totalWeight,
    );

    const neutralWeightPct = percentage(
      neutralWeight,
      totalWeight,
    );

    const agreementPct = Math.max(
      callWeightPct,
      putWeightPct,
      neutralWeightPct,
    );

    const callVolume = indices.reduce(
      (sum, item) => sum + item.callVolume,
      0,
    );

    const putVolume = indices.reduce(
      (sum, item) => sum + item.putVolume,
      0,
    );

    const totalVolume =
      callVolume + putVolume;

    const callOpenInterest = indices.reduce(
      (sum, item) =>
        sum + item.callOpenInterest,
      0,
    );

    const putOpenInterest = indices.reduce(
      (sum, item) =>
        sum + item.putOpenInterest,
      0,
    );

    const totalOpenInterest =
      callOpenInterest + putOpenInterest;

    const totalNetGex = indices.reduce(
      (sum, item) => sum + item.netGex,
      0,
    );

    const weightedGammaRatio =
      indices.reduce(
        (sum, item) =>
          sum +
          item.gammaRegimeRatio *
            item.weight,
        0,
      ) / totalWeight;

    const gammaRegime =
      weightedGammaRatio >= 0.15
        ? "POSITIVE"
        : weightedGammaRatio <= -0.15
          ? "NEGATIVE"
          : "NEUTRAL";

    const ivItems = indices.filter(
      (item) => item.ivSkewPoints !== null,
    );

    const ivWeight = ivItems.reduce(
      (sum, item) => sum + item.weight,
      0,
    );

    const weightedIvSkew =
      ivWeight > 0
        ? round(
            ivItems.reduce(
              (sum, item) =>
                sum +
                num(item.ivSkewPoints) *
                  item.weight,
              0,
            ) / ivWeight,
            2,
          )
        : null;

    const reasons = [];

    if (callWeightPct >= 60) {
      reasons.push(
        "غالبية المؤشرات الرئيسية تميل إلى CALL.",
      );
    }

    if (putWeightPct >= 60) {
      reasons.push(
        "غالبية المؤشرات الرئيسية تميل إلى PUT.",
      );
    }

    reasons.push(
      callVolume >= putVolume
        ? "حجم CALL المجمع أعلى من PUT."
        : "حجم PUT المجمع أعلى من CALL.",
    );

    reasons.push(
      callOpenInterest >= putOpenInterest
        ? "الاهتمام المفتوح المجمع يميل إلى CALL."
        : "الاهتمام المفتوح المجمع يميل إلى PUT.",
    );

    if (gammaRegime === "POSITIVE") {
      reasons.push(
        "القاما الموجبة تميل إلى تهدئة الحركة.",
      );
    }

    if (gammaRegime === "NEGATIVE") {
      reasons.push(
        "القاما السالبة قد تضخم حركة السوق.",
      );
    }

    const risks = [];

    if (agreementPct < 55) {
      risks.push(
        "يوجد تباين بين المؤشرات الرئيسية.",
      );
    }

    if (failed.length > 0) {
      risks.push(
        `تعذر تحميل: ${failed
          .map((item) => item.symbol)
          .join(", ")}.`,
      );
    }

    const sorted = [...indices].sort(
      (a, b) => b.score - a.score,
    );

    return Response.json(
      {
        ok: true,
        updatedAt: new Date().toISOString(),

        market: {
          score,
          bias: marketBias(score),
          status: marketStatus(score),
          confidence: confidence(
            score,
            agreementPct,
          ),

          agreementPct,
          callWeightPct,
          putWeightPct,
          neutralWeightPct,

          reasons,
          risks,
        },

        flow: {
          callVolume,
          putVolume,
          totalVolume,

          callVolumePct: percentage(
            callVolume,
            totalVolume,
          ),

          putVolumePct: percentage(
            putVolume,
            totalVolume,
          ),

          callOpenInterest,
          putOpenInterest,
          totalOpenInterest,

          callOpenInterestPct: percentage(
            callOpenInterest,
            totalOpenInterest,
          ),

          putOpenInterestPct: percentage(
            putOpenInterest,
            totalOpenInterest,
          ),
        },

        gamma: {
          regime: gammaRegime,

          weightedRegimeRatio: round(
            weightedGammaRatio,
            4,
          ),

          totalNetGex: round(
            totalNetGex,
            2,
          ),
        },

        ivSkew: {
          weightedPutMinusCallPoints:
            weightedIvSkew,

          direction:
            weightedIvSkew === null
              ? "UNKNOWN"
              : weightedIvSkew >= 2
                ? "PUT_PREMIUM"
                : weightedIvSkew <= -2
                  ? "CALL_PREMIUM"
                  : "BALANCED",
        },

        leaders: sorted.slice(0, 2),

        laggards: [...sorted]
          .reverse()
          .slice(0, 2),

        indices,
        failed,

        meta: {
          requestedIndices: INDEXES.length,
          successfulIndices: indices.length,

          disclaimer:
            "النتائج تحليل تقديري لبيانات الأوبشن وليست توصية شراء أو بيع.",
        },
      },
      {
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          "فشل إنشاء نظرة السوق.",

        details:
          error instanceof Error
            ? error.message
            : "خطأ غير معروف",
      },
      {
        status: 500,
      },
    );
  }
}
