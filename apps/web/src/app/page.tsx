"use client";

import Link from "next/link";

const FEATURES = [
  {
    title: "تحليل القاما",
    description:
      "قراءة اتجاه القاما، مناطق الدعم والمقاومة، جدران الكول والبوت والمغناطيس السعري.",
    icon: "Γ",
  },
  {
    title: "تحليل السيولة",
    description:
      "متابعة تدفق عقود الأوبشن، حجم التداول والاهتمام المفتوح لمعرفة الطرف المسيطر.",
    icon: "↗",
  },
  {
    title: "أفضل العقود",
    description:
      "تقييم العقد والسترايك والتاريخ بناءً على الدلتا والسيولة والسبريد وجودة الفرصة.",
    icon: "◎",
  },
  {
    title: "صفقات الحيتان",
    description:
      "رصد العقود غير الاعتيادية والصفقات الكبيرة وفرزها حسب القوة والاتجاه.",
    icon: "◈",
  },
];

const STEPS = [
  {
    number: "01",
    title: "ابحث عن السهم",
    description:
      "اكتب رمز الشركة التي تريد تحليلها.",
  },
  {
    number: "02",
    title: "راجع المعطيات",
    description:
      "اطّلع على القاما والسيولة والزخم والعقود.",
  },
  {
    number: "03",
    title: "قيّم الفرصة",
    description:
      "راجع الاتجاه ودرجة الثقة والمخاطر.",
  },
  {
    number: "04",
    title: "اتخذ قرارك",
    description:
      "استخدم البيانات لبناء قرار تداول أكثر وضوحًا.",
  },
];

