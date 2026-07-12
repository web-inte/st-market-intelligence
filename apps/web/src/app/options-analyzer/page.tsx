"use client";

import {
  type FormEvent,
  useState,
} from "react";

type ContractType = "call" | "put";

type AnalyzedContract = {
  ticker: string;
  type: ContractType;
  expiration: string;
  strike: number;
  stockPrice: number;

  bid: number;
  ask: number;
  midpoint: number;
  spreadPct: number | null;

  volume: number;
  openInterest: number;
  volumeOiRatio: number | null;

  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;

  lastTradePrice: number;
  lastTradeSize: number;
  breakEvenPrice: number;

  quoteTimeframe: string | null;
  tradeTimeframe: string | null;

  score: number;
};

type OptionsAnalyzerResponse = {
  symbol: string;
  type: ContractType;
  expiration: string;
  contractsReturned: number;
  stockPrice: number;
  bestContracts: AnalyzedContract[];
  capturedAt: string;
  note: string;
};

type OptionsAnalyzerError = {
  error?: string;
  details?: string;
};

const LEADING_SYMBOLS = [
  "NVDA",
  "TSLA",
  "AAPL",
  "MSFT",
  "META",
  "AMD",
  "AMZN",
  "AVGO",
  "GOOGL",
  "PLTR",
  "SPY",
  "QQQ",
];

function priceFormat(value: number) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toFixed(2);
}

function numberFormat(value: number) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(number);
}

function percentFormat(value: number | null) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "غير متاح";
  }

  return `${value.toFixed(2)}%`;
}

function decimalFormat(
  value: number,
  digits: number
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "غير متاح";
  }

  return number.toFixed(digits);
}

function scoreColor(score: number) {
  if (score >= 85) {
    return "text-emerald-400";
  }

  if (score >= 70) {
    return "text-amber-400";
  }

  return "text-rose-400";
}

function scoreBorder(score: number) {
  if (score >= 85) {
    return "border-emerald-400/30 bg-emerald-400/[0.06]";
  }

  if (score >= 70) {
    return "border-amber-400/30 bg-amber-400/[0.06]";
  }

  return "border-rose-400/30 bg-rose-400/[0.06]";
}

function contractLabel(index: number) {
  if (index === 0) {
    return "الأعلى تقييمًا";
  }

  if (index === 1) {
    return "الخيار الثاني";
  }

  return "الخيار الثالث";
}

function contractQuality(score: number) {
  if (score >= 90) {
    return "جودة ممتازة";
  }

  if (score >= 80) {
    return "جودة قوية";
  }

  if (score >= 70) {
    return "جودة جيدة";
  }

  if (score >= 60) {
    return "جودة متوسطة";
  }

  return "جودة ضعيفة";
}

function typeClasses(type: ContractType) {
  if (type === "call") {
    return {
      text: "text-emerald-400",
      border: "border-emerald-400/25",
      background: "bg-emerald-400/[0.07]",
    };
  }

  return {
    text: "text-rose-400",
    border: "border-rose-400/25",
    background: "bg-rose-400/[0.07]",
  };
}

