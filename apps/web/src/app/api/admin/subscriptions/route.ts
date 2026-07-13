import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createTemporaryPassword() {
  return `ST!${randomBytes(9).toString("base64url")}a7`;
}

async function findUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } =
      await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

    if (error) {
      throw error;
    }

    const found = data.users.find(
      (user) =>
        user.email?.toLowerCase() === email
    );

    if (found) {
      return found;
    }

    if (data.users.length < 1000) {
      break;
    }
  }

  return null;
}

async function getDefaultPlan(
  admin: ReturnType<typeof createAdminClient>
) {
  const trialByCode = await admin
    .from("plans")
    .select("id,code,name,is_trial")
    .eq("code", "trial")
    .limit(1)
    .maybeSingle();

  if (trialByCode.data) {
    return trialByCode.data;
  }

  const trialPlan = await admin
    .from("plans")
    .select("id,code,name,is_trial")
    .eq("is_trial", true)
    .limit(1)
    .maybeSingle();

  if (trialPlan.data) {
    return trialPlan.data;
  }

  const anyPlan = await admin
    .from("plans")
    .select("id,code,name,is_trial")
    .limit(1)
    .maybeSingle();

  if (!anyPlan.data) {
    throw new Error(
      "لا توجد باقة في جدول plans"
    );
  }

  return anyPlan.data;
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (
      origin &&
      origin !== request.nextUrl.origin
    ) {
      return NextResponse.json(
        { error: "طلب غير مسموح" },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول" },
        { status: 401 }
      );
    }

    const { data: currentProfile } =
      await supabase
        .from("profiles")
        .select("role")
        .eq("id", currentUser.id)
        .maybeSingle();

    if (currentProfile?.role !== "admin") {
      return NextResponse.json(
        { error: "ليست لديك صلاحية المسؤول" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const email = normalizeEmail(body.email);
    const fullName = String(
      body.fullName || ""
    ).trim();

    const requestedPassword = String(
      body.password || ""
    );

    const days = Math.floor(
      Number(body.days)
    );

    if (
      !email ||
      !email.includes("@")
    ) {
      return NextResponse.json(
        { error: "البريد الإلكتروني غير صحيح" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(days) ||
      days < 1 ||
      days > 3650
    ) {
      return NextResponse.json(
        {
          error:
            "المدة يجب أن تكون بين يوم و3650 يوم",
        },
        { status: 400 }
      );
    }

    if (
      requestedPassword &&
      requestedPassword.length < 8
    ) {
      return NextResponse.json(
        {
          error:
            "كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    let targetUser =
      await findUserByEmail(admin, email);

    let created = false;
    let temporaryPassword: string | null = null;

    if (!targetUser) {
      temporaryPassword =
        requestedPassword ||
        createTemporaryPassword();

      const { data, error } =
        await admin.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name:
              fullName ||
              email.split("@")[0],
          },
        });

      if (error || !data.user) {
        throw new Error(
          error?.message ||
            "تعذر إنشاء المستخدم"
        );
      }

      targetUser = data.user;
      created = true;
    } else if (fullName) {
      const currentMetadata =
        targetUser.user_metadata || {};

      const { error } =
        await admin.auth.admin.updateUserById(
          targetUser.id,
          {
            user_metadata: {
              ...currentMetadata,
              full_name: fullName,
            },
          }
        );

      if (error) {
        throw error;
      }
    }

    const { data: existingProfile } =
      await admin
        .from("profiles")
        .select(
          "id,full_name,role,is_blocked"
        )
        .eq("id", targetUser.id)
        .maybeSingle();

    const profileName =
      fullName ||
      existingProfile?.full_name ||
      String(
        targetUser.user_metadata
          ?.full_name || ""
      ) ||
      email.split("@")[0];

    const { error: profileError } =
      await admin
        .from("profiles")
        .upsert(
          {
            id: targetUser.id,
            full_name: profileName,
            role:
              existingProfile?.role ||
              "user",
            is_blocked:
              existingProfile
                ?.is_blocked ?? false,
          },
          {
            onConflict: "id",
          }
        );

    if (profileError) {
      throw profileError;
    }

    const plan =
      await getDefaultPlan(admin);

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: activeSubscription } =
      await admin
        .from("subscriptions")
        .select(
          "id,starts_at,ends_at,status"
        )
        .eq("user_id", targetUser.id)
        .eq("status", "active")
        .order("ends_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    const currentEnd =
      activeSubscription?.ends_at
        ? new Date(
            activeSubscription.ends_at
          )
        : null;

    const baseDate =
      currentEnd &&
      currentEnd.getTime() >
        now.getTime()
        ? currentEnd
        : now;

    const newEndDate = new Date(
      baseDate.getTime() +
        days * 86_400_000
    );

    const newEndIso =
      newEndDate.toISOString();

    if (activeSubscription) {
      const expired =
        !currentEnd ||
        currentEnd.getTime() <=
          now.getTime();

      const updatePayload: Record<
        string,
        unknown
      > = {
        plan_id: plan.id,
        status: "active",
        ends_at: newEndIso,
        source: "admin",
      };

      if (expired) {
        updatePayload.starts_at =
          nowIso;
      }

      const { error } = await admin
        .from("subscriptions")
        .update(updatePayload)
        .eq(
          "id",
          activeSubscription.id
        );

      if (error) {
        throw error;
      }
    } else {
      const { error } = await admin
        .from("subscriptions")
        .insert({
          user_id: targetUser.id,
          plan_id: plan.id,
          status: "active",
          starts_at: nowIso,
          ends_at: newEndIso,
          source: "admin",
        });

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      email,
      fullName: profileName,
      daysAdded: days,
      planName:
        plan.name || plan.code,
      endsAt: newEndIso,
      temporaryPassword,
    });
  } catch (error) {
    console.error(
      "Admin subscription error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع",
      },
      { status: 500 }
    );
  }
}
