import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  createClient,
} from "@/lib/supabase/server";

export const dynamic =
  "force-dynamic";

export const runtime =
  "nodejs";

const BUCKET_NAME =
  "market-news";

const ALLOWED_TYPES =
  new Set([
    "URGENT",
    "IMPORTANT",
    "UPDATE",
    "ANNOUNCEMENT",
    "STATISTICS",
    "NEWS",
  ]);

const ALLOWED_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);

const MAX_IMAGE_SIZE =
  5 * 1024 * 1024;

type MarketNewsPostRow = {
  id: string;
  title: string | null;
  content: string | null;
  image_url: string | null;
  news_type:
    | "URGENT"
    | "IMPORTANT"
    | "UPDATE"
    | "ANNOUNCEMENT"
    | "STATISTICS"
    | "NEWS";
  is_pinned: boolean;
  is_published: boolean;
  expires_at: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
};

function isAllowedRequestOrigin(
  request: Request
) {
  const origin =
    request.headers.get("origin");

  if (!origin) {
    return true;
  }

  let originHost = "";

  try {
    originHost =
      new URL(origin)
        .host
        .trim()
        .toLowerCase();
  } catch {
    return false;
  }

  const possibleHosts = [
    request.headers.get(
      "x-forwarded-host"
    ),
    request.headers.get("host"),
  ]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(",")
        .map((host) =>
          host
            .trim()
            .toLowerCase()
        )
    );

  return possibleHosts.includes(
    originHost
  );
}

async function requireAdmin() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        {
          error:
            "يجب تسجيل الدخول",
        },
        {
          status: 401,
        }
      ),
      user: null,
    };
  }

  const {
    data: profile,
  } =
    await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

  if (
    profile?.role !== "admin"
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            "ليست لديك صلاحية المسؤول",
        },
        {
          status: 403,
        }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

function normalizeText(
  value: FormDataEntryValue | null,
  maxLength: number
) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeBoolean(
  value: FormDataEntryValue | null
) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() ===
    "true"
  );
}

function imageExtension(
  contentType: string
) {
  if (
    contentType === "image/png"
  ) {
    return "png";
  }

  if (
    contentType === "image/webp"
  ) {
    return "webp";
  }

  if (
    contentType === "image/gif"
  ) {
    return "gif";
  }

  return "jpg";
}

async function withSignedImageUrl<
  T extends {
    image_url: string | null;
  },
>(
  post: T
) {
  if (!post.image_url) {
    return {
      ...post,
      image_signed_url: null,
    };
  }

  const admin =
    createAdminClient();

  const {
    data,
  } =
    await admin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        post.image_url,
        60 * 60
      );

  return {
    ...post,
    image_signed_url:
      data?.signedUrl || null,
  };
}

