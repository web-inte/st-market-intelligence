"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
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
  reply_to_id: string | null;
  reply_user_name: string | null;
  reply_message: string | null;
  edited_at: string | null;
  image_url: string | null;
  image_signed_url?: string | null;
  message_type:
    | "TEXT"
    | "IMAGE";
  created_at: string;
  updated_at: string;
};

type ReactionInfo = {
  count: number;
  reactedByCurrentUser: boolean;
};

type ReactionsByMessage = Record<
  string,
  Record<
    string,
    ReactionInfo
  >
>;

type ChatResponse = {
  ok?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  messages?: ChatMessage[];
  message?: ChatMessage;
  error?: string;
  retryAfter?: number;
};

const REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🔥",
] as const;

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

  const imageInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    messages,
    setMessages,
  ] =
    useState<ChatMessage[]>([]);

  const [
    pinnedMessageIndex,
    setPinnedMessageIndex,
  ] =
    useState(0);

  const [
    reactions,
    setReactions,
  ] =
    useState<ReactionsByMessage>(
      {}
    );

  const [
    reactingKey,
    setReactingKey,
  ] =
    useState<string | null>(
      null
    );

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    selectedImage,
    setSelectedImage,
  ] =
    useState<File | null>(
      null
    );

  const [
    selectedImagePreview,
    setSelectedImagePreview,
  ] =
    useState<string | null>(
      null
    );

  const [
    openedImage,
    setOpenedImage,
  ] =
    useState<string | null>(
      null
    );

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState("");


  const filteredMessages =
    useMemo(() => {
      const keyword =
        searchQuery
          .trim()
          .toLowerCase();

      if (!keyword) {
        return messages;
      }

      return messages.filter(
        (message) =>
          message.user_name
            .toLowerCase()
            .includes(keyword) ||
          message.message
            .toLowerCase()
            .includes(keyword)
      );
    }, [
      messages,
      searchQuery,
    ]);

  const [
    replyingTo,
    setReplyingTo,
  ] =
    useState<ChatMessage | null>(
      null
    );

  const [
    editingMessage,
    setEditingMessage,
  ] =
    useState<ChatMessage | null>(
      null
    );

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

  const loadReactions =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              "/api/market-chat/reactions",
              {
                cache:
                  "no-store",
              }
            );

          const data =
            (await response.json()) as {
              ok?: boolean;
              reactions?: ReactionsByMessage;
              error?: string;
            };

          if (!response.ok) {
            throw new Error(
              data.error ||
                "تعذر تحميل التفاعلات"
            );
          }

          setReactions(
            data.reactions || {}
          );
        } catch (reactionError) {
          console.error(
            "تعذر تحميل التفاعلات:",
            reactionError
          );
        }
      },
      []
    );

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
    void loadReactions();

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
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "market_chat_reactions",
          },
          () => {
            void loadReactions();
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
  }, [
    loadMessages,
    loadReactions,
  ]);

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

  function clearSelectedImage() {
    if (selectedImagePreview) {
      URL.revokeObjectURL(
        selectedImagePreview
      );
    }

    setSelectedImage(null);
    setSelectedImagePreview(
      null
    );

    if (imageInputRef.current) {
      imageInputRef.current.value =
        "";
    }
  }

  function handleImageChange(
    event:
      React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0] ||
      null;

    if (!file) {
      return;
    }

    const allowedTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
      ]);

    if (
      !allowedTypes.has(
        file.type
      )
    ) {
      setError(
        "يسمح فقط بصور JPG أو PNG أو WEBP"
      );

      event.target.value =
        "";

      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      setError(
        "حجم الصورة يجب ألا يتجاوز 5MB"
      );

      event.target.value =
        "";

      return;
    }

    if (selectedImagePreview) {
      URL.revokeObjectURL(
        selectedImagePreview
      );
    }

    setSelectedImage(file);

    setSelectedImagePreview(
      URL.createObjectURL(
        file
      )
    );

    setEditingMessage(null);
    setError("");
  }

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    const normalized =
      message.trim();

    if (
      !normalized &&
      !selectedImage
    ) {
      setError(
        "اكتب رسالة أو اختر صورة"
      );
      return;
    }

    if (
      editingMessage &&
      selectedImage
    ) {
      setError(
        "لا يمكن إضافة صورة أثناء تعديل رسالة"
      );
      return;
    }

    setSending(true);
    setError("");
    setSuccess("");

    try {
      let requestBody:
        | string
        | FormData;

      let requestHeaders:
        | Record<string, string>
        | undefined;

      if (
        selectedImage &&
        !editingMessage
      ) {
        const formData =
          new FormData();

        formData.append(
          "message",
          normalized
        );

        formData.append(
          "replyToId",
          replyingTo?.id ||
            ""
        );

        formData.append(
          "image",
          selectedImage
        );

        requestBody =
          formData;

        requestHeaders =
          undefined;
      } else {
        requestBody =
          JSON.stringify(
            editingMessage
              ? {
                  messageId:
                    editingMessage.id,
                  message:
                    normalized,
                }
              : {
                  message:
                    normalized,
                  replyToId:
                    replyingTo?.id ||
                    null,
                }
          );

        requestHeaders = {
          "Content-Type":
            "application/json",
        };
      }

      const response =
        await fetch(
          "/api/market-chat",
          {
            method:
              editingMessage
                ? "PATCH"
                : "POST",
            headers:
              requestHeaders,
            body:
              requestBody,
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
      setReplyingTo(null);
      setEditingMessage(null);
      clearSelectedImage();

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

  function startEditing(
    chatMessage: ChatMessage
  ) {
    setEditingMessage(
      chatMessage
    );

    setReplyingTo(null);

    setMessage(
      chatMessage.message
    );

    setError("");

    requestAnimationFrame(() => {
      const textarea =
        document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder^="اكتب رسالتك"]'
        );

      textarea?.focus();
    });
  }

  async function toggleReaction(
    chatMessage: ChatMessage,
    emoji: string
  ) {
    if (
      chatMessage.is_deleted
    ) {
      return;
    }

    const key =
      `${chatMessage.id}:${emoji}`;

    setReactingKey(key);
    setError("");

    try {
      const response =
        await fetch(
          "/api/market-chat/reactions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              messageId:
                chatMessage.id,
              emoji,
            }),
          }
        );

      const data =
        (await response.json()) as {
          ok?: boolean;
          messageId?: string;
          reactions?: Record<
            string,
            ReactionInfo
          >;
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر تحديث التفاعل"
        );
      }

      setReactions(
        (current) => ({
          ...current,
          [chatMessage.id]:
            data.reactions || {},
        })
      );
    } catch (reactionError) {
      setError(
        reactionError instanceof Error
          ? reactionError.message
          : "تعذر تحديث التفاعل"
      );
    } finally {
      setReactingKey(null);
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
      className="min-h-screen bg-[#07101c] px-0 py-0 text-white sm:px-4 sm:py-5"
    >
      <div className="mx-auto max-w-6xl">
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0b1625]/95 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur-xl sm:rounded-t-3xl sm:border sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-lg text-slate-300 transition hover:border-sky-400/30 hover:text-sky-300"
                aria-label="العودة للرئيسية"
              >
                →
              </button>

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-xl shadow-lg shadow-cyan-950/40">
                💬
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-base font-black text-white sm:text-lg">
                  غرفة السوق
                </h1>

                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={[
                      "h-2 w-2 rounded-full",
                      connected
                        ? "bg-emerald-400 shadow shadow-emerald-400/70"
                        : "bg-amber-400",
                    ].join(" ")}
                  />

                  <p className="text-xs font-bold text-slate-400">
                    {connected
                      ? "متصل لحظيًا"
                      : "جارٍ الاتصال..."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400">
              {messages.length} رسالة
            </div>
          </div>
        </header>

        <div className="border-b border-white/[0.07] bg-[#0b1625]/95 px-3 py-3 backdrop-blur-xl sm:border-x sm:px-4">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  🔍
                </span>

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value
                    )
                  }
                  placeholder="ابحث في الرسائل أو أسماء الأعضاء..."
                  autoFocus
                  className="h-11 w-full rounded-2xl border border-white/[0.08] bg-[#152234] pr-10 pl-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/40"
                />
              </div>

              {searchQuery ? (
                <button
                  type="button"
                  onClick={() =>
                    setSearchQuery("")
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-lg text-slate-400 transition hover:text-rose-300"
                  aria-label="مسح البحث"
                >
                  ×
                </button>
              ) : null}
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold">
              <span className="text-slate-500">
                البحث يشمل نص الرسالة واسم المرسل
              </span>

              <span
                className={
                  searchQuery.trim()
                    ? "text-sky-300"
                    : "text-slate-600"
                }
              >
                {searchQuery.trim()
                  ? `${filteredMessages.length} نتيجة`
                  : `${messages.length} رسالة`}
              </span>
            </div>
          </div>

        <div className="border-b border-amber-400/15 bg-amber-400/[0.06] px-4 py-2.5 text-center text-[11px] leading-5 text-amber-200 sm:border-x">
          الآراء المنشورة تمثل أصحابها وليست توصيات استثمارية. لا يسمح للمشتركين بإرسال الروابط أو وسائل التواصل.
        </div>

        {error ? (
          <div className="mx-3 mt-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-300 sm:mx-0">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mx-3 mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300 sm:mx-0">
            {success}
          </div>
        ) : null}

        <section className="overflow-hidden bg-[#0b1625] shadow-2xl shadow-black/30 sm:rounded-b-3xl sm:border sm:border-t-0 sm:border-white/[0.08]">
          {(() => {
            const pinnedMessages =
              messages.filter(
                (item) =>
                  item.is_pinned &&
                  !item.is_deleted
              );

            if (
              pinnedMessages.length === 0
            ) {
              return null;
            }

            const safeIndex =
              pinnedMessageIndex %
              pinnedMessages.length;

            const activePinnedMessage =
              pinnedMessages[
                safeIndex
              ];

            return (
              <div className="sticky top-[68px] z-20 border-b border-violet-400/15 bg-[#10182a]/95 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur-xl sm:px-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById(
                          `chat-message-${activePinnedMessage.id}`
                        )
                        ?.scrollIntoView({
                          behavior:
                            "smooth",
                          block:
                            "center",
                        });
                    }}
                    className="flex min-w-0 flex-1 items-start gap-3 text-right"
                    title="الانتقال إلى الرسالة المثبتة"
                  >
                    <span className="mt-0.5 shrink-0 text-violet-300">
                      📌
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-black text-violet-300">
                          رسالة مثبتة
                        </p>

                        <span className="text-[10px] font-bold text-slate-500">
                          {safeIndex + 1}/
                          {pinnedMessages.length}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-xs font-bold text-sky-300">
                        {
                          activePinnedMessage.user_name
                        }
                      </p>

                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">
                        {
                          activePinnedMessage.message
                        }
                      </p>
                    </div>
                  </button>

                  {pinnedMessages.length >
                  1 ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPinnedMessageIndex(
                            (
                              safeIndex -
                              1 +
                              pinnedMessages.length
                            ) %
                              pinnedMessages.length
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-black text-slate-300 transition hover:border-violet-400/30 hover:text-violet-300"
                        aria-label="الرسالة المثبتة السابقة"
                      >
                        ›
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPinnedMessageIndex(
                            (
                              safeIndex +
                              1
                            ) %
                              pinnedMessages.length
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-black text-slate-300 transition hover:border-violet-400/30 hover:text-violet-300"
                        aria-label="الرسالة المثبتة التالية"
                      >
                        ‹
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })()}

          <div className="h-[calc(100dvh-250px)] min-h-[440px] overflow-y-auto bg-[radial-gradient(circle_at_top,#12233a_0%,#0b1625_48%,#08111e_100%)] px-3 py-5 sm:h-[68vh] sm:px-6">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm font-bold text-slate-500">
                جارٍ تحميل الرسائل...
              </div>
            ) : searchQuery.trim() &&
              filteredMessages.length ===
                0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="text-4xl text-slate-600">
                  🔍
                </div>

                <h3 className="mt-4 font-black text-slate-200">
                  لا توجد نتائج
                </h3>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                  لم نعثر على رسالة أو اسم يطابق بحثك.
                </p>
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
              <div className="grid gap-2.5">
                {filteredMessages.map(
                  (
                    chatMessage
                  ) => {
                    const isOwn =
                      chatMessage.user_id ===
                      currentUserId;

                    const alignRight =
                      isOwn ||
                      chatMessage.is_admin;

                    return (
                      <div
                        key={chatMessage.id}
                        className={[
                          "flex w-full items-end gap-2",
                          alignRight
                            ? "justify-start"
                            : "justify-end",
                        ].join(" ")}
                      >
                        {alignRight ? (
                          <div
                            className={[
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black",
                              chatMessage.is_admin
                                ? "bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950"
                                : "bg-gradient-to-br from-sky-400 to-cyan-700 text-white",
                            ].join(" ")}
                          >
                            {chatMessage.is_admin
                              ? "ST"
                              : chatMessage.user_name
                                  .trim()
                                  .slice(0, 1)
                                  .toUpperCase()}
                          </div>
                        ) : null}

                        <article
                          id={`chat-message-${chatMessage.id}`}
                          className={[
                            "group relative max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-lg sm:max-w-[72%]",
                            chatMessage.is_deleted
                              ? "border border-slate-700/70 bg-slate-900/80"
                              : chatMessage.is_admin
                                ? "rounded-br-md border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.14] to-amber-500/[0.06]"
                                : isOwn
                                  ? "rounded-br-md border border-sky-400/15 bg-[#17324e]"
                                  : "rounded-bl-md border border-white/[0.06] bg-[#152234]",
                            chatMessage.is_pinned
                              ? "ring-1 ring-violet-400/50"
                              : "",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span
                                className={[
                                  "truncate text-xs font-black",
                                  chatMessage.is_admin
                                    ? "text-amber-300"
                                    : "text-sky-300",
                                ].join(" ")}
                              >
                                {chatMessage.user_name}
                              </span>

                              {chatMessage.is_admin ? (
                                <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                                  الإدارة
                                </span>
                              ) : null}

                              {chatMessage.is_pinned ? (
                                <span className="text-[10px] text-violet-300">
                                  📌
                                </span>
                              ) : null}
                            </div>

                            {!chatMessage.is_deleted ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingTo(
                                    chatMessage
                                  );
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-slate-500 transition hover:bg-white/[0.06] hover:text-sky-300"
                                aria-label="الرد على الرسالة"
                                title="رد"
                              >
                                ↩
                              </button>
                            ) : null}

                            {isAdmin && !chatMessage.is_deleted ? (
                              <details className="relative">
                                <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full text-lg leading-none text-slate-500 transition hover:bg-white/[0.06] hover:text-white">
                                  ⋮
                                </summary>

                                <div className="absolute left-0 top-8 z-20 min-w-[155px] overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950 py-1 shadow-2xl shadow-black/50">
                                  <button
                                    type="button"
                                    disabled={actionId === chatMessage.id}
                                    onClick={() =>
                                      void togglePin(chatMessage)
                                    }
                                    className="block w-full px-3 py-2 text-right text-xs font-bold text-violet-300 hover:bg-white/[0.05]"
                                  >
                                    {chatMessage.is_pinned
                                      ? "إلغاء التثبيت"
                                      : "تثبيت الرسالة"}
                                  </button>

                                  {chatMessage.user_id ===
                                  currentUserId ? (
                                    <button
                                      type="button"
                                      disabled={
                                        actionId ===
                                        chatMessage.id
                                      }
                                      onClick={() =>
                                        startEditing(
                                          chatMessage
                                        )
                                      }
                                      className="block w-full px-3 py-2 text-right text-xs font-bold text-sky-300 hover:bg-white/[0.05]"
                                    >
                                      تعديل الرسالة
                                    </button>
                                  ) : null}

                                  {!chatMessage.is_admin ? (
                                    <button
                                      type="button"
                                      disabled={actionId === chatMessage.id}
                                      onClick={() =>
                                        void muteUser(chatMessage)
                                      }
                                      className="block w-full px-3 py-2 text-right text-xs font-bold text-amber-300 hover:bg-white/[0.05]"
                                    >
                                      كتم المستخدم
                                    </button>
                                  ) : null}

                                  <button
                                    type="button"
                                    disabled={actionId === chatMessage.id}
                                    onClick={() =>
                                      void deleteMessage(chatMessage)
                                    }
                                    className="block w-full px-3 py-2 text-right text-xs font-bold text-rose-300 hover:bg-white/[0.05]"
                                  >
                                    حذف الرسالة
                                  </button>
                                </div>
                              </details>
                            ) : null}
                          </div>

                          {chatMessage.image_signed_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenedImage(
                                  chatMessage.image_signed_url ||
                                    null
                                )
                              }
                              className="mt-2 block max-w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/20"
                              aria-label="تكبير الصورة"
                            >
                              <img
                                src={
                                  chatMessage.image_signed_url
                                }
                                alt="صورة داخل غرفة السوق"
                                loading="lazy"
                                className="max-h-[420px] w-auto max-w-full object-contain"
                              />
                            </button>
                          ) : null}

                          {chatMessage.reply_to_id ? (
                            <button
                              type="button"
                              className="mt-2 block w-full rounded-xl border-r-2 border-sky-400 bg-black/20 px-3 py-2 text-right"
                              onClick={() => {
                                const target =
                                  document.getElementById(
                                    `chat-message-${chatMessage.reply_to_id}`
                                  );

                                target?.scrollIntoView({
                                  behavior:
                                    "smooth",
                                  block:
                                    "center",
                                });
                              }}
                            >
                              <span className="block truncate text-[11px] font-black text-sky-300">
                                {chatMessage.reply_user_name ||
                                  "رسالة"}
                              </span>

                              <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-400">
                                {chatMessage.reply_message ||
                                  "الرسالة الأصلية غير متاحة"}
                              </span>
                            </button>
                          ) : null}

                          {chatMessage.message ? (
                            <p
                              className={[
                                "mt-1.5 whitespace-pre-wrap break-words text-sm leading-6",
                                chatMessage.is_deleted
                                  ? "italic text-slate-500"
                                  : "text-slate-100",
                              ].join(" ")}
                            >
                              {chatMessage.message}
                            </p>
                          ) : null}

                          {!chatMessage.is_deleted ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {REACTION_EMOJIS.map(
                                (emoji) => {
                                  const info =
                                    reactions[
                                      chatMessage.id
                                    ]?.[
                                      emoji
                                    ];

                                  const active =
                                    Boolean(
                                      info?.reactedByCurrentUser
                                    );

                                  const count =
                                    info?.count || 0;

                                  const key =
                                    `${chatMessage.id}:${emoji}`;

                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      disabled={
                                        reactingKey ===
                                        key
                                      }
                                      onClick={() =>
                                        void toggleReaction(
                                          chatMessage,
                                          emoji
                                        )
                                      }
                                      className={[
                                        "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition disabled:opacity-50",
                                        active
                                          ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
                                          : "border-white/[0.08] bg-white/[0.04] text-slate-400 hover:border-white/[0.16] hover:bg-white/[0.08]",
                                      ].join(
                                        " "
                                      )}
                                      aria-label={`تفاعل ${emoji}`}
                                    >
                                      <span>
                                        {emoji}
                                      </span>

                                      {count > 0 ? (
                                        <span>
                                          {count}
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          ) : null}

                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            {chatMessage.edited_at ? (
                              <span className="text-[10px] font-medium text-slate-600">
                                تم التعديل
                              </span>
                            ) : null}

                            <span className="text-[10px] font-medium text-slate-500">
                              {formatMessageTime(
                                chatMessage.created_at
                              )}
                            </span>

                            {isOwn ? (
                              <span className="text-[10px] text-sky-300">
                                ✓✓
                              </span>
                            ) : null}
                          </div>

                        </article>

                        {!alignRight ? (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-xs font-black text-white">
                            {chatMessage.user_name
                              .trim()
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                        ) : null}
                      </div>
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
            className="sticky bottom-0 z-30 border-t border-white/[0.07] bg-[#0b1625]/95 p-3 shadow-[0_-12px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-4"
          >
            {selectedImagePreview ? (
              <div className="mb-3 overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-3">
                <div className="flex items-start gap-3">
                  <img
                    src={
                      selectedImagePreview
                    }
                    alt="معاينة الصورة"
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-violet-300">
                      صورة جاهزة للإرسال
                    </p>

                    <p className="mt-1 truncate text-xs text-slate-400">
                      {
                        selectedImage?.name
                      }
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      {selectedImage
                        ? `${(
                            selectedImage.size /
                            1024 /
                            1024
                          ).toFixed(
                            2
                          )} MB`
                        : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      clearSelectedImage
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-rose-300"
                    aria-label="إزالة الصورة"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}

            {editingMessage ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5">
                <div className="min-w-0 flex-1 border-r-2 border-amber-400 pr-3">
                  <p className="text-xs font-black text-amber-300">
                    تعديل الرسالة
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-400">
                    {editingMessage.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingMessage(
                      null
                    );

                    setMessage("");
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-rose-300"
                  aria-label="إلغاء التعديل"
                >
                  ×
                </button>
              </div>
            ) : null}

            {replyingTo ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2.5">
                <div className="min-w-0 flex-1 border-r-2 border-sky-400 pr-3">
                  <p className="truncate text-xs font-black text-sky-300">
                    الرد على{" "}
                    {replyingTo.user_name}
                  </p>

                  <p className="mt-1 truncate text-xs text-slate-400">
                    {replyingTo.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setReplyingTo(null)
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-rose-300"
                  aria-label="إلغاء الرد"
                >
                  ×
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={
                  handleImageChange
                }
                className="hidden"
              />

              <button
                type="button"
                disabled={
                  sending ||
                  Boolean(
                    editingMessage
                  )
                }
                onClick={() =>
                  imageInputRef.current
                    ?.click()
                }
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#152234] text-xl text-slate-400 transition hover:border-violet-400/30 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="اختيار صورة"
                title="إرفاق صورة"
              >
                📎
              </button>

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
                className="min-h-[48px] flex-1 resize-none rounded-[22px] border border-white/[0.08] bg-[#152234] px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-600 focus:border-sky-400/50"
              />

              <button
                type="submit"
                disabled={
                  sending ||
                  (
                    !message.trim() &&
                    !selectedImage
                  )
                }
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-cyan-600 text-lg font-black text-white shadow-lg shadow-cyan-950/40 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending
                  ? "…"
                  : editingMessage
                    ? "✓"
                    : "➤"}
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

      {openedImage ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() =>
            setOpenedImage(null)
          }
        >
          <button
            type="button"
            onClick={() =>
              setOpenedImage(null)
            }
            className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/60 text-2xl text-white"
            aria-label="إغلاق الصورة"
          >
            ×
          </button>

          <img
            src={openedImage}
            alt="عرض الصورة"
            onClick={(event) =>
              event.stopPropagation()
            }
            className="max-h-[92vh] max-w-[96vw] rounded-2xl object-contain shadow-2xl shadow-black"
          />
        </div>
      ) : null}
    </main>
  );
}
