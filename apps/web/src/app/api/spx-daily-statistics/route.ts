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

    const {
      data,
      error,
    } = await supabase
      .from("spx_daily_statistics")
      .select(`
        trade_date,
        trades_count,
        wins_count,
        losses_count,
        profit_amount,
        loss_amount,
        net_profit,
        updated_at
      `)
      .eq("trade_date", tradeDate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row =
      data as DailyStatisticsRow | null;

    const {
      data: activeTrades,
      error: activeTradesError,
    } = await supabase
      .from("spx_trade_setups")
      .select(`
        id,
        status,
        current_profit_dollars,
        best_profit_dollars,
        statistics_recorded,
        activated_at,
        created_at
      `)
      .eq("status", "ACTIVE")
      .eq("statistics_recorded", false);

    if (activeTradesError) {
      throw activeTradesError;
    }

    const activeToday =
      (activeTrades || []).filter(
        (trade) => {
          const timestamp =
            trade.activated_at ||
            trade.created_at;

          if (!timestamp) {
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

          const activeDate =
            `${values.year}-${values.month}-${values.day}`;

          return activeDate === tradeDate;
        }
      );

    const activeProfit =
      activeToday.reduce(
        (sum, trade) => {
          const bestProfit =
            Number(
              trade.best_profit_dollars ||
              0
            );

          return bestProfit >= 100
            ? sum + bestProfit
            : sum;
        },
        0
      );

    /*
      الصفقة النشطة لا تُحسب خسارة.
      الخسارة تُسجل فقط عند الإغلاق النهائي
      إذا لم تحقق الصفقة 100$ أو أكثر.
    */
    const activeLoss = 0;

    const activeWins =
      activeToday.filter(
        (trade) =>
          Number(
            trade.best_profit_dollars ||
            0
          ) >= 100
      ).length;

    const activeLosses = 0;

    const storedTradesCount =
      Number(
        row?.trades_count || 0
      );

    const storedProfitAmount =
      Number(
        row?.profit_amount || 0
      );

    const storedLossAmount =
      Number(
        row?.loss_amount || 0
      );

    const totalProfit =
      storedProfitAmount +
      activeProfit;

    const totalLoss =
      storedLossAmount +
      activeLoss;

    return NextResponse.json(
      {
        ok: true,
        statistics: {
          tradeDate,

          tradesCount:
            storedTradesCount +
            activeToday.length,

          winsCount:
            Number(
              row?.wins_count || 0
            ) +
            activeWins,

          lossesCount:
            Number(
              row?.losses_count || 0
            ) +
            activeLosses,

          profitAmount:
            totalProfit,

          lossAmount:
            totalLoss,

          netProfit:
            totalProfit -
            totalLoss,

          updatedAt:
            row?.updated_at || null,
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