export async function GET() {
  try {
    const authorization =
      await requireAdmin();

    if (
      authorization.error
    ) {
      return authorization.error;
    }

    const admin =
      createAdminClient();

    const {
      data,
      error,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .select(
          [
            "id",
            "title",
            "content",
            "image_url",
            "news_type",
            "is_pinned",
            "is_published",
            "expires_at",
            "published_at",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .order(
          "is_pinned",
          {
            ascending: false,
          }
        )
        .order(
          "published_at",
          {
            ascending: false,
          }
        );

    if (error) {
      throw error;
    }

    const rows =
      (data || []) as unknown as
        MarketNewsPostRow[];

    const posts =
      await Promise.all(
        rows.map((post) =>
          withSignedImageUrl(
            post
          )
        )
      );

    return NextResponse.json({
      ok: true,
      posts,
    });
  } catch (error) {
    console.error(
      "GET /api/admin/market-news failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "تعذر تحميل أخبار مركز الأخبار",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  let uploadedImagePath:
    | string
    | null = null;

  try {
    if (
      !isAllowedRequestOrigin(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "طلب غير مسموح",
        },
        {
          status: 403,
        }
      );
    }

    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const formData =
      await request.formData();

    const title =
      normalizeText(
        formData.get("title"),
        180
      );

    const content =
      normalizeText(
        formData.get("content"),
        5000
      );

    const newsType =
      normalizeText(
        formData.get(
          "news_type"
        ),
        30
      ).toUpperCase();

    const isPinned =
      normalizeBoolean(
        formData.get(
          "is_pinned"
        )
      );

    const expiresAtRaw =
      normalizeText(
        formData.get(
          "expires_at"
        ),
        80
      );

    const imageEntry =
      formData.get("image");

    const image =
      imageEntry instanceof File &&
      imageEntry.size > 0
        ? imageEntry
        : null;

    if (
      !ALLOWED_TYPES.has(
        newsType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "نوع الخبر غير صحيح",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !title &&
      !content &&
      !image
    ) {
      return NextResponse.json(
        {
          error:
            "أضف عنوانًا أو نصًا أو صورة",
        },
        {
          status: 400,
        }
      );
    }

    let expiresAt:
      | string
      | null = null;

    if (expiresAtRaw) {
      const date =
        new Date(
          expiresAtRaw
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return NextResponse.json(
          {
            error:
              "تاريخ انتهاء الخبر غير صحيح",
          },
          {
            status: 400,
          }
        );
      }

      expiresAt =
        date.toISOString();
    }

    const admin =
      createAdminClient();

    if (image) {
      if (
        !ALLOWED_IMAGE_TYPES.has(
          image.type
        )
      ) {
        return NextResponse.json(
          {
            error:
              "نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF",
          },
          {
            status: 400,
          }
        );
      }

      if (
        image.size >
        MAX_IMAGE_SIZE
      ) {
        return NextResponse.json(
          {
            error:
              "حجم الصورة يجب ألا يتجاوز 5 ميجابايت",
          },
          {
            status: 400,
          }
        );
      }

      const extension =
        imageExtension(
          image.type
        );

      uploadedImagePath =
        `${authorization.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const imageBuffer =
        Buffer.from(
          await image.arrayBuffer()
        );

      const {
        error: uploadError,
      } =
        await admin.storage
          .from(BUCKET_NAME)
          .upload(
            uploadedImagePath,
            imageBuffer,
            {
              contentType:
                image.type,
              cacheControl:
                "3600",
              upsert: false,
            }
          );

      if (uploadError) {
        throw new Error(
          `تعذر رفع الصورة: ${uploadError.message}`
        );
      }
    }

    const {
      data,
      error,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .insert({
          title:
            title || null,
          content:
            content || null,
          image_url:
            uploadedImagePath,
          news_type:
            newsType,
          is_pinned:
            isPinned,
          is_published:
            true,
          expires_at:
            expiresAt,
          created_by:
            authorization.user.id,
        })
        .select(
          [
            "id",
            "title",
            "content",
            "image_url",
            "news_type",
            "is_pinned",
            "is_published",
            "expires_at",
            "published_at",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .single();

    if (error) {
      throw error;
    }

    const post =
      await withSignedImageUrl(
        data as unknown as
          MarketNewsPostRow
      );

    return NextResponse.json(
      {
        ok: true,
        post,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    if (
      uploadedImagePath
    ) {
      try {
        const admin =
          createAdminClient();

        await admin.storage
          .from(BUCKET_NAME)
          .remove([
            uploadedImagePath,
          ]);
      } catch {
        // لا نغطي الخطأ الأصلي
      }
    }

    console.error(
      "POST /api/admin/market-news failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : error &&
                typeof error === "object" &&
                "message" in error
              ? String(
                  (error as {
                    message?: unknown;
                  }).message ||
                    "تعذر نشر الخبر"
                )
              : "تعذر نشر الخبر",
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
  let uploadedImagePath:
    | string
    | null = null;

  try {
    if (
      !isAllowedRequestOrigin(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "طلب غير مسموح",
        },
        {
          status: 403,
        }
      );
    }

    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const formData =
      await request.formData();

    const id =
      normalizeText(
        formData.get("id"),
        100
      );

    const title =
      normalizeText(
        formData.get("title"),
        180
      );

    const content =
      normalizeText(
        formData.get("content"),
        5000
      );

    const newsType =
      normalizeText(
        formData.get(
          "news_type"
        ),
        30
      ).toUpperCase();

    const isPinned =
      normalizeBoolean(
        formData.get(
          "is_pinned"
        )
      );

    const isPublished =
      normalizeBoolean(
        formData.get(
          "is_published"
        )
      );

    const removeImage =
      normalizeBoolean(
        formData.get(
          "remove_image"
        )
      );

    const expiresAtRaw =
      normalizeText(
        formData.get(
          "expires_at"
        ),
        80
      );

    const imageEntry =
      formData.get("image");

    const image =
      imageEntry instanceof File &&
      imageEntry.size > 0
        ? imageEntry
        : null;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "معرّف الخبر مطلوب",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !ALLOWED_TYPES.has(
        newsType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "نوع الخبر غير صحيح",
        },
        {
          status: 400,
        }
      );
    }

    let expiresAt:
      | string
      | null = null;

    if (expiresAtRaw) {
      const date =
        new Date(
          expiresAtRaw
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return NextResponse.json(
          {
            error:
              "تاريخ انتهاء الخبر غير صحيح",
          },
          {
            status: 400,
          }
        );
      }

      expiresAt =
        date.toISOString();
    }

    const admin =
      createAdminClient();

    const {
      data: currentData,
      error: currentError,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .select(
          [
            "id",
            "title",
            "content",
            "image_url",
            "news_type",
            "is_pinned",
            "is_published",
            "expires_at",
            "published_at",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq("id", id)
        .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    if (!currentData) {
      return NextResponse.json(
        {
          error:
            "الخبر غير موجود",
        },
        {
          status: 404,
        }
      );
    }

    const current =
      currentData as unknown as
        MarketNewsPostRow;

    if (image) {
      if (
        !ALLOWED_IMAGE_TYPES.has(
          image.type
        )
      ) {
        return NextResponse.json(
          {
            error:
              "نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF",
          },
          {
            status: 400,
          }
        );
      }

      if (
        image.size >
        MAX_IMAGE_SIZE
      ) {
        return NextResponse.json(
          {
            error:
              "حجم الصورة يجب ألا يتجاوز 5 ميجابايت",
          },
          {
            status: 400,
          }
        );
      }

      const extension =
        imageExtension(
          image.type
        );

      uploadedImagePath =
        `${authorization.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

      const imageBuffer =
        Buffer.from(
          await image.arrayBuffer()
        );

      const {
        error: uploadError,
      } =
        await admin.storage
          .from(BUCKET_NAME)
          .upload(
            uploadedImagePath,
            imageBuffer,
            {
              contentType:
                image.type,
              cacheControl:
                "3600",
              upsert: false,
            }
          );

      if (uploadError) {
        throw new Error(
          `تعذر رفع الصورة: ${uploadError.message}`
        );
      }
    }

    const finalImagePath =
      uploadedImagePath
        ? uploadedImagePath
        : removeImage
          ? null
          : current.image_url;

    if (
      !title &&
      !content &&
      !finalImagePath
    ) {
      if (uploadedImagePath) {
        await admin.storage
          .from(BUCKET_NAME)
          .remove([
            uploadedImagePath,
          ]);

        uploadedImagePath =
          null;
      }

      return NextResponse.json(
        {
          error:
            "لا يمكن حفظ خبر فارغ. أضف عنوانًا أو نصًا أو صورة",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .update({
          title:
            title || null,
          content:
            content || null,
          image_url:
            finalImagePath,
          news_type:
            newsType,
          is_pinned:
            isPinned,
          is_published:
            isPublished,
          expires_at:
            expiresAt,
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq("id", id)
        .select(
          [
            "id",
            "title",
            "content",
            "image_url",
            "news_type",
            "is_pinned",
            "is_published",
            "expires_at",
            "published_at",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .single();

    if (error) {
      throw error;
    }

    const oldImageShouldBeRemoved =
      Boolean(
        current.image_url
      ) &&
      current.image_url !==
        finalImagePath;

    if (
      oldImageShouldBeRemoved &&
      current.image_url
    ) {
      const {
        error: removeError,
      } =
        await admin.storage
          .from(BUCKET_NAME)
          .remove([
            current.image_url,
          ]);

      if (removeError) {
        console.error(
          "تعذر حذف الصورة القديمة:",
          removeError
        );
      }
    }

    uploadedImagePath =
      null;

    const post =
      await withSignedImageUrl(
        data as unknown as
          MarketNewsPostRow
      );

    return NextResponse.json({
      ok: true,
      post,
    });
  } catch (error) {
    if (
      uploadedImagePath
    ) {
      try {
        const admin =
          createAdminClient();

        await admin.storage
          .from(BUCKET_NAME)
          .remove([
            uploadedImagePath,
          ]);
      } catch {
        // لا نغطي الخطأ الأصلي
      }
    }

    console.error(
      "PATCH /api/admin/market-news failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر تعديل الخبر",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: NextRequest
) {
  try {
    if (
      !isAllowedRequestOrigin(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "طلب غير مسموح",
        },
        {
          status: 403,
        }
      );
    }

    const authorization =
      await requireAdmin();

    if (
      authorization.error ||
      !authorization.user
    ) {
      return authorization.error;
    }

    const body =
      await request.json();

    const id =
      String(
        body.id || ""
      )
        .trim()
        .slice(0, 100);

    if (!id) {
      return NextResponse.json(
        {
          error:
            "معرّف الخبر مطلوب",
        },
        {
          status: 400,
        }
      );
    }

    const admin =
      createAdminClient();

    const {
      data: currentData,
      error: currentError,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .select(
          "id,image_url"
        )
        .eq("id", id)
        .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    if (!currentData) {
      return NextResponse.json(
        {
          error:
            "الخبر غير موجود",
        },
        {
          status: 404,
        }
      );
    }

    const current =
      currentData as unknown as {
        id: string;
        image_url:
          | string
          | null;
      };

    const {
      error: deleteError,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .delete()
        .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    if (
      current.image_url
    ) {
      const {
        error: removeError,
      } =
        await admin.storage
          .from(BUCKET_NAME)
          .remove([
            current.image_url,
          ]);

      if (removeError) {
        console.error(
          "تم حذف الخبر لكن تعذر حذف صورته:",
          removeError
        );
      }
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
    });
  } catch (error) {
    console.error(
      "DELETE /api/admin/market-news failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر حذف الخبر",
      },
      {
        status: 500,
      }
    );
  }
}

