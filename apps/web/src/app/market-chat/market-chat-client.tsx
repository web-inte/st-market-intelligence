"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/client";

type ChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  is_admin: boolean;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

type ChatResponse = {
  ok?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  messages?: ChatMessage[];
  message?: ChatMessage;
  error?: string;
  retryAfter?: number;
};

function formatMessageTime(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      hour: "numeric",
      minute: "2-digit",
      timeZone:
        "Asia/Riyadh",
    }
  ).format(date);
}

function sortMessages(
  messages: ChatMessage[]
) {
  const pinned =
    messages
      .filter(
        (message) =>
          message.is_pinned
      )
      .sort(
        (a, b) =>
          new Date(
            b.created_at
          ).getTime() -
          new Date(
            a.created_at
          ).getTime()
      );

  const regular =
    messages
      .filter(
        (message) =>
          !message.is_pinned
      )
      .sort(
        (a, b) =>
          new Date(
            a.created_at
          ).getTime() -
          new Date(
            b.created_at
          ).getTime()
      );

  return [
    ...pinned,
    ...regular,
  ];
}

export default function MarketChatClient() {
  const router =
    useRouter();

  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [
    messages,
    setMessages,
  ] =
    useState<ChatMessage[]>([]);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    sending,
    setSending,
  ] =
    useState(false);

  const [
    actionId,
    setActionId,
  ] =
    useState<string | null>(
      null
    );

  const [
    isAdmin,
    setIsAdmin,
  ] =
    useState(false);

  const [
    currentUserId,
    setCurrentUserId,
  ] =
    useState("");

  const [
    connected,
    setConnected,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const loadMessages =
    useCallback(
      async (
        silent = false
      ) => {
        if (!silent) {
          setLoading(true);
        }

        try {
          const response =
            await fetch(
              "/api/market-chat",
              {
                cache:
                  "no-store",
              }
            );

          const data =
            (await response.json()) as
              ChatResponse;

          if (
            response.status ===
            401
          ) {
            router.push(
              "/login"
            );
            return;
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                "تعذر تحميل الرسائل"
            );
          }

          setMessages(
            sortMessages(
              data.messages || []
            )
          );

          setIsAdmin(
            Boolean(
              data.isAdmin
            )
          );

          setCurrentUserId(
            data.currentUserId ||
              ""
          );
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل الرسائل"
          );
        } finally {
          if (!silent) {
            setLoading(false);
          }
        }
      },
      [router]
    );

  useEffect(() => {
    void loadMessages();

    const supabase =
      createClient();

    const channel =
      supabase
        .channel(
          "market-chat-room"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "market_chat_messages",
          },
          () => {
            void loadMessages(
              true
            );
          }
        )
        .subscribe(
          (status) => {
            setConnected(
              status ===
                "SUBSCRIBED"
            );
          }
        );

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [loadMessages]);

  useEffect(() => {
    if (
      messages.length === 0
    ) {
      return;
    }

    messagesEndRef.current
      ?.scrollIntoView({
        behavior: "smooth",
      });
  }, [messages.length]);

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    const normalized =
      message.trim();

    if (!normalized) {
      setError(
        "اكتب الرسالة أولًا"
      );
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/market-chat",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              message:
                normalized,
            }),
          }
        );

      const data =
        (await response.json()) as
          ChatResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر إرسال الرسالة"
        );
      }

      setMessage("");

      if (data.message) {
        setMessages(
          (current) =>
            sortMessages([
              ...current.filter(
                (item) =>
                  item.id !==
                  data.message?.id
              ),
              data.message as
                ChatMessage,
            ])
        );
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "تعذر إرسال الرسالة"
      );
    } finally {
      setSending(false);
    }
  }

  async function runAdminAction(
    body: Record<
      string,
      unknown
    >
  ) {
    const response =
      await fetch(
        "/api/admin/market-chat",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify(
              body
            ),
        }
      );

    const data =
      (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

    if (!response.ok) {
      throw new Error(
        data.error ||
          "تعذر تنفيذ الإجراء"
      );
    }
  }

  async function togglePin(
    chatMessage: ChatMessage
  ) {
    setActionId(
      chatMessage.id
    );

    setError("");
    setSuccess("");

    try {
      await runAdminAction({
        action:
          chatMessage.is_pinned
            ? "UNPIN"
            : "PIN",
        messageId:
          chatMessage.id,
      });

      await loadMessages(true);

      setSuccess(
        chatMessage.is_pinned
          ? "تم إلغاء تثبيت الرسالة"
          : "تم تثبيت الرسالة"
      );
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "تعذر تعديل الرسالة"
      );
    } finally {
      setActionId(null);
    }
  }

  async function deleteMessage(
    chatMessage: ChatMessage
  ) {
    const confirmed =
      window.confirm(
        "هل تريد حذف هذه الرسالة؟"
      );

    if (!confirmed) {
      return;
    }

    setActionId(
      chatMessage.id
    );

    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/admin/market-chat",
          {
            method:
              "DELETE",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                messageId:
                  chatMessage.id,
              }),
          }
        );

      const data =
        (await response.json()) as {
          ok?: boolean;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر حذف الرسالة"
        );
      }

      await loadMessages(true);

      setSuccess(
        "تم حذف الرسالة"
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "تعذر حذف الرسالة"
      );
    } finally {
      setActionId(null);
    }
  }

  async function muteUser(
    chatMessage: ChatMessage
  ) {
    if (
      chatMessage.user_id ===
      currentUserId
    ) {
      setError(
        "لا يمكنك كتم حسابك"
      );
      return;
    }

    const durationInput =
      window.prompt(
        "مدة الكتم بالدقائق. اكتب 0 للكتم الدائم:",
        "60"
      );

    if (
      durationInput === null
    ) {
      return;
    }

    const durationMinutes =
      Number.parseInt(
        durationInput,
        10
      );

    if (
      !Number.isFinite(
        durationMinutes
      ) ||
      durationMinutes < 0
    ) {
      setError(
        "مدة الكتم غير صحيحة"
      );
      return;
    }

    const confirmed =
      window.confirm(
        `هل تريد كتم ${chatMessage.user_name}؟`
      );

    if (!confirmed) {
      return;
    }

    setActionId(
      chatMessage.id
    );

    setError("");
    setSuccess("");

    try {
      await runAdminAction({
        action: "MUTE",
        userId:
          chatMessage.user_id,
        durationMinutes,
        reason:
          "تم كتم حسابك بواسطة إدارة غرفة السوق",
      });

      setSuccess(
        durationMinutes > 0
          ? `تم كتم المستخدم لمدة ${durationMinutes} دقيقة`
          : "تم كتم المستخدم بشكل دائم"
      );
    } catch (muteError) {
      setError(
        muteError instanceof Error
          ? muteError.message
          : "تعذر كتم المستخدم"
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-6 sm:py-7"
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  connected
                    ? "bg-emerald-400 shadow-lg shadow-emerald-400/60"
                    : "bg-amber-400",
                ].join(" ")}
              />

              <p className="text-xs font-bold text-slate-400">
                {connected
                  ? "متصل لحظيًا"
                  : "جارٍ الاتصال"}
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              غرفة السوق
            </h1>

            <p className="mt-2 text-sm leading-7 text-slate-400">
              مساحة واحدة لمناقشة حركة السوق مع المشتركين.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200"
          >
            العودة للرئيسية
          </button>
        </header>

        <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs leading-6 text-amber-200">
          الآراء المنشورة تمثل أصحابها، ولا تمثل توصيات استثمارية من
          ST Market Intelligence. لا يسمح للمشتركين بإرسال الروابط أو
          وسائل التواصل.
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300">
            {success}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-900/60 shadow-2xl shadow-black/30">
          <div className="border-b border-white/[0.07] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-black">
                  دردشة المشتركين
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  تظهر الرسائل الجديدة مباشرة بدون تحديث الصفحة.
                </p>
              </div>

              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">
                {messages.length} رسالة
              </span>
            </div>
          </div>

          <div className="h-[58vh] min-h-[420px] overflow-y-auto px-3 py-4 sm:px-5">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">
                جارٍ تحميل الرسائل...
              </div>
            ) : messages.length ===
              0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="text-4xl text-slate-600">
                  💬
                </div>

                <h3 className="mt-4 font-black text-slate-200">
                  لا توجد رسائل حتى الآن
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  ابدأ أول نقاش داخل غرفة السوق.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {messages.map(
                  (
                    chatMessage
                  ) => {
                    const isOwn =
                      chatMessage.user_id ===
                      currentUserId;

                    return (
                      <article
                        key={
                          chatMessage.id
                        }
                        className={[
                          "rounded-2xl border p-4",
                          chatMessage.is_deleted
                            ? "border-slate-700 bg-slate-950/40"
                            : chatMessage.is_admin
                              ? "border-amber-400/25 bg-amber-400/[0.07]"
                              : isOwn
                                ? "border-sky-400/25 bg-sky-400/[0.07]"
                                : "border-white/[0.07] bg-slate-950/60",
                          chatMessage.is_pinned
                            ? "ring-1 ring-violet-400/40"
                            : "",
                        ].join(
                          " "
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                "text-sm font-black",
                                chatMessage.is_admin
                                  ? "text-amber-300"
                                  : "text-white",
                              ].join(
                                " "
                              )}
                            >
                              {
                                chatMessage.user_name
                              }
                            </span>

                            {chatMessage.is_admin ? (
                              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
                                الإدارة
                              </span>
                            ) : null}

                            {chatMessage.is_pinned ? (
                              <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[10px] font-black text-violet-300">
                                مثبت
                              </span>
                            ) : null}
                          </div>

                          <span className="text-[11px] font-bold text-slate-600">
                            {formatMessageTime(
                              chatMessage.created_at
                            )}
                          </span>
                        </div>

                        <p
                          className={[
                            "mt-3 whitespace-pre-wrap break-words text-sm leading-7",
                            chatMessage.is_deleted
                              ? "italic text-slate-500"
                              : "text-slate-300",
                          ].join(
                            " "
                          )}
                        >
                          {
                            chatMessage.message
                          }
                        </p>

                        {isAdmin &&
                        !chatMessage.is_deleted ? (
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                            <button
                              type="button"
                              disabled={
                                actionId ===
                                chatMessage.id
                              }
                              onClick={() =>
                                void togglePin(
                                  chatMessage
                                )
                              }
                              className="rounded-lg border border-violet-400/25 bg-violet-400/10 px-3 py-1.5 text-xs font-bold text-violet-300 disabled:opacity-50"
                            >
                              {chatMessage.is_pinned
                                ? "إلغاء التثبيت"
                                : "تثبيت"}
                            </button>

                            {!chatMessage.is_admin ? (
                              <button
                                type="button"
                                disabled={
                                  actionId ===
                                  chatMessage.id
                                }
                                onClick={() =>
                                  void muteUser(
                                    chatMessage
                                  )
                                }
                                className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300 disabled:opacity-50"
                              >
                                كتم المستخدم
                              </button>
                            ) : null}

                            <button
                              type="button"
                              disabled={
                                actionId ===
                                chatMessage.id
                              }
                              onClick={() =>
                                void deleteMessage(
                                  chatMessage
                                )
                              }
                              className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-300 disabled:opacity-50"
                            >
                              حذف الرسالة
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  }
                )}

                <div
                  ref={
                    messagesEndRef
                  }
                />
              </div>
            )}
          </div>

          <form
            onSubmit={
              handleSubmit
            }
            className="border-t border-white/[0.07] bg-slate-950/70 p-3 sm:p-4"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={message}
                onChange={(event) => {
                  setMessage(
                    event.target.value.slice(
                      0,
                      500
                    )
                  );

                  if (error) {
                    setError("");
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    event.key ===
                      "Enter" &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();

                    event.currentTarget
                      .form
                      ?.requestSubmit();
                  }
                }}
                rows={2}
                maxLength={500}
                placeholder="اكتب رسالتك... اضغط Enter للإرسال"
                className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-6 outline-none transition focus:border-sky-400/60"
              />

              <button
                type="submit"
                disabled={
                  sending ||
                  !message.trim()
                }
                className="h-[52px] rounded-2xl bg-sky-400 px-5 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending
                  ? "جارٍ..."
                  : "إرسال"}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] font-bold text-slate-600">
              <span>
                لا يسمح بإرسال الروابط
              </span>

              <span>
                {message.length}/500
              </span>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
