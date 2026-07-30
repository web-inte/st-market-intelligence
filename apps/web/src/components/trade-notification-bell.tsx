"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type NotificationSettings = {
  activeTradesEnabled: boolean;
  spxTradesEnabled: boolean;
  soundEnabled: boolean;
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
  const rows: SpxTradeRow[] = [];

  if (
    payload.activeTrade &&
    typeof payload.activeTrade === "object"
  ) {
    rows.push(
      payload.activeTrade as SpxTradeRow
    );
  }

  if (Array.isArray(payload.trades)) {
    for (const item of payload.trades) {
      if (
        item &&
        typeof item === "object"
      ) {
        rows.push(item as SpxTradeRow);
      }
    }
  }

  const unique =
    new Map<string, SpxTradeRow>();

  for (const row of rows) {
    const id = textValue(row.id);

    if (id) {
      unique.set(id, row);
    }
  }

  return Array.from(unique.values());
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
    useCallback(() => {
      if (!settings.soundEnabled) {
        return;
      }

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
          void context.resume();
        }

        const oscillator =
          context.createOscillator();

        const gain =
          context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(
          880,
          context.currentTime
        );

        oscillator.frequency.setValueAtTime(
          1_080,
          context.currentTime + 0.12
        );

        gain.gain.setValueAtTime(
          0.0001,
          context.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
          0.22,
          context.currentTime + 0.02
        );

        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.35
        );

        oscillator.connect(gain);
        gain.connect(
          context.destination
        );

        oscillator.start();
        oscillator.stop(
          context.currentTime + 0.36
        );
      } catch {
        // بعض المتصفحات تمنع الصوت قبل أول تفاعل.
      }
    }, [settings.soundEnabled]);

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

          return next;
        });

        playSound();
      },
      [playSound]
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

        if (storedIds.length === 0) {
          writeJson(
            ACTIVE_BASELINE_KEY,
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

    const storedSettings =
      readJson<NotificationSettings>(
        SETTINGS_KEY,
        DEFAULT_SETTINGS
      );

    const nextSettings =
      migrationDone
        ? storedSettings
        : {
            activeTradesEnabled:
              true,
            spxTradesEnabled:
              true,
            soundEnabled:
              true,
          };

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
        <div className="absolute right-0 mt-3 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/98 shadow-2xl backdrop-blur">
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

                if (checked) {
                  window.setTimeout(
                    playSound,
                    0
                  );
                }
              }}
              label="تشغيل صوت التنبيه"
            />
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

            <div className="max-h-72 overflow-y-auto px-3 pb-3">
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
