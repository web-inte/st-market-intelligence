"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/client";

type UnreadResponse = {
  ok?: boolean;
  unreadCount?: number;
  error?: string;
};

export default function MarketChatUnreadButton() {
  const router =
    useRouter();

  const [
    unreadCount,
    setUnreadCount,
  ] =
    useState(0);

  const loadUnreadCount =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              "/api/market-chat/unread",
              {
                cache:
                  "no-store",
              }
            );

          /*
           * الزائر غير المسجل لا يحتاج ظهور
           * خطأ داخل الداشبورد.
           */
          if (
            response.status ===
            401
          ) {
            setUnreadCount(0);
            return;
          }

          const data =
            (await response.json()) as
              UnreadResponse;

          if (!response.ok) {
            throw new Error(
              data.error ||
                "تعذر تحميل الرسائل الجديدة"
            );
          }

          setUnreadCount(
            Math.max(
              0,
              Number(
                data.unreadCount ||
                0
              )
            )
          );
        } catch (error) {
          console.error(
            "تعذر تحميل عداد غرفة السوق:",
            error
          );
        }
      },
      []
    );

  useEffect(() => {
    void loadUnreadCount();

    const supabase =
      createClient();

    const channel =
      supabase
        .channel(
          "dashboard-market-chat-unread"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema:
              "public",
            table:
              "market_chat_messages",
          },
          () => {
            void loadUnreadCount();
          }
        )
        .subscribe();

    const interval =
      window.setInterval(
        () => {
          void loadUnreadCount();
        },
        30_000
      );

    return () => {
      window.clearInterval(
        interval
      );

      void supabase
        .removeChannel(
          channel
        );
    };
  }, [loadUnreadCount]);

  const badgeLabel =
    unreadCount > 99
      ? "99+"
      : String(
          unreadCount
        );

  return (
    <button
      type="button"
      onClick={() =>
        router.push(
          "/market-chat"
        )
      }
      className="group relative inline-flex flex-1 items-center justify-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] px-5 py-3 text-sm font-black text-emerald-300 shadow-lg shadow-emerald-950/20 transition duration-300 hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-400/[0.14]"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-lg">
        💬

        {unreadCount > 0 ? (
          <span className="absolute -left-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#06111e] bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-lg shadow-rose-950/40">
            {badgeLabel}
          </span>
        ) : null}
      </span>

      <span>
        الدخول إلى غرفة السوق
      </span>
    </button>
  );
}
