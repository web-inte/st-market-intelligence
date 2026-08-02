"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type NotificationSound =
  | "classic"
  | "pulse"
  | "alert"
  | "soft";

type NotificationSettings = {
  activeTradesEnabled: boolean;
  spxTradesEnabled: boolean;
  soundEnabled: boolean;
  activeSound: NotificationSound;
  spxSound: NotificationSound;
};

type NotificationItem = {
  id: string;
  type: "ACTIVE_TRADE" | "SPX_TRADE";
  title: string;
  description: string;
  href: string;
  createdAt: number;
  read: boolean;
};

type ActiveTradeRow = {
  id?: unknown;
  symbol?: unknown;
  side?: unknown;
  activatedAt?: unknown;
};

type ActiveTradesPayload = {
  ok?: unknown;
  trades?: unknown;
};

type SpxTradeRow = {
  id?: unknown;
  side?: unknown;
  strike?: unknown;
  option_ticker?: unknown;
  activated_at?: unknown;
};

type SpxPayload = {
  ok?: unknown;
  activeTrade?: unknown;
  trades?: unknown;
};

const SETTINGS_KEY =
  "st_market_trade_notification_settings";

const ITEMS_KEY =
  "st_market_trade_notification_items";

const ACTIVE_BASELINE_KEY =
  "st_market_active_trade_seen_ids";

const SPX_BASELINE_KEY =
  "st_market_spx_trade_seen_ids";

const AUTO_ENABLE_MIGRATION_KEY =
  "st_market_trade_alerts_auto_enabled_v1";

const POLL_INTERVAL_MS = 5_000;

const DEFAULT_SETTINGS: NotificationSettings = {
  activeTradesEnabled: true,
  spxTradesEnabled: true,
  soundEnabled: true,
  activeSound: "pulse",
  spxSound: "alert",
};

const HIDDEN_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
]);

function readJson<T>(
  key: string,
  fallback: T
): T {
  try {
    const raw =
      window.localStorage.getItem(key);

    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(
  key: string,
  value: unknown
) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  } catch {
    // نتجاهل تعذر التخزين المحلي.
  }
}

function textValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function timestampValue(
  value: unknown
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value < 10_000_000_000
      ? value * 1_000
      : value;
  }

  const raw =
    textValue(value);

  if (!raw) {
    return null;
  }

  const numeric =
    Number(raw);

  if (Number.isFinite(numeric)) {
    return numeric <
      10_000_000_000
      ? numeric * 1_000
      : numeric;
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getActiveRows(
  payload: ActiveTradesPayload
): ActiveTradeRow[] {
  return Array.isArray(payload.trades)
    ? payload.trades.filter(
        (
          item
        ): item is ActiveTradeRow =>
          Boolean(
            item &&
            typeof item === "object"
          )
      )
    : [];
}

function getSpxRows(
  payload: SpxPayload
): SpxTradeRow[] {
  if (
    !payload.activeTrade ||
    typeof payload.activeTrade !==
      "object"
  ) {
    return [];
  }

  const activeTrade =
    payload.activeTrade as SpxTradeRow;

  const id =
    textValue(activeTrade.id);

  return id
    ? [activeTrade]
    : [];
}

function BellIcon({
  active,
}: {
  active: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`h-6 w-6 ${
        active
          ? "text-amber-300"
          : "text-slate-300"
      }`}
    >
      <path
        d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 21h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (
    checked: boolean
  ) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <span className="text-sm font-bold text-slate-200">
        {label}
      </span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked
          )
        }
        className="h-5 w-5 cursor-pointer accent-amber-400"
      />
    </label>
  );
}

