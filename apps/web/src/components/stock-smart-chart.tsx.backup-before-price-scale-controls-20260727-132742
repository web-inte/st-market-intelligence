"use client";

import {
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useLiveStockPrice,
} from "../lib/live-market";

type TargetLevel = {
  index: number;
  price: number;
};

type StockSmartChartProps = {
  symbol: string;
  currentPrice: number;
  entry: number;
  stop: number;
  targets: TargetLevel[];
  side: "CALL" | "PUT" | "NEUTRAL";
  gammaData?: unknown;
};

type ChartLevel = {
  key: string;
  title: string;
  price: number;
  color: string;
  lineStyle: LineStyle;
  lineWidth: 1 | 2 | 3 | 4;
  axisLabelVisible: boolean;
};

type GammaLevel = {
  price: number;
  strength: number;
};

type TechnicalLevels = {
  support: number[];
  resistance: number[];
};

type ChartCandle = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

const INLINE_GAMMA_LABEL_KEYS =
  new Set([
    "gamma-support",
    "gamma-resistance",
    "gamma-flip",
    "zero-gamma",
    "magnet",
  ]);

function toRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

function safeNumber(
  value: unknown
): number | null {
  const number = Number(value);

  return Number.isFinite(number) &&
    number > 0
    ? number
    : null;
}

function extractPrice(
  value: unknown
): number | null {
  const direct = safeNumber(value);

  if (direct !== null) {
    return direct;
  }

  const object = toRecord(value);

  if (!object) {
    return null;
  }

  const keys = [
    "strike",
    "price",
    "level",
    "value",
    "stockPrice",
    "underlyingPrice",
  ];

  for (const key of keys) {
    const price =
      safeNumber(object[key]);

    if (price !== null) {
      return price;
    }
  }

  return null;
}

function firstValue(
  ...values: unknown[]
) {
  for (const value of values) {
    if (
      value !== null &&
      value !== undefined
    ) {
      return value;
    }
  }

  return null;
}

function readMetric(
  row: Record<string, unknown>,
  side: "CALL" | "PUT"
) {
  const directKeys =
    side === "CALL"
      ? [
          "callGex",
          "callGamma",
          "callExposure",
          "callGammaExposure",
          "call_gex",
        ]
      : [
          "putGex",
          "putGamma",
          "putExposure",
          "putGammaExposure",
          "put_gex",
        ];

  for (const key of directKeys) {
    const value = Number(row[key]);

    if (Number.isFinite(value)) {
      return Math.abs(value);
    }
  }

  const nestedKeys =
    side === "CALL"
      ? ["call", "calls"]
      : ["put", "puts"];

  for (const nestedKey of nestedKeys) {
    const nested =
      toRecord(row[nestedKey]);

    if (!nested) {
      continue;
    }

    for (const key of [
      "gex",
      "gamma",
      "exposure",
      "gammaExposure",
    ]) {
      const value =
        Number(nested[key]);

      if (Number.isFinite(value)) {
        return Math.abs(value);
      }
    }
  }

  return 0;
}

function collectGammaRows(
  value: unknown,
  rows: Record<string, unknown>[],
  depth = 0
) {
  if (depth > 4 || !value) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectGammaRows(
        item,
        rows,
        depth + 1
      )
    );

    return;
  }

  const object = toRecord(value);

  if (!object) {
    return;
  }

  if (extractPrice(object) !== null) {
    rows.push(object);
  }

  for (const key of [
    "rows",
    "items",
    "data",
    "results",
    "levels",
    "gammaLevels",
    "gammaByStrike",
    "strikes",
  ]) {
    if (object[key]) {
      collectGammaRows(
        object[key],
        rows,
        depth + 1
      );
    }
  }
}

function uniqueGammaLevels(
  levels: GammaLevel[]
) {
  const result: GammaLevel[] = [];

  for (const level of levels) {
    const existing = result.find(
      (item) =>
        Math.abs(
          item.price - level.price
        ) < 0.01
    );

    if (!existing) {
      result.push(level);
      continue;
    }

    existing.strength = Math.max(
      existing.strength,
      level.strength
    );
  }

  return result;
}

