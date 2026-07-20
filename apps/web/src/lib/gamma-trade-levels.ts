import type {
  GammaLevel,
  GammaStructure,
} from "./gamma-structure";

export type GammaTradeSide =
  | "CALL"
  | "PUT";

export type GammaTradeTarget = {
  index: number;
  price: number;
  movePct: number;
  probability: number;
  strength: number;
  level: string;
  source: "GAMMA" | "ESTIMATED";
};

function numberValue(
  value: unknown,
  fallback = 0
) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
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

function fallbackMovePercentages(
  score: number
) {
  const safeScore =
    clamp(score, 0, 100);

  const baseMove =
    0.8 +
    (safeScore / 100) * 0.9;

  return [
    baseMove,
    baseMove * 1.75,
    baseMove * 2.6,
  ];
}

function fallbackStopMove(
  score: number
) {
  const safeScore =
    clamp(score, 0, 100);

  return (
    0.7 +
    ((100 - safeScore) / 100) *
      0.5
  );
}

function gammaStrength(
  level: GammaLevel,
  maximumStrength: number
) {
  const rawStrength =
    Math.abs(
      numberValue(level.totalGex)
    );

  if (maximumStrength <= 0) {
    return 0;
  }

  return clamp(
    Math.round(
      (rawStrength /
        maximumStrength) *
        100
    ),
    0,
    100
  );
}

