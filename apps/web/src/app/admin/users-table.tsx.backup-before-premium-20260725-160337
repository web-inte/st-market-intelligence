"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

type Subscription = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  source: string;
  planCode: string;
  planName: string;
  isTrial: boolean;
  remainingDays: number;
};

type UserItem = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  isBlocked: boolean;
  trialUsed: boolean;
  emailConfirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  subscription: Subscription | null;
};

function formatDate(
  value?: string | null
) {
  if (!value) {
    return "غير متاح";
  }

  return new Intl.DateTimeFormat(
    "ar-SA",
    {
      dateStyle: "medium",
    }
  ).format(new Date(value));
}

function subscriptionStatus(
  user: UserItem
) {
  if (user.isBlocked) {
    return {
      label: "موقوف",
      className:
        "border-rose-400/30 bg-rose-400/10 text-rose-300",
    };
  }

  if (user.role === "admin") {
    return {
      label: "مسؤول",
      className:
        "border-violet-400/30 bg-violet-400/10 text-violet-300",
    };
  }

  if (!user.subscription) {
    return {
      label: "بدون اشتراك",
      className:
        "border-slate-600 bg-slate-800 text-slate-300",
    };
  }

  if (
    user.subscription.status !==
      "active" ||
    user.subscription.remainingDays <= 0
  ) {
    return {
      label: "منتهي",
      className:
        "border-amber-400/30 bg-amber-400/10 text-amber-300",
    };
  }

  return {
    label: user.subscription.isTrial
      ? "تجريبي"
      : "فعال",

    className:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  };
}

