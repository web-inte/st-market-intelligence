"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Bias = "CALL" | "PUT" | "NEUTRAL";
type GammaRegime = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

type Contract = {
  ticker: string;
  side: "call" | "put";
  strike: number;
  expiration: string;
  dte: number;
  price: number | null;
  bid: number | null;
  ask: number | null;
  midpoint: number | null;
  spreadPct: number | null;
  volume: number;
  openInterest: number;
  volumeOi: number | null;
  impliedVolatilityPct: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  gex: number;
  tradeSize: number | null;
  timeframe: string | null;
  score: number;
  quality: string;
  reasons: string[];
};

type StrikeRow = {
  strike: number;
  callVolume: number;
  putVolume: number;
  totalVolume: number;
  callOi: number;
  putOi: number;
  totalOi: number;
  callGex: number;
  putGex: number;
  netGex: number;
  totalAbsGex: number;
  callIvPct: number | null;
  putIvPct: number | null;
  expirations: string[];
  contracts: number;
  distanceFromSpotPct: number;
  strength: number;
  level: string;
};

type Wall = {
  strike: number;
  role: string;
  gex: number;
  openInterest: number;
  volume: number;
};

type Magnet = {
  strike: number;
  totalOpenInterest: number;
  totalVolume: number;
  netGex: number;
};

type GammaLiquidityResponse = {
  ok: boolean;
  symbol: string;
  updatedAt: string;
  spotPrice: number;
  source: string;
  timeframe: string[];

  summary: {
    bias: Bias;
    directionalScore: number;
    confidence: string;

    callVolume: number;
    putVolume: number;
    totalVolume: number;

    callVolumePct: number;
    putVolumePct: number;
    callPutVolumeRatio: number | null;

    callOpenInterest: number;
    putOpenInterest: number;
    totalOpenInterest: number;

    callOpenInterestPct: number;
    putOpenInterestPct: number;
    callPutOpenInterestRatio: number | null;

    reasons: string[];
    risks: string[];
  };

  gamma: {
    callGex: number;
    putGex: number;
    netGex: number;
    regime: GammaRegime;
    regimeRatio: number;
    estimatedGammaFlip: number | null;
    formula: string;
    coveragePct: number;
  };

  ivSkew: {
    callIvPct: number | null;
    putIvPct: number | null;
    putMinusCallPoints: number | null;
    direction: string;
  };

  walls: {
    callWall: Wall | null;
    putWall: Wall | null;
    magnet: Magnet | null;
  };

  bestContracts: {
    calls: Contract[];
    puts: Contract[];
  };

  strikes: StrikeRow[];

  meta: {
    contractsProcessed: number;
    pagesFetched: number;
    paginationTruncated: boolean;
    gammaCoveragePct: number;
    quoteCoveragePct: number;
    disclaimer: string;
  };

  error?: string;
  details?: string;
};

function normalizeSymbol(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 10);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(2);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${formatCompact(value)}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function biasText(bias: Bias) {
  if (bias === "CALL") {
    return "اتجاه صاعد";
  }

  if (bias === "PUT") {
    return "اتجاه هابط";
  }

  return "اتجاه محايد";
}

function regimeText(regime: GammaRegime) {
  if (regime === "POSITIVE") {
    return "قاما موجبة";
  }

  if (regime === "NEGATIVE") {
    return "قاما سالبة";
  }

  return "قاما متعادلة";
}

function skewText(direction: string) {
  if (direction === "CALL_PREMIUM") {
    return "علاوة CALL أعلى";
  }

  if (direction === "PUT_PREMIUM") {
    return "علاوة PUT أعلى";
  }

  if (direction === "BALANCED") {
    return "توازن في التقلب";
  }

  return "غير متوفر";
}

function levelText(level: string) {
  return level
    .replace("CALL_WALL", "جدار CALL")
    .replace("PUT_WALL", "جدار PUT")
    .replace("MAGNET", "مغناطيس")
    .replace("NORMAL", "عادي")
    .replaceAll("+", " + ");
}

function biasBadgeClass(bias: Bias) {
  if (bias === "CALL") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (bias === "PUT") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  }

  return "border-slate-400/30 bg-slate-400/10 text-slate-300";
}

function regimeBadgeClass(regime: GammaRegime) {
  if (regime === "POSITIVE") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";
  }

  if (regime === "NEGATIVE") {
    return "border-orange-400/30 bg-orange-400/10 text-orange-300";
  }

  return "border-slate-400/30 bg-slate-400/10 text-slate-300";
}