function uniqueLevels(
  levels: Array<{
    level: GammaLevel;
    name: string;
  }>
) {
  const seen =
    new Set<string>();

  return levels.filter(
    ({ level }) => {
      const key =
        numberValue(
          level.strike
        ).toFixed(2);

      if (
        numberValue(
          level.strike
        ) <= 0 ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

export function buildGammaStopPrice(
  gamma: GammaStructure,
  side: GammaTradeSide,
  entryPrice: number,
  score: number
) {
  const candidates =
    side === "CALL"
      ? [
          gamma.nearestSupport,
          gamma.strongestSupport,
          gamma.putWall,
          gamma.magnet,
        ]
      : [
          gamma.nearestResistance,
          gamma.strongestResistance,
          gamma.callWall,
          gamma.magnet,
        ];

  const directionalCandidates =
    candidates
      .filter(
        (
          level
        ): level is GammaLevel =>
          Boolean(level)
      )
      .map((level) =>
        numberValue(level.strike)
      )
      .filter((price) => {
        if (price <= 0) {
          return false;
        }

        const correctDirection =
          side === "CALL"
            ? price < entryPrice
            : price > entryPrice;

        const distancePct =
          Math.abs(
            ((price -
              entryPrice) /
              entryPrice) *
              100
          );

        return (
          correctDirection &&
          distancePct >= 0.45 &&
          distancePct <= 2.8
        );
      })
      .sort(
        (first, second) =>
          Math.abs(
            first - entryPrice
          ) -
          Math.abs(
            second - entryPrice
          )
      );

  const wall =
    directionalCandidates[0];

  if (wall) {
    const bufferedStop =
      side === "CALL"
        ? wall * 0.9985
        : wall * 1.0015;

    const distancePct =
      Math.abs(
        ((bufferedStop -
          entryPrice) /
          entryPrice) *
          100
      );

    if (
      distancePct >= 0.55 &&
      distancePct <= 3
    ) {
      return round(
        bufferedStop
      );
    }
  }

  const stopMove =
    fallbackStopMove(score);

  return round(
    entryPrice *
      (
        1 -
        (
          side === "PUT"
            ? -1
            : 1
        ) *
          (stopMove / 100)
      )
  );
}

export function buildGammaTargets(
  gamma: GammaStructure,
  side: GammaTradeSide,
  entryPrice: number,
  stopPrice: number,
  score: number
): GammaTradeTarget[] {
  const stopDistancePct =
    entryPrice > 0 &&
    stopPrice > 0
      ? Math.abs(
          ((entryPrice -
            stopPrice) /
            entryPrice) *
            100
        )
      : fallbackStopMove(
          score
        );

  const minimumTargetMovePct =
    Math.max(
      0.75,
      stopDistancePct * 1.35
    );

  const maximumTargetMovePct =
    Math.min(
      5,
      Math.max(
        3,
        stopDistancePct * 3.5
      )
    );

  const candidates =
    side === "CALL"
      ? [
          {
            level:
              gamma.nearestResistance,
            name:
              "NEAREST_RESISTANCE",
          },
          {
            level:
              gamma.strongestResistance,
            name:
              "STRONGEST_RESISTANCE",
          },
          {
            level:
              gamma.callWall,
            name:
              "CALL_WALL",
          },
          {
            level:
              gamma.magnet,
            name:
              "MAGNET",
          },
        ]
      : [
          {
            level:
              gamma.nearestSupport,
            name:
              "NEAREST_SUPPORT",
          },
          {
            level:
              gamma.strongestSupport,
            name:
              "STRONGEST_SUPPORT",
          },
          {
            level:
              gamma.putWall,
            name:
              "PUT_WALL",
          },
          {
            level:
              gamma.magnet,
            name:
              "MAGNET",
          },
        ];

  const usableLevels =
    uniqueLevels(
      candidates.filter(
        (
          item
        ): item is {
          level: GammaLevel;
          name: string;
        } =>
          Boolean(item.level)
      )
    )
      .map(
        ({
          level,
          name,
        }) => {
          const price =
            numberValue(
              level.strike
            );

          const movePct =
            Math.abs(
              ((price -
                entryPrice) /
                entryPrice) *
                100
            );

          return {
            level,
            name,
            price,
            movePct,
          };
        }
      )
      .filter((item) => {
        const correctDirection =
          side === "CALL"
            ? item.price >
              entryPrice
            : item.price <
              entryPrice;

        return (
          correctDirection &&
          item.movePct >=
            minimumTargetMovePct &&
          item.movePct <=
            maximumTargetMovePct
        );
      })
      .sort(
        (left, right) =>
          left.movePct -
          right.movePct
      );

  const maximumStrength =
    Math.max(
      0,
      ...usableLevels.map(
        ({ level }) =>
          Math.abs(
            numberValue(
              level.totalGex
            )
          )
      )
    );

  const targets:
    GammaTradeTarget[] =
    usableLevels
      .slice(0, 3)
      .map(
        (
          {
            level,
            name,
            price,
            movePct,
          },
          index
        ) => {
          const strength =
            gammaStrength(
              level,
              maximumStrength
            );

          return {
            index:
              index + 1,
            price:
              round(price),
            movePct:
              round(movePct),
            probability:
              clamp(
                Math.round(
                  score * 0.72 +
                    strength *
                      0.28 -
                    movePct * 3
                ),
                10,
                95
              ),
            strength,
            level:
              name,
            source:
              "GAMMA",
          };
        }
      );

  const fallbackPercentages =
    fallbackMovePercentages(
      score
    ).map((value) =>
      Math.min(value, 5)
    );

  for (
    let index = 0;
    targets.length < 3 &&
    index <
      fallbackPercentages.length;
    index += 1
  ) {
    const movePct =
      fallbackPercentages[
        index
      ];

    const direction =
      side === "PUT"
        ? -1
        : 1;

    const price =
      entryPrice *
      (
        1 +
        direction *
          (movePct / 100)
      );

    if (
      targets.some(
        (target) =>
          Math.abs(
            target.price -
              price
          ) < 0.01
      )
    ) {
      continue;
    }

    targets.push({
      index:
        targets.length + 1,
      price:
        round(price),
      movePct:
        round(movePct),
      probability:
        clamp(
          Math.round(
            score -
              targets.length * 9
          ),
          10,
          99
        ),
      strength: 0,
      level:
        "ESTIMATED",
      source:
        "ESTIMATED",
    });
  }

  return targets.map(
    (target, index) => ({
      ...target,
      index:
        index + 1,
    })
  );
}
