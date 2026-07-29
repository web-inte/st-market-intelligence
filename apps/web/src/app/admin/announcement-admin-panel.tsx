"use client";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

type Announcement = {
  id: number;
  title: string;
  message: string;
  enabled: boolean;
  version: number;
  updated_at: string;
};

export default function AnnouncementAdminPanel() {
  const [title, setTitle] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [enabled, setEnabled] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  async function loadAnnouncement() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/announcement",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر قراءة الإعلان"
        );
      }

      const announcement:
        | Announcement
        | null =
        data.announcement;

      if (announcement) {
        setTitle(
          announcement.title || ""
        );

        setMessage(
          announcement.message || ""
        );

        setEnabled(
          Boolean(
            announcement.enabled
          )
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "حدث خطأ غير متوقع"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnnouncement();
  }, []);

  async function handlePublish(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanMessage =
      message.trim();

    if (!cleanMessage) {
      setError(
        "اكتب نص الإعلان أولًا"
      );
      setSuccess("");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/admin/announcement",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            message: cleanMessage,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر نشر الإعلان"
        );
      }

      setEnabled(true);
      setSuccess(
        "تم نشر الإعلان بنجاح"
      );
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "حدث خطأ غير متوقع"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStop() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/admin/announcement",
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر إيقاف الإعلان"
        );
      }

      setEnabled(false);
      setSuccess(
        "تم إيقاف الإعلان"
      );
    } catch (stopError) {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "حدث خطأ غير متوقع"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-amber-300">
            إعلان الموقع
          </p>

          <h2 className="mt-2 text-2xl font-black">
            الإعلان المنبثق
          </h2>

          <p className="mt-2 text-sm leading-7 text-slate-400">
            يظهر الإعلان للمشتركين في وسط الشاشة،
            ويختفي بعد 10 ثوانٍ أو عند الضغط على زر الإغلاق.
          </p>
        </div>

        <div
          className={`rounded-full border px-4 py-2 text-sm font-black ${
            enabled
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-slate-600 bg-slate-950 text-slate-400"
          }`}
        >
          {loading
            ? "جارٍ التحقق..."
            : enabled
              ? "الإعلان يعمل الآن"
              : "الإعلان متوقف"}
        </div>
      </div>

      <form
        onSubmit={handlePublish}
        className="mt-6 space-y-5"
      >
        <div>
          <label className="mb-2 block text-sm font-bold">
            عنوان الإعلان
          </label>

          <input
            type="text"
            maxLength={120}
            value={title}
            disabled={
              loading || saving
            }
            onChange={(event) =>
              setTitle(
                event.target.value
              )
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-amber-300 disabled:opacity-60"
            placeholder="مثال: تنبيه مهم اليوم"
          />

          <p className="mt-2 text-xs text-slate-500">
            العنوان اختياري.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">
            نص الإعلان
          </label>

          <textarea
            required
            rows={6}
            maxLength={2000}
            value={message}
            disabled={
              loading || saving
            }
            onChange={(event) =>
              setMessage(
                event.target.value
              )
            }
            className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-4 py-3 leading-7 outline-none focus:border-amber-300 disabled:opacity-60"
            placeholder="اكتب الإعلان الذي تريد إظهاره للمشتركين..."
          />

          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              لا يمكن نشر إعلان فارغ.
            </span>

            <span>
              {message.length}/2000
            </span>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-300">
            {success}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="submit"
            disabled={
              loading ||
              saving ||
              !message.trim()
            }
            className="rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "جارٍ التنفيذ..."
              : "نشر الإعلان"}
          </button>

          <button
            type="button"
            onClick={handleStop}
            disabled={
              loading ||
              saving ||
              !enabled
            }
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 font-black text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            إيقاف الإعلان
          </button>
        </div>
      </form>
    </section>
  );
}
