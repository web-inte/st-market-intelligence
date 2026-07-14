"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export default function UpdatePasswordPage() {
  const supabase = useMemo(() => {
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "متغيرات Supabase العامة غير موجودة"
      );
    }

    return createSupabaseClient(url, key, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }, []);

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [checking, setChecking] =
    useState(true);

  const [validSession, setValidSession] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState(false);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) {
          return;
        }

        if (session?.user) {
          setValidSession(true);
          setChecking(false);
        }
      }
    );

    async function checkSession() {
      const {
        data: { session },
      } =
        await supabase.auth
          .getSession();

      if (!active) {
        return;
      }

      setValidSession(
        Boolean(session?.user)
      );

      setChecking(false);
    }

    void checkSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(
        "كلمة المرور يجب ألا تقل عن 8 أحرف"
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        "كلمتا المرور غير متطابقتين"
      );

      return;
    }

    setLoading(true);

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);

      await supabase.auth.signOut();

      window.setTimeout(() => {
        window.location.replace(
          "/login?password_updated=1"
        );
      }, 1200);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "تعذر تحديث كلمة المرور"
      );

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
            تعيين كلمة مرور جديدة
          </h1>

          {checking ? (
            <p className="mt-7 text-slate-400">
              جارٍ التحقق من جلسة الاستعادة...
            </p>
          ) : !validSession ? (
            <div className="mt-7">
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
                <p className="font-black text-rose-300">
                  رابط الاستعادة غير صالح أو منتهي
                </p>
              </div>

              <Link
                href="/forgot-password"
                className="mt-5 block rounded-xl bg-cyan-400 px-5 py-3 text-center font-black text-slate-950"
              >
                إرسال رابط جديد
              </Link>
            </div>
          ) : success ? (
            <div className="mt-7 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="font-black text-emerald-300">
                تم تغيير كلمة المرور بنجاح
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-7 space-y-5"
            >
              <div>
                <label className="mb-2 block font-bold">
                  كلمة المرور الجديدة
                </label>

                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-4 outline-none transition focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="mb-2 block font-bold">
                  تأكيد كلمة المرور
                </label>

                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-4 outline-none transition focus:border-cyan-400"
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
                  ? "جارٍ الحفظ..."
                  : "حفظ كلمة المرور الجديدة"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
