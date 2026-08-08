"use client";

import Link from "next/link";

const PRIMARY_TOOLS = [
  {
    code: "GEX",
    title: "Gamma & Liquidity",
    description:
      "مستويات القاما والسيولة وجدران Call وPut والمغناطيس السعري.",
  },
  {
    code: "FLOW",
    title: "Options Flow",
    description:
      "تدفق عقود الأوبشن، حجم التداول والاهتمام المفتوح.",
  },
  {
    code: "SPX",
    title: "SPX 0DTE",
    description:
      "متابعة جلسة SPX وربط حركة السعر بتدفق العقود والمستويات.",
  },
  {
    code: "WHALE",
    title: "Whale Trades",
    description:
      "رصد الصفقات الكبيرة والعقود غير الاعتيادية وفرزها حسب القوة.",
  },
  {
    code: "ACTIVE",
    title: "Active Trades",
    description:
      "متابعة الصفقات النشطة وحالة العقد وتطور الحركة.",
  },
  {
    code: "OPT",
    title: "Options Analyzer",
    description:
      "تحليل العقد والسترايك والانتهاء والسيولة والسبريد.",
  },
];

const MARKET_MODULES = [
  ["Gamma", "بنية السوق", "GEX"],
  ["Options Flow", "تدفق العقود", "FLOW"],
  ["SPX", "جلسة 0DTE", "SPX"],
  ["Whales", "الصفقات الكبيرة", "WHALE"],
];

const DATA_ROWS = [
  {
    symbol: "SPX",
    label: "جلسة المؤشر",
    status: "Market Structure",
    badge: "SPX",
  },
  {
    symbol: "FLOW",
    label: "تدفق الأوبشن",
    status: "Live Contract Activity",
    badge: "OPTIONS",
  },
  {
    symbol: "GEX",
    label: "Gamma & Liquidity",
    status: "Levels & Positioning",
    badge: "GAMMA",
  },
  {
    symbol: "WHALE",
    label: "الصفقات الكبيرة",
    status: "Unusual Activity",
    badge: "FLOW",
  },
];

