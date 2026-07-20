export type GammaFlipContract = {
  side: "CALL" | "PUT";
  strike: number;
  openInterest: number;
  ivPct: number;
};

export type GammaFlipResult = {
  zeroGamma: number | null;
  scannedFrom: number;
  scannedTo: number;
  step: number;
  points: Array<{
    spot: number;
    netGex: number;
  }>;
};

function normalPdf(value: number) {
  return (
    Math.exp(-0.5 * value * value) /
    Math.sqrt(2 * Math.PI)
  );
}

function blackScholesGamma(params: {
  spot: number;
  strike: number;
  volatility: number;
  timeYears: number;
  riskFreeRate: number;
}) {
  const {
    spot,
    strike,
    volatility,
    timeYears,
    riskFreeRate,
  } = params;

  if (
    spot <= 0 ||
    strike <= 0 ||
    volatility <= 0 ||
    timeYears <= 0
  ) {
    return 0;
  }

  const sqrtTime = Math.sqrt(timeYears);

  const d1 =
    (
      Math.log(spot / strike) +
      (
        riskFreeRate +
        0.5 * volatility * volatility
      ) *
        timeYears
    ) /
    (volatility * sqrtTime);

  return (
    normalPdf(d1) /
    (spot * volatility * sqrtTime)
  );
}

function interpolateZero(
  leftSpot: number,
  leftGex: number,
  rightSpot: number,
  rightGex: number
) {
  const denominator =
    rightGex - leftGex;

  if (denominator === 0) {
    return (
      (leftSpot + rightSpot) / 2
    );
  }

  return (
    leftSpot -
    leftGex *
      ((rightSpot - leftSpot) /
        denominator)
  );
}

export function calculateGammaFlip(params: {
  contracts: GammaFlipContract[];
  currentSpot: number;
  timeYears: number;
  riskFreeRate?: number;
  rangePoints?: number;
  step?: number;
}): GammaFlipResult {
  const {
    contracts,
    currentSpot,
    timeYears,
    riskFreeRate = 0.05,
    rangePoints = 200,
    step = 1,
  } = params;

  const scannedFrom = Math.max(
    step,
    Math.floor(
      (currentSpot - rangePoints) /
        step
    ) * step
  );

  const scannedTo =
    Math.ceil(
      (currentSpot + rangePoints) /
        step
    ) * step;

  const eligible = contracts.filter(
    (contract) =>
      contract.strike > 0 &&
      contract.openInterest > 0 &&
      contract.ivPct > 0
  );

  const points: GammaFlipResult["points"] =
    [];

  for (
    let spot = scannedFrom;
    spot <= scannedTo;
    spot += step
  ) {
    let netGex = 0;

    for (const contract of eligible) {
      const volatility =
        contract.ivPct > 3
          ? contract.ivPct / 100
          : contract.ivPct;

      const gamma = blackScholesGamma({
        spot,
        strike: contract.strike,
        volatility,
        timeYears,
        riskFreeRate,
      });

      const unsignedGex =
        gamma *
        contract.openInterest *
        100 *
        spot *
        spot *
        0.01;

      netGex +=
        contract.side === "CALL"
          ? unsignedGex
          : -unsignedGex;
    }

    points.push({
      spot,
      netGex,
    });
  }

  let zeroGamma: number | null = null;

  for (
    let index = 1;
    index < points.length;
    index += 1
  ) {
    const previous = points[index - 1];
    const current = points[index];

    const crossed =
      (previous.netGex <= 0 &&
        current.netGex >= 0) ||
      (previous.netGex >= 0 &&
        current.netGex <= 0);

    if (!crossed) {
      continue;
    }

    zeroGamma = interpolateZero(
      previous.spot,
      previous.netGex,
      current.spot,
      current.netGex
    );

    break;
  }

  return {
    zeroGamma,
    scannedFrom,
    scannedTo,
    step,
    points,
  };
}
