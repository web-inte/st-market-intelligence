import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,is_blocked")
    .eq("id", user.id)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(`
      status,
      starts_at,
      ends_at,
      source,
      plans (
        code,
        name,
        is_trial
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planValue = subscription?.plans;
  const plan = Array.isArray(planValue)
    ? planValue[0]
    : planValue;

  const remainingDays = subscription?.ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.ends_at).getTime() - Date.now()) /
            86_400_000
        )
      )
    : 0;

  async function signOut() {
    "use server";

    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-12 text-white"
    >
      <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900 p-6">
        <p className="text-sm font-bold text-cyan-400">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-2 text-3xl font-black">
          حسابي
        </h1>

        <div className="mt-8 space-y-4">
          <div className="rounded-2xl bg-slate-950 p-5">
            <p className="text-sm text-slate-400">الاسم</p>
            <p className="mt-1 font-bold">
              {profile?.full_name || "مستخدم"}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-950 p-5">
            <p className="text-sm text-slate-400">
              البريد الإلكتروني
            </p>
            <p className="mt-1 break-all font-bold">
              {user.email}
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
            <p className="text-sm text-slate-400">
              الاشتراك الحالي
            </p>

            {subscription ? (
              <>
                <p className="mt-2 text-xl font-black">
                  {plan?.name || plan?.code || "اشتراك فعال"}
                </p>

                <p className="mt-2 text-cyan-300">
                  متبقي {remainingDays} يوم
                </p>
              </>
            ) : (
              <p className="mt-2 text-slate-300">
                لا يوجد اشتراك فعال.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl border border-white/10 px-5 py-3 font-bold"
          >
            الصفحة الرئيسية
          </Link>

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 font-bold text-rose-300"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
