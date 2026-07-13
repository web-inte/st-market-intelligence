import Link from "next/link";
import { redirect } from "next/navigation";

import SignOutButton from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileResult, subscriptionResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,role,is_blocked")
        .eq("id", user.id)
        .maybeSingle(),

      supabase
        .from("subscriptions")
        .select(`
          id,
          status,
          starts_at,
          ends_at,
          source,
          plans (
            name,
            is_trial
          )
        `)
        .eq("user_id", user.id)
        .order("ends_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    ]);

  const profile = profileResult.data;
  const subscription = subscriptionResult.data;

  const isAdmin =
    profile?.role === "admin";

  const fullName =
    profile?.full_name ||
    String(
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "مستخدم"
    );

  const rawPlan =
    (subscription as any)?.plans;

  const plan = Array.isArray(rawPlan)
    ? rawPlan[0]
    : rawPlan;

  const endsAt = subscription?.ends_at
    ? new Date(subscription.ends_at)
    : null;

  const remainingDays = endsAt
    ? Math.max(
        0,
        Math.ceil(
          (endsAt.getTime() - Date.now()) /
            DAY_MS
        )
      )
    : 0;

  const subscriptionActive =
    subscription?.status === "active" &&
    remainingDays > 0;

  const subscriptionTitle = isAdmin
    ? "مسؤول النظام"
    : subscriptionActive
      ? plan?.is_trial
        ? "الفترة التجريبية"
        : plan?.name || "اشتراك فعال"
      : "لا يوجد اشتراك فعال";

  const subscriptionDescription = isAdmin
    ? "دخول كامل وغير محدود"
    : subscriptionActive
      ? `متبقي ${remainingDays} يوم`
      : "انتهت صلاحية الاشتراك";

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-12 text-white"
    >
      <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl">
        <p className="text-sm font-black text-cyan-400">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-3 text-4xl font-black">
          حسابي
        </h1>

        <div className="mt-8 grid gap-4">
          <div className="rounded-2xl bg-slate-950 p-5">
            <p className="text-sm text-slate-500">
              الاسم
            </p>

            <p className="mt-2 text-xl font-black">
              {fullName}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-950 p-5">
            <p className="text-sm text-slate-500">
              البريد الإلكتروني
            </p>

            <p
              dir="ltr"
              className="mt-2 break-all text-left text-xl font-black"
            >
              {user.email}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-5 ${
              isAdmin
                ? "border-violet-400/30 bg-violet-400/10"
                : subscriptionActive
                  ? "border-cyan-400/30 bg-cyan-400/10"
                  : "border-rose-400/30 bg-rose-400/10"
            }`}
          >
            <p className="text-sm text-slate-400">
              حالة الحساب
            </p>

            <p className="mt-2 text-3xl font-black">
              {subscriptionTitle}
            </p>

            <p
              className={`mt-2 font-bold ${
                isAdmin
                  ? "text-violet-300"
                  : subscriptionActive
                    ? "text-cyan-300"
                    : "text-rose-300"
              }`}
            >
              {subscriptionDescription}
            </p>

            {!isAdmin && endsAt ? (
              <p className="mt-2 text-sm text-slate-400">
                ينتهي في{" "}
                {endsAt.toLocaleDateString(
                  "ar-SA"
                )}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl border border-white/10 px-5 py-3 font-bold"
          >
            الصفحة الرئيسية
          </Link>

          {isAdmin ? (
            <Link
              href="/admin"
              className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-5 py-3 font-bold text-violet-300"
            >
              لوحة المسؤول
            </Link>
          ) : null}

          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
