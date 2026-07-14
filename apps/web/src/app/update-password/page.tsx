"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createClient as createSupabaseClient,
} from "@supabase/supabase-js";

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
        detectSessionInUrl: false,
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

    async function initializeRecovery() {
      try {
        const hash = new URLSearchParams(
          window.location.hash.replace(
            /^#/,
            ""
          )
        );

        const accessToken =
          hash.get("access_token");

        const refreshToken =
          hash.get("refresh_token");

        const urlError =
          hash.get("error_description") ||
          hash.get("error");

        if (urlError) {
          throw new Error(urlError);
        }

        if (
          accessToken &&
          refreshToken
        ) {
          const { error: sessionError } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

          if (sessionError) {
            throw sessionError;
          }

          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );

          if (active) {
            setValidSession(true);
          }

          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (active) {
          setValidSession(
            Boolean(session?.user)
          );
        }
      } catch (recoveryError) {
        if (active) {
          setError(
            recoveryError instanceof Error
              ? recoveryError.message
              : "رابط الاستعادة غير صالح"
          );

          setValidSession(false);
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    }

    void initializeRecovery();

    return () => {
      active = false;
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
      password !== confirmPassword
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
      <section className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl">
        <p className="text-sm font-bold text-cyan-300">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-3 text-3xl font-black">
          تعيين كلمة مرور جديدة
        </h1>

        {checking ? (
          <div className="mt-7 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5 text-cyan-200">
            جارٍ التحقق من رابط الاستعادة...
          </div>
        ) : !validSession ? (
          <div className="mt-7">
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5">
              <p className="font-black text-rose-300">
                رابط الاستعادة غير صالح أو
                منتهي
              </p>

              {error ? (
                <p className="mt-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
            </div>

            <Link
              href="/forgot-password"
              className="mt-5 block text-center font-bold text-cyan-300"
            >
              إرسال رابط جديد
            </Link>
          </div>
        ) : success ? (
          <div className="mt-7 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5 font-black text-emerald-300">
            تم تغيير كلمة المرور بنجاح
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-5"
          >
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">
                كلمة المرور الجديدة
              </span>

              <input
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-4 outline-none transition focus:border-cyan-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">
                تأكيد كلمة المرور
              </span>

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(
                    event.target.value
                  )
                }
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-4 outline-none transition focus:border-cyan-400"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-cyan-400 px-4 py-4 font-black text-slate-950 disabled:opacity-60"
            >
              {loading
                ? "جارٍ الحفظ..."
                : "حفظ كلمة المرور الجديدة"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
