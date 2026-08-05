import {
  NextResponse,
} from "next/server";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

const BUCKET_NAME =
  "market-news";

type MarketNewsPostRow = {
  id: string;
  title: string | null;
  content: string | null;
  image_url: string | null;
  news_type:
    | "URGENT"
    | "IMPORTANT"
    | "UPDATE"
    | "ANNOUNCEMENT";
  is_pinned: boolean;
  published_at: string;
  expires_at: string | null;
};

async function addSignedImageUrl(
  post: MarketNewsPostRow
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
    error,
  } =
    await admin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        post.image_url,
        60 * 60
      );

  if (error) {
    console.error(
      "تعذر إنشاء رابط الصورة:",
      error
    );
  }

  return {
    ...post,
    image_signed_url:
      data?.signedUrl || null,
  };
}

export async function GET() {
  try {
    const admin =
      createAdminClient();

    const now =
      new Date().toISOString();

    const {
      data,
      error,
    } =
      await admin
        .from(
          "market_news_posts"
        )
        .select(
          "id,title,content,image_url,news_type,is_pinned,published_at,expires_at"
        )
        .eq(
          "is_published",
          true
        )
        .or(
          `expires_at.is.null,expires_at.gt.${now}`
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
        )
        .limit(100);

    if (error) {
      throw error;
    }

    const rows =
      (data || []) as unknown as
        MarketNewsPostRow[];

    const posts =
      await Promise.all(
        rows.map(
          addSignedImageUrl
        )
      );

    return NextResponse.json({
      ok: true,
      posts,
      count: posts.length,
      updatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "GET /api/market-news failed:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        posts: [],
        error:
          "تعذر تحميل مركز الأخبار",
      },
      {
        status: 500,
      }
    );
  }
}