function extractGammaView(
  gammaData: unknown,
  currentPrice: number
) {
  const root =
    toRecord(gammaData) || {};

  const structure =
    toRecord(root.gammaStructure) ||
    toRecord(root.gamma) ||
    root;

  const walls =
    toRecord(root.walls) ||
    toRecord(structure.walls) ||
    {};

  const callWall = firstValue(
    structure.callWall,
    walls.callWall,
    root.callWall
  );

  const putWall = firstValue(
    structure.putWall,
    walls.putWall,
    root.putWall
  );

  const support = firstValue(
    structure.nearestSupport,
    structure.support,
    root.nearestSupport,
    root.support,
    root.gammaSupport
  );

  const resistance = firstValue(
    structure.nearestResistance,
    structure.resistance,
    root.nearestResistance,
    root.resistance,
    root.gammaResistance
  );

  const magnet = firstValue(
    structure.magnet,
    root.magnet
  );

  const gammaFlip = firstValue(
    structure.estimatedFlip,
    structure.gammaFlip,
    root.gammaFlip,
    root.gammaFlipLevel,
    root.flip
  );

  const zeroGamma = firstValue(
    structure.zeroGamma,
    root.zeroGamma,
    root.zeroGammaLevel
  );

  const rows:
    Record<string, unknown>[] = [];

  [
    root.gammaByStrike,
    root.gammaLevels,
    root.levels,
    structure.gammaByStrike,
    structure.gammaLevels,
    structure.levels,
    structure.nearestSupport,
    structure.nearestResistance,
    structure.strongestSupport,
    structure.strongestResistance,
    root.nearestSupport,
    root.nearestResistance,
    root.strongestSupport,
    root.strongestResistance,
  ].forEach((value) =>
    collectGammaRows(value, rows)
  );

  const callLevels: GammaLevel[] = [];
  const putLevels: GammaLevel[] = [];

  rows.forEach((row) => {
    const price =
      extractPrice(row);

    if (price === null) {
      return;
    }

    const callStrength =
      readMetric(row, "CALL");

    const putStrength =
      readMetric(row, "PUT");

    if (
      callStrength <= 0 &&
      putStrength <= 0
    ) {
      return;
    }

    if (
      callStrength >
      putStrength * 1.05
    ) {
      callLevels.push({
        price,
        strength: callStrength,
      });

      return;
    }

    if (
      putStrength >
      callStrength * 1.05
    ) {
      putLevels.push({
        price,
        strength: putStrength,
      });
    }
  });

  const candidateToLevel = (
    value: unknown,
    levelSide: "CALL" | "PUT"
  ): GammaLevel | null => {
    const price =
      extractPrice(value);

    if (price === null) {
      return null;
    }

    const row =
      toRecord(value);

    const sideStrength =
      row
        ? readMetric(
            row,
            levelSide
          )
        : 0;

    const rawTotal =
      row
        ? Number(
            row.totalGex ??
              row.netGex ??
              row.gex ??
              0
          )
        : 0;

    const totalStrength =
      Number.isFinite(rawTotal)
        ? Math.abs(rawTotal)
        : 0;

    return {
      price,
      strength: Math.max(
        sideStrength,
        totalStrength,
        1
      ),
    };
  };

  /*
   * في الاتجاه المحايد:
   * المقاومات تمثل مستويات Gamma CALL.
   * المساند تمثل مستويات Gamma PUT.
   */
  const neutralCallLevels = [
    structure.nearestResistance,
    structure.strongestResistance,
    root.nearestResistance,
    root.strongestResistance,
  ]
    .map((value) =>
      candidateToLevel(
        value,
        "CALL"
      )
    )
    .filter(
      (
        value
      ): value is GammaLevel =>
        value !== null
    );

  const neutralPutLevels = [
    structure.nearestSupport,
    structure.strongestSupport,
    root.nearestSupport,
    root.strongestSupport,
  ]
    .map((value) =>
      candidateToLevel(
        value,
        "PUT"
      )
    )
    .filter(
      (
        value
      ): value is GammaLevel =>
        value !== null
    );

  const sortLevels = (
    values: GammaLevel[]
  ) =>
    uniqueGammaLevels(values)
      .sort((left, right) => {
        const leftDistance =
          Math.abs(
            left.price -
              currentPrice
          );

        const rightDistance =
          Math.abs(
            right.price -
              currentPrice
          );

        if (
          Math.abs(
            leftDistance -
              rightDistance
          ) > 0.01
        ) {
          return (
            leftDistance -
            rightDistance
          );
        }

        return (
          right.strength -
          left.strength
        );
      })
      .slice(0, 4);

  return {
    callWall,
    putWall,
    support,
    resistance,
    magnet,
    gammaFlip,
    zeroGamma,

    callLevels:
      sortLevels(callLevels),

    putLevels:
      sortLevels(putLevels),

    neutralCallLevels:
      sortLevels(
        neutralCallLevels
      ),

    neutralPutLevels:
      sortLevels(
        neutralPutLevels
      ),
  };
}

