import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function safeInteger(
  value: unknown,
  fallback: number
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.trunc(number)
    : fallback;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        {
          error: "يجب تسجيل الدخول",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const admin = createAdminClient();

  const {
    data: profile,
    error: profileError,
  } = await admin
    .from("profiles")
    .select("role,is_blocked")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    profile?.role !== "admin" ||
    profile?.is_blocked
  ) {
    return {
      error: NextResponse.json(
        {
          error: "ليست لديك صلاحية المسؤول",
        },
        {
          status: 403,
        }
      ),
    };
  }

  return {
    admin,
    currentUser: user,
  };
}

export async function GET(
  request: NextRequest
) {
  try {
    const access = await requireAdmin();

    if ("error" in access) {
      return access.error;
    }

    const { admin } = access;

    const query = normalizeText(
      request.nextUrl.searchParams.get("q")
    );

    const page = Math.max(
      1,
      safeInteger(
        request.nextUrl.searchParams.get(
          "page"
        ),
        1
      )
    );

    const limit = Math.min(
      100,
      Math.max(
        10,
        safeInteger(
          request.nextUrl.searchParams.get(
            "limit"
          ),
          50
        )
      )
    );

    const allUsers: Array<{
      id: string;
      email?: string;
      created_at: string;
      last_sign_in_at?: string;
      email_confirmed_at?: string;
      user_metadata?: Record<
        string,
        unknown
      >;
    }> = [];

    for (
      let authPage = 1;
      authPage <= 20;
      authPage += 1
    ) {
      const {
        data,
        error,
      } = await admin.auth.admin.listUsers({
        page: authPage,
        perPage: 1000,
      });

      if (error) {
        throw error;
      }

      allUsers.push(...data.users);

      if (data.users.length < 1000) {
        break;
      }
    }

    const filteredUsers = allUsers
      .filter((user) => {
        if (!query) {
          return true;
        }

        const email = normalizeText(
          user.email
        );

        const name = normalizeText(
          user.user_metadata?.full_name ||
            user.user_metadata?.name
        );

        return (
          email.includes(query) ||
          name.includes(query)
        );
      })
      .sort(
        (first, second) =>
          new Date(
            second.created_at
          ).getTime() -
          new Date(
            first.created_at
          ).getTime()
      );

    const total = filteredUsers.length;
    const start = (page - 1) * limit;

    const selectedUsers =
      filteredUsers.slice(
        start,
        start + limit
      );

    const userIds = selectedUsers.map(
      (user) => user.id
    );

    if (userIds.length === 0) {
      return NextResponse.json({
        users: [],
        total,
        page,
        limit,
      });
    }

    const [
      profilesResult,
      subscriptionsResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id,full_name,role,is_blocked,trial_used,created_at"
        )
        .in("id", userIds),

      admin
        .from("subscriptions")
        .select(`
          id,
          user_id,
          status,
          starts_at,
          ends_at,
          source,
          plans (
            code,
            name,
            is_trial
          )
        `)
        .in("user_id", userIds)
        .order("ends_at", {
          ascending: false,
        }),
    ]);

    if (profilesResult.error) {
      throw profilesResult.error;
    }

    if (subscriptionsResult.error) {
      throw subscriptionsResult.error;
    }

    const profileMap = new Map(
      (profilesResult.data || []).map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

    const subscriptionsMap = new Map<
      string,
      Array<Record<string, unknown>>
    >();

    for (
      const subscription of
        subscriptionsResult.data || []
    ) {
      const userId = String(
        subscription.user_id
      );

      const list =
        subscriptionsMap.get(userId) || [];

      list.push(
        subscription as unknown as Record<
          string,
          unknown
        >
      );

      subscriptionsMap.set(
        userId,
        list
      );
    }

    const now = Date.now();

    const users = selectedUsers.map(
      (authUser) => {
        const profile =
          profileMap.get(authUser.id);

        const subscriptions =
          subscriptionsMap.get(
            authUser.id
          ) || [];

        const activeSubscription =
          subscriptions.find(
            (subscription) => {
              const startsAt =
                new Date(
                  String(
                    subscription.starts_at
                  )
                ).getTime();

              const endsAt =
                new Date(
                  String(
                    subscription.ends_at
                  )
                ).getTime();

              return (
                subscription.status ===
                  "active" &&
                startsAt <= now &&
                endsAt > now
              );
            }
          );

        const latestSubscription =
          activeSubscription ||
          subscriptions[0] ||
          null;

        let subscription = null;

        if (latestSubscription) {
          const planValue =
            latestSubscription.plans;

          const plan = Array.isArray(
            planValue
          )
            ? planValue[0]
            : planValue;

          const normalizedPlan =
            plan &&
            typeof plan === "object"
              ? (plan as Record<
                  string,
                  unknown
                >)
              : null;

          const endsAt = String(
            latestSubscription.ends_at
          );

          subscription = {
            id: String(
              latestSubscription.id
            ),

            status:
              latestSubscription.status,

            startsAt: String(
              latestSubscription.starts_at
            ),

            endsAt,

            source:
              latestSubscription.source,

            planCode: String(
              normalizedPlan?.code || ""
            ),

            planName: String(
              normalizedPlan?.name ||
                "اشتراك"
            ),

            isTrial: Boolean(
              normalizedPlan?.is_trial
            ),

            remainingDays: Math.max(
              0,
              Math.ceil(
                (new Date(
                  endsAt
                ).getTime() -
                  now) /
                  DAY_MS
              )
            ),
          };
        }

        return {
          id: authUser.id,

          email:
            authUser.email || "",

          fullName:
            profile?.full_name ||
            String(
              authUser.user_metadata
                ?.full_name ||
                authUser.user_metadata
                  ?.name ||
                ""
            ),

          role:
            profile?.role || "user",

          isBlocked:
            Boolean(
              profile?.is_blocked
            ),

          trialUsed:
            Boolean(
              profile?.trial_used
            ),

          emailConfirmed:
            Boolean(
              authUser.email_confirmed_at
            ),

          createdAt:
            authUser.created_at,

          lastSignInAt:
            authUser.last_sign_in_at ||
            null,

          subscription,
        };
      }
    );

    return NextResponse.json({
      users,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error(
      "Admin users GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذر تحميل المستخدمين",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest
) {
  try {
    const access = await requireAdmin();

    if ("error" in access) {
      return access.error;
    }

    const {
      admin,
      currentUser,
    } = access;

    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const userId = String(
      body.userId || ""
    );

    const action = String(
      body.action || ""
    );

    if (!userId) {
      return NextResponse.json(
        {
          error: "معرف المستخدم غير موجود",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: targetProfile,
      error: targetProfileError,
    } = await admin
      .from("profiles")
      .select(
        "id,role,is_blocked"
      )
      .eq("id", userId)
      .maybeSingle();

    if (
      targetProfileError ||
      !targetProfile
    ) {
      return NextResponse.json(
        {
          error: "المستخدم غير موجود",
        },
        {
          status: 404,
        }
      );
    }

    if (action === "set_blocked") {
      const blocked = Boolean(
        body.blocked
      );

      if (
        userId === currentUser.id &&
        blocked
      ) {
        return NextResponse.json(
          {
            error:
              "لا يمكنك إيقاف حسابك الإداري",
          },
          {
            status: 400,
          }
        );
      }

      const { error } = await admin
        .from("profiles")
        .update({
          is_blocked: blocked,
        })
        .eq("id", userId);

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        message: blocked
          ? "تم إيقاف الحساب"
          : "تم تفعيل الحساب",
      });
    }

    if (action === "set_role") {
      const role = String(
        body.role || ""
      );

      if (
        role !== "admin" &&
        role !== "user"
      ) {
        return NextResponse.json(
          {
            error: "الصلاحية غير صحيحة",
          },
          {
            status: 400,
          }
        );
      }

      if (
        userId === currentUser.id &&
        role !== "admin"
      ) {
        return NextResponse.json(
          {
            error:
              "لا يمكنك إزالة صلاحيتك الإدارية",
          },
          {
            status: 400,
          }
        );
      }

      const {
        error: profileError,
      } = await admin
        .from("profiles")
        .update({
          role,
        })
        .eq("id", userId);

      if (profileError) {
        throw profileError;
      }

      const {
        error: roleError,
      } = await admin
        .from("user_roles")
        .upsert(
          {
            user_id: userId,
            role,
            created_by:
              currentUser.id,
          },
          {
            onConflict: "user_id",
          }
        );

      if (roleError) {
        throw roleError;
      }

      return NextResponse.json({
        ok: true,
        message:
          role === "admin"
            ? "تم منح صلاحية المسؤول"
            : "تم تحويل الحساب إلى مستخدم",
      });
    }

    if (action === "set_plan") {
      const planCode = String(
        body.planCode || ""
      );

      if (
        planCode !== "platform" &&
        planCode !== "plus"
      ) {
        return NextResponse.json(
          {
            error:
              "الباقة المطلوبة غير صحيحة",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: plan,
        error: planError,
      } = await admin
        .from("plans")
        .select(
          "id,code,name,is_trial"
        )
        .eq("code", planCode)
        .maybeSingle();

      if (
        planError ||
        !plan
      ) {
        return NextResponse.json(
          {
            error:
              "لم يتم العثور على الباقة المطلوبة",
          },
          {
            status: 404,
          }
        );
      }

      const {
        data: subscription,
        error: subscriptionError,
      } = await admin
        .from("subscriptions")
        .select(
          "id,plan_id,starts_at,ends_at,status"
        )
        .eq("user_id", userId)
        .order("ends_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (
        subscriptionError ||
        !subscription
      ) {
        return NextResponse.json(
          {
            error:
              "لا يوجد اشتراك لهذا المستخدم",
          },
          {
            status: 400,
          }
        );
      }

      if (
        String(subscription.plan_id) ===
        String(plan.id)
      ) {
        return NextResponse.json({
          ok: true,
          message:
            planCode === "plus"
              ? "المستخدم مشترك بالفعل في Plus"
              : "المستخدم مشترك بالفعل في منصة",
        });
      }

      const oldPlanId =
        subscription.plan_id;

      const {
        error: updatePlanError,
      } = await admin
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          source: "admin",
        })
        .eq("id", subscription.id);

      if (updatePlanError) {
        throw updatePlanError;
      }

      const {
        error: planEventError,
      } = await admin
        .from("subscription_events")
        .insert({
          subscription_id:
            subscription.id,

          user_id: userId,

          event_type:
            "subscription_plan_changed",

          old_data: {
            plan_id: oldPlanId,
          },

          new_data: {
            plan_id: plan.id,
            plan_code: plan.code,
            plan_name: plan.name,
          },

          actor_user_id:
            currentUser.id,

          note:
            planCode === "plus"
              ? "تم تحويل الباقة إلى Plus"
              : "تم تحويل الباقة إلى منصة",
        });

      if (planEventError) {
        console.error(
          "Plan change event error:",
          planEventError
        );
      }

      return NextResponse.json({
        ok: true,

        message:
          planCode === "plus"
            ? "تم تحويل الاشتراك إلى Plus"
            : "تم تحويل الاشتراك إلى منصة",
      });
    }

    if (action === "set_end_date") {
      const endDate = String(
        body.endDate || ""
      ).trim();

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          endDate
        )
      ) {
        return NextResponse.json(
          {
            error:
              "تاريخ نهاية الاشتراك غير صحيح",
          },
          {
            status: 400,
          }
        );
      }

      const calculatedEnd =
        new Date(
          `${endDate}T23:59:59.999Z`
        );

      if (
        Number.isNaN(
          calculatedEnd.getTime()
        )
      ) {
        return NextResponse.json(
          {
            error:
              "تعذر قراءة تاريخ نهاية الاشتراك",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: subscription,
        error: subscriptionError,
      } = await admin
        .from("subscriptions")
        .select(
          "id,ends_at,status"
        )
        .eq("user_id", userId)
        .order("ends_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (
        subscriptionError ||
        !subscription
      ) {
        return NextResponse.json(
          {
            error:
              "لا يوجد اشتراك لهذا المستخدم",
          },
          {
            status: 400,
          }
        );
      }

      const oldEnd = String(
        subscription.ends_at
      );

      const expiresNow =
        calculatedEnd.getTime() <=
        Date.now();

      const {
        error: updateEndError,
      } = await admin
        .from("subscriptions")
        .update({
          ends_at:
            calculatedEnd.toISOString(),

          status: expiresNow
            ? "expired"
            : "active",

          source: "admin",
        })
        .eq("id", subscription.id);

      if (updateEndError) {
        throw updateEndError;
      }

      const {
        error: dateEventError,
      } = await admin
        .from("subscription_events")
        .insert({
          subscription_id:
            subscription.id,

          user_id: userId,

          event_type:
            "subscription_end_date_changed",

          old_data: {
            ends_at: oldEnd,
          },

          new_data: {
            ends_at:
              calculatedEnd.toISOString(),

            status: expiresNow
              ? "expired"
              : "active",
          },

          actor_user_id:
            currentUser.id,

          note:
            "تم تعديل تاريخ نهاية الاشتراك من لوحة المسؤول",
        });

      if (dateEventError) {
        console.error(
          "End date event error:",
          dateEventError
        );
      }

      return NextResponse.json({
        ok: true,

        message: expiresNow
          ? "تم تعديل التاريخ وانتهى الاشتراك"
          : "تم تعديل تاريخ نهاية الاشتراك",
      });
    }

    if (action === "adjust_days") {
      const days = safeInteger(
        body.days,
        0
      );

      if (
        days === 0 ||
        days < -3650 ||
        days > 3650
      ) {
        return NextResponse.json(
          {
            error:
              "قيمة الأيام غير صحيحة",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: subscription,
        error: subscriptionError,
      } = await admin
        .from("subscriptions")
        .select(
          "id,ends_at,status"
        )
        .eq("user_id", userId)
        .eq("status", "active")
        .order("ends_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (
        subscriptionError ||
        !subscription
      ) {
        return NextResponse.json(
          {
            error:
              "لا يوجد اشتراك فعال لهذا المستخدم",
          },
          {
            status: 400,
          }
        );
      }

      const oldEnd =
        new Date(
          subscription.ends_at
        );

      const base =
        oldEnd.getTime() >
        Date.now()
          ? oldEnd
          : new Date();

      const calculatedEnd =
        new Date(
          base.getTime() +
            days * DAY_MS
        );

      const expiresNow =
        calculatedEnd.getTime() <=
        Date.now();

      const finalEnd = expiresNow
        ? new Date()
        : calculatedEnd;

      const {
        error: updateError,
      } = await admin
        .from("subscriptions")
        .update({
          ends_at:
            finalEnd.toISOString(),

          status: expiresNow
            ? "expired"
            : "active",
        })
        .eq(
          "id",
          subscription.id
        );

      if (updateError) {
        throw updateError;
      }

      await admin
        .from("subscription_events")
        .insert({
          subscription_id:
            subscription.id,

          user_id: userId,

          event_type:
            days > 0
              ? "subscription_extended"
              : "subscription_reduced",

          old_data: {
            ends_at:
              oldEnd.toISOString(),
          },

          new_data: {
            ends_at:
              finalEnd.toISOString(),

            adjusted_days: days,
          },

          actor_user_id:
            currentUser.id,

          note:
            days > 0
              ? `تمت إضافة ${days} يوم`
              : `تم خصم ${Math.abs(
                  days
                )} يوم`,
        });

      return NextResponse.json({
        ok: true,

        message:
          days > 0
            ? `تمت إضافة ${days} يوم`
            : `تم خصم ${Math.abs(
                days
              )} يوم`,
      });
    }

    return NextResponse.json(
      {
        error: "العملية غير مدعومة",
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error(
      "Admin users PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذر تنفيذ العملية",
      },
      {
        status: 500,
      }
    );
  }
}