export default function TradeNotificationBell() {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] =
    useState(false);

  const [ready, setReady] =
    useState(false);

  const [settings, setSettings] =
    useState<NotificationSettings>(
      DEFAULT_SETTINGS
    );

  const [items, setItems] =
    useState<NotificationItem[]>([]);

  const activeRequestRunning =
    useRef(false);

  const activeBaselineReady =
    useRef(false);

  const activeWatcherStartedAt =
    useRef(Date.now());

  const spxRequestRunning =
    useRef(false);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const unreadCount =
    items.filter(
      (item) => !item.read
    ).length;

  const notificationsEnabled =
    settings.activeTradesEnabled ||
    settings.spxTradesEnabled;

  const unlockAudio =
    useCallback(async () => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (!AudioContextClass) {
          return;
        }

        const context =
          audioContextRef.current ||
          new AudioContextClass();

        audioContextRef.current =
          context;

        if (
          context.state ===
          "suspended"
        ) {
          await context.resume();
        }
      } catch {
        // المتصفح قد يمنع الصوت حتى أول تفاعل حقيقي.
      }
    }, []);

  const playSound =
    useCallback(
      (
        preset: NotificationSound,
        force = false
      ) => {
        if (
          !force &&
          !settings.soundEnabled
        ) {
          return;
        }

        try {
          const AudioContextClass =
            window.AudioContext ||
            (
              window as typeof window & {
                webkitAudioContext?:
                  typeof AudioContext;
              }
            ).webkitAudioContext;

          if (!AudioContextClass) {
            return;
          }

          const context =
            audioContextRef.current ||
            new AudioContextClass();

          audioContextRef.current =
            context;

          if (
            context.state ===
            "suspended"
          ) {
            void context.resume();
          }

          const tones: Record<
            NotificationSound,
            Array<{
              frequency: number;
              delay: number;
              duration: number;
              volume: number;
              type:
                | OscillatorType;
            }>
          > = {
            classic: [
              {
                frequency: 980,
                delay: 0,
                duration: 0.3,
                volume: 0.2,
                type: "sine",
              },
            ],
            pulse: [
              {
                frequency: 820,
                delay: 0,
                duration: 0.16,
                volume: 0.2,
                type: "sine",
              },
              {
                frequency: 1_080,
                delay: 0.19,
                duration: 0.2,
                volume: 0.22,
                type: "sine",
              },
            ],
            alert: [
              {
                frequency: 760,
                delay: 0,
                duration: 0.13,
                volume: 0.2,
                type: "triangle",
              },
              {
                frequency: 980,
                delay: 0.15,
                duration: 0.13,
                volume: 0.22,
                type: "triangle",
              },
              {
                frequency: 1_240,
                delay: 0.3,
                duration: 0.23,
                volume: 0.24,
                type: "triangle",
              },
            ],
            soft: [
              {
                frequency: 620,
                delay: 0,
                duration: 0.22,
                volume: 0.12,
                type: "sine",
              },
              {
                frequency: 760,
                delay: 0.24,
                duration: 0.28,
                volume: 0.14,
                type: "sine",
              },
            ],
          };

          const startAt =
            context.currentTime +
            0.01;

          for (
            const tone of tones[preset]
          ) {
            const oscillator =
              context.createOscillator();

            const gain =
              context.createGain();

            const toneStart =
              startAt + tone.delay;

            const toneEnd =
              toneStart +
              tone.duration;

            oscillator.type =
              tone.type;

            oscillator.frequency.setValueAtTime(
              tone.frequency,
              toneStart
            );

            gain.gain.setValueAtTime(
              0.0001,
              toneStart
            );

            gain.gain.exponentialRampToValueAtTime(
              tone.volume,
              toneStart + 0.025
            );

            gain.gain.exponentialRampToValueAtTime(
              0.0001,
              toneEnd
            );

            oscillator.connect(gain);

            gain.connect(
              context.destination
            );

            oscillator.start(
              toneStart
            );

            oscillator.stop(
              toneEnd + 0.02
            );
          }
        } catch {
          // بعض المتصفحات تمنع الصوت قبل أول تفاعل.
        }
      },
      [settings.soundEnabled]
    );

  const addNotification =
    useCallback(
      (
        item: Omit<
          NotificationItem,
          "createdAt" | "read"
        >
      ) => {
        setItems((previous) => {
          if (
            previous.some(
              (existing) =>
                existing.id === item.id
            )
          ) {
            return previous;
          }

          const next: NotificationItem[] =
            [
              {
                ...item,
                createdAt:
                  Date.now(),
                read: false,
              },
              ...previous,
            ].slice(0, 20);

          writeJson(
            ITEMS_KEY,
            next
          );

          playSound(
            item.type ===
              "SPX_TRADE"
              ? settings.spxSound
              : settings.activeSound
          );

          return next;
        });
      },
      [
        playSound,
        settings.activeSound,
        settings.spxSound,
      ]
    );

  const checkActiveTrades =
    useCallback(async () => {
      if (
        !settings.activeTradesEnabled ||
        activeRequestRunning.current
      ) {
        return;
      }

      activeRequestRunning.current =
        true;

      try {
        const response =
          await fetch(
            `/api/active-trades?t=${Date.now()}`,
            {
              cache: "no-store",
              credentials:
                "include",
              headers: {
                "Cache-Control":
                  "no-cache, no-store, max-age=0",
              },
            }
          );

        if (!response.ok) {
          return;
        }

        const payload =
          (await response.json()) as
            ActiveTradesPayload;

        const rows =
          getActiveRows(payload);

        const currentIds =
          rows
            .map((trade) =>
              textValue(trade.id)
            )
            .filter(Boolean);

        const storedIds =
          readJson<string[]>(
            ACTIVE_BASELINE_KEY,
            []
          );

        /*
          أول استجابة ناجحة بعد فتح الصفحة
          تعتبر خط أساس فقط.

          بهذه الطريقة لا يصدر الجرس تنبيهًا
          عن عقد كان موجودًا قبل تشغيله،
          حتى لو لم يكن معرّفه محفوظًا سابقًا.
        */
        if (
          !activeBaselineReady.current
        ) {
          activeBaselineReady.current =
            true;

          writeJson(
            ACTIVE_BASELINE_KEY,
            Array.from(
              new Set([
                ...storedIds,
                ...currentIds,
              ])
            ).slice(-500)
          );

          return;
        }

        const seen =
          new Set(storedIds);

        for (const trade of rows) {
          const id =
            textValue(trade.id);

          if (
            !id ||
            seen.has(id)
          ) {
            continue;
          }

          const activatedAt =
            timestampValue(
              trade.activatedAt
            );

          /*
            العقد غير المعروف لا يُعد جديدًا
            إلا إذا كان وقت تفعيله بعد تشغيل
            مراقب التنبيهات في هذه الجلسة.

            العقود القديمة أو التي لا تحتوي
            على وقت تفعيل تُحفظ بصمت فقط.
          */
          const isActuallyNew =
            activatedAt !== null &&
            activatedAt >=
              activeWatcherStartedAt.current;

          if (!isActuallyNew) {
            continue;
          }

          const symbol =
            textValue(
              trade.symbol
            ) || "صفقة";

          const side =
            textValue(
              trade.side
            );

          addNotification({
            id: `active:${id}`,
            type:
              "ACTIVE_TRADE",
            title:
              "صفقة نشطة جديدة",
            description:
              `${symbol}${
                side
                  ? ` ${side}`
                  : ""
              }`,
            href:
              "/active-trades",
          });
        }

        /*
          نحفظ جميع المعرّفات، سواء كانت
          جديدة أو قديمة، حتى لا يعاد
          فحصها أو التنبيه عنها مرة أخرى.
        */
        writeJson(
          ACTIVE_BASELINE_KEY,
          Array.from(
            new Set([
              ...storedIds,
              ...currentIds,
            ])
          ).slice(-500)
        );
      } catch {
        // لا نعرض خطأ للمستخدم عند فشل دورة مؤقتة.
      } finally {
        activeRequestRunning.current =
          false;
      }
    }, [
      addNotification,
      settings.activeTradesEnabled,
    ]);

  const checkSpxTrades =
    useCallback(async () => {
      if (
        !settings.spxTradesEnabled ||
        spxRequestRunning.current
      ) {
        return;
      }

      spxRequestRunning.current =
        true;

      try {
        const response =
          await fetch(
            `/api/spx-active-trade?t=${Date.now()}`,
            {
              cache: "no-store",
              credentials:
                "include",
              headers: {
                "Cache-Control":
                  "no-cache, no-store, max-age=0",
              },
            }
          );

        if (!response.ok) {
          return;
        }

        const payload =
          (await response.json()) as
            SpxPayload;

        const rows =
          getSpxRows(payload);

        const currentIds =
          rows
            .map((trade) =>
              textValue(trade.id)
            )
            .filter(Boolean);

        const storedIds =
          readJson<string[]>(
            SPX_BASELINE_KEY,
            []
          );

        if (storedIds.length === 0) {
          writeJson(
            SPX_BASELINE_KEY,
            currentIds
          );

          return;
        }

        const seen =
          new Set(storedIds);

        for (const trade of rows) {
          const id =
            textValue(trade.id);

          if (
            !id ||
            seen.has(id)
          ) {
            continue;
          }

          const side =
            textValue(
              trade.side
            );

          const strike =
            numberValue(
              trade.strike
            );

          addNotification({
            id: `spx:${id}`,
            type: "SPX_TRADE",
            title:
              "صفقة SPX جديدة",
            description:
              `SPX${
                side
                  ? ` ${side}`
                  : ""
              }${
                strike !== null
                  ? ` — ${strike}`
                  : ""
              }`,
            href: "/spx-whales",
          });
        }

        writeJson(
          SPX_BASELINE_KEY,
          Array.from(
            new Set([
              ...storedIds,
              ...currentIds,
            ])
          ).slice(-300)
        );
      } catch {
        // لا نعرض خطأ للمستخدم عند فشل دورة مؤقتة.
      } finally {
        spxRequestRunning.current =
          false;
      }
    }, [
      addNotification,
      settings.spxTradesEnabled,
    ]);

  useEffect(() => {
    const migrationDone =
      window.localStorage.getItem(
        AUTO_ENABLE_MIGRATION_KEY
      ) === "1";

    const storedSettings = {
      ...DEFAULT_SETTINGS,
      ...readJson<
        Partial<NotificationSettings>
      >(
        SETTINGS_KEY,
        {}
      ),
    };

    const nextSettings =
      migrationDone
        ? storedSettings
        : DEFAULT_SETTINGS;

    setSettings(
      nextSettings
    );

    if (!migrationDone) {
      writeJson(
        SETTINGS_KEY,
        nextSettings
      );

      window.localStorage.setItem(
        AUTO_ENABLE_MIGRATION_KEY,
        "1"
      );
    }

    setItems(
      readJson<NotificationItem[]>(
        ITEMS_KEY,
        []
      )
    );

    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let unlocked = false;

    const handleFirstInteraction =
      () => {
        if (unlocked) {
          return;
        }

        unlocked = true;
        void unlockAudio();

        window.removeEventListener(
          "pointerdown",
          handleFirstInteraction
        );

        window.removeEventListener(
          "keydown",
          handleFirstInteraction
        );

        window.removeEventListener(
          "touchstart",
          handleFirstInteraction
        );
      };

    window.addEventListener(
      "pointerdown",
      handleFirstInteraction,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "keydown",
      handleFirstInteraction
    );

    window.addEventListener(
      "touchstart",
      handleFirstInteraction,
      {
        passive: true,
      }
    );

    return () => {
      window.removeEventListener(
        "pointerdown",
        handleFirstInteraction
      );

      window.removeEventListener(
        "keydown",
        handleFirstInteraction
      );

      window.removeEventListener(
        "touchstart",
        handleFirstInteraction
      );
    };
  }, [ready, unlockAudio]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    writeJson(
      SETTINGS_KEY,
      settings
    );
  }, [ready, settings]);

  useEffect(() => {
    if (
      !ready ||
      !settings.activeTradesEnabled
    ) {
      return;
    }

    void checkActiveTrades();

    const interval =
      window.setInterval(
        () => {
          void checkActiveTrades();
        },
        POLL_INTERVAL_MS
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [
    ready,
    settings.activeTradesEnabled,
    checkActiveTrades,
  ]);

  useEffect(() => {
    if (
      !ready ||
      !settings.spxTradesEnabled
    ) {
      return;
    }

    void checkSpxTrades();

    const interval =
      window.setInterval(
        () => {
          void checkSpxTrades();
        },
        POLL_INTERVAL_MS
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [
    ready,
    settings.spxTradesEnabled,
    checkSpxTrades,
  ]);

  useEffect(() => {
    const close = (
      event: MouseEvent
    ) => {
      const target =
        event.target as HTMLElement;

      if (
        !target.closest(
          "[data-trade-notification-bell]"
        )
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      close
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        close
      );
  }, []);

  const markAllRead = () => {
    setItems((previous) => {
      const next =
        previous.map(
          (item) => ({
            ...item,
            read: true,
          })
        );

      writeJson(
        ITEMS_KEY,
        next
      );

      return next;
    });
  };

  const openItem = (
    item: NotificationItem
  ) => {
    setItems((previous) => {
      const next =
        previous.map(
          (existing) =>
            existing.id ===
            item.id
              ? {
                  ...existing,
                  read: true,
                }
              : existing
        );

      writeJson(
        ITEMS_KEY,
        next
      );

      return next;
    });

    setOpen(false);
    router.push(item.href);
  };

  const clearItems = () => {
    setItems([]);
    writeJson(
      ITEMS_KEY,
      []
    );
  };

  const togglePanel = () => {
    setOpen((previous) =>
      !previous
    );

    if (!open) {
      markAllRead();
    }
  };

  if (
    !ready ||
    HIDDEN_PATHS.has(pathname)
  ) {
    return null;
  }

  return (
    <div
      dir="rtl"
      data-trade-notification-bell
      className="fixed right-4 top-4 z-[90]"
    >
      <button
        type="button"
        onClick={togglePanel}
        aria-label="إعدادات تنبيهات الصفقات"
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/95 shadow-xl backdrop-blur transition hover:border-amber-400/40 hover:bg-slate-900"
      >
        <BellIcon
          active={
            notificationsEnabled
          }
        />

        {unreadCount > 0 && (
          <span className="absolute -left-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
            {unreadCount > 9
              ? "9+"
              : unreadCount}
          </span>
        )}

        {notificationsEnabled && (
          <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-3 top-20 w-auto overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] rounded-2xl border border-white/10 bg-slate-950/98 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-auto md:mt-3 md:max-h-[calc(100dvh-5rem)] md:w-[min(92vw,360px)] md:pb-0">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-white">
                  تنبيهات الصفقات
                </h2>

                <p className="mt-1 text-xs leading-5 text-slate-400">
                  التنبيه يعمل عند ظهور صفقة جديدة فقط.
                </p>
              </div>

              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                  notificationsEnabled
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-slate-500/30 bg-slate-500/10 text-slate-400"
                }`}
              >
                {notificationsEnabled
                  ? "مفعّل"
                  : "متوقف"}
              </span>
            </div>
          </div>

          <div className="space-y-2 p-3">
            <Toggle
              checked={
                settings.activeTradesEnabled
              }
              onChange={(
                checked
              ) =>
                setSettings(
                  (previous) => ({
                    ...previous,
                    activeTradesEnabled:
                      checked,
                  })
                )
              }
              label="الصفقات النشطة الجديدة"
            />

            <Toggle
              checked={
                settings.spxTradesEnabled
              }
              onChange={(
                checked
              ) =>
                setSettings(
                  (previous) => ({
                    ...previous,
                    spxTradesEnabled:
                      checked,
                  })
                )
              }
              label="صفقات SPX الجديدة"
            />

            <Toggle
              checked={
                settings.soundEnabled
              }
              onChange={(
                checked
              ) => {
                setSettings(
                  (previous) => ({
                    ...previous,
                    soundEnabled:
                      checked,
                  })
                );
              }}
              label="تشغيل صوت التنبيه"
            />

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="active-trade-sound"
                  className="text-xs font-bold text-slate-300"
                >
                  نغمة الصفقات النشطة
                </label>

                <button
                  type="button"
                  onClick={() => {
                    void unlockAudio();

                    playSound(
                      settings.activeSound,
                      true
                    );
                  }}
                  className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black text-sky-300 transition hover:bg-sky-400/20"
                >
                  تجربة
                </button>
              </div>

              <select
                id="active-trade-sound"
                value={
                  settings.activeSound
                }
                onChange={(event) =>
                  setSettings(
                    (previous) => ({
                      ...previous,
                      activeSound:
                        event.target
                          .value as NotificationSound,
                    })
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-sky-400/50"
              >
                <option value="classic">
                  كلاسيكية — نغمة واحدة
                </option>

                <option value="pulse">
                  نبض — تن تن
                </option>

                <option value="alert">
                  تنبيه — ثلاث نغمات
                </option>

                <option value="soft">
                  هادئة — نغمتان خفيفتان
                </option>
              </select>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="spx-trade-sound"
                  className="text-xs font-bold text-slate-300"
                >
                  نغمة صفقات SPX
                </label>

                <button
                  type="button"
                  onClick={() => {
                    void unlockAudio();

                    playSound(
                      settings.spxSound,
                      true
                    );
                  }}
                  className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black text-amber-300 transition hover:bg-amber-400/20"
                >
                  تجربة
                </button>
              </div>

              <select
                id="spx-trade-sound"
                value={
                  settings.spxSound
                }
                onChange={(event) =>
                  setSettings(
                    (previous) => ({
                      ...previous,
                      spxSound:
                        event.target
                          .value as NotificationSound,
                    })
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none transition focus:border-amber-400/50"
              >
                <option value="classic">
                  كلاسيكية — نغمة واحدة
                </option>

                <option value="pulse">
                  نبض — تن تن
                </option>

                <option value="alert">
                  تنبيه — ثلاث نغمات
                </option>

                <option value="soft">
                  هادئة — نغمتان خفيفتان
                </option>
              </select>
            </div>
          </div>

          <div className="border-t border-white/10">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-black text-slate-300">
                آخر التنبيهات
              </span>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearItems}
                  className="text-xs font-bold text-rose-300 transition hover:text-rose-200"
                >
                  مسح
                </button>
              )}
            </div>

            <div className="px-3 pb-3 md:max-h-72 md:overflow-y-auto md:overscroll-contain">
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
                  لا توجد تنبيهات جديدة
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map(
                    (item) => (
                      <button
                        key={
                          item.id
                        }
                        type="button"
                        onClick={() =>
                          openItem(
                            item
                          )
                        }
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-right transition hover:border-amber-400/30 hover:bg-white/[0.07]"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              item.type ===
                              "SPX_TRADE"
                                ? "bg-violet-400"
                                : "bg-emerald-400"
                            }`}
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-white">
                              {
                                item.title
                              }
                            </p>

                            <p
                              dir="ltr"
                              className="mt-1 truncate text-right text-xs font-bold text-slate-300"
                            >
                              {
                                item.description
                              }
                            </p>

                            <p className="mt-1 text-[10px] text-slate-500">
                              {new Date(
                                item.createdAt
                              ).toLocaleTimeString(
                                "ar-SA",
                                {
                                  hour:
                                    "2-digit",
                                  minute:
                                    "2-digit",
                                }
                              )}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
