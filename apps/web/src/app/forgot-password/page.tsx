"use client";

import Link from "next/link";
import {
  type FormEvent,
  useMemo,
  useState,
} from "react";

import {
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const key =
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env
        .NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "متغيرات Supabase غير موجودة"
      );
    }

    // استعادة كلمة المرور بالتدفق المباشر.
    // لا تعتمد على متصفح طلب الرابط.
    return createSupabaseClient(
      url,
      key,
      {
        auth: {
          flowType: "implicit",
          detectSessionInUrl: false,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }, []);

  const [email, setEmail] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [sent, setSent] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const normalizedEmail =
      email.trim().toLowerCase();

    if (
      !normalizedEmail ||
      !normalizedEmail.includes("@")
    ) {
      setError(
        "أدخل بريدًا إلكترونيًا صحيحًا"
      );

      return;
    }

    setLoading(true);
    setError("");

    try {
      const redirectTo =
        `${window.location.origin}/auth/callback?next=/update-password`;

      const { error: resetError } =
        await supabase.auth
          .resetPasswordForEmail(
            normalizedEmail,
            {
              redirectTo,
            }
          );

      if (resetError) {
        throw resetError;
      }

      setSent(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "تعذر إرسال رابط الاستعادة"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-12 text-white"
    >
      <div className="mx-auto max-w-lg">
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl">
          <p className="text-sm font-bold text-cyan-400">
            ST MARKET INTELLIGENCE
          </p>

          <h1 className="mt-3 text-3xl font-black">
            استعادة كلمة المرور
          </h1>

          <p className="mt-3 leading-7 text-slate-400">
            اكتب بريدك الإلكتروني وسنرسل لك رابطًا لتعيين كلمة مرور جديدة.
          </p>

          {sent ? (
            <div className="mt-7">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
                <p className="font-black text-emerald-300">
                  تم إرسال رابط الاستعادة
                </p>

                <p className="mt-2 text-sm leading-7 text-slate-300">
                  افتح أحدث رسالة وصلتك واضغط رابط استعادة كلمة المرور.
                </p>
              </div>

              <Link
                href="/login"
                className="mt-5 block rounded-xl border border-white/10 px-5 py-3 text-center font-bold"
              >
                العودة إلى تسجيل الدخول
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-7 space-y-5"
            >
              <div>
                <label className="mb-2 block font-bold">
                  البريد الإلكتروني
                </label>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  placeholder="name@example.com"
                  autoComplete="email"
                  dir="ltr"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-4 text-left outline-none transition focus:border-cyan-400"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-cyan-400 px-5 py-4 font-black text-slate-950 disabled:opacity-60"
              >
                {loading
                  ? "جارٍ الإرسال..."
                  : "إرسال رابط الاستعادة"}
              </button>

              <Link
                href="/login"
                className="block text-center text-sm font-bold text-cyan-300"
              >
                العودة إلى تسجيل الدخول
              </Link>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
