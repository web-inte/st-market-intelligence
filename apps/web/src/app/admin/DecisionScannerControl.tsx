"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";

type RoundNumber =
  | "1"
  | "2"
  | "3"
  | "4";

const ROUNDS: Array<{
  value: RoundNumber;
  label: string;
  description: string;
}> = [
  {
    value: "1",
    label: "الدائرة الأولى",
    description:
      "تشغيل رموز المجموعة الأولى",
  },
  {
    value: "2",
    label: "الدائرة الثانية",
    description:
      "تشغيل رموز المجموعة الثانية",
  },
  {
    value: "3",
    label: "الدائرة الثالثة",
    description:
      "تشغيل رموز المجموعة الثالثة",
  },
  {
    value: "4",
    label: "الدائرة الرابعة",
    description:
      "تشغيل رموز المجموعة الرابعة",
  },
];

export default function DecisionScannerControl() {
  const supabase =
    useMemo(
      () => createClient(),
      []
    );

  const [
    selectedRound,
    setSelectedRound,
  ] = useState<RoundNumber>("1");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    stopping,
    setStopping,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  async function startScan() {
    if (loading) {
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const {
        data: sessionData,
      } =
        await supabase.auth
          .getSession();

      const accessToken =
        sessionData.session
          ?.access_token;

      if (!accessToken) {
        throw new Error(
          "انتهت جلسة الدخول، سجّل الدخول من جديد"
        );
      }

      const response =
        await fetch(
          "/api/admin/decision-scanner",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              action: "start",
              round:
                selectedRound,
            }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.ok
      ) {
        throw new Error(
          result.error ||
          "تعذر تشغيل البحث"
        );
      }

      setMessage(
        result.message ||
        "تم بدء البحث"
      );
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "تعذر تشغيل البحث"
      );
    } finally {
      setLoading(false);
    }
  }

  async function stopScan() {
    if (
      loading ||
      stopping
    ) {
      return;
    }

    setStopping(true);
    setMessage("");
    setError("");

    try {
      const {
        data: sessionData,
      } =
        await supabase.auth
          .getSession();

      const accessToken =
        sessionData.session
          ?.access_token;

      if (!accessToken) {
        throw new Error(
          "انتهت جلسة الدخول، سجّل الدخول من جديد"
        );
      }

      const response =
        await fetch(
          "/api/admin/decision-scanner",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              action: "stop",
            }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.ok
      ) {
        throw new Error(
          result.error ||
          "تعذر إيقاف البحث"
        );
      }

      setMessage(
        result.message ||
        "تم إرسال أمر إيقاف البحث"
      );
    } catch (stopError) {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "تعذر إيقاف البحث"
      );
    } finally {
      setStopping(false);
    }
  }

  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/20 sm:p-6"
    >
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-cyan-400">
          تحكم الأدمن
        </p>

        <h2 className="mt-2 text-xl font-black text-white">
          تشغيل بحث محرك القرار
        </h2>

        <p className="mt-2 text-sm leading-7 text-slate-400">
          اختر الدائرة ثم ابدأ البحث.
          تم إيقاف الجدولة التلقائية،
          ولن يبدأ أي فحص إلا من هذا الزر.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ROUNDS.map((round) => {
          const selected =
            selectedRound ===
            round.value;

          return (
            <button
              key={round.value}
              type="button"
              onClick={() =>
                setSelectedRound(
                  round.value
                )
              }
              className={[
                "rounded-2xl border p-4 text-right transition",
                selected
                  ? "border-cyan-400/60 bg-cyan-400/10 text-white"
                  : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700",
              ].join(" ")}
            >
              <span className="block font-black">
                {round.label}
              </span>

              <span className="mt-1 block text-xs leading-6 text-slate-400">
                {round.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)]">
        <button
          type="button"
          disabled={
            loading ||
            stopping
          }
          onClick={startScan}
          className="min-w-0 rounded-2xl bg-cyan-400 px-3 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
        >
          {loading
            ? "جارٍ بدء البحث..."
            : `بدء بحث الدائرة ${selectedRound}`}
        </button>

        <button
          type="button"
          disabled={
            loading ||
            stopping
          }
          onClick={stopScan}
          className="min-w-0 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-3 text-sm font-black text-rose-300 transition hover:border-rose-400/70 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
        >
          {stopping
            ? "جارٍ الإيقاف..."
            : "إيقاف البحث"}
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm font-bold text-emerald-300">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm font-bold text-rose-300">
          {error}
        </div>
      ) : null}
    </section>
  );
}
