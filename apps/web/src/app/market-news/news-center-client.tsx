"use client";

import {
  type ChangeEvent,
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

type NewsType =
  | "URGENT"
  | "IMPORTANT"
  | "UPDATE"
  | "ANNOUNCEMENT";

type NewsPost = {
  id: string;
  title: string | null;
  content: string | null;
  image_url: string | null;
  image_signed_url: string | null;
  news_type: NewsType;
  is_pinned: boolean;
  is_published?: boolean;
  expires_at: string | null;
  published_at: string;
  created_at?: string;
  updated_at?: string;
};

type NewsResponse = {
  ok?: boolean;
  posts?: NewsPost[];
  error?: string;
};

const TYPE_OPTIONS: Array<{
  value: NewsType;
  label: string;
}> = [
  {
    value: "URGENT",
    label: "عاجل",
  },
  {
    value: "IMPORTANT",
    label: "مهم",
  },
  {
    value: "UPDATE",
    label: "تحديث",
  },
  {
    value: "ANNOUNCEMENT",
    label: "إعلان",
  },
];

function typeLabel(
  type: NewsType
) {
  return (
    TYPE_OPTIONS.find(
      (option) =>
        option.value === type
    )?.label || "تحديث"
  );
}

function typeClasses(
  type: NewsType
) {
  if (type === "URGENT") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  }

  if (type === "IMPORTANT") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }

  if (
    type === "ANNOUNCEMENT"
  ) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  return "border-sky-400/30 bg-sky-400/10 text-sky-300";
}

function formatTime(
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
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }
  ).format(date);
}

