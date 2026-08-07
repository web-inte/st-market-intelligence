import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DailyStatisticsRow = {
  trade_date: string;
  trades_count: number | string | null;
  wins_count: number | string | null;
  losses_count: number | string | null;
  profit_amount: number | string | null;
  loss_amount: number | string | null;
  net_profit: number | string | null;
  updated_at: string | null;
};

function createServerSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير مكتملة"
    );
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function riyadhDate() {
  const parts =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

  const values =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET() {
  try {
    const supabase =
      createServerSupabase();

    const tradeDate =
      riyadhDate();

    /*
      إحصائية SPX اليومية أصبحت مبنية على
      جميع عقود الجلسة، وليس ACTIVE فقط.

      كل عقد يحتفظ بمساهمته حتى لو أصبح:
      STOPPED أو EXPIRED.

      العقود النشطة تعتمد على الربح الحالي.
      العقود المنتهية تعتمد على نتيجة الإغلاق
      إن وجدت، وإلا آخر نتيجة حالية محفوظة.
    */
    const {
      data: sessionTrades,
      error: sessionTradesError,
    } = await supabase
      .from("spx_trade_setups")
      .select(`
        id,
        status,
        current_profit_dollars,
        stop_profit_dollars,
        statistics_recorded,
        activated_at,
        created_at,
        last_error
      `);

    if (sessionTradesError) {
      throw sessionTradesError;
    }

    const tradesToday =
      (sessionTrades || []).filter(
        (trade) => {
          const timestamp =
            trade.activated_at ||
            trade.created_at;

          if (!timestamp) {
            return false;
          }

          /*
            استبعاد النسخ المكررة التي أُغلقت
            أثناء تنظيف مشكلة التكرار السابقة.
          */
          const lastError =
            String(
              trade.last_error || ""
            );

          if (
            lastError.includes(
              "DUPLICATE_WAVE_CLEANUP"
            ) ||
            lastError.includes(
              "نسخة مكررة"
            )
          ) {
            return false;
          }

          const parts =
            new Intl.DateTimeFormat(
              "en-US",
              {
                timeZone:
                  "Asia/Riyadh",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }
            ).formatToParts(
              new Date(timestamp)
            );

          const values =
            Object.fromEntries(
              parts.map((part) => [
                part.type,
                part.value,
              ])
            );

          const date =
            `${values.year}-${values.month}-${values.day}`;

          return date === tradeDate;
        }
      );

    const pnlForTrade = (
      trade: Record<string, unknown>
    ) => {
      const status =
        String(
          trade.status || ""
        ).toUpperCase();

      const current =
        Number(
          trade.current_profit_dollars ||
          0
        );

      const stopped =
        Number(
          trade.stop_profit_dollars
        );

      if (
        (
          status === "STOPPED" ||
          status === "EXPIRED"
        ) &&
        Number.isFinite(stopped)
      ) {
        return stopped;
      }

      return Number.isFinite(current)
        ? current
        : 0;
    };

    const profitAmount =
      tradesToday.reduce(
        (sum, trade) => {
          const pnl =
            pnlForTrade(trade);

          return pnl > 0
            ? sum + pnl
            : sum;
        },
        0
      );

    const lossAmount =
      tradesToday.reduce(
        (sum, trade) => {
          const pnl =
            pnlForTrade(trade);

          return pnl < 0
            ? sum + Math.abs(pnl)
            : sum;
        },
        0
      );

    const winsCount =
      tradesToday.filter(
        (trade) =>
          pnlForTrade(trade) > 0
      ).length;

    const lossesCount =
      tradesToday.filter(
        (trade) =>
          pnlForTrade(trade) < 0
      ).length;

    return NextResponse.json(
      {
        ok: true,

        statistics: {
          tradeDate,

          tradesCount:
            tradesToday.length,

          winsCount,

          lossesCount,

          profitAmount,

          lossAmount,

          netProfit:
            profitAmount -
            lossAmount,

          updatedAt:
            new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error(
      "تعذر جلب إحصائية SPX اليومية:",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : "تعذر جلب إحصائية SPX اليومية",
      },
      {
        status: 500,
      }
    );
  }
}

