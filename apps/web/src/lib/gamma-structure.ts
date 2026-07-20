export type GammaInputContract = {
  type: "call" | "put";
  strike: number;
  openInterest: number;
  gamma: number;
};

export type GammaLevel = {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  totalGex: number;
  distancePct: number;
};

export type GammaStructure = {
  estimatedFlip: number | null;
  magnet: GammaLevel | null;
  callWall: GammaLevel | null;
  putWall: GammaLevel | null;
  nearestSupport: GammaLevel | null;
  nearestResistance: GammaLevel | null;
  strongestSupport: GammaLevel | null;
  strongestResistance: GammaLevel | null;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildGammaStructure(
  contracts: GammaInputContract[],
  stockPrice: number
): GammaStructure {
  const strikesMap = new Map<
    number,
    { callGex: number; putGex: number }
  >();

  for (const contract of contracts) {
    if (
      contract.strike <= 0 ||
      contract.openInterest <= 0 ||
      contract.gamma === 0 ||
      stockPrice <= 0
    ) {
      continue;
    }

    const estimatedGex =
      Math.abs(contract.gamma) *
      contract.openInterest *
      100 *
      stockPrice *
      stockPrice *
      0.01;

    const current = strikesMap.get(contract.strike) ?? {
      callGex: 0,
      putGex: 0,
    };

    if (contract.type === "call") {
      current.callGex += estimatedGex;
    } else {
      current.putGex += estimatedGex;
    }

    strikesMap.set(contract.strike, current);
  }

  const levels: GammaLevel[] = Array.from(
    strikesMap.entries()
  )
    .map(([strike, values]) => ({
      strike: round(strike),
      callGex: round(values.callGex),
      putGex: round(values.putGex),
      netGex: round(values.callGex - values.putGex),
      totalGex: round(values.callGex + values.putGex),
      distancePct: round(
        (Math.abs(strike - stockPrice) / stockPrice) * 100
      ),
    }))
    .sort((a, b) => a.strike - b.strike);

  const supports = levels.filter(
    (level) =>
      level.strike < stockPrice &&
      level.putGex > 0
  );

  const resistances = levels.filter(
    (level) =>
      level.strike > stockPrice &&
      level.callGex > 0
  );

  const nearestSupport =
    [...supports].sort((a, b) => b.strike - a.strike)[0] ?? null;

  const nearestResistance =
    [...resistances].sort((a, b) => a.strike - b.strike)[0] ?? null;

  const strongestSupport =
    [...supports].sort((a, b) => b.putGex - a.putGex)[0] ?? null;

  const strongestResistance =
    [...resistances].sort((a, b) => b.callGex - a.callGex)[0] ?? null;

  const callWall =
    [...levels].sort((a, b) => b.callGex - a.callGex)[0] ?? null;

  const putWall =
    [...levels].sort((a, b) => b.putGex - a.putGex)[0] ?? null;

  const magnet =
    [...levels].sort((a, b) => b.totalGex - a.totalGex)[0] ?? null;

  const flipCandidates: number[] = [];

  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1];
    const current = levels[index];

    if (
      (previous.netGex <= 0 && current.netGex >= 0) ||
      (previous.netGex >= 0 && current.netGex <= 0)
    ) {
      flipCandidates.push(
        round((previous.strike + current.strike) / 2)
      );
    }
  }

  const estimatedFlip =
    flipCandidates.sort(
      (a, b) =>
        Math.abs(a - stockPrice) -
        Math.abs(b - stockPrice)
    )[0] ?? null;

  return {
    estimatedFlip,
    magnet,
    callWall,
    putWall,
    nearestSupport,
    nearestResistance,
    strongestSupport,
    strongestResistance,
  };
}
