export type DecisionResult = {
  score: number;
  side: "CALL" | "PUT" | "NEUTRAL";
  status: string;
  confidence: string;
};

export function buildDecision(score: number, side: string): DecisionResult {
  const cleanSide = (side || "NEUTRAL").toUpperCase() as
    | "CALL"
    | "PUT"
    | "NEUTRAL";

  let status = "مراقبة";
  let confidence = "منخفضة";

  if (score >= 90) {
    status = "جاهزة";
    confidence = "مرتفعة";
  } else if (score >= 80) {
    status = "قريبة";
    confidence = "مرتفعة";
  } else if (score >= 70) {
    status = "مراقبة";
    confidence = "متوسطة";
  } else if (score >= 60) {
    status = "تحتاج تأكيد";
    confidence = "متوسطة";
  } else {
    status = "ضعيفة";
    confidence = "منخفضة";
  }

  if (cleanSide === "NEUTRAL") {
    status = "محايد";
    confidence = "منخفضة";
  }

  return {
    score,
    side: cleanSide,
    status,
    confidence,
  };
}