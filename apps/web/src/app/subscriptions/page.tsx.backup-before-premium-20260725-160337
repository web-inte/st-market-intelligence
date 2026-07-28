import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "الاشتراكات",
  description:
    "اختر باقة ST Market المناسبة لك.",
  robots: {
    index: false,
    follow: false,
  },
};

const platformUrl =
  "https://salla.sa/stvipsignals/اشتراك-منصة-st-market-شهر/p1066244002";

const plusUrl =
  "https://salla.sa/stvipsignals/اشتراك-st-market-plus-شهر/p2122436443";

export default async function SubscriptionsPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const purchaseEmail =
    user?.email || "";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-14 text-white"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-bold text-emerald-400">
            باقات ST Market
          </p>

          <h1 className="text-3xl font-black sm:text-4xl">
            اختر الاشتراك المناسب لك
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            جميع الباقات مدتها شهر واحد،
            ويتم إتمام الدفع عبر متجر
            ST Market في سلة.
          </p>

          {user ? (
            <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm leading-7 text-amber-200">
              استخدم البريد نفسه عند
              الدفع في سلة:
              <strong className="mx-1 break-all text-white">
                {purchaseEmail}
              </strong>
            </div>
          ) : (
            <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] px-4 py-3 text-sm leading-7 text-cyan-200">
              يجب تسجيل الدخول إلى حسابك
              قبل شراء الاشتراك حتى يتم
              تفعيله تلقائيًا.
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <div className="mb-6">
              <p className="text-sm font-bold text-sky-400">
                اشتراك المنصة
              </p>

              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-black">
                  159
                </span>

                <span className="pb-1 text-sm text-slate-400">
                  ريال / شهر
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm leading-7 text-slate-300">
              <p>
                ✓ الدخول إلى منصة ST Market
              </p>
              <p>
                ✓ تحليلات الأسهم الأمريكية
              </p>
              <p>
                ✓ نظرة السوق والفرص الأساسية
              </p>

              <div className="my-5 border-t border-white/10" />

              <p className="text-slate-500">
                ✕ صفقات الحيتان
              </p>
              <p className="text-slate-500">
                ✕ القاما والسيولة
              </p>
              <p className="text-slate-500">
                ✕ الصفقات النشطة
              </p>
            </div>

            {user ? (
              <a
                href={platformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-sky-500 px-5 py-4 text-sm font-black text-white transition hover:bg-sky-400"
              >
                الاشتراك في المنصة
              </a>
            ) : (
              <Link
                href="/login?next=/subscriptions"
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-sky-500 px-5 py-4 text-sm font-black text-white transition hover:bg-sky-400"
              >
                سجل الدخول أولًا
              </Link>
            )}
          </section>

          <section className="relative rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6 shadow-2xl">
            <div className="absolute left-5 top-5 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">
              الأكثر شمولًا
            </div>

            <div className="mb-6">
              <p className="text-sm font-bold text-emerald-400">
                اشتراك Plus
              </p>

              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-black">
                  249
                </span>

                <span className="pb-1 text-sm text-slate-400">
                  ريال / شهر
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm leading-7 text-slate-300">
              <p>
                ✓ جميع مزايا اشتراك المنصة
              </p>
              <p>✓ صفقات الحيتان</p>
              <p>✓ القاما والسيولة</p>
              <p>✓ الصفقات النشطة</p>
              <p>
                ✓ الوصول الكامل إلى أدوات المنصة
              </p>
            </div>

            {user ? (
              <a
                href={plusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
              >
                الاشتراك في Plus
              </a>
            ) : (
              <Link
                href="/login?next=/subscriptions"
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
              >
                سجل الدخول أولًا
              </Link>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
