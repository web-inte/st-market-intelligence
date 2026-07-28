"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (loginError) {
      setError(
        loginError.message.toLowerCase().includes("invalid")
          ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
          : loginError.message
      );
      setLoading(false);
      return;
    }

    router.replace("/account");
    router.refresh();
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white"
    >
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <p className="text-sm font-bold text-cyan-400">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-2 text-3xl font-black">
          تسجيل الدخول
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-bold">
              البريد الإلكتروني
            </label>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">
              كلمة المرور
            </label>

            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            {loading ? "جارٍ الدخول..." : "تسجيل الدخول"}
          </button>
        
        <Link
          href="/forgot-password"
          className="block text-center text-sm font-bold text-cyan-300 transition hover:text-cyan-200"
        >
          نسيت كلمة المرور؟
        </Link>
</form>

        <p className="mt-6 text-center text-sm text-slate-400">
          ليس لديك حساب؟{" "}
          <Link href="/register" className="font-bold text-cyan-400">
            إنشاء حساب
          </Link>
        </p>
      </section>
    </main>
  );
}