export default function LandingPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#030712] text-white selection:bg-cyan-300 selection:text-slate-950"
    >
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_0%,rgba(34,211,238,0.09),transparent_30%),radial-gradient(circle_at_10%_35%,rgba(37,99,235,0.06),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      </div>

      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#030712]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.08] text-xs font-black tracking-tight text-cyan-300">
              ST
            </div>

            <div className="leading-none">
              <p className="text-sm font-black tracking-wide text-white">
                ST MARKET
              </p>
              <p className="mt-1 text-[9px] tracking-[0.28em] text-slate-600">
                INTELLIGENCE
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <a
              href="https://t.me/STtradevip"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-lg border border-white/[0.07] px-3.5 py-2 text-xs font-bold text-slate-400 transition hover:border-sky-400/25 hover:text-sky-300 md:block"
            >
              تيليجرام
            </a>

            <Link
              href="/subscriptions"
              className="hidden rounded-lg border border-white/[0.07] px-3.5 py-2 text-xs font-bold text-slate-400 transition hover:border-cyan-400/25 hover:text-white sm:block"
            >
              الاشتراكات
            </Link>

            <Link
              href="/login"
              className="rounded-lg border border-white/[0.07] px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-400/25 hover:text-white"
            >
              دخول
            </Link>

            <Link
              href="/register"
              className="rounded-lg bg-cyan-400 px-3.5 py-2 text-xs font-black text-[#020617] transition hover:bg-cyan-300"
            >
              ابدأ مجانًا
            </Link>
          </div>
        </div>
      </header>

      {/* Hero / terminal */}
      <section className="relative z-10 mx-auto max-w-[1440px] px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12 lg:pt-16">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
          {/* Text side */}
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-md border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-1.5 text-[11px] font-bold text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Market Intelligence Platform
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.22] tracking-tight sm:text-5xl lg:text-[62px]">
              كل ما تحتاجه
              <span className="block text-slate-500">
                لقراءة السوق الأمريكي
              </span>
              <span className="block bg-gradient-to-l from-cyan-300 to-blue-500 bg-clip-text text-transparent">
                في شاشة واحدة
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
              Gamma، السيولة، تدفق الأوبشن، صفقات الحيتان،
              SPX والصفقات النشطة ضمن واجهة واحدة منظمة.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-cyan-400 px-6 py-3.5 text-sm font-black text-[#020617] shadow-[0_0_40px_rgba(34,211,238,0.09)] transition hover:-translate-y-0.5 hover:bg-cyan-300"
              >
                ابدأ تجربتك المجانية
                <span>←</span>
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-6 py-3.5 text-sm font-bold text-slate-200 transition hover:border-cyan-400/20 hover:bg-white/[0.04]"
              >
                لدي حساب بالفعل
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-slate-600 sm:text-xs">
              <span>تجربة مجانية 3 أيام</span>
              <span>بدون بطاقة بنكية</span>
              <span>وصول لأدوات المنصة</span>
            </div>
          </div>

          {/* Terminal preview */}
          <div className="relative">
            <div className="absolute -inset-8 bg-cyan-500/[0.05] blur-3xl" />

            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07101c]/95 shadow-[0_40px_100px_rgba(0,0,0,0.42)]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]" />
                  <div>
                    <p className="text-[10px] font-black tracking-[0.18em] text-slate-400">
                      MARKET TERMINAL
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-600">
                      ST MARKET INTELLIGENCE
                    </p>
                  </div>
                </div>

                <span className="rounded border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[9px] font-bold tracking-wider text-slate-600">
                  LIVE DATA
                </span>
              </div>

              <div className="grid border-b border-white/[0.06] sm:grid-cols-4">
                {MARKET_MODULES.map(([title, subtitle, code]) => (
                  <div
                    key={code}
                    className="border-b border-white/[0.05] px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-l sm:last:border-l-0"
                  >
                    <p className="text-[9px] font-black tracking-widest text-cyan-400/70">
                      {code}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-200">
                      {title}
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-600">
                      {subtitle}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
                {/* Chart */}
                <div className="border-b border-white/[0.06] p-4 lg:border-b-0 lg:border-l lg:border-white/[0.06] sm:p-5">
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-600">
                        Market Structure
                      </p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <p className="text-2xl font-black">SPX</p>
                        <span className="text-[10px] text-slate-600">
                          0DTE
                        </span>
                      </div>
                    </div>

                    <div className="text-left">
                      <p className="text-[9px] text-slate-600">
                        Session Status
                      </p>
                      <p className="mt-1 text-xs font-black text-emerald-300">
                        Monitoring
                      </p>
                    </div>
                  </div>

                  <div className="relative h-64 overflow-hidden rounded-xl border border-white/[0.05] bg-[#020711]">
                    <div className="absolute inset-x-0 top-1/4 border-t border-dashed border-white/[0.04]" />
                    <div className="absolute inset-x-0 top-2/4 border-t border-dashed border-white/[0.04]" />
                    <div className="absolute inset-x-0 top-3/4 border-t border-dashed border-white/[0.04]" />
                    <div className="absolute inset-y-0 left-1/4 border-l border-dashed border-white/[0.03]" />
                    <div className="absolute inset-y-0 left-2/4 border-l border-dashed border-white/[0.03]" />
                    <div className="absolute inset-y-0 left-3/4 border-l border-dashed border-white/[0.03]" />

                    <svg
                      viewBox="0 0 700 260"
                      preserveAspectRatio="none"
                      className="relative h-full w-full"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient
                          id="terminalArea"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="rgb(34 211 238)"
                            stopOpacity="0.17"
                          />
                          <stop
                            offset="100%"
                            stopColor="rgb(34 211 238)"
                            stopOpacity="0"
                          />
                        </linearGradient>
                      </defs>

                      <path
                        d="M0 210 C35 205,55 218,85 195 C120 166,145 184,180 160 C215 136,240 151,275 125 C310 101,340 128,375 93 C410 63,435 89,470 65 C505 38,530 60,560 40 C600 17,635 43,700 20 L700 260 L0 260 Z"
                        fill="url(#terminalArea)"
                      />

                      <path
                        d="M0 210 C35 205,55 218,85 195 C120 166,145 184,180 160 C215 136,240 151,275 125 C310 101,340 128,375 93 C410 63,435 89,470 65 C505 38,530 60,560 40 C600 17,635 43,700 20"
                        fill="none"
                        stroke="rgb(34 211 238)"
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>

                    <div className="absolute left-3 top-3 rounded border border-cyan-400/10 bg-cyan-400/[0.05] px-2 py-1 text-[9px] font-bold text-cyan-300">
                      Gamma Structure
                    </div>

                    <div className="absolute bottom-3 right-3 rounded border border-white/[0.05] bg-[#07101c]/80 px-2 py-1 text-[9px] text-slate-500">
                      نموذج واجهة
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["GAMMA", "Levels"],
                      ["FLOW", "Contracts"],
                      ["LIQUIDITY", "Structure"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5"
                      >
                        <p className="text-[8px] font-bold tracking-widest text-slate-600">
                          {label}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-slate-300">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Data table */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-300">
                        Platform Modules
                      </p>
                      <p className="mt-1 text-[9px] text-slate-600">
                        Core market data views
                      </p>
                    </div>

                    <span className="text-[9px] font-bold text-cyan-400/70">
                      ST
                    </span>
                  </div>

                  <div className="mt-4 divide-y divide-white/[0.05]">
                    {DATA_ROWS.map((row) => (
                      <div
                        key={row.symbol}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black text-slate-200">
                              {row.symbol}
                            </p>
                            <span className="rounded border border-white/[0.05] px-1.5 py-0.5 text-[7px] font-bold tracking-widest text-slate-600">
                              {row.badge}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-[10px] text-slate-500">
                            {row.label}
                          </p>
                        </div>

                        <p className="shrink-0 text-left text-[9px] font-bold text-cyan-300/80">
                          {row.status}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-cyan-400/10 bg-cyan-400/[0.03] p-3">
                    <p className="text-[9px] leading-5 text-slate-500">
                      المعاينة توضح أسلوب عرض البيانات داخل
                      المنصة ولا تمثل قراءة سوق حالية.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform strip */}
      <section className="relative z-10 border-y border-white/[0.06] bg-white/[0.012]">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 px-4 sm:grid-cols-4 sm:px-6">
          {[
            ["LIVE", "بيانات السوق"],
            ["GAMMA", "مستويات القاما"],
            ["FLOW", "تدفق العقود"],
            ["SPX", "جلسة المؤشر"],
          ].map(([code, label], index) => (
            <div
              key={code}
              className={[
                "py-5 text-center",
                index % 2 === 0 ? "border-l border-white/[0.05]" : "",
                index < 2 ? "border-b border-white/[0.05] sm:border-b-0" : "",
                index < 3 ? "sm:border-l sm:border-white/[0.05]" : "",
              ].join(" ")}
            >
              <p className="text-xs font-black tracking-[0.16em] text-cyan-300">
                {code}
              </p>
              <p className="mt-1 text-[10px] text-slate-600">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tools */}
      <section className="relative z-10 mx-auto max-w-[1440px] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <p className="text-[11px] font-black tracking-[0.18em] text-cyan-300">
              PLATFORM
            </p>

            <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
              أدوات السوق
              <span className="block text-slate-600">
                ضمن نظام واحد
              </span>
            </h2>

            <p className="mt-5 max-w-lg text-sm leading-7 text-slate-500">
              بدل التنقل بين عدة مصادر، اجمع قراءات السوق
              الأساسية في واجهة واحدة منظمة وواضحة.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PRIMARY_TOOLS.map((tool, index) => (
              <article
                key={tool.code}
                className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#07101b]/60 p-5 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-400/20 hover:bg-[#081421]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black tracking-[0.18em] text-cyan-400/70">
                    {tool.code}
                  </span>
                  <span className="text-[9px] font-bold text-slate-700">
                    0{index + 1}
                  </span>
                </div>

                <h3 className="mt-5 text-base font-black text-slate-100">
                  {tool.title}
                </h3>

                <p className="mt-3 text-xs leading-6 text-slate-500">
                  {tool.description}
                </p>

                <div className="mt-5 h-px w-full bg-gradient-to-l from-cyan-400/20 to-transparent opacity-0 transition group-hover:opacity-100" />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="relative z-10 border-y border-white/[0.06] bg-[#050b15]/55">
        <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-[11px] font-black tracking-[0.18em] text-cyan-300">
                WORKFLOW
              </p>

              <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
                قراءة السوق
                <span className="block text-slate-600">
                  بطريقة منظمة
                </span>
              </h2>

              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-500">
                ابدأ بالسهم أو السوق، ثم راجع المعطيات الأساسية
                واربطها ببعض قبل اتخاذ قرارك.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["01", "ابحث", "اختر السهم أو السوق الذي تريد متابعته."],
                ["02", "راجع", "اطلع على Gamma والسيولة وتدفق العقود."],
                ["03", "قارن", "اربط المستويات بحركة السعر والعقود."],
                ["04", "قرر", "استخدم المعطيات لبناء قرار تداول أوضح."],
              ].map(([number, title, description]) => (
                <div
                  key={number}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-cyan-400/60">
                      {number}
                    </span>
                    <h3 className="text-sm font-black text-slate-200">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-3 pr-6 text-xs leading-6 text-slate-500">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-cyan-400/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_32%),linear-gradient(135deg,rgba(7,16,28,0.98),rgba(3,7,18,0.98))] p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-black tracking-[0.18em] text-cyan-300">
                3-DAY FREE ACCESS
              </p>

              <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                ابدأ استخدام ST MARKET
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
                جرّب المنصة لمدة 3 أيام بدون بطاقة بنكية،
                واستكشف أدوات تحليل السوق وعقود الأوبشن.
              </p>
            </div>

            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-3 rounded-xl bg-cyan-400 px-7 py-3.5 text-sm font-black text-[#020617] transition hover:bg-cyan-300"
            >
              إنشاء حساب مجاني
              <span>←</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-7 text-center sm:px-6 md:flex-row md:items-center md:justify-between md:text-right">
          <div>
            <p className="text-xs font-black tracking-wide text-slate-300">
              ST MARKET INTELLIGENCE
            </p>
            <p className="mt-1 text-[9px] text-slate-700">
              Market data & options analytics
            </p>
          </div>

          <p className="max-w-xl text-[10px] leading-5 text-slate-600">
            المنصة للأغراض التعليمية والتحليلية ولا تمثل توصية
            شراء أو بيع. قرارات التداول مسؤولية المستخدم.
          </p>
        </div>
      </footer>
    </main>
  );
}
