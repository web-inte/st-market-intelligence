"use client";

import {
  useEffect,
  useState,
} from "react";

export default function RecoveryPage() {
  const [tokenHash, setTokenHash] =
    useState<string | null>(null);

  const [ready, setReady] =
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

  function continueRecovery() {
    if (!tokenHash) {
      return;
    }

    window.location.assign(
      `/auth/recovery-callback?token_hash=${encodeURIComponent(
        tokenHash
      )}`
    );
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
            جارٍ التحقق من الرابط...
          </p>
        ) : tokenHash ? (
          <>
            <p className="mt-5 leading-8 text-slate-300">
              اضغط الزر التالي للانتقال إلى
              صفحة تعيين كلمة المرور الجديدة.
            </p>

            <button
              type="button"
              onClick={continueRecovery}
              className="mt-7 w-full rounded-xl bg-cyan-400 px-4 py-4 font-black text-slate-950"
            >
              متابعة استعادة كلمة المرور
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
