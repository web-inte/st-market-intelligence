"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { getDeviceSecurityData } from "@/lib/device-security";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      return;
    }

    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setLoading(true);

    const {
      deviceHash,
      fingerprintHash,
    } =
      await getDeviceSecurityData();

    const { data, error: signupError } =
      await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo:
            `${window.location.origin}/auth/callback?next=/account`,
          data: {
            full_name: fullName.trim(),
            device_hash: deviceHash,
            fingerprint_hash:
              fingerprintHash,
          },
        },
      });

    if (signupError) {
      setError(
        signupError.message.toLowerCase().includes("already")
          ? "هذا البريد مسجل مسبقًا."
          : signupError.message
      );
      setLoading(false);
      return;
    }

    if (data.session) {
      const {
        error: deviceError,
      } = await supabase.rpc(
        "claim_login_device",
        {
          p_device_hash: deviceHash,
        }
      );

      if (deviceError) {
        await supabase.auth.signOut();

        setError(
          "تم إنشاء الحساب، لكن تعذر ربط الجهاز. سجل الدخول مرة أخرى."
        );
        setLoading(false);
        return;
      }

      const trialResponse =
        await fetch("/api/trial/start", {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization:
              `Bearer ${data.session.access_token}`,
          },
        });

if (!trialResponse.ok) {
  console.error(
    "Trial start request failed:",
    await trialResponse.text()
  );
}

router.replace("/account");
      router.refresh();
      return;
    }

    setMessage(
      "تم إنشاء الحساب. افتح بريدك الإلكتروني واضغط رابط تأكيد الحساب."
    );
    setLoading(false);
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
          إنشاء حساب
        </h1>

        <p className="mt-2 text-sm text-slate-400">
          سجل حسابك لتبدأ الفترة التجريبية.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <input
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            placeholder="الاسم الكامل"
          />

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            placeholder="البريد الإلكتروني"
          />

          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            placeholder="كلمة المرور — 8 أحرف على الأقل"
          />

          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            placeholder="تأكيد كلمة المرور"
          />

          {error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || Boolean(message)}
            className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            {loading ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4">
          <p className="text-sm font-black text-cyan-300">
            هل أنت مستخدم جديد؟
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            إذا واجهتك مشكلة في تفعيل التجربة المجانية لمدة 3 أيام،
            انضم إلى قناة التلقرام وتواصل مع أحد مشرفي القناة لمراجعة حسابك.
          </p>

          <a
            href="https://t.me/ST_Levels"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-300 transition hover:bg-cyan-400/15"
          >
            الانضمام إلى قناة التلقرام
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          لديك حساب؟{" "}
          <Link href="/login" className="font-bold text-cyan-400">
            تسجيل الدخول
          </Link>
        </p>
      </section>
    </main>
  );
}
