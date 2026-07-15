"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

export default function RecoveryPage() {
  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [tokenHash, setTokenHash] =
    useState<string | null>(null);

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [ready, setReady] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState(false);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    setTokenHash(
      params.get("token_hash")
    );

    setReady(true);
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (!tokenHash) {
      setError(
        "رابط الاستعادة غير صحيح. اطلب رابطًا جديدًا."
      );
      return;
    }

    if (password.length < 8) {
      setError(
        "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل"
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "كلمتا المرور غير متطابقتين"
      );
      return;
    }

    setLoading(true);

    try {
      const {
        data: verifyData,
        error: verifyError,
      } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (verifyError) {
        throw verifyError;
      }

      if (!verifyData.session) {
        throw new Error(
          "تعذر إنشاء جلسة استعادة كلمة المرور"
        );
      }

      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut({
        scope: "local",
      });

      window.history.replaceState(
        {},
        "",
        "/auth/recovery"
      );

      setSuccess(true);
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "تعذر تغيير كلمة المرور"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white"
    >
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl">
        <p className="text-sm font-bold text-cyan-300">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-4 text-3xl font-black">
          تعيين كلمة مرور جديدة
        </h1>

        {!ready ? (
          <p className="mt-6 text-slate-300">
            جارٍ تجهيز رابط الاستعادة...
          </p>
        ) : success ? (
          <div className="mt-7">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="font-black text-emerald-300">
                تم تغيير كلمة المرور بنجاح
              </p>

              <p className="mt-2 text-sm leading-7 text-slate-300">
                يمكنك الآن تسجيل الدخول
                باستخدام كلمة المرور الجديدة.
              </p>
            </div>

            <Link
              href="/login"
              className="mt-5 block rounded-xl bg-cyan-400 px-4 py-4 text-center font-black text-slate-950"
            >
              الانتقال إلى تسجيل الدخول
            </Link>
          </div>
        ) : tokenHash ? (
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
                تأكيد كلمة المرور الجديدة
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
                ? "جارٍ تغيير كلمة المرور..."
                : "تغيير كلمة المرور"}
            </button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-rose-300">
            رابط الاستعادة غير صحيح. اطلب
            رابطًا جديدًا.
          </div>
        )}
      </section>
    </main>
  );
}
