"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
} from "react";

type AutoRefreshProps = {
  intervalMs?: number;
};

export default function AutoRefresh({
  intervalMs = 20_000,
}: AutoRefreshProps) {
  const router = useRouter();

  const [isPending, startTransition] =
    useTransition();

  const safeInterval = Math.max(
    5_000,
    intervalMs,
  );

  const totalSeconds = Math.ceil(
    safeInterval / 1_000,
  );

  const [secondsLeft, setSecondsLeft] =
    useState(totalSeconds);

  useEffect(() => {
    let nextRefresh =
      Date.now() + safeInterval;

    function refreshPage() {
      startTransition(() => {
        router.refresh();
      });

      nextRefresh =
        Date.now() + safeInterval;

      setSecondsLeft(totalSeconds);
    }

    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (nextRefresh - Date.now()) / 1_000,
        ),
      );

      setSecondsLeft(remaining);

      if (Date.now() >= nextRefresh) {
        if (
          document.visibilityState ===
          "visible"
        ) {
          refreshPage();
        } else {
          nextRefresh =
            Date.now() + safeInterval;
        }
      }
    }, 1_000);

    function handleVisibilityChange() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        refreshPage();
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [
    router,
    safeInterval,
    totalSeconds,
  ]);

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3 text-xs">
      <div className="flex items-center gap-2 font-bold text-emerald-300">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />

        <span>
          الرصد والتحديث التلقائي يعمل
        </span>
      </div>

      <span className="text-slate-400">
        {isPending
          ? "جارٍ جلب الصفقات..."
          : `التحديث خلال ${secondsLeft} ثانية`}
      </span>
    </div>
  );
}
