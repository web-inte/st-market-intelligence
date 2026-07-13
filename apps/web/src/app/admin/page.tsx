import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import AdminPanel from "./admin-panel";
import AdminUsersTable from "./users-table";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } =
    await supabase
      .from("profiles")
      .select("role,full_name")
      .eq("id", user.id)
      .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/account");
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-10 text-white"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-cyan-400">
              ST MARKET INTELLIGENCE
            </p>

            <h1 className="mt-2 text-3xl font-black">
              لوحة المسؤول
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              إضافة المستخدمين وتحديد مدة الاشتراك.
            </p>
          </div>

          <Link
            href="/account"
            className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold"
          >
            العودة إلى حسابي
          </Link>
        </div>

        <AdminPanel />

        <AdminUsersTable />
      </div>
    </main>
  );
}
