import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  formatSpxKsaTime,
  formatSpxNumber,
  sendSpxTelegramMessage,
} from "@/lib/spx-telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DataRecord = Record<string, unknown>;

type SpxSignal = {
  ok: boolean;
  status: string;
  message?: string;
  market?: {
    stockPrice?: number;
  } | null;
  gamma?: {
    zeroGamma?: number;
    callWall?: number;
    putWall?: number;
    magnet?: number;
  } | null;
  bestContract?: {
    ticker: string;
    side: "CALL" | "PUT";
    strike: number;
    expiration: string;
    ask: number;
    bid: number;
    midpoint: number;
    price: number;
    finalScore: number;
    quality: string;
  } | null;
};

type SpxSignalWithExecution =
  SpxSignal & {
    executionContract?:
      SpxSignal["bestContract"];
  };


function record(value: unknown): DataRecord {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as DataRecord)
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function textValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;

  return (
    Math.round((value + Number.EPSILON) * factor) /
    factor
  );
}


async function getLastCompletedSpxFiveMinuteCandle(
  activatedAt: string
) {
  const apiKey =
    process.env.MASSIVE_API_KEY ||
    process.env.POLYGON_API_KEY ||
    "";

  if (!apiKey) {
    return null;
  }

  const activatedAtMs =
    new Date(activatedAt).getTime();

  if (!Number.isFinite(activatedAtMs)) {
    return null;
  }

  try {
    const nowMs = Date.now();

    /*
      نطلب آخر عدد محدود من شموع 5 دقائق فقط،
      بدل جلب بيانات دقائق متعددة الأيام.
    */
    const fromMs =
      nowMs - 3 * 60 * 60 * 1000;

    const massiveUrl =
      "https://api.massive.com/v2/aggs/ticker/" +
      "I%3ASPX/range/5/minute/" +
      `${fromMs}/${nowMs}` +
      "?adjusted=true&sort=desc&limit=50" +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(
      massiveUrl,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const payload =
      await response.json();

    if (!response.ok) {
      console.error(
        "SPX five-minute candle provider error:",
        response.status,
        payload?.error ||
          payload?.message ||
          "Unknown provider error"
      );

      return null;
    }

    const results =
      Array.isArray(payload?.results)
        ? payload.results
        : [];

    /*
      bar.t هو بداية الشمعة.
      لا نعتمد إلا شمعة:
      - انتهت مدة الخمس دقائق كاملة.
      - أغلقت بعد تفعيل الصفقة.
      - لديها سعر إغلاق صالح.
    */
    const completedCandles =
      results
        .map((bar: Record<string, unknown>) => ({
          time:
            numberValue(bar.t),
          close:
            numberValue(bar.c),
        }))
        .filter(
          (
            bar: {
              time: number;
              close: number;
            }
          ) => {
            const candleCloseMs =
              bar.time + 5 * 60 * 1000;

          return (
            bar.time > 0 &&
            bar.close > 0 &&
            candleCloseMs <= nowMs &&
            candleCloseMs > activatedAtMs
          );
          }
        )
        .sort(
          (
            left: {
              time: number;
              close: number;
            },
            right: {
              time: number;
              close: number;
            }
          ) =>
            right.time - left.time
        );

    return completedCandles[0] || null;
  } catch (error) {
    console.error(
      "SPX five-minute stop confirmation error:",
      error
    );

    return null;
  }
}


function todayNewYork() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}


function isSpxDailyWindowOpen() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const weekday =
    parts.find(
      (part) => part.type === "weekday"
    )?.value || "";

  const hour = Number(
    parts.find(
      (part) => part.type === "hour"
    )?.value || 0
  );

  const minute = Number(
    parts.find(
      (part) => part.type === "minute"
    )?.value || 0
  );

  const totalMinutes =
    hour * 60 + minute;

  const morningTradingDay =
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(
      weekday
    );

  const eveningTradingDay =
    ["Sun", "Mon", "Tue", "Wed", "Thu"].includes(
      weekday
    );

  // جلسة GTH:
  // 20:15 مساءً حتى 09:25 صباحًا بتوقيت نيويورك.
  const globalSessionOpen =
    (
      eveningTradingDay &&
      totalMinutes >= 20 * 60 + 15
    ) ||
    (
      morningTradingDay &&
      totalMinutes < 9 * 60 + 25
    );

  // جلسة RTH لعقد SPXW المنتهي في اليوم نفسه:
  // 09:30 صباحًا حتى 16:00 مساءً بتوقيت نيويورك.
  const regularZeroDteSessionOpen =
    morningTradingDay &&
    totalMinutes >= 9 * 60 + 30 &&
    totalMinutes < 16 * 60;

  return (
    globalSessionOpen ||
    regularZeroDteSessionOpen
  );
}

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

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

async function fetchSpxSignal(
  request: Request
): Promise<SpxSignalWithExecution> {
  const requestOrigin =
    new URL(request.url).origin;

  const internalOrigin =
    process.env.NODE_ENV === "development"
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : requestOrigin;

  const response = await fetch(
    `${internalOrigin}/api/spx-0dte`,
    {
      cache: "no-store",
      headers: {
        cookie:
          request.headers.get("cookie") || "",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      "السوق مغلق"
    );
  }

  return response.json();
}

async function fetchContractSnapshot(
  contractTicker: string,
  apiKey: string
) {
  const normalizedTicker =
    contractTicker.startsWith("O:")
      ? contractTicker
      : `O:${contractTicker}`;

  const url =
    `https://api.massive.com/v3/snapshot/options/` +
    `I%3ASPX/${encodeURIComponent(normalizedTicker)}` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `تعذر جلب سعر العقد: ${response.status}`
    );
  }

  const payload = record(
    await response.json()
  );

  const result = record(payload.results);
  const quote = record(result.last_quote);
  const trade = record(result.last_trade);

  const bid = numberValue(quote.bid);
  const ask = numberValue(quote.ask);

  const midpoint =
    numberValue(quote.midpoint) > 0
      ? numberValue(quote.midpoint)
      : bid > 0 && ask > 0
        ? (bid + ask) / 2
        : 0;

  const lastPrice =
    numberValue(trade.price);

  const currentPrice =
    bid > 0
      ? bid
      : midpoint > 0
        ? midpoint
        : lastPrice;

  if (currentPrice <= 0) {
    throw new Error(
      "لم يرجع Massive سعرًا صالحًا للعقد"
    );
  }

  return {
    bid: round(bid),
    ask: round(ask),
    midpoint: round(midpoint),
    currentPrice: round(currentPrice),
    quoteAt:
      new Date().toISOString(),
  };
}

