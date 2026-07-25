import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "اشتراك ST MARKET Premium",
  description:
    "اشترك في ST MARKET Premium واستفد من جميع خدمات المنصة.",
  robots: {
    index: false,
    follow: false,
  },
};

const premiumUrl =
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
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-sm font-bold text-emerald-400">
            اشتراك واحد يشمل جميع الخدمات
          </p>

          <h1 className="text-3xl font-black sm:text-4xl">
            ST MARKET Premium
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            وصول كامل إلى تحليلات الأسهم والفرص والصفقات
            النشطة وصفقات الحيتان والقاما والسيولة وصفقات
            المؤشر اليومية.
          </p>

          {purchaseEmail ? (
            <p className="mt-4 text-xs text-slate-500">
              يرجى استخدام البريد نفسه عند إتمام الطلب:
              {" "}
              <span className="font-bold text-slate-300">
                {purchaseEmail}
              </span>
            </p>
          ) : null}
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6 shadow-2xl shadow-emerald-950/30 sm:p-8">
          <div className="absolute left-5 top-5 rounded-full bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">
            وصول كامل
          </div>

          <div className="mb-7">
            <p className="text-sm font-bold text-emerald-400">
              اشتراك Premium
            </p>

            <div className="mt-3 flex items-end gap-2">
              <span className="text-5xl font-black">
                249
              </span>

              <span className="pb-2 text-sm text-slate-400">
                ريال / شهر
              </span>
            </div>
          </div>

          <div className="grid gap-3 text-sm leading-7 text-slate-300 sm:grid-cols-2">
            <p>✓ الدخول الكامل إلى منصة ST MARKET</p>
            <p>✓ تحليلات الأسهم الأمريكية</p>
            <p>✓ أفضل الفرص ونظرة السوق</p>
            <p>✓ الصفقات النشطة</p>
            <p>✓ صفقات الحيتان</p>
            <p>✓ القاما والسيولة</p>
            <p>✓ صفقات SPX اليومية</p>
            <p>✓ جميع أدوات المنصة الحالية</p>
          </div>

          {user ? (
            <a
              href={premiumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
            >
              الاشتراك في Premium
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
    </main>
  );
}
