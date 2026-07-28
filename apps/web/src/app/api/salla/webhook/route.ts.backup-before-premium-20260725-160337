import { timingSafeEqual } from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PlanCode = "platform" | "plus";

const PRODUCT_PLAN_MAP: Record<
  string,
  PlanCode
> = {
  "1066244002": "platform",
  "2122436443": "plus",
};

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function asRecord(
  value: unknown
): Record<string, any> {
  return value &&
    typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function tokensMatch(
  received: string,
  expected: string
) {
  const receivedBuffer =
    Buffer.from(received);

  const expectedBuffer =
    Buffer.from(expected);

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    receivedBuffer,
    expectedBuffer
  );
}

function extractToken(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  const bearerToken =
    authorization
      .replace(/^Bearer\s+/i, "")
      .trim();

  return String(
    request.headers.get(
      "x-webhook-token"
    ) ||
      request.headers.get(
        "x-salla-token"
      ) ||
      bearerToken ||
      ""
  ).trim();
}

function extractProductIds(
  data: Record<string, any>
) {
  const items = Array.isArray(
    data.items
  )
    ? data.items
    : Array.isArray(data.products)
      ? data.products
      : [];

  return items
    .flatMap((item: unknown) => {
      const row = asRecord(item);
      const product = asRecord(
        row.product
      );

      return [
        row.product_id,
        row.id,
        product.id,
      ];
    })
    .filter(Boolean)
    .map(String);
}

function extractCustomerEmail(
  data: Record<string, any>
) {
  const customer = asRecord(
    data.customer
  );

  const receiver = asRecord(
    data.receiver
  );

  return normalizeEmail(
    customer.email ||
      receiver.email ||
      data.customer_email ||
      data.email
  );
}

function extractPaymentStatus(
  data: Record<string, any>
) {
  const payment = asRecord(
    data.payment
  );

  return String(
    payment.status ||
      data.payment_status ||
      ""
  )
    .trim()
    .toLowerCase();
}

function isPaidStatus(
  status: string
) {
  return [
    "paid",
    "completed",
    "complete",
    "مدفوع",
    "مكتمل",
    "تم الدفع",
  ].includes(status);
}

function extractAmount(
  data: Record<string, any>
) {
  const amounts = asRecord(
    data.amounts
  );

  const total = asRecord(
    amounts.total
  );

  const legacyTotal = asRecord(
    data.total
  );

  const value =
    total.amount ??
    legacyTotal.amount ??
    data.amount ??
    null;

  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : null;
}

export async function POST(
  request: NextRequest
) {
  try {
    const expectedToken =
      process.env
        .SALLA_WEBHOOK_TOKEN;

    if (!expectedToken) {
      console.error(
        "SALLA_WEBHOOK_TOKEN is missing"
      );

      return NextResponse.json(
        {
          error:
            "Webhook is not configured",
        },
        { status: 500 }
      );
    }

    const receivedToken =
      extractToken(request);

    if (
      !receivedToken ||
      !tokensMatch(
        receivedToken,
        expectedToken
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unauthorized webhook",
        },
        { status: 401 }
      );
    }

    const payload =
      await request.json();

    const event = String(
      payload?.event || ""
    ).trim();

    if (
      event !==
        "order.payment.updated" &&
      event !==
        "order.status.updated"
    ) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason:
          "unsupported_event",
      });
    }

    const data = asRecord(
      payload?.data
    );

    const paymentStatus =
      extractPaymentStatus(data);

    if (
      !isPaidStatus(paymentStatus)
    ) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason:
          "payment_not_confirmed",
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
        {
          error:
            "Missing order id",
        },
        { status: 400 }
      );
    }

    const productIds =
      extractProductIds(data);

    const matchedProductId =
      productIds.find(
        (productId) =>
          PRODUCT_PLAN_MAP[
            productId
          ]
      );

    if (!matchedProductId) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason:
          "unknown_product",
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

    const admin =
      createAdminClient();

    const {
      data: rpcResult,
      error: rpcError,
    } = await admin.rpc(
      "process_salla_paid_order",
      {
        p_order_id: orderId,
        p_event_type: event,
        p_product_id:
          matchedProductId,
        p_plan_code: planCode,
        p_customer_email:
          customerEmail,
        p_amount:
          extractAmount(data),
        p_payload: payload,
      }
    );

    if (rpcError) {
      throw rpcError;
    }

    const result =
      asRecord(rpcResult);

    if (
      result.status ===
      "needs_review"
    ) {
      return NextResponse.json(
        result,
        { status: 409 }
      );
    }

    if (
      result.status === "failed"
    ) {
      return NextResponse.json(
        result,
        { status: 500 }
      );
    }

    return NextResponse.json(
      result
    );
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