export default function OptionsAnalyzerPage() {
  const [symbol, setSymbol] =
    useState("NVDA");

  const [type, setType] =
    useState<ContractType>("call");

  const [expiration, setExpiration] =
    useState("");

  const [result, setResult] =
    useState<OptionsAnalyzerResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanSymbol = symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z.-]/g, "");

    if (!cleanSymbol) {
      setError("اكتب رمز الشركة أولًا.");
      return;
    }

    if (!expiration) {
      setError("اختر تاريخ انتهاء العقد.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const params =
        new URLSearchParams({
          symbol: cleanSymbol,
          type,
          expiration,
        });

      const response = await fetch(
        `/api/options-analyzer?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const responseText =
        await response.text();

      if (!responseText.trim()) {
        throw new Error(
          "وصل رد فارغ من خادم تحليل العقود. أعد المحاولة."
        );
      }

      let data:
        | OptionsAnalyzerResponse
        | OptionsAnalyzerError;

      try {
        data = JSON.parse(
          responseText
        ) as
          | OptionsAnalyzerResponse
          | OptionsAnalyzerError;
      } catch {
        throw new Error(
          "وصل رد غير صالح من خادم تحليل العقود."
        );
      }

      if (
        !response.ok ||
        !("bestContracts" in data)
      ) {
        const message =
          "error" in data && data.error
            ? data.error
            : "تعذر تحليل العقود.";

        throw new Error(message);
      }

      setSymbol(cleanSymbol);
      setResult(data);
    } catch (requestError) {
      console.error(
        "Options analyzer request failed:",
        requestError
      );

      setError(
        requestError instanceof Error
          ? requestError.message
          : "حدث خطأ أثناء تحليل العقود."
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedTypeStyle =
    typeClasses(type);

  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#030914] text-white selection:bg-cyan-400/30"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.035)_1px,transparent_1px)] bg-[size:42px_42px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[140px]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-44 -left-40 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[140px]"
      />

      <section className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <nav className="mb-10 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-slate-950/55 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-5">
          <a
            href="/"
            className="group flex items-center gap-3 rounded-xl transition hover:opacity-90"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
              <span className="text-sm font-black text-cyan-300">
                ST
              </span>
            </div>

            <div>
              <p className="text-sm font-bold text-white">
                ST Market Intelligence
              </p>

              <p className="text-[11px] text-slate-500">
                تحليل العقود الذكي
              </p>
            </div>
          </a>

          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />

              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>

            <span className="text-xs font-black tracking-[0.14em] text-emerald-300">
              مباشر
            </span>
          </div>
        </nav>

        <a
          href="/"
          className="group mb-8 inline-flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/65 px-4 py-3 text-sm font-semibold text-slate-200 shadow-lg shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-cyan-300"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-slate-950 text-cyan-400 transition group-hover:bg-cyan-400/10">
            ←
          </span>

          <span className="text-right">
            <span className="block">
              العودة للصفحة الرئيسية
            </span>

            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
              أفضل فرص السوق
            </span>
          </span>
        </a>

        <header className="mx-auto mb-10 max-w-4xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2 text-xs font-bold text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />

            محلل عقود الشركات
          </div>

          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            محلل عقود الشركات
          </h1>

          <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-slate-400 sm:text-lg">
            اختر الشركة ونوع العقد وتاريخ
            الانتهاء، وسيقوم النظام بتحليل العقود
            المطابقة وترتيب أفضل ثلاثة عقود حسب
            السيولة والسبريد والدلتا وجودة العقد.
          </p>
        </header>

        <section className="mx-auto mb-10 max-w-5xl overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/65 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="border-b border-white/[0.06] px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-cyan-400">
                  التحليل اليدوي للعقود
                </p>

                <h2 className="mt-2 text-xl font-black text-white">
                  بيانات العقد المطلوبة
                </h2>
              </div>

              <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-500">
                طلب واحد عند الضغط
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid gap-5 p-5 sm:p-7 lg:grid-cols-3"
          >
            <div>
              <label
                htmlFor="stock-symbol"
                className="mb-2 block text-sm font-medium text-slate-400"
              >
                رمز الشركة
              </label>

              <input
                id="stock-symbol"
                type="text"
                value={symbol}
                onChange={(event) =>
                  setSymbol(
                    event.target.value
                  )
                }
                maxLength={10}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="مثال: NVDA"
                className="h-14 w-full rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 text-left text-lg font-bold uppercase text-white outline-none transition placeholder:font-normal placeholder:text-slate-600 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-400">
                نوع العقد
              </p>

              <div className="grid h-14 grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-[#07111f] p-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setType("call")
                  }
                  className={`rounded-xl font-black transition duration-200 ${
                    type === "call"
                      ? "bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/15"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  CALL
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setType("put")
                  }
                  className={`rounded-xl font-black transition duration-200 ${
                    type === "put"
                      ? "bg-rose-400 text-slate-950 shadow-lg shadow-rose-500/15"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  PUT
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="expiration-date"
                className="mb-2 block text-sm font-medium text-slate-400"
              >
                تاريخ الانتهاء
              </label>

<div className="relative">
  <input
    id="expiration-date"
    type="date"
    value={expiration}
    onChange={(event) =>
      setExpiration(event.target.value)
    }
    dir="ltr"
    style={{
      colorScheme: "dark",
    }}
    className={`h-14 w-full rounded-2xl border border-white/[0.08] bg-[#07111f] px-4 text-left text-base font-semibold outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-90 [&::-webkit-calendar-picker-indicator]:invert ${
      expiration
        ? "text-white"
        : "text-transparent"
    }`}
  />

  {!expiration ? (
    <span
      dir="rtl"
      className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-500"
    >
      اختر التاريخ المناسب للعقد
    </span>
  ) : null}
</div>
            </div>

            <div className="lg:col-span-3">
              <button
                type="submit"
                disabled={loading}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-l from-cyan-400 to-sky-500 text-lg font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition duration-300 hover:-translate-y-0.5 hover:shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {loading ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />

                    جارٍ تحليل العقود...
                  </>
                ) : (
                  <>
                    <span>
                      حلّل العقود الآن
                    </span>

                    <span aria-hidden="true">
                      ←
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="border-t border-white/[0.06] px-5 py-5 sm:px-7">
            <p className="mb-3 text-sm text-slate-500">
              الشركات القيادية
            </p>

            <div className="flex flex-wrap gap-2">
              {LEADING_SYMBOLS.map(
                (item) => {
                  const active =
                    symbol
                      .trim()
                      .toUpperCase() ===
                    item;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setSymbol(item);
                        setResult(null);
                        setError("");
                      }}
                      className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                        active
                          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                          : "border-white/[0.07] bg-white/[0.03] text-slate-400 hover:border-white/15 hover:text-white"
                      }`}
                    >
                      {item}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </section>

        {error ? (
          <div className="mx-auto mb-8 max-w-5xl rounded-3xl border border-rose-500/25 bg-rose-500/[0.07] p-5 text-rose-300">
            <p className="font-black">
              تعذر تنفيذ التحليل
            </p>

            <p className="mt-2 text-sm leading-7 text-rose-200/75">
              {error}
            </p>
          </div>
        ) : null}

        {loading ? (
          <section className="mx-auto max-w-6xl">
            <div className="mb-5 h-28 animate-pulse rounded-3xl border border-white/[0.06] bg-slate-950/60" />

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-3xl border border-white/[0.06] bg-slate-950/60 p-6"
                >
                  <div className="h-5 w-28 rounded bg-slate-800" />

                  <div className="mt-4 h-8 w-40 rounded bg-slate-800" />

                  <div className="mt-6 h-28 rounded-2xl bg-slate-800/70" />

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map(
                      (box) => (
                        <div
                          key={box}
                          className="h-20 rounded-xl bg-slate-800/50"
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && result ? (
          <section className="mx-auto max-w-6xl">
            <div className="mb-6 overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/65 p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold tracking-[0.16em] text-cyan-400">
                    نتيجة التحليل
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-black text-white sm:text-4xl">
                      {result.symbol}
                    </h2>

                    <span
                      className={`rounded-xl border px-3 py-1.5 text-sm font-black ${selectedTypeStyle.border} ${selectedTypeStyle.background} ${selectedTypeStyle.text}`}
                    >
                      {result.type.toUpperCase()}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-400">
                    تاريخ الانتهاء:{" "}
                    <span className="font-bold text-slate-200">
                      {result.expiration}
                    </span>
                  </p>

                  <p className="mt-2 text-xs text-slate-600">
                    تم العثور على{" "}
                    {result.contractsReturned} عقدًا
                    صالحًا قبل الترتيب.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4 text-left">
                  <p className="text-xs text-slate-500">
                    سعر السهم
                  </p>

                  <p className="mt-1 text-4xl font-black tracking-tight text-white">
                    $
                    {priceFormat(
                      result.stockPrice
                    )}
                  </p>
                </div>
              </div>
            </div>

            {result.bestContracts.length >
            0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {result.bestContracts.map(
                  (contract, index) => {
                    const contractStyle =
                      typeClasses(
                        contract.type
                      );

                    return (
                      <article
                        key={contract.ticker}
                        className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/70 p-6 shadow-xl shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-400/20"
                      >
                        <div
                          aria-hidden="true"
                          className={`absolute inset-x-0 top-0 h-px ${
                            contract.type ===
                            "call"
                              ? "bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
                              : "bg-gradient-to-r from-transparent via-rose-400/60 to-transparent"
                          }`}
                        />

                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p
                              className={`text-sm font-black ${contractStyle.text}`}
                            >
                              {contractLabel(
                                index
                              )}
                            </p>

                            <h3 className="mt-2 text-2xl font-black text-white">
                              سعر التنفيذ{" "}
                              {contract.strike}
                            </h3>

                            <p className="mt-1 text-xs text-slate-500">
                              {contractQuality(
                                contract.score
                              )}
                            </p>
                          </div>

                          <div
                            className={`rounded-2xl border px-4 py-3 text-center ${scoreBorder(
                              contract.score
                            )}`}
                          >
                            <p className="text-[10px] tracking-wider text-slate-500">
                              التقييم
                            </p>

                            <p
                              className={`mt-1 text-3xl font-black ${scoreColor(
                                contract.score
                              )}`}
                            >
                              {contract.score}
                            </p>
                          </div>
                        </div>

                        <p className="mt-4 break-all rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-left text-[11px] text-slate-600">
                          {contract.ticker}
                        </p>

                        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                          <div className="flex items-end justify-between gap-4">
                            <div>
                              <p className="text-xs text-slate-500">
                                سعر العقد
                              </p>

                              <p className="mt-1 text-3xl font-black text-white">
                                $
                                {priceFormat(
                                  contract.midpoint
                                )}
                              </p>
                            </div>

                            <span
                              className={`rounded-lg border px-2.5 py-1 text-xs font-black ${contractStyle.border} ${contractStyle.background} ${contractStyle.text}`}
                            >
                              {contract.type.toUpperCase()}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3 text-xs">
                            <div>
                              <p className="text-slate-600">
                                أعلى سعر شراء
                              </p>

                              <p className="mt-1 font-bold text-slate-300">
                                $
                                {priceFormat(
                                  contract.bid
                                )}
                              </p>
                            </div>

                            <div className="text-left">
                              <p className="text-slate-600">
                                أقل سعر بيع
                              </p>

                              <p className="mt-1 font-bold text-slate-300">
                                $
                                {priceFormat(
                                  contract.ask
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              حجم التداول
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {numberFormat(
                                contract.volume
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              العقود المفتوحة
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {numberFormat(
                                contract.openInterest
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              دلتا
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {decimalFormat(
                                contract.delta,
                                4
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              السبريد
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {percentFormat(
                                contract.spreadPct
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              نسبة الحجم للعقود المفتوحة
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {contract.volumeOiRatio !==
                              null
                                ? decimalFormat(
                                    contract.volumeOiRatio,
                                    2
                                  )
                                : "غير متاح"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              التذبذب الضمني
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {Number.isFinite(
                                contract.iv
                              )
                                ? `${(
                                    contract.iv *
                                    100
                                  ).toFixed(
                                    2
                                  )}%`
                                : "غير متاح"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              قاما
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {decimalFormat(
                                contract.gamma,
                                6
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              ثيتا
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {decimalFormat(
                                contract.theta,
                                4
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              فيغا
                            </p>

                            <p className="mt-1 font-bold text-white">
                              {decimalFormat(
                                contract.vega,
                                4
                              )}
                            </p>
                          </div>

                          <div className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                            <p className="text-xs text-slate-600">
                              آخر صفقة
                            </p>

                            <p className="mt-1 font-bold text-white">
                              $
                              {priceFormat(
                                contract.lastTradePrice
                              )}
                            </p>
                          </div>

                          <div className="col-span-2 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.04] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs text-slate-500">
                                  سعر التعادل
                                </p>

                                <p className="mt-1 text-lg font-black text-cyan-300">
                                  $
                                  {priceFormat(
                                    contract.breakEvenPrice
                                  )}
                                </p>
                              </div>

                              <div className="text-left">
                                <p className="text-xs text-slate-600">
                                  الانتهاء
                                </p>

                                <p className="mt-1 text-sm font-bold text-slate-300">
                                  {
                                    contract.expiration
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-white/[0.07] bg-slate-950/60 p-10 text-center text-slate-400">
                لم يتم العثور على عقود صالحة
                لهذا التاريخ والنوع.
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-slate-950/50 p-4 text-center text-xs leading-6 text-slate-600">
              يتم ترتيب النتائج حسب السيولة،
              العقود المفتوحة، السبريد، الدلتا
              ونسبة حجم التداول إلى العقود
              المفتوحة. النتائج تحليلية وليست
              توصية مباشرة بالشراء أو البيع.
            </div>
          </section>
        ) : null}

        {!loading &&
        !result &&
        !error ? (
          <div className="mx-auto max-w-5xl rounded-3xl border border-dashed border-white/[0.08] bg-slate-950/30 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] text-2xl text-cyan-300">
              ↗
            </div>

            <h2 className="mt-5 text-xl font-black text-white">
              جاهز لتحليل العقد
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
              حدد الشركة ونوع العقد وتاريخ
              الانتهاء، ثم اضغط زر التحليل لعرض
              أفضل ثلاثة عقود مطابقة.
            </p>
          </div>
        ) : null}

        <footer className="mt-16 border-t border-white/[0.06] pt-6 text-center">
          <p className="text-xs leading-6 text-slate-600">
            التحليلات مبنية على بيانات السوق ولا
            تمثل توصية مباشرة بالشراء أو البيع.
          </p>
        </footer>
      </section>
    </main>
  );
}