export default function NewsCenterClient() {
  const router =
    useRouter();

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [
    posts,
    setPosts,
  ] =
    useState<NewsPost[]>([]);

  const [
    isAdmin,
    setIsAdmin,
  ] =
    useState(false);

  const [
    adminCheckLoading,
    setAdminCheckLoading,
  ] =
    useState(true);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    deletingId,
    setDeletingId,
  ] =
    useState<string | null>(
      null
    );

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

  const [
    title,
    setTitle,
  ] =
    useState("");

  const [
    content,
    setContent,
  ] =
    useState("");

  const [
    newsType,
    setNewsType,
  ] =
    useState<NewsType>(
      "UPDATE"
    );

  const [
    isPinned,
    setIsPinned,
  ] =
    useState(false);

  const [
    image,
    setImage,
  ] =
    useState<File | null>(
      null
    );

  const [
    imagePreview,
    setImagePreview,
  ] =
    useState<string | null>(
      null
    );

  const loadPosts =
    useCallback(
      async (
        adminAccess: boolean
      ) => {
        setLoading(true);
        setError("");

        try {
          const response =
            await fetch(
              adminAccess
                ? "/api/admin/market-news"
                : "/api/market-news",
              {
                cache: "no-store",
              }
            );

          const data =
            (await response.json()) as
              NewsResponse;

          if (!response.ok) {
            throw new Error(
              data.error ||
                "تعذر تحميل الأخبار"
            );
          }

          setPosts(
            data.posts || []
          );
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل الأخبار"
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const supabase =
          createClient();

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        let adminAccess =
          false;

        if (user) {
          const {
            data: profile,
          } =
            await supabase
              .from("profiles")
              .select("role")
              .eq("id", user.id)
              .maybeSingle();

          adminAccess =
            profile?.role ===
            "admin";
        }

        if (cancelled) {
          return;
        }

        setIsAdmin(
          adminAccess
        );

        setAdminCheckLoading(
          false
        );

        await loadPosts(
          adminAccess
        );
      } catch {
        if (cancelled) {
          return;
        }

        setIsAdmin(false);
        setAdminCheckLoading(
          false
        );

        await loadPosts(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [loadPosts]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview
        );
      }
    };
  }, [imagePreview]);

  function handleImageChange(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const selected =
      event.target.files?.[0] ||
      null;

    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview
      );
    }

    if (!selected) {
      setImage(null);
      setImagePreview(null);
      return;
    }

    if (
      selected.size >
      5 * 1024 * 1024
    ) {
      setError(
        "حجم الصورة يجب ألا يتجاوز 5 ميجابايت"
      );

      event.target.value = "";
      setImage(null);
      setImagePreview(null);
      return;
    }

    setError("");
    setImage(selected);
    setImagePreview(
      URL.createObjectURL(
        selected
      )
    );
  }

  function removeSelectedImage() {
    if (imagePreview) {
      URL.revokeObjectURL(
        imagePreview
      );
    }

    setImage(null);
    setImagePreview(null);

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setNewsType("UPDATE");
    setIsPinned(false);
    removeSelectedImage();
  }

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      !title.trim() &&
      !content.trim() &&
      !image
    ) {
      setError(
        "أضف عنوانًا أو نصًا أو صورة"
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const formData =
        new FormData();

      formData.set(
        "title",
        title
      );

      formData.set(
        "content",
        content
      );

      formData.set(
        "news_type",
        newsType
      );

      formData.set(
        "is_pinned",
        String(isPinned)
      );

      if (image) {
        formData.set(
          "image",
          image
        );
      }

      const response =
        await fetch(
          "/api/admin/market-news",
          {
            method: "POST",
            body: formData,
          }
        );

      const data =
        (await response.json()) as {
          ok?: boolean;
          post?: NewsPost;
          error?: string;
        };

      if (
        !response.ok ||
        !data.post
      ) {
        throw new Error(
          data.error ||
            "تعذر نشر الخبر"
        );
      }

      setPosts(
        (current) => [
          data.post as NewsPost,
          ...current,
        ]
      );

      resetForm();

      setSuccess(
        "تم نشر الخبر بنجاح"
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر نشر الخبر"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deletePost(
    post: NewsPost
  ) {
    const confirmed =
      window.confirm(
        "هل تريد حذف هذا الخبر نهائيًا؟"
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(post.id);
    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/admin/market-news",
          {
            method: "DELETE",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id: post.id,
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
            "تعذر حذف الخبر"
        );
      }

      setPosts(
        (current) =>
          current.filter(
            (item) =>
              item.id !== post.id
          )
      );

      setSuccess(
        "تم حذف الخبر"
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "تعذر حذف الخبر"
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-sky-400">
              محتوى فريق ST Market Intelligence
            </p>

            <h1 className="mt-2 text-3xl font-black sm:text-4xl">
              مركز الأخبار
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              الأخبار والتنبيهات والإعلانات المهمة التي ينشرها فريق
              ST Market Intelligence.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/dashboard"
              )
            }
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-sky-400/50 hover:text-sky-300"
          >
            العودة للرئيسية
          </button>
        </header>

        {!adminCheckLoading &&
        isAdmin ? (
          <form
            onSubmit={
              handleSubmit
            }
            className="mb-7 rounded-3xl border border-sky-400/15 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 sm:p-7"
          >
            <div className="mb-6">
              <p className="text-xs font-bold text-sky-400">
                إدارة مركز الأخبار
              </p>

              <h2 className="mt-2 text-xl font-black">
                نشر خبر جديد
              </h2>
            </div>

            <div className="grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-300">
                  العنوان
                </span>

                <input
                  value={title}
                  onChange={(event) =>
                    setTitle(
                      event.target
                        .value
                    )
                  }
                  maxLength={180}
                  placeholder="عنوان الخبر"
                  className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm outline-none transition focus:border-sky-400/60"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-slate-300">
                  المحتوى
                </span>

                <textarea
                  value={content}
                  onChange={(event) =>
                    setContent(
                      event.target
                        .value
                    )
                  }
                  maxLength={5000}
                  rows={5}
                  placeholder="اكتب الخبر أو التنبيه"
                  className="resize-y rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm leading-7 outline-none transition focus:border-sky-400/60"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-slate-300">
                    نوع الخبر
                  </span>

                  <select
                    value={
                      newsType
                    }
                    onChange={(
                      event
                    ) =>
                      setNewsType(
                        event.target
                          .value as NewsType
                      )
                    }
                    className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm outline-none"
                  >
                    {TYPE_OPTIONS.map(
                      (option) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {
                            option.label
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      isPinned
                    }
                    onChange={(
                      event
                    ) =>
                      setIsPinned(
                        event.target
                          .checked
                      )
                    }
                    className="h-4 w-4"
                  />

                  <span className="text-sm font-bold text-slate-300">
                    تثبيت الخبر في الأعلى
                  </span>
                </label>
              </div>

              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-4">
                <label className="grid cursor-pointer gap-2">
                  <span className="text-sm font-bold text-slate-300">
                    صورة الخبر
                  </span>

                  <input
                    ref={
                      fileInputRef
                    }
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={
                      handleImageChange
                    }
                    className="text-sm text-slate-400 file:ml-3 file:rounded-xl file:border-0 file:bg-sky-400/10 file:px-4 file:py-2 file:font-bold file:text-sky-300"
                  />
                </label>

                {imagePreview ? (
                  <div className="mt-4">
                    <img
                      src={
                        imagePreview
                      }
                      alt="معاينة الصورة"
                      className="max-h-[360px] w-full rounded-2xl object-contain"
                    />

                    <button
                      type="button"
                      onClick={
                        removeSelectedImage
                      }
                      className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-bold text-rose-300"
                    >
                      حذف الصورة
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-sky-400 px-5 py-3.5 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "جارٍ النشر..."
                  : "نشر الخبر"}
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-300">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-300">
            {success}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-900/60 shadow-2xl shadow-black/20">
          <div className="border-b border-white/[0.07] px-5 py-4 sm:px-7">
            <h2 className="font-black">
              آخر المنشورات
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              الأخبار الأحدث تظهر أولًا، والمثبتة تبقى في الأعلى.
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm font-bold text-slate-500">
              جارٍ تحميل الأخبار...
            </div>
          ) : posts.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-14 text-center">
              <div className="text-4xl text-slate-600">
                ◫
              </div>

              <h3 className="mt-5 text-lg font-black text-slate-200">
                لا توجد أخبار منشورة حاليًا
              </h3>
            </div>
          ) : (
            <div className="grid gap-5 p-4 sm:p-6">
              {posts.map(
                (post) => (
                  <article
                    key={
                      post.id
                    }
                    className="overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/70"
                  >
                    {post.image_signed_url ? (
                      <img
                        src={
                          post.image_signed_url
                        }
                        alt={
                          post.title ||
                          "صورة الخبر"
                        }
                        className="max-h-[560px] w-full object-contain"
                      />
                    ) : null}

                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${typeClasses(
                              post.news_type
                            )}`}
                          >
                            {typeLabel(
                              post.news_type
                            )}
                          </span>

                          {post.is_pinned ? (
                            <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-xs font-black text-violet-300">
                              مثبت
                            </span>
                          ) : null}
                        </div>

                        <span className="text-xs font-bold text-slate-500">
                          {formatTime(
                            post.published_at
                          )}
                        </span>
                      </div>

                      {post.title ? (
                        <h3 className="mt-4 text-xl font-black leading-8">
                          {
                            post.title
                          }
                        </h3>
                      ) : null}

                      {post.content ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-slate-300">
                          {
                            post.content
                          }
                        </p>
                      ) : null}

                      {isAdmin ? (
                        <div className="mt-5 border-t border-white/[0.07] pt-4">
                          <button
                            type="button"
                            disabled={
                              deletingId ===
                              post.id
                            }
                            onClick={() =>
                              void deletePost(
                                post
                              )
                            }
                            className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-bold text-rose-300 disabled:opacity-50"
                          >
                            {deletingId ===
                            post.id
                              ? "جارٍ الحذف..."
                              : "حذف الخبر"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
