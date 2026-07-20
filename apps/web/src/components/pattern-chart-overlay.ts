import {
  LineSeries,
  LineStyle,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartPatternDrawingPoint = {
  label: string;
  index?: number;
  time: number;
  price: number;
};

export type ChartTopPattern = {
  kind: string;
  status: "FORMING" | "CONFIRMED";
  direction: "CALL" | "PUT";
  breakout: {
    time?: number;
    price: number;
  };
  invalidation: number;
  target1: number;
  target2: number;
  target3: number;
  drawingPoints: ChartPatternDrawingPoint[];
};

type OverlayCleanup = () => void;

type OverlayParams = {
  chart: IChartApi;
  candlesSeries: ISeriesApi<"Candlestick">;
  candles: ChartCandle[];
  interval: number;
  topPattern: ChartTopPattern | null;
  existingLevelPrices: number[];
};

const DAILY_INTERVAL = 1440;
const LEVEL_DUPLICATE_RATIO = 0.0005;

function isFinitePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidTime(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function getPoint(pattern: ChartTopPattern, label: string): ChartPatternDrawingPoint | null {
  return pattern.drawingPoints.find((point) => point.label === label) ?? null;
}

function getOrderedPatternPoints(pattern: ChartTopPattern): ChartPatternDrawingPoint[] {
  const headShouldersLabels = ["LS", "N1", "H", "N2", "RS"];
  const headShouldersPoints = headShouldersLabels
    .map((label) => getPoint(pattern, label))
    .filter((point): point is ChartPatternDrawingPoint => point !== null);

  if (headShouldersPoints.length === headShouldersLabels.length) {
    return headShouldersPoints;
  }

  return [...pattern.drawingPoints]
    .filter((point) => point.label !== "BO")
    .sort((a, b) => a.time - b.time);
}

function hasAllTimesInCandles(points: ChartPatternDrawingPoint[], candleTimes: Set<number>): boolean {
  return points.every((point) => candleTimes.has(point.time));
}

function isDuplicateLevel(price: number, existingLevelPrices: number[]): boolean {
  return existingLevelPrices.some((existingPrice) => {
    if (!isFinitePrice(existingPrice)) {
      return false;
    }

    const tolerance = Math.max(price, existingPrice) * LEVEL_DUPLICATE_RATIO;
    return Math.abs(existingPrice - price) <= tolerance;
  });
}

function getPalette(direction: "CALL" | "PUT") {
  if (direction === "CALL") {
    return {
      pattern: "#22d3ee",
      neckline: "#34d399",
      breakout: "#22d3ee",
      target: "#34d399",
      invalidation: "#f59e0b",
      marker: "#67e8f9",
    };
  }

  return {
    pattern: "#fb7185",
    neckline: "#f43f5e",
    breakout: "#fb7185",
    target: "#f97316",
    invalidation: "#f59e0b",
    marker: "#fda4af",
  };
}

export function createPatternChartOverlay({
  chart,
  candlesSeries,
  candles,
  interval,
  topPattern,
  existingLevelPrices,
}: OverlayParams): OverlayCleanup {
  if (!topPattern || (topPattern.status !== "FORMING" && topPattern.status !== "CONFIRMED")) {
    return () => {};
  }

  if (interval !== DAILY_INTERVAL) {
    return () => {};
  }

  const orderedPoints = getOrderedPatternPoints(topPattern);
  const candleTimes = new Set(candles.map((candle) => candle.time));

  if (
    candles.length === 0 ||
    orderedPoints.length < 2 ||
    !orderedPoints.every((point) => isValidTime(point.time) && isFinitePrice(point.price)) ||
    !hasAllTimesInCandles(orderedPoints, candleTimes) ||
    !topPattern.drawingPoints.every(
      (point) => isValidTime(point.time) && isFinitePrice(point.price) && candleTimes.has(point.time),
    )
  ) {
    return () => {};
  }

  const breakoutPoint = getPoint(topPattern, "BO");
  if (!breakoutPoint || !candleTimes.has(breakoutPoint.time) || !isFinitePrice(breakoutPoint.price)) {
    return () => {};
  }

  const palette = getPalette(topPattern.direction);
  const cleanupTasks: OverlayCleanup[] = [];

  try {
    const patternSeries = chart.addSeries(LineSeries, {
      color: palette.pattern,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    patternSeries.setData(
      orderedPoints.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.price,
      })),
    );

    cleanupTasks.push(() => {
      try {
        chart.removeSeries(patternSeries);
      } catch {
        // Ignore overlay cleanup errors.
      }
    });

    const necklineStart = getPoint(topPattern, "N1");
    const necklineEnd = getPoint(topPattern, "N2");
    if (necklineStart && necklineEnd && candleTimes.has(necklineStart.time) && candleTimes.has(necklineEnd.time)) {
      const necklineSeries = chart.addSeries(LineSeries, {
        color: palette.neckline,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      necklineSeries.setData([
        {
          time: necklineStart.time as UTCTimestamp,
          value: necklineStart.price,
        },
        {
          time: necklineEnd.time as UTCTimestamp,
          value: necklineEnd.price,
        },
        {
          time: breakoutPoint.time as UTCTimestamp,
          value: breakoutPoint.price,
        },
      ]);

      cleanupTasks.push(() => {
        try {
          chart.removeSeries(necklineSeries);
        } catch {
          // Ignore overlay cleanup errors.
        }
      });
    }

    const markerSeries = chart.addSeries(LineSeries, {
      color: palette.marker,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    markerSeries.setData([
      {
        time: breakoutPoint.time as UTCTimestamp,
        value: breakoutPoint.price,
      },
    ]);

    createSeriesMarkers(markerSeries, [
      {
        time: breakoutPoint.time as UTCTimestamp,
        position: "inBar",
        color: palette.marker,
        shape: "circle",
        text: "BO",
      },
    ]);

    cleanupTasks.push(() => {
      try {
        chart.removeSeries(markerSeries);
      } catch {
        // Ignore overlay cleanup errors.
      }
    });

    const levelAnchorSeries = chart.addSeries(LineSeries, {
      color: "rgba(0,0,0,0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    levelAnchorSeries.setData([
      {
        time: candles[0].time as UTCTimestamp,
        value: candles[0].close,
      },
      {
        time: candles[candles.length - 1].time as UTCTimestamp,
        value: candles[candles.length - 1].close,
      },
    ]);

    cleanupTasks.push(() => {
      try {
        chart.removeSeries(levelAnchorSeries);
      } catch {
        // Ignore overlay cleanup errors.
      }
    });

    const levelDefinitions = [
      {
        key: "breakout",
        title: "اختراق النموذج",
        price: topPattern.breakout.price,
        color: palette.breakout,
        lineStyle: LineStyle.Solid,
      },
      {
        key: "invalidation",
        title: "إلغاء النموذج",
        price: topPattern.invalidation,
        color: palette.invalidation,
        lineStyle: LineStyle.Dashed,
      },
      {
        key: "target1",
        title: "هدف النموذج 1",
        price: topPattern.target1,
        color: palette.target,
        lineStyle: LineStyle.Dotted,
      },
      {
        key: "target2",
        title: "هدف النموذج 2",
        price: topPattern.target2,
        color: palette.target,
        lineStyle: LineStyle.Dotted,
      },
      {
        key: "target3",
        title: "هدف النموذج 3",
        price: topPattern.target3,
        color: palette.target,
        lineStyle: LineStyle.Dotted,
      },
    ].filter((level) => {
      return isFinitePrice(level.price) && !isDuplicateLevel(level.price, existingLevelPrices);
    });

    const levelLines: IPriceLine[] = levelDefinitions.map((level) => {
      return levelAnchorSeries.createPriceLine({
        price: level.price,
        color: level.color,
        lineWidth: level.key === "breakout" ? 2 : 1,
        lineStyle: level.lineStyle,
        axisLabelVisible: true,
        title: level.title,
      });
    });

    cleanupTasks.push(() => {
      for (const line of levelLines) {
        try {
          levelAnchorSeries.removePriceLine(line);
        } catch {
          // Ignore overlay cleanup errors.
        }
      }
    });
  } catch {
    for (const cleanup of cleanupTasks.reverse()) {
      cleanup();
    }

    try {
      createSeriesMarkers(candlesSeries, []);
    } catch {
      // Ignore marker reset errors.
    }

    return () => {};
  }

  return () => {
    for (const cleanup of cleanupTasks.reverse()) {
      cleanup();
    }
  };
}
