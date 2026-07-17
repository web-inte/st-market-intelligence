import Link from "next/link";

export default function SubscriptionRequiredPage() {
  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-[#020617] px-5 py-12 text-white"
    >
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl">
        <p className="font-black text-cyan-300">
          ST MARKET INTELLIGENCE
        </p>

        <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-3xl">
          🔒
        </div>

        <h1 className="mt-6 text-3xl font-black">
          يلزم اشتراك فعال
        </h1>

        <p className="mt-4 leading-8 text-slate-300">
          انتهت الفترة التجريبية أو لا يوجد اشتراك
          فعال على هذا الحساب. يلزم تفعيل الاشتراك
          للاستمرار في استخدام التحليلات والبيانات الحية.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/account"
            className="rounded-xl bg-cyan-400 px-5 py-4 font-black text-slate-950"
          >
            عرض حالة الحساب
          </Link>

          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 font-black"
          >
            العودة للرئيسية
          </Link>
        </div>

        <p className="mt-7 text-sm leading-7 text-slate-500">
          إذا كان لديك اشتراك ساري ولم يظهر في حسابك،
          تواصل مع الدعم وأرسل البريد الإلكتروني المسجل.
        </p>
      </section>
    </main>
  );
}
