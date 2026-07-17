import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PRODUCT_PLAN_MAP: Record<string, "platform" | "plus"> = {
  "1066244002": "platform",
  "2122436443": "plus",
};

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function extractToken(request: NextRequest) {
  const authorization =
    request.headers.get("authorization") || "";

  const bearerToken = authorization
    .replace(/^Bearer\s+/i, "")
    .trim();

  return (
    request.headers.get("x-salla-token") ||
    request.headers.get("x-webhook-token") ||
    bearerToken
  );
}

function extractProductIds(data: Record<string, any>) {
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.products)
      ? data.products
      : [];

  return items
    .flatMap((item: unknown) => {
      const row = asRecord(item);
      const product = asRecord(row.product);

      return [
        row.product_id,
        row.id,
        product.id,
      ];
    })
    .filter(Boolean)
    .map(String);
}

function extractCustomerEmail(data: Record<string, any>) {
  const customer = asRecord(data.customer);
  const receiver = asRecord(data.receiver);
  const shipping = asRecord(data.shipping);
  const address = asRecord(shipping.address);

  return normalizeEmail(
    customer.email ||
      receiver.email ||
      address.email ||
      data.customer_email ||
      data.email
  );
}

function extractPaymentStatus(data: Record<string, any>) {
  const payment = asRecord(data.payment);
  const status = asRecord(data.status);

  return String(
    payment.status ||
      data.payment_status ||
      status.slug ||
      status.name ||
      data.status ||
      ""
  )
    .trim()
    .toLowerCase();
}

function isPaidStatus(status: string) {
  return [
    "paid",
    "completed",
    "complete",
    "تم الدفع",
    "مدفوع",
    "مكتمل",
  ].includes(status);
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

export async function POST(request: NextRequest) {
  try {
    const expectedToken =
      process.env.SALLA_WEBHOOK_TOKEN;

    if (!expectedToken) {
      console.error(
        "SALLA_WEBHOOK_TOKEN is missing"
      );

      return NextResponse.json(
        { error: "Webhook is not configured" },
        { status: 500 }
      );
    }

    const receivedToken =
      extractToken(request);

    if (
      !receivedToken ||
      receivedToken !== expectedToken
    ) {
      return NextResponse.json(
        { error: "Unauthorized webhook" },
        { status: 401 }
      );
    }

    const payload = await request.json();
    const event = String(
      payload?.event || ""
    ).trim();

    if (
      event !== "order.payment.updated" &&
      event !== "order.status.updated"
    ) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "unsupported_event",
      });
    }

    const data = asRecord(payload?.data);
    const paymentStatus =
      extractPaymentStatus(data);

    if (!isPaidStatus(paymentStatus)) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "payment_not_confirmed",
        paymentStatus,
      });
    }

    const orderId = String(
      data.id ||
        data.order_id ||
        data.reference_id ||
        ""
    ).trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing order id" },
        { status: 400 }
      );
    }

    const productIds =
      extractProductIds(data);

    const matchedProductId =
      productIds.find(
        (id) => PRODUCT_PLAN_MAP[id]
      );

    if (!matchedProductId) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: "unknown_product",
        productIds,
      });
    }

    const planCode =
      PRODUCT_PLAN_MAP[
        matchedProductId
      ];

    const customerEmail =
      extractCustomerEmail(data);

    if (!customerEmail) {
      return NextResponse.json(
        {
          error:
            "لا يوجد بريد للعميل داخل الطلب",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: previousEvent } =
      await admin
        .from("salla_payment_events")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();

    if (previousEvent) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
      });
    }

    const targetUser =
      await findUserByEmail(
        admin,
        customerEmail
      );

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "لا يوجد حساب في المنصة بنفس بريد المشتري",
          customerEmail,
        },
        { status: 404 }
      );
    }

    const { data: plan, error: planError } =
      await admin
        .from("plans")
        .select("id,code,name")
        .eq("code", planCode)
        .single();

    if (planError || !plan) {
      throw new Error(
        planError?.message ||
          "لم يتم العثور على الباقة"
      );
    }

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
        30 * 86_400_000
    );

    const newEndIso =
      newEndDate.toISOString();

    if (activeSubscription) {
      const { error } = await admin
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          status: "active",
          starts_at:
            currentEnd &&
            currentEnd.getTime() >
              now.getTime()
              ? activeSubscription.starts_at
              : nowIso,
          ends_at: newEndIso,
          source: "salla",
        })
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
          source: "salla",
        });

      if (error) {
        throw error;
      }
    }

    const amount =
      Number(
        data?.amounts?.total?.amount ??
          data?.total?.amount ??
          data?.amount ??
          0
      ) || null;

    const { error: eventError } =
      await admin
        .from("salla_payment_events")
        .insert({
          order_id: orderId,
          event_type: event,
          product_id:
            matchedProductId,
          plan_code: planCode,
          customer_email:
            customerEmail,
          amount,
          payload,
        });

    if (eventError) {
      throw eventError;
    }

    return NextResponse.json({
      ok: true,
      orderId,
      customerEmail,
      planCode,
      endsAt: newEndIso,
    });
  } catch (error) {
    console.error(
      "Salla webhook error:",
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