function priceFormat(
  value: number
) {
  return Number(value || 0).toFixed(2);
}

export default function StockSmartChart({
  symbol,
  currentPrice,
  entry,
  stop,
  targets,
  side,
  gammaData,
}: StockSmartChartProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const chartRef =
    useRef<IChartApi | null>(null);

  const seriesRef =
    useRef<
      ISeriesApi<"Candlestick"> | null
    >(
      null
    );

  const [
    isExpanded,
    setIsExpanded,
  ] = useState(false);

  const [
    clockNow,
    setClockNow,
  ] = useState(
    () => Date.now()
  );

  const [
    candlesLoading,
    setCandlesLoading,
  ] = useState(true);

  const [
    candlesError,
    setCandlesError,
  ] = useState("");

  const [
    interval,
    setIntervalValue,
  ] = useState<
    5 | 15 | 30 | 60 | 240 | 1440
  >(15);

  useEffect(() => {
    intervalRef.current =
      interval;
  }, [interval]);

  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setClockNow(
            Date.now()
          );
        },
        1_000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleEscape(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [isExpanded]);

  const {
    price: livePrice,
    quote: liveQuote,
  } =
    useLiveStockPrice(symbol);

  const effectiveCurrentPrice =
    livePrice ??
    currentPrice;

  const [
    rawTechnicalLevels,
    setRawTechnicalLevels,
  ] =
    useState<number[]>([]);

  const [
    supportResistanceRefresh,
    setSupportResistanceRefresh,
  ] = useState(0);

  const priceLinesRef =
    useRef<IPriceLine[]>([]);

  const lastCandleRef =
    useRef<ChartCandle | null>(
      null
    );

  const intervalRef =
    useRef<
      5 | 15 | 30 | 60 | 240 | 1440
    >(15);

  const gammaLabelsLayerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  useEffect(() => {
    let cancelled = false;

    const resolution =
      interval === 1440
        ? "D"
        : interval === 240
          ? "60"
          : String(interval);

    async function loadSupportResistance() {
      try {
        const response =
          await fetch(
            `/api/stocks/${encodeURIComponent(
              symbol
            )}/support-resistance?resolution=${encodeURIComponent(
              resolution
            )}`,
            {
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as {
            levels?: unknown[];
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            result.error ||
              "تعذر جلب الدعم والمقاومة"
          );
        }

        if (cancelled) {
          return;
        }

        const levels =
          Array.isArray(
            result.levels
          )
            ? result.levels
                .map(Number)
                .filter(
                  (level) =>
                    Number.isFinite(
                      level
                    ) &&
                    level > 0
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    first -
                    second
                )
            : [];

        setRawTechnicalLevels(
          levels
        );
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Failed to load support/resistance:",
            error
          );

          setRawTechnicalLevels(
            []
          );
        }
      }
    }

    void loadSupportResistance();

    const refreshTimer =
      window.setInterval(
        () => {
          void loadSupportResistance();
        },
        5 * 60_000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        refreshTimer
      );
    };
  }, [
    symbol,
    interval,
    supportResistanceRefresh,
  ]);

  const technicalLevels =
    useMemo<TechnicalLevels>(
      () => {
        const supports =
          rawTechnicalLevels
            .filter(
              (level) =>
                level <
                effectiveCurrentPrice
            )
            .sort(
              (
                first,
                second
              ) =>
                second -
                first
            )
            .slice(0, 2);

        const resistances =
          rawTechnicalLevels
            .filter(
              (level) =>
                level >
                effectiveCurrentPrice
            )
            .sort(
              (
                first,
                second
              ) =>
                first -
                second
            )
            .slice(0, 2);

        return {
          support: supports,
          resistance:
            resistances,
        };
      },
      [
        rawTechnicalLevels,
        effectiveCurrentPrice,
      ]
    );

  useEffect(() => {
    if (
      rawTechnicalLevels.length ===
      0
    ) {
      return;
    }

    if (
      technicalLevels.support
        .length < 2 ||
      technicalLevels.resistance
        .length < 2
    ) {
      const timer =
        window.setTimeout(
          () => {
            setSupportResistanceRefresh(
              (value) =>
                value + 1
            );
          },
          10_000
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    }
  }, [
    rawTechnicalLevels,
    technicalLevels,
  ]);

  const levels = useMemo(() => {
    const result: ChartLevel[] = [];

    const gamma =
      extractGammaView(
        gammaData,
        currentPrice
      );

    const addLevel = (
      key: string,
      title: string,
      rawPrice: unknown,
      color: string,
      lineStyle:
        LineStyle = LineStyle.Solid,
      lineWidth:
        | 1
        | 2
        | 3
        | 4 = 1,
      axisLabelVisible = true
    ) => {
      const price =
        extractPrice(rawPrice);

      if (price === null) {
        return;
      }

      const incomingIsWall =
        key === "call-wall" ||
        key === "put-wall";

      const existing =
        result.find(
          (level) =>
            Math.abs(
              level.price -
                price
            ) < 0.01
        );

      if (existing) {
        const existingIsWall =
          existing.key.includes(
            "wall"
          ) ||
          existing.color ===
            "#fbbf24";

        /*
         * إذا اجتمع جدار CALL وPUT
         * على السعر نفسه، يظهران كجدار
         * ذهبي واحد باسم واضح.
         */
        if (incomingIsWall) {
          const hasCall =
            existing.key.includes(
              "call-wall"
            ) ||
            key === "call-wall";

          const hasPut =
            existing.key.includes(
              "put-wall"
            ) ||
            key === "put-wall";

          existing.key =
            `${existing.key}+${key}`;

          existing.title =
            hasCall && hasPut
              ? "مغناطيس القاما"
              : hasCall
                ? "جدار قاما الكول"
                : "جدار قاما البوت";

          existing.color =
            "#fbbf24";

          existing.lineWidth = 3;

          existing.lineStyle =
            LineStyle.Solid;

          existing.axisLabelVisible =
            true;

          return;
        }

        /*
         * لا نضيف Gamma CALL أو PUT
         * إلى اسم الجدار الذهبي.
         */
        if (existingIsWall) {
          return;
        }

        if (
          !existing.title.includes(
            title
          )
        ) {
          existing.title =
            `${existing.title} / ${title}`;
        }

        return;
      }

      result.push({
        key,
        title,
        price,
        color,
        lineStyle,
        lineWidth,
        axisLabelVisible,
      });
    };

    /*
     * لا توجد صفقة عند الحياد.
     */
    if (side !== "NEUTRAL") {
      addLevel(
        "entry",
        "الدخول",
        entry,
        "#22d3ee",
        LineStyle.Solid,
        2
      );

      addLevel(
        "stop",
        "الوقف",
        stop,
        "#fb7185",
        LineStyle.Solid,
        2
      );

      targets.forEach(
        (
          target,
          targetIndex
        ) => {
          addLevel(
            `target-${target.index}`,
            `الهدف ${
              targetIndex + 1
            }`,
            target.price,
            "#34d399",
            LineStyle.Dashed,
            1
          );
        }
      );
    }

    /*
     * جدارا القاما يظهران بالذهبي
     * في CALL وPUT وNEUTRAL.
     */
    addLevel(
      "call-wall",
      "جدار قاما الكول",
      gamma.callWall,
      "#fbbf24",
      LineStyle.Solid,
      3,
      true
    );

    addLevel(
      "put-wall",
      "جدار قاما البوت",
      gamma.putWall,
      "#fbbf24",
      LineStyle.Solid,
      3,
      true
    );

    if (side === "NEUTRAL") {
      /*
       * عند الاتجاه المحايد:
       * CALL سماوي وPUT وردي.
       */
      gamma.neutralCallLevels.forEach(
        (level, index) => {
          addLevel(
            `neutral-call-${index}`,
            "Gamma CALL",
            level.price,
            "#22d3ee",
            LineStyle.Dashed,
            2,
            true
          );
        }
      );

      gamma.neutralPutLevels.forEach(
        (level, index) => {
          addLevel(
            `neutral-put-${index}`,
            "Gamma PUT",
            level.price,
            "#fb7185",
            LineStyle.Dashed,
            2,
            true
          );
        }
      );
    } else {
      addLevel(
        "gamma-support",
        "دعم Gamma",
        gamma.support,
        "#a78bfa",
        LineStyle.Dashed,
        2,
        true
      );

      addLevel(
        "gamma-resistance",
        "مقاومة Gamma",
        gamma.resistance,
        "#f59e0b",
        LineStyle.Dashed,
        2,
        true
      );

      addLevel(
        "magnet",
        "مغناطيس القاما",
        gamma.magnet,
        "#facc15",
        LineStyle.Dotted,
        2,
        true
      );

      addLevel(
        "gamma-flip",
        "Gamma Flip",
        gamma.gammaFlip,
        "#c084fc",
        LineStyle.SparseDotted,
        2,
        true
      );

      addLevel(
        "zero-gamma",
        "Zero Gamma",
        gamma.zeroGamma,
        "#94a3b8",
        LineStyle.Dotted,
        1,
        true
      );
    }

    technicalLevels.support.forEach(
      (price, index) => {
        addLevel(
          `technical-support-${index + 1}`,
          `دعم ${index + 1}`,
          price,
          index === 0
            ? "#38bdf8"
            : "#7dd3fc",
          LineStyle.Dashed,
          index === 0
            ? 2
            : 1,
          true
        );
      }
    );

    technicalLevels.resistance.forEach(
      (price, index) => {
        addLevel(
          `technical-resistance-${index + 1}`,
          `مقاومة ${index + 1}`,
          price,
          index === 0
            ? "#f97316"
            : "#fdba74",
          LineStyle.Dashed,
          index === 0
            ? 2
            : 1,
          true
        );
      }
    );

    return result;
  }, [
    effectiveCurrentPrice,
    currentPrice,
    entry,
    stop,
    targets,
    side,
    gammaData,
    technicalLevels,
  ]);

  const inlineGammaLevels =
    useMemo(
      () =>
        levels.filter((level) =>
          INLINE_GAMMA_LABEL_KEYS.has(
            level.key
          )
        ),
      [levels]
    );

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(
      container,
      {
        width:
          container.clientWidth,
        height: 480,
        layout: {
          background: {
            type: ColorType.Solid,
            color: "#020617",
          },
          textColor: "#94a3b8",
          fontFamily:
            "Arial, sans-serif",
        },
        grid: {
          vertLines: {
            color:
              "rgba(148, 163, 184, 0.08)",
          },
          horzLines: {
            color:
              "rgba(148, 163, 184, 0.08)",
          },
        },
        crosshair: {
          mode:
            CrosshairMode.Normal,
        },

        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,

          /*
            نترك السحب العمودي للجوال
            لتمرير الصفحة بصورة طبيعية.
          */
          vertTouchDrag: false,
        },

        handleScale: {
          axisPressedMouseMove: {
            time: true,
            price: true,
          },
          mouseWheel: true,
          pinch: true,
        },

        kineticScroll: {
          mouse: true,
          touch: true,
        },

        rightPriceScale: {
          borderColor:
            "rgba(148, 163, 184, 0.18)",
          scaleMargins: {
            top: 0.12,
            bottom: 0.12,
          },
        },
        timeScale: {
          borderColor:
            "rgba(148, 163, 184, 0.18)",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: 8,
        },
        localization: {
          locale: "en-US",
          priceFormatter:
            priceFormat,
        },
      }
    );

    const series =
      chart.addSeries(
        CandlestickSeries,
        {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor:
            "#22c55e",
          borderDownColor:
            "#ef4444",
          wickUpColor:
            "#22c55e",
          wickDownColor:
            "#ef4444",
          priceLineVisible: false,
          lastValueVisible: true,
        }
      );

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver =
      new ResizeObserver(() => {
        chart.applyOptions({
          width:
            container.clientWidth,
          height:
            container.clientHeight,
        });
      });

    resizeObserver.observe(
      container
    );

    return () => {
      resizeObserver.disconnect();

      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
      lastCandleRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart =
      chartRef.current;

    const series =
      seriesRef.current;

    if (!chart || !series) {
      return;
    }

    const candleSeries = series;
    const activeChart = chart;

    let cancelled = false;

    async function loadCandles() {
      setCandlesLoading(true);
      setCandlesError("");

      try {
        const response =
          await fetch(
            `/api/stocks/${encodeURIComponent(
              symbol
            )}/candles?interval=${interval}`,
            {
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as {
            candles?: Array<{
              time: number;
              open: number;
              high: number;
              low: number;
              close: number;
              volume: number;
            }>;
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            result.error ||
              "تعذر جلب الشموع"
          );
        }

        const candles =
          Array.isArray(
            result.candles
          )
            ? result.candles
            : [];

        if (cancelled) {
          return;
        }

        const chartCandles =
          candles.map(
            (candle) => ({
              time:
                candle.time as UTCTimestamp,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            })
          );

        candleSeries.setData(
          chartCandles
        );

        lastCandleRef.current =
          chartCandles.length > 0
            ? chartCandles[
                chartCandles.length - 1
              ]
            : null;

        activeChart
          .timeScale()
          .fitContent();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setCandlesError(
          error instanceof Error
            ? error.message
            : "تعذر جلب الشموع"
        );
      } finally {
        if (!cancelled) {
          setCandlesLoading(false);
        }
      }
    }

    void loadCandles();

    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  useEffect(() => {
    const series =
      seriesRef.current;

    const price =
      Number(livePrice);

    if (
      !series ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return;
    }

    const timestampSeconds =
      Math.floor(
        Number(
          liveQuote?.timestamp ||
            Date.now()
        ) / 1000
      );

    const currentInterval =
      intervalRef.current;

    const intervalSeconds =
      currentInterval * 60;

    const previous =
      lastCandleRef.current;

    let nextCandle: ChartCandle;

    /*
      إذا كان التحديث داخل نفس شمعة الفريم،
      نعدّل الإغلاق والأعلى والأدنى فقط.
    */
    if (
      previous &&
      timestampSeconds >=
        Number(previous.time) &&
      timestampSeconds <
        Number(previous.time) +
          intervalSeconds
    ) {
      nextCandle = {
        ...previous,
        high: Math.max(
          previous.high,
          price
        ),
        low: Math.min(
          previous.low,
          price
        ),
        close: price,
      };
    } else {
      /*
        عند بدء فريم جديد ننشئ شمعة جديدة
        بدون إعادة تحميل الصفحة أو التحليل.
      */
      const bucketTime =
        Math.floor(
          timestampSeconds /
            intervalSeconds
        ) * intervalSeconds;

      nextCandle = {
        time:
          bucketTime as UTCTimestamp,
        open: price,
        high: price,
        low: price,
        close: price,
      };
    }

    series.update(
      nextCandle
    );

    lastCandleRef.current =
      nextCandle;
  }, [
    livePrice,
    liveQuote?.timestamp,
  ]);

  useEffect(() => {
    const series =
      seriesRef.current;

    if (!series) {
      return;
    }

    priceLinesRef.current.forEach(
      (priceLine) => {
        series.removePriceLine(
          priceLine
        );
      }
    );

    priceLinesRef.current =
      levels.map((level) =>
        series.createPriceLine({
          price: level.price,
          color: level.color,
          lineWidth:
            level.lineWidth,
          lineStyle:
            level.lineStyle,
          axisLabelVisible:
            level.axisLabelVisible,
          title:
            INLINE_GAMMA_LABEL_KEYS.has(
              level.key
            )
              ? ""
              : level.title,
        })
      );
  }, [levels]);

  useEffect(() => {
    const layer =
      gammaLabelsLayerRef.current;

    const series =
      seriesRef.current;

    if (!layer || !series) {
      return;
    }

    let animationFrame = 0;
    let active = true;

    function syncGammaLabels() {
      const currentLayer =
        gammaLabelsLayerRef.current;

      const currentSeries =
        seriesRef.current;

      if (
        !currentLayer ||
        !currentSeries
      ) {
        return;
      }

      inlineGammaLevels.forEach(
        (level) => {
          const label =
            currentLayer.querySelector<HTMLElement>(
              `[data-gamma-label="${level.key}"]`
            );

          if (!label) {
            return;
          }

          const coordinate =
            currentSeries.priceToCoordinate(
              level.price
            );

          if (
            coordinate === null ||
            coordinate < 8 ||
            coordinate >
              currentLayer.clientHeight - 8
          ) {
            label.style.display =
              "none";

            return;
          }

          label.style.display =
            "block";

          const labelHeight =
            label.offsetHeight || 12;

          label.style.transform =
            `translate3d(0, ${
              Math.round(
                coordinate -
                  labelHeight / 2
              )
            }px, 0)`;
        }
      );
    }

    function animate() {
      if (!active) {
        return;
      }

      syncGammaLabels();

      animationFrame =
        window.requestAnimationFrame(
          animate
        );
    }

    animationFrame =
      window.requestAnimationFrame(
        animate
      );

    return () => {
      active = false;

      window.cancelAnimationFrame(
        animationFrame
      );
    };
  }, [inlineGammaLevels]);

  useEffect(() => {
    const chart =
      chartRef.current;

    const container =
      containerRef.current;

    if (!chart || !container) {
      return;
    }

    const frame =
      window.requestAnimationFrame(
        () => {
          chart.applyOptions({
            width:
              container.clientWidth,
            height:
              container.clientHeight,
          });
        }
      );

    return () => {
      window.cancelAnimationFrame(
        frame
      );
    };
  }, [isExpanded]);

  function fitChartContent() {
    chartRef.current
      ?.timeScale()
      .fitContent();
  }

  function scrollToLatestCandle() {
    chartRef.current
      ?.timeScale()
      .scrollToRealTime();
  }

  const intervalSeconds =
    interval * 60;

  const nowSeconds =
    Math.floor(
      clockNow / 1000
    );

  const currentBucketStart =
    Math.floor(
      nowSeconds /
        intervalSeconds
    ) * intervalSeconds;

  const candleCloseTime =
    currentBucketStart +
    intervalSeconds;

  const secondsRemaining =
    Math.max(
      0,
      candleCloseTime -
        nowSeconds
    );

  const countdownHours =
    Math.floor(
      secondsRemaining /
        3_600
    );

  const countdownMinutes =
    Math.floor(
      (
        secondsRemaining %
        3_600
      ) / 60
    );

  const countdownSeconds =
    secondsRemaining % 60;

  const candleCountdown =
    countdownHours > 0
      ? [
          countdownHours,
          countdownMinutes,
          countdownSeconds,
        ]
          .map((value) =>
            String(value).padStart(
              2,
              "0"
            )
          )
          .join(":")
      : [
          countdownMinutes,
          countdownSeconds,
        ]
          .map((value) =>
            String(value).padStart(
              2,
              "0"
            )
          )
          .join(":");

  const intervalLabel =
    interval === 1440
      ? "1D"
      : interval === 240
        ? "4H"
        : interval === 60
          ? "1H"
          : `${interval}m`;

  const displayedLivePrice =
    livePrice ??
    currentPrice;

  const directionLabel =
    side === "CALL"
      ? "سيناريو صاعد — صفقة CALL"
      : side === "PUT"
        ? "سيناريو هابط — صفقة PUT"
        : "اتجاه محايد — لا توجد صفقة حتى يتحول الاتجاه إلى CALL أو PUT";

  return (
    <section
      className={[
        "overflow-hidden border border-cyan-400/15 bg-slate-950 shadow-2xl shadow-cyan-950/10",
        isExpanded
          ? "fixed inset-0 z-[100] m-0 rounded-none"
          : "mb-5 rounded-3xl",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold text-cyan-400">
            الشارت الذكي
          </p>

          <h2 className="mt-2 text-2xl font-black text-white">
            {symbol} — حركة السعر والمستويات
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-1.5 text-sm font-black text-emerald-300">
              مباشر $
              {priceFormat(
                displayedLivePrice
              )}
            </span>

            <span className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-1.5 text-xs font-black text-cyan-300">
              فريم {intervalLabel}
            </span>

            <span
              className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-1.5 font-mono text-xs font-black tabular-nums text-amber-300"
              title="الوقت المتبقي حتى إغلاق الشمعة الحالية"
              dir="ltr"
            >
              إغلاق الشمعة خلال{" "}
              {candleCountdown}
            </span>
          </div>

          <p
            className={[
              "mt-2 text-sm font-bold",
              side === "NEUTRAL"
                ? "text-amber-300"
                : "text-slate-400",
            ].join(" ")}
          >
            {directionLabel}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            [5, "5m"],
            [15, "15m"],
            [30, "30m"],
            [60, "1H"],
            [240, "4H"],
            [1440, "1D"],
          ].map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setIntervalValue(
                    value as
                      | 5
                      | 15
                      | 30
                      | 60
                      | 240
                      | 1440
                  )
                }
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-black transition",
                  interval === value
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                    : "border-white/[0.07] bg-slate-900/70 text-slate-400 hover:text-white",
                ].join(" ")}
              >
                {label}
              </button>
            )
          )}

          <span className="mx-1 hidden h-8 w-px bg-white/[0.08] sm:block" />

          <button
            type="button"
            onClick={fitChartContent}
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            title="إظهار جميع الشموع"
          >
            ملاءمة
          </button>

          <button
            type="button"
            onClick={
              scrollToLatestCandle
            }
            className="rounded-xl border border-white/[0.08] bg-slate-900/70 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            title="العودة إلى آخر شمعة"
          >
            آخر شمعة
          </button>

          <button
            type="button"
            onClick={() =>
              setIsExpanded(
                (current) => !current
              )
            }
            className={[
              "rounded-xl border px-3 py-2 text-xs font-black transition",
              isExpanded
                ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                : "border-white/[0.08] bg-slate-900/70 text-slate-300 hover:border-cyan-400/30 hover:text-cyan-300",
            ].join(" ")}
            title={
              isExpanded
                ? "إغلاق وضع الشاشة الكاملة"
                : "تكبير الشارت"
            }
          >
            {isExpanded
              ? "إغلاق"
              : "تكبير"}
          </button>
        </div>
      </div>

      {side === "NEUTRAL" ? (
        <div className="mx-5 mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm font-bold leading-7 text-amber-200">
          الاتجاه محايد حاليًا. تظهر مستويات Gamma CALL وGamma PUT للمراقبة فقط، ولا يوجد دخول أو وقف أو أهداف حتى يتحول الاتجاه.
        </div>
      ) : null}

      <div className="relative">
        <div
          className={[
            "relative w-full",
            isExpanded
              ? "h-[calc(100dvh-190px)] min-h-[420px]"
              : "h-[420px] sm:h-[480px] lg:h-[560px]",
          ].join(" ")}
        >
          {candlesLoading ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/35 text-sm font-bold text-slate-300">
              جارٍ تحميل الشموع...
            </div>
          ) : null}

          {candlesError ? (
            <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-300">
              {candlesError}
            </div>
          ) : null}

          <div
            ref={containerRef}
            className="h-full w-full"
            dir="ltr"
          />

          <div
            ref={gammaLabelsLayerRef}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            aria-hidden="true"
          >
            {inlineGammaLevels.map(
              (level) => (
                <span
                  key={`inline-${level.key}-${level.price}`}
                  data-gamma-label={
                    level.key
                  }
                  dir="rtl"
                  className="absolute right-[86px] top-0 hidden whitespace-nowrap text-[10px] font-black leading-none [will-change:transform] sm:right-[96px] sm:text-xs"
                  style={{
                    color: level.color,
                    textShadow:
                      "0 1px 3px #020617, 0 -1px 3px #020617",
                  }}
                >
                  {level.title}
                </span>
              )
            )}
          </div>

        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] p-4">
        {levels.map((level) => (
          <span
            key={`${level.key}-${level.price}`}
            className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-xs text-slate-300"
          >
            {level.title}: $
            {priceFormat(level.price)}
          </span>
        ))}
      </div>
    </section>
  );
}
