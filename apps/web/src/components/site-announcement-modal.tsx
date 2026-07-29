"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Announcement = {
  id: number;
  title: string;
  message: string;
  version: number;
  updatedAt: string;
};

const POLL_INTERVAL_MS = 15_000;
const AUTO_CLOSE_SECONDS = 10;

function getAnnouncementKey(
  announcement: Announcement
) {
  return [
    announcement.id,
    announcement.version,
    announcement.updatedAt,
  ].join(":");
}

export default function SiteAnnouncementModal() {
  const [announcement, setAnnouncement] =
    useState<Announcement | null>(null);

  const [visible, setVisible] =
    useState(false);

  const [secondsLeft, setSecondsLeft] =
    useState(AUTO_CLOSE_SECONDS);

  const currentKeyRef =
    useRef("");

  const closeTimerRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const isRequestRunningRef =
    useRef(false);

  const closeAnnouncement =
    useCallback(() => {
      setVisible(false);
      setSecondsLeft(
        AUTO_CLOSE_SECONDS
      );

      if (closeTimerRef.current) {
        clearInterval(
          closeTimerRef.current
        );

        closeTimerRef.current =
          null;
      }
    }, []);

  const showAnnouncement =
    useCallback(
      (
        nextAnnouncement:
          Announcement
      ) => {
        const nextKey =
          getAnnouncementKey(
            nextAnnouncement
          );

        /*
          لا نعيد نفس الإعلان في كل طلب تحديث.
          كل ضغطة نشر من الأدمن ترفع version،
          ولذلك يظهر الإعلان من جديد.
        */
        if (
          currentKeyRef.current ===
          nextKey
        ) {
          return;
        }

        currentKeyRef.current =
          nextKey;

        setAnnouncement(
          nextAnnouncement
        );

        setSecondsLeft(
          AUTO_CLOSE_SECONDS
        );

        setVisible(true);

        if (closeTimerRef.current) {
          clearInterval(
            closeTimerRef.current
          );
        }

        closeTimerRef.current =
          setInterval(() => {
            setSecondsLeft(
              (currentSeconds) => {
                if (
                  currentSeconds <= 1
                ) {
                  closeAnnouncement();
                  return 0;
                }

                return (
                  currentSeconds - 1
                );
              }
            );
          }, 1000);
      },
      [closeAnnouncement]
    );

  const loadAnnouncement =
    useCallback(async () => {
      if (
        isRequestRunningRef.current
      ) {
        return;
      }

      isRequestRunningRef.current =
        true;

      try {
        const response = await fetch(
          "/api/announcement",
          {
            cache: "no-store",
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          return;
        }

        const nextAnnouncement:
          | Announcement
          | null =
          data.announcement;

        /*
          عند إيقاف الإعلان من الأدمن
          تختفي النافذة في أقرب دورة تحديث.
        */
        if (!nextAnnouncement) {
          if (visible) {
            closeAnnouncement();
          }

          return;
        }

        showAnnouncement(
          nextAnnouncement
        );
      } catch (error) {
        console.error(
          "تعذر تحميل إعلان الموقع:",
          error
        );
      } finally {
        isRequestRunningRef.current =
          false;
      }
    }, [
      closeAnnouncement,
      showAnnouncement,
      visible,
    ]);

  useEffect(() => {
    void loadAnnouncement();

    const pollingTimer =
      setInterval(() => {
        void loadAnnouncement();
      }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(
        pollingTimer
      );

      if (closeTimerRef.current) {
        clearInterval(
          closeTimerRef.current
        );
      }
    };
  }, [loadAnnouncement]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape"
      ) {
        closeAnnouncement();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    visible,
    closeAnnouncement,
  ]);

  if (
    !visible ||
    !announcement
  ) {
    return null;
  }

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-announcement-title"
      aria-describedby="site-announcement-message"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm"
    >
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-amber-300/30 bg-slate-900 shadow-2xl shadow-black/50">
        <div className="h-1.5 w-full bg-amber-300" />

        <button
          type="button"
          onClick={
            closeAnnouncement
          }
          aria-label="إغلاق الإعلان"
          className="absolute left-4 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950 text-xl font-black text-white transition hover:border-rose-400/50 hover:bg-rose-500/20"
        >
          ×
        </button>

        <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
          <div className="flex items-center gap-3 pl-12">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-300/10 text-2xl">
              ⚠️
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                إعلان مهم
              </p>

              <h2
                id="site-announcement-title"
                className="mt-1 text-xl font-black text-white sm:text-2xl"
              >
                {announcement.title ||
                  "تنبيه مهم"}
              </h2>
            </div>
          </div>

          <p
            id="site-announcement-message"
            className="mt-6 whitespace-pre-wrap text-base font-medium leading-8 text-slate-200"
          >
            {announcement.message}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <p className="text-sm font-bold text-slate-400">
              يختفي الإعلان تلقائيًا بعد{" "}
              <span className="text-amber-300">
                {secondsLeft}
              </span>{" "}
              ثوانٍ
            </p>

            <button
              type="button"
              onClick={
                closeAnnouncement
              }
              className="rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
