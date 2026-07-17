import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SubscriptionRequiredPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isExpiredTrial = false;

  if (user) {
    const { data } = await supabase
      .from("subscriptions")
      .select(
        "status,ends_at,plans(name,is_trial)"
      )
      .eq("user_id", user.id)
      .order("ends_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    const rawPlan = (data as any)?.plans;

    const plan = Array.isArray(rawPlan)
      ? rawPlan[0]
      : rawPlan;

    const endsAt =
      data?.ends_at ?? null;

    isExpiredTrial = Boolean(
      plan?.is_trial &&
        endsAt &&
        new Date(endsAt).getTime() <=
          Date.now()
    );
  }

  async function signOut() {
    "use server";

    const serverSupabase =
      await createClient();

    await serverSupabase.auth.signOut();

    redirect("/");
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-14 text-white"
    >
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center shadow-2xl sm:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-3xl">
          🔒
        </div>

        <h1 className="text-2xl font-black sm:text-3xl">
          {isExpiredTrial
            ? "انتهت تجربتك المجانية"
            : "يلزم اشتراك فعال"}
        </h1>

        <p className="mx-auto mt-4 max-w-md text-sm leading-8 text-slate-400">
          {isExpiredTrial
            ? "انتهت مدة التجربة المجانية البالغة 5 أيام. اختر اشتراك المنصة أو اشتراك Plus لمواصلة استخدام ST Market."
            : "لا يوجد اشتراك فعال على هذا الحساب حاليًا. اختر الباقة المناسبة لمواصلة استخدام المنصة."}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/subscriptions"
            className="rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
          >
            عرض الاشتراكات
          </Link>

          <Link
            href="/account"
            className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.07] px-5 py-4 text-sm font-black text-cyan-300 transition hover:bg-cyan-400/10"
          >
            عرض حالة الحساب
          </Link>
        </div>

        <form
          action={signOut}
          className="mt-4"
        >
          <button
            type="submit"
            className="text-sm font-bold text-slate-500 transition hover:text-slate-300"
          >
            تسجيل الخروج
          </button>
        </form>
      </section>
    </main>
  );
}