export default function AdminUsersTable() {
  const [users, setUsers] =
    useState<UserItem[]>([]);

  const [query, setQuery] =
    useState("");

  const [activeQuery, setActiveQuery] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [actionUserId, setActionUserId] =
    useState("");

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [
    endDateValues,
    setEndDateValues,
  ] = useState<Record<string, string>>(
    {}
  );

  const loadUsers = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const parameters =
          new URLSearchParams({
            limit: "100",
          });

        if (activeQuery) {
          parameters.set(
            "q",
            activeQuery
          );
        }

        const response = await fetch(
          `/api/admin/users?${parameters.toString()}`,
          {
            cache: "no-store",
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "تعذر تحميل المستخدمين"
          );
        }

        setUsers(data.users || []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "تعذر تحميل المستخدمين"
        );
      } finally {
        setLoading(false);
      }
    },
    [activeQuery]
  );

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function runAction(
    userId: string,
    action: string,
    values: Record<string, unknown>
  ) {
    setActionUserId(userId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/users",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            userId,
            action,
            ...values,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر تنفيذ العملية"
        );
      }

      setMessage(
        data.message ||
          "تم تنفيذ العملية"
      );

      await loadUsers();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "تعذر تنفيذ العملية"
      );
    } finally {
      setActionUserId("");
    }
  }

  function submitSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setActiveQuery(
      query.trim()
    );
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-cyan-400">
            إدارة المشتركين
          </p>

          <h2 className="mt-2 text-2xl font-black">
            جميع المستخدمين
          </h2>
        </div>

        <form
          onSubmit={submitSearch}
          className="flex w-full max-w-md gap-2"
        >
          <input
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
            placeholder="ابحث بالاسم أو البريد"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            className="rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950"
          >
            بحث
          </button>
        </form>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900 p-8 text-center text-slate-400">
          جارٍ تحميل المستخدمين...
        </div>
      ) : users.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900 p-8 text-center text-slate-400">
          لا يوجد مستخدمون مطابقون.
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {users.map((user) => {
            const status =
              subscriptionStatus(user);

            const working =
              actionUserId === user.id;

            return (
              <article
                key={user.id}
                className="rounded-3xl border border-white/10 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-lg font-black">
                        {user.fullName ||
                          "بدون اسم"}
                      </h3>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    <p
                      dir="ltr"
                      className="mt-2 break-all text-left text-sm text-slate-400"
                    >
                      {user.email}
                    </p>
                  </div>

                  <div className="text-left text-xs text-slate-500">
                    <p>
                      التسجيل:{" "}
                      {formatDate(
                        user.createdAt
                      )}
                    </p>

                    <p className="mt-1">
                      آخر دخول:{" "}
                      {formatDate(
                        user.lastSignInAt
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs text-slate-500">
                      الباقة
                    </p>

                    <p className="mt-1 font-bold">
                      {user.role ===
                      "admin"
                        ? "دخول إداري كامل"
                        : user
                              .subscription
                              ?.planName ||
                          "لا توجد باقة"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs text-slate-500">
                      الأيام المتبقية
                    </p>

                    <p className="mt-1 font-bold">
                      {user.role ===
                      "admin"
                        ? "غير محدود"
                        : `${
                            user
                              .subscription
                              ?.remainingDays ??
                            0
                          } يوم`}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-950 p-4">
                    <p className="text-xs text-slate-500">
                      نهاية الاشتراك
                    </p>

                    <p className="mt-1 font-bold">
                      {user.role ===
                      "admin"
                        ? "غير محدد"
                        : formatDate(
                            user
                              .subscription
                              ?.endsAt
                          )}
                    </p>
                  </div>
                </div>

                {user.role !==
                  "admin" &&
                user.subscription ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">
                          إدارة الباقة
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          تغيير الباقة لا يغيّر مدة الاشتراك.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            working ||
                            user.subscription
                              .planCode ===
                              "platform"
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "تحويل اشتراك هذا المستخدم إلى باقة منصة؟"
                              )
                            ) {
                              void runAction(
                                user.id,
                                "set_plan",
                                {
                                  planCode:
                                    "platform",
                                }
                              );
                            }
                          }}
                          className={[
                            "rounded-xl border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed",
                            user.subscription
                              .planCode ===
                            "platform"
                              ? "border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20"
                              : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 disabled:opacity-100",
                          ].join(" ")}
                        >
                          {user.subscription
                            .planCode ===
                          "platform"
                            ? "✓ منصة"
                            : "منصة"}
                        </button>

                        <button
                          type="button"
                          disabled={
                            working ||
                            user.subscription
                              .planCode ===
                              "plus"
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "تحويل اشتراك هذا المستخدم إلى باقة Plus؟"
                              )
                            ) {
                              void runAction(
                                user.id,
                                "set_plan",
                                {
                                  planCode:
                                    "plus",
                                }
                              );
                            }
                          }}
                          className={[
                            "rounded-xl border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed",
                            user.subscription
                              .planCode ===
                            "plus"
                              ? "border-violet-300 bg-violet-400 text-slate-950 shadow-lg shadow-violet-500/20"
                              : "border-violet-400/30 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20 disabled:opacity-100",
                          ].join(" ")}
                        >
                          {user.subscription
                            .planCode ===
                          "plus"
                            ? "✓ Plus"
                            : "Plus"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-white/10 pt-4">
                      <p className="text-sm font-black text-white">
                        تاريخ نهاية الاشتراك
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={
                            endDateValues[
                              user.id
                            ] ??
                            user.subscription.endsAt.slice(
                              0,
                              10
                            )
                          }
                          onChange={(event) =>
                            setEndDateValues(
                              (current) => ({
                                ...current,
                                [user.id]:
                                  event.target
                                    .value,
                              })
                            )
                          }
                          className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                        />

                        <button
                          type="button"
                          disabled={working}
                          onClick={() => {
                            const currentEndDate =
                              user.subscription
                                ?.endsAt.slice(
                                  0,
                                  10
                                ) || "";

                            const endDate =
                              endDateValues[
                                user.id
                              ] ??
                              currentEndDate;

                            if (!endDate) {
                              setError(
                                "لا يوجد تاريخ نهاية صالح لهذا الاشتراك"
                              );
                              return;
                            }

                            if (
                              window.confirm(
                                `اعتماد نهاية الاشتراك بتاريخ ${endDate}؟`
                              )
                            ) {
                              void runAction(
                                user.id,
                                "set_end_date",
                                {
                                  endDate,
                                }
                              );
                            }
                          }}
                          className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-bold text-sky-300 disabled:opacity-50"
                        >
                          حفظ التاريخ
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {user.role !==
                  "admin" ? (
                    <>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void runAction(
                            user.id,
                            "adjust_days",
                            {
                              days: 7,
                            }
                          )
                        }
                        className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300 disabled:opacity-50"
                      >
                        +7 أيام
                      </button>

                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void runAction(
                            user.id,
                            "adjust_days",
                            {
                              days: 30,
                            }
                          )
                        }
                        className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300 disabled:opacity-50"
                      >
                        +30 يوم
                      </button>

                      <button
                        type="button"
                        disabled={working}
                        onClick={() => {
                          if (
                            window.confirm(
                              "هل تريد خصم 7 أيام من الاشتراك؟"
                            )
                          ) {
                            void runAction(
                              user.id,
                              "adjust_days",
                              {
                                days: -7,
                              }
                            );
                          }
                        }}
                        className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-bold text-amber-300 disabled:opacity-50"
                      >
                        -7 أيام
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    disabled={working}
                    onClick={() => {
                      const nextBlocked =
                        !user.isBlocked;

                      if (
                        !nextBlocked ||
                        window.confirm(
                          "هل تريد إيقاف هذا الحساب؟"
                        )
                      ) {
                        void runAction(
                          user.id,
                          "set_blocked",
                          {
                            blocked:
                              nextBlocked,
                          }
                        );
                      }
                    }}
                    className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-bold text-rose-300 disabled:opacity-50"
                  >
                    {user.isBlocked
                      ? "إعادة التفعيل"
                      : "إيقاف الحساب"}
                  </button>

                  <button
                    type="button"
                    disabled={working}
                    onClick={() => {
                      const nextRole =
                        user.role ===
                        "admin"
                          ? "user"
                          : "admin";

                      if (
                        window.confirm(
                          nextRole ===
                            "admin"
                            ? "منح هذا المستخدم صلاحية المسؤول؟"
                            : "إزالة صلاحية المسؤول؟"
                        )
                      ) {
                        void runAction(
                          user.id,
                          "set_role",
                          {
                            role: nextRole,
                          }
                        );
                      }
                    }}
                    className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-sm font-bold text-violet-300 disabled:opacity-50"
                  >
                    {user.role ===
                    "admin"
                      ? "إرجاعه مستخدم"
                      : "منحه Admin"}
                  </button>
                </div>

                {working ? (
                  <p className="mt-3 text-sm text-cyan-300">
                    جارٍ تنفيذ العملية...
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
