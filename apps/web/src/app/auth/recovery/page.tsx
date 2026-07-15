"use client";

import {
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

  const [ready, setReady] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

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

  async function continueRecovery() {
    if (!tokenHash) {
      setError(
        "رابط الاستعادة غير صحيح. اطلب رابطًا جديدًا."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const {
        data,
        error: verifyError,
      } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (verifyError) {
        throw verifyError;
      }

      if (!data.session) {
        throw new Error(
          "تعذر إنشاء جلسة استعادة كلمة المرور"
        );
      }

      window.location.replace(
        "/update-password"
      );
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "رابط الاستعادة غير صالح أو منتهي"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"
    >
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <p className="text-sm font-bold text-cyan-300">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-4 text-3xl font-black">
          استعادة كلمة المرور
        </h1>

        {!ready ? (
          <p className="mt-5 text-slate-300">
            جارٍ تجهيز رابط الاستعادة...
          </p>
        ) : tokenHash ? (
          <>
            <p className="mt-5 leading-8 text-slate-300">
              اضغط الزر التالي للانتقال إلى
              صفحة تعيين كلمة المرور الجديدة.
            </p>

            {error ? (
              <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-rose-300">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              disabled={loading}
              onClick={continueRecovery}
              className="mt-7 w-full rounded-xl bg-cyan-400 px-4 py-4 font-black text-slate-950 disabled:opacity-60"
            >
              {loading
                ? "جارٍ التحقق..."
                : "متابعة استعادة كلمة المرور"}
            </button>
          </>
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