export default function LandingPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-hidden bg-[#020617] text-white"
    >
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -right-40 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -left-40 top-[500px] h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <div>
            <p className="text-lg font-black tracking-wide text-cyan-300">
              ST MARKET
            </p>
            <p className="text-xs tracking-[0.18em] text-slate-500">
              INTELLIGENCE
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {/* PUBLIC_TELEGRAM_BUTTON */}
            <a
              href="https://t.me/STtradevip"
              target="_blank"
              rel="noreferrer"
              className="inline-flex whitespace-nowrap items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-3 text-sm font-black text-sky-300 transition hover:border-sky-300/50 hover:bg-sky-400/15"
            >
              <span aria-hidden="true">✈</span>
              <span className="sm:hidden">تيليجرام</span>
              <span className="hidden sm:inline">قناة تيليجرام</span>
            </a>

            <Link
              href="/subscriptions"
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-300 transition hover:border-emerald-300/50 hover:bg-emerald-400/15"
            >
              الاشتراكات
            </Link>

            <Link
              href="/login"
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-300"
            >
              تسجيل الدخول
            </Link>

            <Link
              href="/register"
              className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
            >
              تجربة مجانية
            </Link>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-14 px-5 pb-24 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
            منصة تحليل الأسهم والأوبشن
          </div>

          <h1 className="mt-7 text-4xl font-black leading-[1.35] sm:text-5xl lg:text-6xl">
            قرارات تداول أوضح
            <span className="block bg-gradient-to-l from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              مدعومة بالبيانات الذكية
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-400">
            منصة متكاملة لتحليل الأسهم الأمريكية وعقود
            الأوبشن، تجمع القاما والسيولة والزخم والعقود
            المفتوحة في واجهة واحدة سهلة وواضحة.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="rounded-2xl bg-cyan-400 px-7 py-4 text-center font-black text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:-translate-y-0.5 hover:bg-cyan-300"
            >
              ابدأ تجربتك المجانية لمدة 5 أيام
            </Link>

            <Link
              href="/login"
              className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 text-center font-black text-white transition hover:border-cyan-400/30 hover:bg-white/10"
            >
              لدي حساب بالفعل
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            لا يتطلب إدخال بطاقة بنكية لبدء التجربة.
          </p>

          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-2xl font-black text-cyan-300">
                5
              </p>
              <p className="mt-1 text-xs text-slate-500">
                أيام مجانية
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-2xl font-black text-emerald-400">
                LIVE
              </p>
              <p className="mt-1 text-xs text-slate-500">
                بيانات السوق
              </p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-2xl font-black text-blue-400">
                AI
              </p>
              <p className="mt-1 text-xs text-slate-500">
                تحليل ذكي
              </p>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-10 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative rounded-[32px] border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500">
                  نموذج توضيحي
                </p>
                <p className="mt-1 text-2xl font-black">
                  NVDA
                </p>
              </div>

              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300">
                اتجاه صاعد
              </div>
            </div>

            <div className="mt-7 flex h-56 items-end gap-2 rounded-2xl border border-white/5 bg-slate-950/70 px-4 pb-4 pt-8">
              {[28, 34, 31, 42, 38, 51, 48, 60, 56, 69, 64, 78, 73, 88].map(
                (height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-cyan-500/20 to-cyan-300/80"
                    style={{
                      height: `${height}%`,
                    }}
                  />
                )
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                <p className="text-xs text-slate-500">
                  تدفق السيولة
                </p>
                <p className="mt-2 font-black text-emerald-300">
                  إيجابي
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                <p className="text-xs text-slate-500">
                  القاما
                </p>
                <p className="mt-2 font-black text-cyan-300">
                  داعمة للصعود
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <p className="text-xs text-slate-500">
                  درجة الفرصة
                </p>
                <p className="mt-2 text-xl font-black">
                  87%
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <p className="text-xs text-slate-500">
                  مستوى المخاطر
                </p>
                <p className="mt-2 font-black text-amber-300">
                  متوسطة
                </p>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-slate-600">
              البيانات المعروضة هنا توضيحية وليست بيانات حية.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/5 bg-white/[0.015] py-24">
        <div className="mx-auto max-w-7xl px-5">
          <div className="max-w-2xl">
            <p className="font-bold text-cyan-300">
              أدوات المنصة
            </p>

            <h2 className="mt-3 text-3xl font-black sm:text-4xl">
              كل ما تحتاجه لقراءة السوق في مكان واحد
            </h2>

            <p className="mt-4 leading-8 text-slate-400">
              لا تعتمد على مؤشر منفرد. المنصة تجمع أكثر من
              مصدر وتحليل لتمنحك صورة أكثر تكاملًا.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 transition hover:-translate-y-1 hover:border-cyan-400/20"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-xl font-black text-cyan-300">
                  {feature.icon}
                </div>

                <h3 className="mt-5 text-xl font-black">
                  {feature.title}
                </h3>

                <p className="mt-3 leading-7 text-slate-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-24">
        <div className="text-center">
          <p className="font-bold text-cyan-300">
            طريقة الاستخدام
          </p>

          <h2 className="mt-3 text-3xl font-black sm:text-4xl">
            من البحث إلى القرار خلال خطوات واضحة
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="relative rounded-3xl border border-white/5 bg-white/[0.025] p-6"
            >
              <p className="text-4xl font-black text-cyan-400/20">
                {step.number}
              </p>

              <h3 className="mt-4 text-xl font-black">
                {step.title}
              </h3>

              <p className="mt-3 leading-7 text-slate-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 px-5 pb-24">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-cyan-400/20 bg-gradient-to-l from-cyan-500/10 to-blue-600/10 p-8 text-center sm:p-12">
          <h2 className="text-3xl font-black sm:text-4xl">
            ابدأ تجربتك المجانية لمدة 5 أيام
          </h2>

          <p className="mx-auto mt-4 max-w-2xl leading-8 text-slate-300">
            أنشئ حسابك وابدأ باستكشاف أدوات التحليل.
            بعد انتهاء التجربة يلزم وجود اشتراك فعال
            للاستمرار في استخدام المنصة.
          </p>

          <Link
            href="/register"
            className="mt-8 inline-block rounded-2xl bg-cyan-400 px-8 py-4 font-black text-slate-950 transition hover:bg-cyan-300"
          >
            إنشاء حساب مجاني
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-center text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-right">
          <p>
            © ST MARKET INTELLIGENCE
          </p>

          <p>
            المنصة للأغراض التعليمية والتحليلية ولا تمثل
            توصية شراء أو بيع.
          </p>
        </div>
      </footer>
    </main>
  );
}
