"use client";

import {
  type FormEvent,
  useState,
} from "react";

type Result = {
  ok: boolean;
  created: boolean;
  email: string;
  fullName: string;
  daysAdded: number;
  planName: string;
  endsAt: string;
  temporaryPassword: string | null;
};

export default function AdminPanel() {
  const [email, setEmail] =
    useState("");

  const [fullName, setFullName] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [days, setDays] =
    useState("14");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [result, setResult] =
    useState<Result | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        "/api/admin/subscriptions",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            fullName,
            password,
            days: Number(days),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر تنفيذ العملية"
        );
      }

      setResult(data);
      setPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "حدث خطأ غير متوقع"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-3xl border border-white/10 bg-slate-900 p-6"
      >
        <div>
          <label className="mb-2 block text-sm font-bold">
            البريد الإلكتروني
          </label>

          <input
            type="email"
            required
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
            placeholder="name@example.com"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">
            الاسم
          </label>

          <input
            type="text"
            value={fullName}
            onChange={(event) =>
              setFullName(
                event.target.value
              )
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
            placeholder="اختياري للمستخدم الموجود"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">
            كلمة مرور مؤقتة
          </label>

          <input
            type="text"
            minLength={8}
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
            placeholder="اتركها فارغة لتوليد كلمة مرور"
          />

          <p className="mt-2 text-xs text-slate-500">
            تستخدم فقط عند إنشاء مستخدم جديد.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">
            المدة بالأيام
          </label>

          <input
            type="number"
            required
            min={1}
            max={3650}
            value={days}
            onChange={(event) =>
              setDays(event.target.value)
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
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
          className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
        >
          {loading
            ? "جارٍ التنفيذ..."
            : "إضافة أو تمديد المستخدم"}
        </button>
      </form>

      <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
        <h2 className="text-xl font-black">
          نتيجة العملية
        </h2>

        {!result ? (
          <p className="mt-4 text-sm leading-7 text-slate-400">
            إذا كان البريد موجودًا سيتم تمديد اشتراكه.
            وإذا لم يكن موجودًا سيتم إنشاء حساب مؤكد ومنحه المدة المحددة.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-950 p-4">
              <p className="text-sm text-slate-400">
                الحالة
              </p>

              <p className="mt-1 font-black text-emerald-300">
                {result.created
                  ? "تم إنشاء مستخدم جديد"
                  : "تم تمديد المستخدم"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <p className="text-sm text-slate-400">
                البريد
              </p>

              <p className="mt-1 break-all font-bold">
                {result.email}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950 p-4">
              <p className="text-sm text-slate-400">
                نهاية الاشتراك
              </p>

              <p className="mt-1 font-bold">
                {new Intl.DateTimeFormat(
                  "ar-SA",
                  {
                    dateStyle: "full",
                    timeStyle: "short",
                  }
                ).format(
                  new Date(result.endsAt)
                )}
              </p>
            </div>

            {result.temporaryPassword ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                <p className="text-sm text-amber-200">
                  كلمة المرور المؤقتة
                </p>

                <p
                  dir="ltr"
                  className="mt-2 break-all font-mono text-lg font-black text-white"
                >
                  {result.temporaryPassword}
                </p>

                <p className="mt-2 text-xs text-slate-400">
                  انسخها الآن وأرسلها للمستخدم.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
