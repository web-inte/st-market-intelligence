"use client";

import {
  useEffect,
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

  const [
    autoEnabled,
    setAutoEnabled,
  ] = useState<boolean | null>(
    null
  );

  const [
    autoLoading,
    setAutoLoading,
  ] = useState(false);

  const [
    scanStatus,
    setScanStatus,
  ] = useState<
    "searching" |
    "waiting" |
    "stopped"
  >("stopped");

  const [
    activeRound,
    setActiveRound,
  ] = useState<
    string | null
  >(null);


  async function sendAutoAction(
    action:
      | "auto_status"
      | "auto_start"
      | "auto_stop"
  ) {
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
            action,
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
        "تعذر تحديث البحث التلقائي"
      );
    }

    return result;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAutoStatus() {
      try {
        const result =
          await sendAutoAction(
            "auto_status"
          );

        if (!cancelled) {
          setAutoEnabled(
            Boolean(
              result.autoEnabled
            )
          );

          setScanStatus(
            result.scanStatus ||
              (
                result.autoEnabled
                  ? "waiting"
                  : "stopped"
              )
          );

          setActiveRound(
            result.activeRound ||
              null
          );
        }
      } catch (statusError) {
        if (!cancelled) {
          setAutoEnabled(null);

          setError(
            statusError instanceof Error
              ? statusError.message
              : "تعذر قراءة حالة البحث التلقائي"
          );
        }
      }
    }

    void loadAutoStatus();

    const interval =
      window.setInterval(
        () => {
          void loadAutoStatus();
        },
        10000
      );

    return () => {
      cancelled = true;
      window.clearInterval(
        interval
      );
    };
  }, [supabase]);

  async function toggleAutoScan() {
    if (
      autoLoading ||
      autoEnabled === null
    ) {
      return;
    }

    setAutoLoading(true);
    setMessage("");
    setError("");

    try {
      const result =
        await sendAutoAction(
          autoEnabled
            ? "auto_stop"
            : "auto_start"
        );

      setAutoEnabled(
        Boolean(
          result.autoEnabled
        )
      );

      setScanStatus(
        result.autoEnabled
          ? result.startedRound
            ? "searching"
            : "waiting"
          : "stopped"
      );

      setActiveRound(
        result.startedRound ||
          null
      );

      setMessage(
        result.message ||
        "تم تحديث حالة البحث التلقائي"
      );
    } catch (autoError) {
      setError(
        autoError instanceof Error
          ? autoError.message
          : "تعذر تحديث البحث التلقائي"
      );
    } finally {
      setAutoLoading(false);
    }
  }

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
          اختر الدائرة للتشغيل اليدوي،
          أو استخدم التشغيل التلقائي
          لتشغيل الدوائر بالتتابع، ثم
          راحة 15 دقيقة بعد اكتمال الأربع.
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

      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-black text-white">
                البحث التلقائي
              </p>

              <span
                className={[
                  "rounded-full px-2.5 py-1 text-[11px] font-black",
                  autoEnabled === true
                    ? "bg-emerald-400/10 text-emerald-300"
                    : autoEnabled === false
                      ? "bg-rose-400/10 text-rose-300"
                      : "bg-slate-800 text-slate-400",
                ].join(" ")}
              >
                {autoEnabled === true
                  ? "شغال"
                  : autoEnabled === false
                    ? "متوقف"
                    : "جارٍ التحقق"}
              </span>
            </div>

            <p className="mt-2 text-xs leading-6 text-slate-400">
              1 ← 2 ← 3 ← 4، ثم راحة
              15 دقيقة وإعادة الدورة حتى
              15:30 بتوقيت نيويورك.
            </p>

            {autoEnabled === true && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-black",
                    scanStatus ===
                    "searching"
                      ? "bg-cyan-400/10 text-cyan-300"
                      : "bg-amber-400/10 text-amber-300",
                  ].join(" ")}
                >
                  {scanStatus ===
                  "searching"
                    ? activeRound
                      ? `🔍 جاري البحث — الدائرة ${activeRound}`
                      : "🔍 جاري البحث الآن"
                    : "⏱️ في انتظار الدائرة التالية / استراحة"}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={
              autoLoading ||
              autoEnabled === null
            }
            onClick={toggleAutoScan}
            className={[
              "rounded-2xl px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50",
              autoEnabled
                ? "border border-rose-400/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                : "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
            ].join(" ")}
          >
            {autoLoading
              ? "جارٍ التحديث..."
              : autoEnabled
                ? "إيقاف التلقائي"
                : "تشغيل التلقائي"}
          </button>
        </div>
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