function Card({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
      <p className="text-xs text-slate-400">{title}</p>

      <p className="mt-2 text-xl font-bold text-white">
        {value}
      </p>

      {subtitle ? (
        <p className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function ProgressBar({
  callPct,
  putPct,
}: {
  callPct: number;
  putPct: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-emerald-300">
          CALL {formatPercent(callPct)}
        </span>

        <span className="text-rose-300">
          PUT {formatPercent(putPct)}
        </span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="bg-emerald-400"
          style={{
            width: `${Math.max(0, Math.min(100, callPct))}%`,
          }}
        />

        <div
          className="bg-rose-400"
          style={{
            width: `${Math.max(0, Math.min(100, putPct))}%`,
          }}
        />
      </div>
    </div>
  );
}

function WallCard({
  title,
  wall,
  tone,
}: {
  title: string;
  wall: Wall | null;
  tone: "call" | "put";
}) {
  const toneClass =
    tone === "call"
      ? "border-emerald-400/20 bg-emerald-400/[0.06]"
      : "border-rose-400/20 bg-rose-400/[0.06]";

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <p className="text-sm text-slate-300">{title}</p>

      {wall ? (
        <>
          <p className="mt-3 text-3xl font-black text-white">
            {formatPrice(wall.strike)}
          </p>

          <p className="mt-1 text-sm text-slate-400">
            الدور: {wall.role}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500">GEX</p>
              <p className="mt-1 font-semibold text-white">
                {formatSigned(wall.gex)}
              </p>
            </div>

            <div>
              <p className="text-slate-500">OI</p>
              <p className="mt-1 font-semibold text-white">
                {formatCompact(wall.openInterest)}
              </p>
            </div>

            <div>
              <p className="text-slate-500">Volume</p>
              <p className="mt-1 font-semibold text-white">
                {formatCompact(wall.volume)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          لا توجد بيانات كافية.
        </p>
      )}
    </div>
  );
}

function ContractCard({
  contract,
}: {
  contract: Contract;
}) {
  const isCall = contract.side === "call";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isCall
          ? "border-emerald-400/20 bg-emerald-400/[0.05]"
          : "border-rose-400/20 bg-rose-400/[0.05]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className={`rounded-full border px-2 py-1 text-xs font-bold ${
              isCall
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-rose-400/30 bg-rose-400/10 text-rose-300"
            }`}
          >
            {isCall ? "CALL" : "PUT"}
          </span>

          <p className="mt-3 text-xl font-black text-white">
            {formatPrice(contract.strike)}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {contract.expiration} • {contract.dte} يوم
          </p>
        </div>

        <div className="text-left">
          <p className="text-2xl font-black text-white">
            {contract.score}
          </p>

          <p className="text-xs text-slate-400">
            {contract.quality}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">سعر العقد</p>
          <p className="mt-1 font-semibold text-white">
            ${formatPrice(contract.price)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Bid / Ask</p>
          <p className="mt-1 font-semibold text-white">
            {formatPrice(contract.bid)} / {formatPrice(contract.ask)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Volume</p>
          <p className="mt-1 font-semibold text-white">
            {formatCompact(contract.volume)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Open Interest</p>
          <p className="mt-1 font-semibold text-white">
            {formatCompact(contract.openInterest)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Volume / OI</p>
          <p className="mt-1 font-semibold text-white">
            {formatNumber(contract.volumeOi)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">السبريد</p>
          <p className="mt-1 font-semibold text-white">
            {formatPercent(contract.spreadPct)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">Delta</p>
          <p className="mt-1 font-semibold text-white">
            {formatNumber(contract.delta)}
          </p>
        </div>

        <div>
          <p className="text-slate-500">IV</p>
          <p className="mt-1 font-semibold text-white">
            {formatPercent(contract.impliedVolatilityPct)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {contract.reasons.map((reason) => (
          <span
            key={reason}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300"
          >
            {reason}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function GammaLiquidityPage() {
  const [query, setQuery] = useState("NVDA");
  const [activeSymbol, setActiveSymbol] = useState("NVDA");

  const [data, setData] =
    useState<GammaLiquidityResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSymbol = useCallback(async (rawSymbol: string) => {
    const symbol = normalizeSymbol(rawSymbol);

    if (!symbol) {
      setError("اكتب رمز سهم صحيح.");
      return;
    }

    setLoading(true);
    setError("");
    setActiveSymbol(symbol);

    try {
      const response = await fetch(
        `/api/gamma-liquidity/${encodeURIComponent(symbol)}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const result =
        (await response.json()) as GammaLiquidityResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error ||
            result.details ||
            "تعذر تحميل بيانات القاما والسيولة.",
        );
      }

      setData(result);
      setQuery(symbol);

      const url = new URL(window.location.href);

      url.searchParams.set("symbol", symbol);

      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}`,
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "حدث خطأ غير معروف.";

      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(
      window.location.search,
    );

    const initialSymbol =
      normalizeSymbol(searchParams.get("symbol") || "NVDA") ||
      "NVDA";

    setQuery(initialSymbol);

    void loadSymbol(initialSymbol);
  }, [loadSymbol]);

  const displayedStrikes = useMemo(() => {
    if (!data?.strikes?.length) {
      return [];
    }

    return [...data.strikes]
      .sort(
        (a, b) =>
          Math.abs(a.distanceFromSpotPct) -
          Math.abs(b.distanceFromSpotPct),
      )
      .slice(0, 60)
      .sort((a, b) => a.strike - b.strike);
  }, [data]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void loadSymbol(query);
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#050816] text-white"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -left-40 top-80 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur sm:p-7">
          <div className="mb-5">
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"
            >
              ← العودة للقائمة الرئيسية
            </a>
          </div>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  ● LIVE
                </span>

                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
                  Massive Option Chain
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-black sm:text-4xl">
                القاما والسيولة
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
                تحليل سلسلة الأوبشن، الجدران، المغناطيس، صافي
                القاما، تدفق CALL وPUT وأفضل العقود.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-xl flex-col gap-3 sm:flex-row"
            >
              <input
                value={query}
                onChange={(event) =>
                  setQuery(normalizeSymbol(event.target.value))
                }
                placeholder="اكتب رمز السهم مثل NVDA"
                className="h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-left font-bold uppercase text-white outline-none transition placeholder:text-right placeholder:font-normal placeholder:text-slate-600 focus:border-cyan-400/50"
                dir="ltr"
              />

              <button
                type="submit"
                disabled={loading}
                className="h-12 rounded-xl bg-cyan-400 px-6 font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "جارٍ التحليل..." : "تحليل الرمز"}
              </button>
            </form>
          </div>
        </header>

        {loading ? (
          <section className="mt-6 flex min-h-[420px] items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-cyan-400/20 border-t-cyan-400" />

              <p className="mt-5 font-bold text-white">
                جارٍ تحليل {activeSymbol}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                يتم جلب سلسلة الأوبشن وحساب القاما والسيولة.
              </p>
            </div>
          </section>
        ) : error ? (
          <section className="mt-6 rounded-3xl border border-rose-400/20 bg-rose-400/[0.06] p-6">
            <p className="font-bold text-rose-300">
              تعذر إكمال التحليل
            </p>

            <p className="mt-2 text-sm leading-7 text-slate-300">
              {error}
            </p>

            <button
              type="button"
              onClick={() => void loadSymbol(activeSymbol)}
              className="mt-5 rounded-xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white"
            >
              إعادة المحاولة
            </button>
          </section>
        ) : data ? (
          <>
            <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">
                      التحليل الحالي
                    </p>

                    <div className="mt-2 flex items-end gap-3">
                      <h2 className="text-4xl font-black">
                        {data.symbol}
                      </h2>

                      <span className="pb-1 text-lg font-bold text-slate-300">
                        ${formatPrice(data.spotPrice)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border px-3 py-1.5 text-sm font-bold ${biasBadgeClass(
                        data.summary.bias,
                      )}`}
                    >
                      {biasText(data.summary.bias)}
                    </span>

                    <span
                      className={`rounded-full border px-3 py-1.5 text-sm font-bold ${regimeBadgeClass(
                        data.gamma.regime,
                      )}`}
                    >
                      {regimeText(data.gamma.regime)}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card
                    title="درجة الاتجاه"
                    value={`${data.summary.directionalScore}`}
                    subtitle="من -100 إلى +100"
                  />

                  <Card
                    title="الثقة"
                    value={data.summary.confidence}
                  />

                  <Card
                    title="صافي GEX"
                    value={formatSigned(data.gamma.netGex)}
                  />

                  <Card
                    title="Gamma Flip"
                    value={formatPrice(
                      data.gamma.estimatedGammaFlip,
                    )}
                  />
                </div>

                <div className="mt-6">
                  <ProgressBar
                    callPct={data.summary.callVolumePct}
                    putPct={data.summary.putVolumePct}
                  />
                </div>

                <p className="mt-5 text-xs text-slate-500">
                  آخر تحديث: {formatDate(data.updatedAt)}
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur sm:p-6">
                <p className="text-sm font-bold text-white">
                  أسباب الاتجاه
                </p>

                <div className="mt-4 space-y-3">
                  {data.summary.reasons.length ? (
                    data.summary.reasons.map((reason) => (
                      <div
                        key={reason}
                        className="flex gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
                      >
                        <span className="text-cyan-300">✓</span>

                        <p className="text-sm leading-6 text-slate-300">
                          {reason}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      لا توجد أفضلية اتجاهية واضحة حاليًا.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Card
                title="CALL Volume"
                value={formatCompact(data.summary.callVolume)}
                subtitle={formatPercent(
                  data.summary.callVolumePct,
                )}
              />

              <Card
                title="PUT Volume"
                value={formatCompact(data.summary.putVolume)}
                subtitle={formatPercent(
                  data.summary.putVolumePct,
                )}
              />

              <Card
                title="CALL OI"
                value={formatCompact(
                  data.summary.callOpenInterest,
                )}
                subtitle={formatPercent(
                  data.summary.callOpenInterestPct,
                )}
              />

              <Card
                title="PUT OI"
                value={formatCompact(
                  data.summary.putOpenInterest,
                )}
                subtitle={formatPercent(
                  data.summary.putOpenInterestPct,
                )}
              />

              <Card
                title="CALL IV"
                value={formatPercent(data.ivSkew.callIvPct)}
              />

              <Card
                title="PUT IV"
                value={formatPercent(data.ivSkew.putIvPct)}
                subtitle={skewText(data.ivSkew.direction)}
              />
            </section>

            <section className="mt-6">
              <div className="mb-4">
                <h2 className="text-2xl font-black">
                  مستويات القاما الرئيسية
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  أهم الجدران ومنطقة المغناطيس المستخرجة من
                  السلسلة.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <WallCard
                  title="جدار CALL"
                  wall={data.walls.callWall}
                  tone="call"
                />

                <WallCard
                  title="جدار PUT"
                  wall={data.walls.putWall}
                  tone="put"
                />

                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-5">
                  <p className="text-sm text-slate-300">
                    منطقة المغناطيس
                  </p>

                  {data.walls.magnet ? (
                    <>
                      <p className="mt-3 text-3xl font-black text-white">
                        {formatPrice(data.walls.magnet.strike)}
                      </p>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-slate-500">إجمالي OI</p>

                          <p className="mt-1 font-semibold text-white">
                            {formatCompact(
                              data.walls.magnet.totalOpenInterest,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-slate-500">
                            إجمالي Volume
                          </p>

                          <p className="mt-1 font-semibold text-white">
                            {formatCompact(
                              data.walls.magnet.totalVolume,
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-slate-500">Net GEX</p>

                          <p className="mt-1 font-semibold text-white">
                            {formatSigned(
                              data.walls.magnet.netGex,
                            )}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      لا توجد بيانات كافية.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-4">
                <h2 className="text-2xl font-black">
                  أفضل عقود CALL
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  العقود الأعلى جودة حسب السيولة، السبريد،
                  الدلتا، OI والانتهاء.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {data.bestContracts.calls.length ? (
                  data.bestContracts.calls.map((contract) => (
                    <ContractCard
                      key={contract.ticker}
                      contract={contract}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    لا توجد عقود CALL مناسبة حاليًا.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-4">
                <h2 className="text-2xl font-black">
                  أفضل عقود PUT
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  العقود الأعلى جودة حسب السيولة، السبريد،
                  الدلتا، OI والانتهاء.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {data.bestContracts.puts.length ? (
                  data.bestContracts.puts.map((contract) => (
                    <ContractCard
                      key={contract.ticker}
                      contract={contract}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    لا توجد عقود PUT مناسبة حاليًا.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">
                    جدول السترايكات
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    أقرب 60 مستوى للسعر الحالي.
                  </p>
                </div>

                <p className="text-xs text-slate-500">
                  تمت معالجة{" "}
                  {formatNumber(data.meta.contractsProcessed)} عقد
                </p>
              </div>

              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
                <div className="overflow-x-auto">
                  <table className="min-w-[1200px] w-full text-sm">
                    <thead className="bg-white/[0.05] text-xs text-slate-400">
                      <tr>
                        <th className="px-4 py-4 text-right">
                          المستوى
                        </th>

                        <th className="px-4 py-4 text-right">
                          Strike
                        </th>

                        <th className="px-4 py-4 text-right">
                          البعد
                        </th>

                        <th className="px-4 py-4 text-right">
                          قوة
                        </th>

                        <th className="px-4 py-4 text-right">
                          CALL Vol
                        </th>

                        <th className="px-4 py-4 text-right">
                          PUT Vol
                        </th>

                        <th className="px-4 py-4 text-right">
                          CALL OI
                        </th>

                        <th className="px-4 py-4 text-right">
                          PUT OI
                        </th>

                        <th className="px-4 py-4 text-right">
                          CALL GEX
                        </th>

                        <th className="px-4 py-4 text-right">
                          PUT GEX
                        </th>

                        <th className="px-4 py-4 text-right">
                          Net GEX
                        </th>

                        <th className="px-4 py-4 text-right">
                          IV CALL
                        </th>

                        <th className="px-4 py-4 text-right">
                          IV PUT
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {displayedStrikes.map((row) => {
                        const isSpecial = row.level !== "NORMAL";
                        const isNearSpot =
                          Math.abs(row.distanceFromSpotPct) <= 0.5;

                        return (
                          <tr
                            key={row.strike}
                            className={`border-t border-white/[0.06] ${
                              isSpecial
                                ? "bg-cyan-400/[0.04]"
                                : isNearSpot
                                  ? "bg-violet-400/[0.04]"
                                  : ""
                            }`}
                          >
                            <td className="whitespace-nowrap px-4 py-4">
                              <span
                                className={`rounded-full border px-2 py-1 text-xs ${
                                  isSpecial
                                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                                    : "border-white/10 bg-white/[0.03] text-slate-400"
                                }`}
                              >
                                {levelText(row.level)}
                              </span>
                            </td>

                            <td className="px-4 py-4 font-bold text-white">
                              {formatPrice(row.strike)}
                            </td>

                            <td
                              className={`px-4 py-4 font-semibold ${
                                row.distanceFromSpotPct > 0
                                  ? "text-emerald-300"
                                  : row.distanceFromSpotPct < 0
                                    ? "text-rose-300"
                                    : "text-slate-300"
                              }`}
                            >
                              {row.distanceFromSpotPct > 0 ? "+" : ""}
                              {formatPercent(
                                row.distanceFromSpotPct,
                              )}
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className="h-full bg-cyan-400"
                                    style={{
                                      width: `${Math.max(
                                        0,
                                        Math.min(100, row.strength),
                                      )}%`,
                                    }}
                                  />
                                </div>

                                <span className="text-xs text-slate-400">
                                  {row.strength}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-4 text-emerald-300">
                              {formatCompact(row.callVolume)}
                            </td>

                            <td className="px-4 py-4 text-rose-300">
                              {formatCompact(row.putVolume)}
                            </td>

                            <td className="px-4 py-4 text-slate-300">
                              {formatCompact(row.callOi)}
                            </td>

                            <td className="px-4 py-4 text-slate-300">
                              {formatCompact(row.putOi)}
                            </td>

                            <td className="px-4 py-4 text-emerald-300">
                              {formatSigned(row.callGex)}
                            </td>

                            <td className="px-4 py-4 text-rose-300">
                              {formatSigned(row.putGex)}
                            </td>

                            <td
                              className={`px-4 py-4 font-bold ${
                                row.netGex > 0
                                  ? "text-cyan-300"
                                  : row.netGex < 0
                                    ? "text-orange-300"
                                    : "text-slate-400"
                              }`}
                            >
                              {formatSigned(row.netGex)}
                            </td>

                            <td className="px-4 py-4 text-slate-300">
                              {formatPercent(row.callIvPct)}
                            </td>

                            <td className="px-4 py-4 text-slate-300">
                              {formatPercent(row.putIvPct)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-5">
              <p className="font-bold text-amber-300">
                المخاطر وملاحظات البيانات
              </p>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {data.summary.risks.map((risk) => (
                  <div
                    key={risk}
                    className="flex gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <span className="text-amber-300">⚠</span>

                    <p className="text-sm leading-6 text-slate-300">
                      {risk}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs leading-6 text-slate-500">
                {data.meta.disclaimer}
              </p>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}