function chooseInvalidationLevel(input: {
  side: "CALL" | "PUT";
  stockPrice: number;
  gamma: NonNullable<SpxSignal["gamma"]>;
}) {
  const {
    side,
    stockPrice,
    gamma,
  } = input;

  const candidates =
    side === "CALL"
      ? [
          gamma.putWall,
          gamma.zeroGamma,
          gamma.magnet,
        ]
          .map(Number)
          .filter(
            (level) =>
              Number.isFinite(level) &&
              level > 0 &&
              level < stockPrice
          )
          .sort((a, b) => b - a)
      : [
          gamma.callWall,
          gamma.zeroGamma,
          gamma.magnet,
        ]
          .map(Number)
          .filter(
            (level) =>
              Number.isFinite(level) &&
              level > stockPrice
          )
          .sort((a, b) => a - b);

  return candidates[0] || 0;
}

export async function GET(
  request: Request
) {
  try {
    const massiveApiKey =
      process.env.MASSIVE_API_KEY;

    if (!massiveApiKey) {
      throw new Error(
        "متغير MASSIVE_API_KEY غير موجود"
      );
    }

    const supabase =
      createAdminClient();


    const nowIso =
      new Date().toISOString();


    const today =
      todayNewYork();

    const stoppedCutoff =
      new Date(
        Date.now() -
          30 * 60 * 1000
      ).toISOString();

    /*
      تنظيف صفقات SPX القديمة:
      1) عقود الأيام السابقة تختفي فورًا.
      2) الصفقات التي ضربت الوقف تختفي بعد 30 دقيقة.
    */
    const {
      error: expiredCleanupError,
    } = await supabase
      .from("spx_trade_setups")
      .update({
        status: "EXPIRED",
        hidden_after: nowIso,
        last_error:
          "انتهى تاريخ عقد SPX",
      })
      .in("status", [
        "WATCH",
        "ACTIVE",
      ])
      .lt("expiration", today);

    if (expiredCleanupError) {
      throw expiredCleanupError;
    }

    /*
      لا نخفي STOPPED بعد 30 دقيقة.
      تبقى جميع صفقات جلسة SPX ظاهرة
      حتى ساعة بعد إغلاق السوق.
    */


    const {
      data: visibleTrades,
      error: visibleError,
    } = await supabase
      .from("spx_trade_setups")
      .select("*")
      /*
        أثناء الجلسة نحتفظ بجميع العقود:
        ACTIVE / WATCH / STOPPED.

        الإخفاء النهائي يتم بعد انتهاء السوق
        بساعة، وليس بعد 30 دقيقة من الوقف.
      */
      .in("status", [
        "WATCH",
        "ACTIVE",
        "STOPPED",
      ])
      .order("created_at", {
        ascending: false,
      })
      .limit(20);

    if (visibleError) {
      throw visibleError;
    }

    const liveTrades =
      (visibleTrades || []).filter(
        (row) =>
          row.status === "WATCH" ||
          row.status === "ACTIVE"
      );

    /*
      نستمر مؤقتًا في تنفيذ منطق الوقف الكامل
      على صفقة واحدة في كل دورة، لكن نختار
      الأقل تحديثًا حتى تدور المتابعة بين جميع
      الموجات بدل تثبيتها على أحدث صفقة فقط.
    */
    const liveTrade =
      [...liveTrades].sort(
        (left, right) => {
          const leftTime =
            new Date(
              textValue(
                left.last_quote_at
              ) ||
              textValue(
                left.activated_at
              ) ||
              textValue(
                left.created_at
              )
            ).getTime();

          const rightTime =
            new Date(
              textValue(
                right.last_quote_at
              ) ||
              textValue(
                right.activated_at
              ) ||
              textValue(
                right.created_at
              )
            ).getTime();

          return leftTime - rightTime;
        }
      )[0] || null;

    const sessionOrigin =
      process.env.NODE_ENV === "development"
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : new URL(request.url).origin;

    const sessionResponse =
      await fetch(
        `${sessionOrigin}/api/market-session`,
        {
          cache: "no-store",
          headers: {
            cookie:
              request.headers.get("cookie") || "",
          },
        }
      );

    const session =
      await sessionResponse.json();

    const regularSessionOpen =
      session?.isOpen === true &&
      session?.phase === "REGULAR";

    /*
      نستمر في جلب التحليل خارج الجلسة الرسمية
      لعرض Flow والقاما والمستويات فقط.

      لكن بيانات أسعار العقود خارج REGULAR
      لا تُستخدم لإصدار أو متابعة أي صفقة.
    */
    const signal =
      await fetchSpxSignal(request);

    if (!regularSessionOpen) {
      /*
        جميع صفقات جلسة SPX تبقى ظاهرة
        حتى ساعة بعد نهاية الجلسة.

        الجلسة الحالية تنتهي 23:00 بتوقيت الرياض،
        لذلك وقت الإخفاء الثابت هو 00:00 الرياض
        لليوم التالي.

        استخدام وقت ثابت مهم حتى لا تتم إضافة
        ساعة جديدة في كل طلب بعد الإغلاق.
      */
      const riyadhParts =
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
          new Date()
        );

      const riyadhValues =
        Object.fromEntries(
          riyadhParts.map(
            (part) => [
              part.type,
              part.value,
            ]
          )
        );

      const sessionHideAfter =
        new Date(
          Date.UTC(
            Number(
              riyadhValues.year
            ),
            Number(
              riyadhValues.month
            ) - 1,
            Number(
              riyadhValues.day
            ),
            21,
            0,
            0
          )
        ).toISOString();

      /*
        الصفقات التي كانت لا تزال مفتوحة
        تتحول إلى EXPIRED عند انتهاء الجلسة.
      */
      const {
        error: sessionCloseError,
      } = await supabase
        .from("spx_trade_setups")
        .update({
          status: "EXPIRED",

          hidden_after:
            sessionHideAfter,

          last_error:
            "انتهت الجلسة الرسمية وتم إغلاق المتابعة تلقائيًا",
        })
        .in("status", [
          "ACTIVE",
          "WATCH",
        ]);

      if (sessionCloseError) {
        throw sessionCloseError;
      }

      /*
        الصفقات التي ضربت الوقف أثناء الجلسة
        تبقى أيضًا ظاهرة إلى نفس وقت الإخفاء.
      */
      const {
        error:
          stoppedRetentionError,
      } = await supabase
        .from("spx_trade_setups")
        .update({
          hidden_after:
            sessionHideAfter,
        })
        .eq(
          "status",
          "STOPPED"
        )
        .eq(
          "expiration",
          today
        );

      if (stoppedRetentionError) {
        throw stoppedRetentionError;
      }

      /*
        بعد الإغلاق نرجع جميع صفقات الجلسة
        إلى أن يحين وقت الإخفاء.
      */
      const {
        data:
          sessionTradesAfterClose,
        error:
          sessionTradesAfterCloseError,
      } = await supabase
        .from("spx_trade_setups")
        .select("*")
        .in("status", [
          "STOPPED",
          "EXPIRED",
        ])
        .eq(
          "expiration",
          today
        )
        .gt(
          "hidden_after",
          nowIso
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(20);

      if (
        sessionTradesAfterCloseError
      ) {
        throw (
          sessionTradesAfterCloseError
        );
      }

      return NextResponse.json(
        {
          ok: true,
          created: false,

          activeTrade:
            null,

          trades:
            sessionTradesAfterClose ||
            [],

          signal,

          executionEnabled:
            false,

          message:
            (
              sessionTradesAfterClose ||
              []
            ).length > 0
              ? "انتهت الجلسة الرسمية — صفقات جلسة اليوم تبقى ظاهرة لمدة ساعة بعد الإغلاق."
              : "السوق خارج الجلسة الرسمية — لا توجد صفقات SPX ظاهرة حاليًا.",

          marketSession:
            session,

          updatedAt:
            nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    /*
      عند ظهور إشارة ACTIVE مؤكدة في اتجاه جديد،
      نغلق جميع الموجات المفتوحة في الاتجاه المعاكس.

      هذا لا يغيّر شروط الإشارة أو اختيار العقد؛
      بل يوسّع منطق الإغلاق القديم من صفقة واحدة
      إلى جميع الصفقات المفتوحة في الاتجاه السابق.
    */
    const confirmedSignalSide =
      signal.status === "ACTIVE"
        ? signal.bestContract?.side ||
          null
        : null;

    const oppositeOpenTrades =
      confirmedSignalSide
        ? liveTrades.filter(
            (trade) =>
              textValue(
                trade.side
              ).toUpperCase() !==
                confirmedSignalSide
          )
        : [];

    const closedOppositeDirectionTrades: DataRecord[] =
      [];

    if (
      confirmedSignalSide &&
      oppositeOpenTrades.length > 0
    ) {
      for (
        const oppositeTrade of
          oppositeOpenTrades
      ) {
        const oppositeEntryPrice =
          numberValue(
            oppositeTrade.entry_price
          );

        const oppositeCurrentPrice =
          numberValue(
            oppositeTrade.current_price,
            oppositeEntryPrice
          );

        const oppositeProfitDollars =
          round(
            (
              oppositeCurrentPrice -
              oppositeEntryPrice
            ) * 100
          );

        const oppositeProfitPct =
          oppositeEntryPrice > 0
            ? round(
                (
                  (
                    oppositeCurrentPrice -
                    oppositeEntryPrice
                  ) /
                  oppositeEntryPrice
                ) * 100
              )
            : 0;

        const oppositeSide =
          textValue(
            oppositeTrade.side
          ).toUpperCase();

        const closeReasonText =
          `تغير الاتجاه المؤكد من ${oppositeSide} إلى ${confirmedSignalSide}`;

        const hiddenAfter =
          new Date(
            Date.now() +
              30 * 60 * 1000
          ).toISOString();

        const {
          data: closedTrade,
          error: closeError,
        } = await supabase
          .from("spx_trade_setups")
          .update({
            status:
              "STOPPED",

            stopped_at:
              nowIso,

            closed_at:
              nowIso,

            hidden_after:
              hiddenAfter,

            stop_contract_price:
              oppositeCurrentPrice,

            stop_profit_dollars:
              oppositeProfitDollars,

            stop_profit_pct:
              oppositeProfitPct,

            stop_reason:
              closeReasonText,

            close_reason:
              "OPPOSITE_DIRECTION",
          })
          .eq(
            "id",
            oppositeTrade.id
          )
          .in("status", [
            "ACTIVE",
            "WATCH",
          ])
          .select("*")
          .maybeSingle();

        if (closeError) {
          throw closeError;
        }

        if (!closedTrade) {
          continue;
        }

        closedOppositeDirectionTrades.push(
          closedTrade
        );

        /*
          تسجيل كل صفقة مغلقة في الإحصائية
          بشكل مستقل ومنع فقد أي موجة.
        */
        const {
          error: statisticsError,
        } = await supabase.rpc(
          "record_spx_trade_statistics",
          {
            p_trade_id:
              closedTrade.id,
          }
        );

        if (statisticsError) {
          console.error(
            "تعذر تسجيل إحصائية موجة SPX المغلقة:",
            {
              tradeId:
                closedTrade.id,
              error:
                statisticsError.message,
            }
          );
        }

        await supabase
          .from("spx_trade_updates")
          .insert({
            setup_id:
              closedTrade.id,

            event_type:
              "STOPPED",

            contract_price:
              oppositeCurrentPrice,

            profit_dollars:
              oppositeProfitDollars,

            profit_pct:
              oppositeProfitPct,

            message:
              closeReasonText,

            metadata: {
              closeReason:
                "OPPOSITE_DIRECTION",

              previousSide:
                oppositeSide,

              newSide:
                confirmedSignalSide,
            },
          });

        /*
          فشل تيليجرام لا يعطل الإغلاق.
        */
        try {
          const telegramUrl =
            `${new URL(request.url).origin}/spx-whales`;

          const telegramResult =
            await sendSpxTelegramMessage(
              [
                "🛑 انتهت صفقة SPX",
                "",
                `📊 الاتجاه السابق: ${oppositeSide}`,
                `🔄 الاتجاه الجديد: ${confirmedSignalSide}`,
                `📍 سبب الإغلاق: ${closeReasonText}`,
                "",
                `💵 النتيجة عند الإغلاق: ${
                  oppositeProfitDollars >= 0
                    ? "+"
                    : ""
                }${formatSpxNumber(
                  oppositeProfitDollars,
                  0
                )}$`,
                "",
                "🌐 تفاصيل الصفقة:",
                telegramUrl,
              ].join("\n")
            );

          if (!telegramResult.ok) {
            console.error(
              "تعذر إرسال إغلاق موجة SPX إلى تيليجرام:",
              {
                tradeId:
                  closedTrade.id,
                error:
                  telegramResult.error,
              }
            );
          }
        } catch (telegramError) {
          console.error(
            "خطأ جانبي في إشعار إغلاق موجة SPX:",
            telegramError
          );
        }
      }
    }

    /*
      قد تكون liveTrade ضمن الموجات التي أُغلقت
      جماعيًا بسبب انعكاس الاتجاه. لا نعالجها
      مرة أخرى حتى لا تعود حالتها إلى ACTIVE.
    */
    const liveTradeClosedByDirection =
      liveTrade !== null &&
      closedOppositeDirectionTrades.some(
        (trade) =>
          textValue(trade.id) ===
          textValue(liveTrade.id)
      );

    if (
      liveTrade &&
      !liveTradeClosedByDirection
    ) {
      const entryPrice =
        numberValue(
          liveTrade.entry_price
        );

      let snapshotErrorMessage:
        string | null = null;

      let snapshot = {
        bid: numberValue(
          liveTrade.current_bid
        ),
        ask: numberValue(
          liveTrade.current_ask
        ),
        midpoint: numberValue(
          liveTrade.current_price,
          entryPrice
        ),
        currentPrice: numberValue(
          liveTrade.current_price,
          entryPrice
        ),
        quoteAt:
          textValue(
            liveTrade.last_quote_at
          ) || nowIso,
      };

      try {
        snapshot =
          await fetchContractSnapshot(
            textValue(
              liveTrade.option_ticker
            ),
            massiveApiKey
          );
      } catch (snapshotError) {
        snapshotErrorMessage =
          snapshotError instanceof Error
            ? snapshotError.message
            : "تعذر تحديث سعر العقد مؤقتًا";

        console.warn(
          "SPX contract snapshot unavailable:",
          {
            ticker:
              liveTrade.option_ticker,
            error:
              snapshotErrorMessage,
          }
        );
      }

      const currentPrice =
        snapshot.currentPrice;

      const previousBest =
        numberValue(
          liveTrade.best_price,
          entryPrice
        );

      const previousLowest =
        numberValue(
          liveTrade.lowest_price,
          entryPrice
        );

      const bestPrice =
        Math.max(
          previousBest,
          currentPrice
        );

      const lowestPrice =
        Math.min(
          previousLowest,
          currentPrice
        );

      const currentProfitDollars =
        round(
          (currentPrice - entryPrice) *
            100
        );

      const currentProfitPct =
        entryPrice > 0
          ? round(
              ((currentPrice -
                entryPrice) /
                entryPrice) *
                100
            )
          : 0;

      const bestProfitDollars =
        round(
          (bestPrice - entryPrice) *
            100
        );

      const bestProfitPct =
        entryPrice > 0
          ? round(
              ((bestPrice -
                entryPrice) /
                entryPrice) *
                100
            )
          : 0;

      const spxCurrentPrice =
        numberValue(
          signal.market?.stockPrice
        );

      const invalidationLevel =
        numberValue(
          liveTrade.invalidation_level
        );

      const side =
        textValue(
          liveTrade.side
        ).toUpperCase();

      /*
        أسباب إغلاق الصفقة:

        1) كسر وقف SPX المعتاد.
        2) بعد تحقيق ربح 100$ أو أكثر:
           إذا رجع العقد إلى خسارة 100$ أو أكثر.
        3) إذا ظهرت فرصة ACTIVE مؤكدة
           في الاتجاه المعاكس، تُغلق الصفقة فورًا
           حتى لو لم تحقق ربحًا سابقًا.
      */
      /*
        وقف SPX يعتمد على إغلاق شمعة 5 دقائق
        مكتملة بعد تفعيل الصفقة، وليس على اللمس
        أو على موقع السعر الحالي وقت التحديث.
      */
      const activatedAt =
        textValue(
          liveTrade.activated_at
        ) ||
        textValue(
          liveTrade.created_at
        );

      const completedCandle =
        invalidationLevel > 0 &&
        activatedAt
          ? await getLastCompletedSpxFiveMinuteCandle(
              activatedAt
            )
          : null;

      const invalidationConfirmationClose =
        completedCandle
          ? completedCandle.close
          : null;

      const invalidationConfirmationTime =
        completedCandle
          ? completedCandle.time
          : null;

      const spxInvalidationStopped =
        invalidationLevel > 0 &&
        completedCandle !== null &&
        (
          (
            side === "CALL" &&
            completedCandle.close <=
              invalidationLevel
          ) ||
          (
            side === "PUT" &&
            completedCandle.close >=
              invalidationLevel
          )
        );

      const reachedProfitProtection =
        bestProfitDollars >= 100;

      const profitProtectionStopped =
        reachedProfitProtection &&
        currentProfitDollars <= -100;

      const signalSide =
        signal.status === "ACTIVE"
          ? signal.bestContract?.side ||
            null
          : null;

      /*
        الإغلاق المعاكس أصبح يُنفذ جماعيًا
        قبل معالجة الصفقة الفردية.
      */
      const oppositeDirectionStopped =
        false;

      const stopped =
        spxInvalidationStopped ||
        profitProtectionStopped ||
        oppositeDirectionStopped;

      const stopReason =
        spxInvalidationStopped
          ? `تأكيد كسر الوقف ${invalidationLevel} بإغلاق شمعة 5 دقائق عند ${invalidationConfirmationClose}`
          : profitProtectionStopped
            ? "حقق العقد 100$ أو أكثر ثم تراجع إلى خسارة 100$ أو أكثر"
            : oppositeDirectionStopped
              ? `تغير الاتجاه المؤكد من ${side} إلى ${signalSide}`
              : null;

      const closeReason =
        spxInvalidationStopped
          ? "SPX_INVALIDATION"
          : profitProtectionStopped
            ? "PROFIT_PROTECTION_DRAWDOWN"
            : oppositeDirectionStopped
              ? "OPPOSITE_DIRECTION"
              : null;

      const stoppedAt =
        stopped ? nowIso : null;

      const hiddenAfter =
        stopped
          ? new Date(
              Date.now() +
                30 *
                  60 *
                  1000
            ).toISOString()
          : null;

      const updatePayload = {
        current_price:
          currentPrice,

        current_bid:
          snapshot.bid,

        current_ask:
          snapshot.ask,

        best_price:
          bestPrice,

        lowest_price:
          lowestPrice,

        best_price_at:
          bestPrice >
          previousBest
            ? snapshot.quoteAt
            : liveTrade.best_price_at,

        current_profit_dollars:
          currentProfitDollars,

        current_profit_pct:
          currentProfitPct,

        best_profit_dollars:
          bestProfitDollars,

        best_profit_pct:
          bestProfitPct,

        spx_current_price:
          spxCurrentPrice || null,

        last_quote_at:
          snapshot.quoteAt,

        last_error:
          snapshotErrorMessage,

        ...(stopped
          ? {
              status: "STOPPED",
              stopped_at:
                stoppedAt,
              closed_at:
                stoppedAt,
              hidden_after:
                hiddenAfter,
              stop_contract_price:
                currentPrice,
              stop_profit_dollars:
                currentProfitDollars,
              stop_profit_pct:
                currentProfitPct,
              stop_reason:
                stopReason,
              close_reason:
                closeReason,
            }
          : {
              status: "ACTIVE",
            }),
      };

      const {
        data: updatedTrade,
        error: updateError,
      } = await supabase
        .from("spx_trade_setups")
        .update(updatePayload)
        .eq("id", liveTrade.id)
        .select("*")
        .single();

      if (
        updateError ||
        !updatedTrade
      ) {
        throw (
          updateError ||
          new Error(
            "تعذر تحديث صفقة SPX"
          )
        );
      }

      /*
        نشر نسخة من تحديث صفقة SPX إلى تيليجرام.

        هذا الجزء لا يدخل في قرار الصفقة ولا في
        حساب الوقف أو السعر أو الربح. أي فشل في
        تيليجرام يُسجل فقط ولا يعطل استجابة الموقع.
      */
      try {
        const telegramUrl =
          `${new URL(request.url).origin}/spx-whales`;

        const previousMilestone =
          Math.floor(
            Math.max(
              0,
              numberValue(
                liveTrade.last_telegram_milestone
              )
            ) / 50
          ) * 50;

        const currentMilestone =
          Math.floor(
            Math.max(
              0,
              bestProfitDollars
            ) / 50
          ) * 50;

        /*
          إذا قفز العقد أكثر من 50 دولار بين تحديثين،
          نرسل كل المستويات التي تجاوزها بالترتيب.
        */
        if (
          !stopped &&
          currentMilestone >
            previousMilestone
        ) {
          for (
            let milestone =
              Math.max(
                50,
                previousMilestone + 50
              );
            milestone <= currentMilestone;
            milestone += 50
          ) {
            const telegramResult =
              await sendSpxTelegramMessage(
                [
                  "📈 تحديث صفقة SPX",
                  "",
                  `📊 الاتجاه: ${side}`,
                  `💰 أفضل ربح: +${milestone}$`,
                  `📈 أعلى نسبة ربح: +${formatSpxNumber(
                    bestProfitPct
                  )}%`,
                  "",
                  `🎟️ سعر العقد الحالي: ${formatSpxNumber(
                    currentPrice
                  )}`,
                  `🏆 أعلى سعر للعقد: ${formatSpxNumber(
                    bestPrice
                  )}`,
                  "",
                  "🌐 متابعة الصفقة:",
                  telegramUrl,
                ].join("\n")
              );

            if (!telegramResult.ok) {
              console.error(
                "تعذر إرسال تحديث ربح SPX إلى تيليجرام:",
                {
                  tradeId:
                    updatedTrade.id,
                  milestone,
                  error:
                    telegramResult.error,
                }
              );
              break;
            }

            const {
              error:
                telegramMilestoneUpdateError,
            } = await supabase
              .from("spx_trade_setups")
              .update({
                last_telegram_milestone:
                  milestone,
              })
              .eq(
                "id",
                updatedTrade.id
              );

            if (
              telegramMilestoneUpdateError
            ) {
              console.error(
                "تعذر حفظ مستوى تيليجرام لصفقة SPX:",
                {
                  tradeId:
                    updatedTrade.id,
                  milestone,
                  error:
                    telegramMilestoneUpdateError,
                }
              );
              break;
            }
          }
        }

        /*
          الهدف الهيكلي مأخوذ مباشرة من بيانات
          الموقع الحالية:
          CALL = Call Wall
          PUT  = Put Wall
        */
        const structuralTarget =
          side === "CALL"
            ? numberValue(
                signal.gamma?.callWall
              )
            : numberValue(
                signal.gamma?.putWall
              );

        const previousSpxPrice =
          numberValue(
            liveTrade.spx_current_price,
            numberValue(
              liveTrade.spx_entry_price
            )
          );

        const targetReached =
          structuralTarget > 0 &&
          spxCurrentPrice > 0 &&
          (
            (
              side === "CALL" &&
              spxCurrentPrice >=
                structuralTarget &&
              previousSpxPrice <
                structuralTarget
            ) ||
            (
              side === "PUT" &&
              spxCurrentPrice <=
                structuralTarget &&
              previousSpxPrice >
                structuralTarget
            )
          );

        if (
          !stopped &&
          targetReached
        ) {
          const nextTarget =
            side === "CALL"
              ? numberValue(
                  signal.gamma?.callWall
                )
              : numberValue(
                  signal.gamma?.putWall
                );

          const targetMessage = [
            "🎯 الهدف الهيكلي تحقق",
            "",
            `📈 SPX ${side}`,
            "",
            `✅ الهدف المحقق: ${formatSpxNumber(
              structuralTarget,
              0
            )} ✔️`,
            nextTarget > 0 &&
            nextTarget !==
              structuralTarget
              ? `🎯 الهدف التالي: ${formatSpxNumber(
                  nextTarget,
                  0
                )}`
              : "🎯 الهدف التالي يتحدث تلقائيًا من الموقع",
            "",
            `💰 أفضل ربح: ${
              bestProfitDollars >= 0
                ? "+"
                : ""
            }${formatSpxNumber(
              bestProfitDollars,
              0
            )}$`,
            `📊 نسبة الربح: ${
              bestProfitPct >= 0
                ? "+"
                : ""
            }${formatSpxNumber(
              bestProfitPct
            )}%`,
            "",
            "🌐 متابعة الصفقة:",
            telegramUrl,
          ].join("\n");

          const telegramResult =
            await sendSpxTelegramMessage(
              targetMessage
            );

          if (!telegramResult.ok) {
            console.error(
              "تعذر إرسال هدف SPX إلى تيليجرام:",
              {
                tradeId:
                  updatedTrade.id,
                structuralTarget,
                error:
                  telegramResult.error,
              }
            );
          }
        }

        if (stopped) {
          const telegramResult =
            await sendSpxTelegramMessage(
              [
                "🛑 انتهت صفقة SPX",
                "",
                `📊 الاتجاه: ${side}`,
                "",
                `💰 أفضل ربح: ${
                  bestProfitDollars >= 0
                    ? "+"
                    : ""
                }${formatSpxNumber(
                  bestProfitDollars,
                  0
                )}$`,
                `📊 أعلى نسبة ربح: ${
                  bestProfitPct >= 0
                    ? "+"
                    : ""
                }${formatSpxNumber(
                  bestProfitPct
                )}%`,
                `💵 النتيجة عند الإغلاق: ${
                  currentProfitDollars >= 0
                    ? "+"
                    : ""
                }${formatSpxNumber(
                  currentProfitDollars,
                  0
                )}$`,
                "",
                bestProfitDollars >= 100
                  ? "🟢 صفقة ناجحة"
                  : "🔴 صفقة خاسرة",
                "",
                "🌐 تفاصيل الصفقة:",
                telegramUrl,
              ].join("\n")
            );

          if (!telegramResult.ok) {
            console.error(
              "تعذر إرسال إغلاق SPX إلى تيليجرام:",
              {
                tradeId:
                  updatedTrade.id,
                error:
                  telegramResult.error,
              }
            );
          }
        }
      } catch (telegramError) {
        console.error(
          "خطأ جانبي في ناشر تيليجرام لصفقة SPX:",
          telegramError
        );
      }

      /*
        عند إغلاق الصفقة نسجلها في إحصائية
        يوم الإغلاق بتوقيت السعودية مرة واحدة فقط.

        فشل الإحصائية لا يلغي إغلاق الصفقة؛
        تبقى statistics_recorded=false حتى
        يمكن إعادة المحاولة في الطلب التالي.
      */
      if (stopped) {
        const {
          error: statisticsError,
        } = await supabase.rpc(
          "record_spx_trade_statistics",
          {
            p_trade_id:
              updatedTrade.id,
          }
        );

        if (statisticsError) {
          console.error(
            "تعذر تسجيل إحصائية صفقة SPX:",
            {
              tradeId:
                updatedTrade.id,
              message:
                statisticsError.message,
            }
          );
        }
      }

      await supabase
        .from("spx_trade_updates")
        .insert({
          setup_id:
            updatedTrade.id,

          event_type:
            stopped
              ? "STOPPED"
              : "UPDATED",

          contract_price:
            currentPrice,

          profit_dollars:
            currentProfitDollars,

          profit_pct:
            currentProfitPct,

          message:
            stopped
              ? stopReason ||
                "تم إغلاق صفقة SPX"
              : "تم تحديث صفقة SPX",

          metadata: {
            spxCurrentPrice,
            invalidationLevel,
            bid: snapshot.bid,
            ask: snapshot.ask,
            bestPrice,
            bestProfitDollars,
            bestProfitPct,
            reachedProfitProtection,
            profitProtectionStopped,
            oppositeDirectionStopped,
            signalSide,
            closeReason,
          },
        });

      const {
        data: latestTrades,
        error: latestError,
      } = await supabase
        .from("spx_trade_setups")
        .select("*")
        .or(
          `status.in.(WATCH,ACTIVE),and(status.eq.STOPPED,hidden_after.gt.${nowIso})`
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(20);

      if (latestError) {
        throw latestError;
      }

      /*
        السماح بموجة دخول ثانية أو ثالثة لا يغير
        أي شرط من شروط التحليل أو اختيار العقد.

        الشروط الإضافية فقط:
        1) الإشارة ما زالت ACTIVE بنفس الاتجاه.
        2) آخر موجة في الاتجاه حققت 100% أو أكثر.
        3) العقد المرشح مختلف عن جميع العقود المفتوحة.
        4) عدد الموجات المفتوحة أقل من 3.
      */
      const candidateContract =
        signal.executionContract ||
        signal.bestContract ||
        null;

      const signalSideForWave =
        signal.status === "ACTIVE"
          ? candidateContract?.side ||
            null
          : null;

      const sameDirectionTrades =
        (latestTrades || [])
          .filter(
            (trade) =>
              (
                trade.status === "ACTIVE" ||
                trade.status === "WATCH"
              ) &&
              textValue(
                trade.side
              ).toUpperCase() ===
                signalSideForWave
          )
          .sort(
            (left, right) =>
              new Date(
                textValue(
                  right.activated_at
                ) ||
                textValue(
                  right.created_at
                )
              ).getTime() -
              new Date(
                textValue(
                  left.activated_at
                ) ||
                textValue(
                  left.created_at
                )
              ).getTime()
          );

      const latestWave =
        sameDirectionTrades[0] ||
        null;

      const latestWaveDoubled =
        latestWave !== null &&
        numberValue(
          latestWave.best_profit_pct
        ) >= 100;

      const candidateAlreadyOpen =
        candidateContract !== null &&
        (latestTrades || []).some(
          (trade) =>
            (
              trade.status === "ACTIVE" ||
              trade.status === "WATCH"
            ) &&
            textValue(
              trade.option_ticker
            ) ===
              candidateContract.ticker
        );

      const allowSameDirectionWave =
        !stopped &&
        signal.status === "ACTIVE" &&
        signalSideForWave !== null &&
        signalSideForWave === side &&
        sameDirectionTrades.length > 0 &&
        sameDirectionTrades.length < 3 &&
        latestWaveDoubled &&
        candidateContract !== null &&
        !candidateAlreadyOpen;

      /*
        نكمل إلى إنشاء عقد جديد فقط في حال:
        - انعكاس مؤكد، كما كان سابقًا.
        - أو موجة جديدة استوفت الشروط أعلاه.
      */
      if (
        closedOppositeDirectionTrades.length === 0 &&
        !allowSameDirectionWave
      ) {
        return NextResponse.json(
          {
            ok: true,
            created: false,
            stopped,
            activeTrade:
              stopped
                ? null
                : updatedTrade,
            trades:
              latestTrades || [],
            signal,
            message:
              stopped
                ? stopReason ||
                  "تم إغلاق صفقة SPX"
                : undefined,
            updatedAt: nowIso,
          },
          {
            headers: {
              "Cache-Control":
                "private, no-store, max-age=0",
            },
          }
        );
      }
    }

    if (
      signal.status !== "ACTIVE" ||
      !signal.bestContract ||
      !signal.market ||
      !signal.gamma
    ) {
      return NextResponse.json(
        {
          ok: true,
          created: false,
          activeTrade: null,
          trades:
            visibleTrades || [],
          signal,
          message:
            signal.message ||
            "لا توجد فرصة SPX مفعّلة حاليًا.",
          updatedAt: nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    const analyticalContract =
      signal.bestContract;

    const contract =
      signal.executionContract ||
      analyticalContract;

    /*
      لا نغيّر اختيار الفرصة أو تقييمها.
      فقط نمنع إعادة إنشاء نفس العقد لمدة 30 دقيقة
      إذا تم إغلاقه يدويًا للاختبار.
    */
    const manualCloseCutoff =
      new Date(
        Date.now() -
          30 * 60 * 1000
      ).toISOString();

    const {
      data: recentlyClosedSameContract,
      error: recentlyClosedError,
    } = await supabase
      .from("spx_trade_setups")
      .select("id, option_ticker, hidden_after")
      .eq(
        "option_ticker",
        contract.ticker
      )
      .eq("status", "EXPIRED")
      .ilike(
        "last_error",
        "%إغلاق يدوي%"
      )
      .gte(
        "hidden_after",
        manualCloseCutoff
      )
      .order("hidden_after", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (recentlyClosedError) {
      throw recentlyClosedError;
    }

    if (recentlyClosedSameContract) {
      return NextResponse.json(
        {
          ok: true,
          created: false,
          activeTrade: null,
          trades:
            visibleTrades || [],
          signal,
          message:
            "تم إغلاق هذا العقد يدويًا — لن يعاد تفعيله لمدة 30 دقيقة.",
          updatedAt: nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    const spxEntryPrice =
      numberValue(
        signal.market.stockPrice
      );

    const invalidationLevel =
      chooseInvalidationLevel({
        side:
          contract.side,

        stockPrice:
          spxEntryPrice,

        gamma:
          signal.gamma,
      });

    if (
      spxEntryPrice <= 0 ||
      invalidationLevel <= 0
    ) {
      return NextResponse.json(
        {
          ok: true,
          created: false,
          activeTrade: null,
          trades:
            visibleTrades || [],
          signal,
          message:
            "ظهرت فرصة لكن لم يتوفر وقف صالح من بيانات القاما.",
          updatedAt: nowIso,
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    const entryPrice =
      numberValue(
        contract.midpoint,
        numberValue(
          contract.ask,
          numberValue(
            contract.price
          )
        )
      );

    const {
      data: createdTrade,
      error: createError,
    } = await supabase
      .from("spx_trade_setups")
      .insert({
        option_ticker:
          contract.ticker,

        side:
          contract.side,

        strike:
          contract.strike,

        expiration:
          contract.expiration,

        entry_price:
          entryPrice,

        current_price:
          entryPrice,

        current_bid:
          contract.bid,

        current_ask:
          contract.ask,

        best_price:
          entryPrice,

        lowest_price:
          entryPrice,

        best_price_at:
          nowIso,

        current_profit_dollars:
          0,

        current_profit_pct:
          0,

        best_profit_dollars:
          0,

        best_profit_pct:
          0,

        spx_entry_price:
          spxEntryPrice,

        spx_current_price:
          spxEntryPrice,

        invalidation_level:
          invalidationLevel,

        score:
          analyticalContract.finalScore,

        quality:
          analyticalContract.quality,

        analysis_snapshot: {
          ...signal,
          analyticalContract,
          executionContract:
            contract,
        },

        status:
          "ACTIVE",

        activated_at:
          nowIso,

        last_quote_at:
          nowIso,
      })
      .select("*")
      .single();

    if (
      createError ||
      !createdTrade
    ) {
      throw (
        createError ||
        new Error(
          "تعذر إنشاء صفقة SPX"
        )
      );
    }

    /*
      نشر الصفقة الجديدة بعد نجاح حفظها في الموقع.
      لا يؤثر فشل تيليجرام على إنشاء الصفقة.
    */
    try {
      const telegramUrl =
        `${new URL(request.url).origin}/spx-whales`;

      const structuralTarget =
        contract.side === "CALL"
          ? numberValue(
              signal.gamma?.callWall
            )
          : numberValue(
              signal.gamma?.putWall
            );

      const telegramResult =
        await sendSpxTelegramMessage(
          [
            "🚨 صفقة SPX جديدة",
            "",
            `📈 الاتجاه: ${contract.side}`,
            `🎯 سعر الدخول: ${formatSpxNumber(
              spxEntryPrice
            )}`,
            `🛑 وقف الخسارة: ${formatSpxNumber(
              invalidationLevel
            )}`,
            "",
            `🎯 الهدف الهيكلي: ${
              structuralTarget > 0
                ? formatSpxNumber(
                    structuralTarget,
                    0
                  )
                : "يتحدث تلقائيًا من الموقع"
            }`,
            "",
            `🎟️ العقد: ${contract.ticker}`,
            `💵 سعر العقد: ${formatSpxNumber(
              entryPrice
            )}`,
            "",
            `⏰ الوقت: ${formatSpxKsaTime(
              nowIso
            )} (KSA)`,
            "",
            `🌐 ${telegramUrl}`,
          ].join("\n")
        );

      if (!telegramResult.ok) {
        console.error(
          "تعذر إرسال صفقة SPX الجديدة إلى تيليجرام:",
          {
            tradeId:
              createdTrade.id,
            error:
              telegramResult.error,
          }
        );
      }
    } catch (telegramError) {
      console.error(
        "خطأ جانبي عند نشر صفقة SPX الجديدة:",
        telegramError
      );
    }

    await supabase
      .from("spx_trade_updates")
      .insert({
        setup_id:
          createdTrade.id,

        event_type:
          "CREATED",

        contract_price:
          entryPrice,

        profit_dollars:
          0,

        profit_pct:
          0,

        message:
          `تم تفعيل صفقة ${contract.side} عند وقف ${invalidationLevel}`,

        metadata: {
          score:
            analyticalContract.finalScore,
          quality:
            analyticalContract.quality,
          analyticalTicker:
            analyticalContract.ticker,
          analyticalStrike:
            analyticalContract.strike,
          analyticalPrice:
            analyticalContract.price,
          executionTicker:
            contract.ticker,
          executionStrike:
            contract.strike,
          executionPrice:
            entryPrice,
          usedAffordableAlternative:
            contract.ticker !==
            analyticalContract.ticker,
          spxEntryPrice,
          invalidationLevel,
        },
      });

    const {
      data: latestTrades,
      error: latestError,
    } = await supabase
      .from("spx_trade_setups")
      .select("*")
      .or(
        `status.in.(WATCH,ACTIVE),and(status.eq.STOPPED,hidden_after.gt.${nowIso})`
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(20);

    if (latestError) {
      throw latestError;
    }

    return NextResponse.json(
      {
        ok: true,
        created: true,
        activeTrade:
          createdTrade,
        trades:
          latestTrades || [],
        signal,
        updatedAt: nowIso,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير معروف",
      },
      {
        status: 500,
      }
    );
  }
}
