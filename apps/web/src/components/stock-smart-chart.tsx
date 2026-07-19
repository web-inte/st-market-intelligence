"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
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

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

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
    useRef<ISeriesApi<"Candlestick"> | null>(
      null
    );

  const priceLinesRef =
    useRef<IPriceLine[]>([]);

  const currentPriceLineRef =
    useRef<IPriceLine | null>(null);

  const gammaLabelsLayerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [candles, setCandles] =
    useState<Candle[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [interval, setIntervalValue] =
    useState(15);

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

    return result;
  }, [
    currentPrice,
    entry,
    stop,
    targets,
    side,
    gammaData,
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
    let cancelled = false;

    async function loadCandles() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/stocks/${encodeURIComponent(
            symbol
          )}/candles?interval=${interval}`,
          {
            cache: "no-store",
          }
        );

        const payload =
          await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error ||
              "تعذر تحميل الشارت."
          );
        }

        if (!cancelled) {
          setCandles(
            Array.isArray(
              payload?.candles
            )
              ? payload.candles
              : []
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل الشارت."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCandles();

    const refreshTimer =
      window.setInterval(
        loadCandles,
        60_000
      );

    return () => {
      cancelled = true;

      window.clearInterval(
        refreshTimer
      );
    };
  }, [symbol, interval]);

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
          upColor: "#10b981",
          downColor: "#f43f5e",
          wickUpColor: "#34d399",
          wickDownColor:
            "#fb7185",
          borderVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        }
      );

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver =
      new ResizeObserver(() => {
        chart.applyOptions({
          width:
            container.clientWidth,
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
      priceLinesRef.current = [];
      currentPriceLineRef.current =
        null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series =
      seriesRef.current;

    if (
      !chart ||
      !series ||
      candles.length === 0
    ) {
      return;
    }

    series.setData(
      candles.map((candle) => ({
        time:
          candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }))
    );

    if (
      currentPriceLineRef.current
    ) {
      series.removePriceLine(
        currentPriceLineRef.current
      );
    }

    const latestClose = Number(
      candles[
        candles.length - 1
      ]?.close || 0
    );

    if (
      Number.isFinite(latestClose) &&
      latestClose > 0
    ) {
      currentPriceLineRef.current =
        series.createPriceLine({
          price: latestClose,
          color: "#ffffff",
          lineWidth: 2,
          lineStyle:
            LineStyle.Dotted,
          axisLabelVisible: true,
          title: "السعر الحالي",
        });
    }

    chart
      .timeScale()
      .fitContent();
  }, [candles]);

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

  const directionLabel =
    side === "CALL"
      ? "سيناريو صاعد — صفقة CALL"
      : side === "PUT"
        ? "سيناريو هابط — صفقة PUT"
        : "اتجاه محايد — لا توجد صفقة حتى يتحول الاتجاه إلى CALL أو PUT";

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-cyan-400/15 bg-slate-950 shadow-2xl shadow-cyan-950/10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold text-cyan-400">
            الشارت الذكي
          </p>

          <h2 className="mt-2 text-2xl font-black text-white">
            {symbol} — حركة السعر والمستويات
          </h2>

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
          {[5, 15, 30, 60].map(
            (value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setIntervalValue(
                    value
                  )
                }
                className={[
                  "rounded-xl border px-3 py-2 text-xs font-bold transition",
                  interval === value
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                    : "border-white/[0.07] bg-white/[0.03] text-slate-400 hover:text-white",
                ].join(" ")}
              >
                {value === 60
                  ? "ساعة"
                  : `${value} د`}
              </button>
            )
          )}
        </div>
      </div>

      {side === "NEUTRAL" ? (
        <div className="mx-5 mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm font-bold leading-7 text-amber-200">
          الاتجاه محايد حاليًا. تظهر مستويات Gamma CALL وGamma PUT للمراقبة فقط، ولا يوجد دخول أو وقف أو أهداف حتى يتحول الاتجاه.
        </div>
      ) : null}

      <div className="relative">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 text-sm font-bold text-cyan-300">
            جاري تحميل شموع {symbol}...
          </div>
        ) : null}

        {error ? (
          <div className="m-5 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-5 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="relative h-[480px] w-full">
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
