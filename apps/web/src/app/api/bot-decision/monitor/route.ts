import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const dynamic =
  "force-dynamic";

export const revalidate = 0;
export const maxDuration = 300;

type Side =
  | "CALL"
  | "PUT";

type JsonRecord =
  Record<string, unknown>;

type ContractData = {
  ticker: string;
  strike: number;
  expiration: string;
  side: Side;

  bid: number;
  ask: number;
  last: number;
  mid: number;

  volume: number;
  openInterest: number;

  delta:
    | number
    | null;

  gamma:
    | number
    | null;

  score: number;
};

const MIN_CONTRACT_PRICE =
  Number(
    process.env
      .MIN_CONTRACT_PRICE ||
    1
  );

const MAX_CONTRACT_PRICE =
  Number(
    process.env
      .MAX_CONTRACT_PRICE ||
    2.7
  );

const CONTRACT_STOP_DROP =
  Number(
    process.env
      .CONTRACT_STOP_DROP ||
    0.65
  );

function isAuthorized(
  request: NextRequest
) {
  const expectedSecret =
    process.env
      .DECISION_SCAN_SECRET;

  if (!expectedSecret) {
    return true;
  }

  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  return (
    authorization ===
    `Bearer ${expectedSecret}`
  );
}

function asRecord(
  value: unknown
): JsonRecord {
  return (
    value !== null &&
    typeof value ===
      "object"
  )
    ? value as JsonRecord
    : {};
}

function numberValue(
  value: unknown,
  fallback = 0
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}

function round(
  value: number,
  digits = 2
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

function createAdminClient() {
  const url =
    process.env
      .SUPABASE_URL ||
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  const secret =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY ||
    process.env
      .SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "متغيرات Supabase الخاصة بالسيرفر غير موجودة"
    );
  }

  return createClient(
    url,
    secret,
    {
      auth: {
        persistSession:
          false,
        autoRefreshToken:
          false,
      },
    }
  );
}

async function getFinnhubPrice(
  symbol: string
) {
  const apiKey =
    process.env
      .FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error(
      "متغير FINNHUB_API_KEY غير موجود"
    );
  }

  const url =
    `https://finnhub.io/api/v1/quote` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&token=${encodeURIComponent(apiKey)}`;

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
        signal:
          AbortSignal.timeout(
            20_000
          ),
      }
    );

  if (!response.ok) {
    throw new Error(
      `تعذر جلب سعر السهم: HTTP ${response.status}`
    );
  }

  const payload =
    asRecord(
      await response.json()
    );

  const price =
    numberValue(
      payload.c
    );

  if (price <= 0) {
    throw new Error(
      `لم يرجع Finnhub سعرًا صالحًا للرمز ${symbol}`
    );
  }

  return price;
}

function getOptionPrice(
  item: JsonRecord
) {
  const quote =
    asRecord(
      item.last_quote
    );

  const trade =
    asRecord(
      item.last_trade
    );

  const day =
    asRecord(
      item.day
    );

  const bid =
    numberValue(
      quote.bid ??
      quote.bp
    );

  const ask =
    numberValue(
      quote.ask ??
      quote.ap
    );

  const last =
    numberValue(
      trade.price ??
      trade.p ??
      day.close
    );

  let mid = 0;

  if (
    bid > 0 &&
    ask > 0
  ) {
    mid =
      (bid + ask) / 2;
  } else if (last > 0) {
    mid = last;
  } else if (ask > 0) {
    mid = ask;
  } else if (bid > 0) {
    mid = bid;
  }

  return {
    bid,
    ask,
    last,
    mid:
      round(mid, 2),
  };
}

async function getContractSnapshot(
  symbol: string,
  ticker: string
) {
  const apiKey =
    process.env
      .MASSIVE_API_KEY;

  const baseUrl =
    process.env
      .MASSIVE_BASE_URL ||
    "https://api.massive.com";

  if (!apiKey) {
    throw new Error(
      "متغير MASSIVE_API_KEY غير موجود"
    );
  }

  const url =
    `${baseUrl.replace(/\/+$/, "")}` +
    `/v3/snapshot/options/` +
    `${encodeURIComponent(symbol)}/` +
    `${encodeURIComponent(ticker)}` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const response =
    await fetch(
      url,
      {
        cache: "no-store",
        signal:
          AbortSignal.timeout(
            30_000
          ),
      }
    );

  if (!response.ok) {
    throw new Error(
      `تعذر جلب العقد ${ticker}: HTTP ${response.status}`
    );
  }

  const payload =
    asRecord(
      await response.json()
    );

  const result =
    asRecord(
      payload.results
    );

  if (
    Object.keys(result).length ===
    0
  ) {
    throw new Error(
      `لا توجد بيانات للعقد ${ticker}`
    );
  }

  return result;
}

async function getOptionChain(
  symbol: string,
  expiration: string,
  side: Side
) {
  const apiKey =
    process.env
      .MASSIVE_API_KEY;

  const baseUrl =
    process.env
      .MASSIVE_BASE_URL ||
    "https://api.massive.com";

  if (!apiKey) {
    throw new Error(
      "متغير MASSIVE_API_KEY غير موجود"
    );
  }

  const contractType =
    side === "CALL"
      ? "call"
      : "put";

  let url =
    `${baseUrl.replace(/\/+$/, "")}` +
    `/v3/snapshot/options/` +
    `${encodeURIComponent(symbol)}` +
    `?expiration_date=${encodeURIComponent(expiration)}` +
    `&contract_type=${encodeURIComponent(contractType)}` +
    `&limit=250` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const all:
    JsonRecord[] = [];

  while (url) {
    const response =
      await fetch(
        url,
        {
          cache: "no-store",
          signal:
            AbortSignal.timeout(
              45_000
            ),
        }
      );

    if (!response.ok) {
      throw new Error(
        `تعذر جلب سلسلة العقود: HTTP ${response.status}`
      );
    }

    const payload =
      asRecord(
        await response.json()
      );

    const results =
      Array.isArray(
        payload.results
      )
        ? payload.results
        : [];

    for (
      const result of results
    ) {
      all.push(
        asRecord(result)
      );
    }

    const nextUrl =
      typeof payload.next_url ===
        "string"
        ? payload.next_url
        : "";

    if (!nextUrl) {
      break;
    }

    url =
      nextUrl.includes(
        "apiKey="
      )
        ? nextUrl
        : `${nextUrl}&apiKey=${encodeURIComponent(apiKey)}`;
  }

  return all;
}

function getStrikeStep(
  price: number
) {
  if (price >= 1000) {
    return 10;
  }

  if (price >= 500) {
    return 5;
  }

  if (price >= 100) {
    return 2.5;
  }

  return 1;
}

function getPreferredStrike(
  price: number,
  side: Side
) {
  const step =
    getStrikeStep(price);

  if (side === "CALL") {
    return (
      Math.ceil(
        price / step
      ) * step
    );
  }

  return (
    Math.floor(
      price / step
    ) * step
  );
}

function scoreContract(
  contract: ContractData,
  preferredStrike: number,
  side: Side
) {
  const distance =
    Math.abs(
      contract.strike -
      preferredStrike
    );

  const volumeScore =
    Math.min(
      contract.volume /
      1000,
      3
    );

  const oiScore =
    Math.min(
      contract.openInterest /
      3000,
      3
    );

  let deltaScore = 0;

  const delta =
    Number(
      contract.delta
    );

  if (
    Number.isFinite(delta)
  ) {
    if (side === "CALL") {
      if (
        delta >= 0.25 &&
        delta <= 0.65
      ) {
        deltaScore = 3;
      } else if (
        delta >= 0.15 &&
        delta <= 0.75
      ) {
        deltaScore = 1.5;
      }
    } else {
      if (
        delta <= -0.25 &&
        delta >= -0.65
      ) {
        deltaScore = 3;
      } else if (
        delta <= -0.15 &&
        delta >= -0.75
      ) {
        deltaScore = 1.5;
      }
    }
  }

  const spread =
    contract.ask -
    contract.bid;

  const spreadPenalty =
    contract.bid > 0 &&
    contract.ask > 0
      ? Math.min(
          spread / 0.2,
          2
        )
      : 0;

  const distancePenalty =
    distance * 0.1;

  return (
    volumeScore +
    oiScore +
    deltaScore -
    spreadPenalty -
    distancePenalty
  );
}

async function findAlternativeContract(
  symbol: string,
  expiration: string,
  side: Side,
  stockPrice: number
) {
  const preferredStrike =
    getPreferredStrike(
      stockPrice,
      side
    );

  const chain =
    await getOptionChain(
      symbol,
      expiration,
      side
    );

  const candidates =
    chain
      .map((item) => {
        const details =
          asRecord(
            item.details
          );

        const day =
          asRecord(
            item.day
          );

        const greeks =
          asRecord(
            item.greeks
          );

        const price =
          getOptionPrice(
            item
          );

        const ticker =
          String(
            details.ticker ||
            item.ticker ||
            ""
          );

        const strike =
          numberValue(
            details.strike_price
          );

        const contract: ContractData = {
          ticker,
          strike,

          expiration:
            String(
              details.expiration_date ||
              expiration
            ),

          side,

          bid:
            price.bid,

          ask:
            price.ask,

          last:
            price.last,

          mid:
            price.mid,

          volume:
            numberValue(
              day.volume ??
              day.v
            ),

          openInterest:
            numberValue(
              item.open_interest
            ),

          delta:
            Number.isFinite(
              Number(
                greeks.delta
              )
            )
              ? Number(
                  greeks.delta
                )
              : null,

          gamma:
            Number.isFinite(
              Number(
                greeks.gamma
              )
            )
              ? Number(
                  greeks.gamma
                )
              : null,

          score: 0,
        };

        contract.score =
          scoreContract(
            contract,
            preferredStrike,
            side
          );

        return contract;
      })
      .filter(
        (contract) =>
          contract.ticker &&
          contract.strike > 0 &&
          contract.mid >=
            MIN_CONTRACT_PRICE &&
          contract.mid <=
            MAX_CONTRACT_PRICE
      )
      .sort(
        (
          first,
          second
        ) => {
          if (
            second.score !==
            first.score
          ) {
            return (
              second.score -
              first.score
            );
          }

          return (
            Math.abs(
              first.strike -
              preferredStrike
            ) -
            Math.abs(
              second.strike -
              preferredStrike
            )
          );
        }
      );

  return (
    candidates[0] ||
    null
  );
}

function isEntryActivated({
  side,
  stockPrice,
  entryPrice,
}: {
  side: Side;
  stockPrice: number;
  entryPrice: number;
}) {
  if (side === "CALL") {
    return (
      stockPrice >=
      entryPrice
    );
  }

  return (
    stockPrice <=
    entryPrice
  );
}

export async function GET(
  request: NextRequest
) {
  if (
    !isAuthorized(request)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "غير مصرح بتشغيل المتابعة",
      },
      {
        status: 401,
      }
    );
  }

  const startedAt =
    Date.now();

  try {
    const supabase =
      createAdminClient();

    const nowIso =
      new Date()
        .toISOString();

    /*
      إنهاء فرص المراقبة التي
      تجاوزت مدة ثلاث ساعات.
    */
    await supabase
      .from(
        "stock_trade_setups"
      )
      .update({
        status:
          "expired",

        contract_status:
          "EXPIRED",

        invalidated_at:
          nowIso,

        invalidation_reason:
          "انتهت مدة مراقبة الفرصة بدون تفعيل",
      })
      .in(
        "status",
        [
          "watching",
          "WATCHING",
        ]
      )
      .lte(
        "expires_at",
        nowIso
      );

    const {
      data,
      error,
    } = await supabase
      .from(
        "stock_trade_setups"
      )
      .select("*")
      .in(
        "status",
        [
          "watching",
          "WATCHING",
        ]
      )
      .gt(
        "expires_at",
        nowIso
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    const results:
      JsonRecord[] = [];

    for (
      const rawRow of
      data || []
    ) {
      const row =
        asRecord(rawRow);

      const id =
        String(
          row.id || ""
        );

      const symbol =
        String(
          row.symbol || ""
        ).toUpperCase();

      const side =
        String(
          row.side || ""
        ).toUpperCase() as Side;

      const entryPrice =
        numberValue(
          row.entry_price
        );

      const expiration =
        String(
          row.contract_expiration ||
          ""
        );

      const savedTicker =
        String(
          row.contract_ticker ||
          ""
        );

      if (
        !id ||
        !symbol ||
        !["CALL", "PUT"].includes(
          side
        ) ||
        entryPrice <= 0 ||
        !expiration
      ) {
        results.push({
          id,
          symbol,
          status:
            "تم التجاهل",
          reason:
            "بيانات فرصة المراقبة غير مكتملة",
        });

        continue;
      }

      try {
        const stockPrice =
          await getFinnhubPrice(
            symbol
          );

        const activated =
          isEntryActivated({
            side,
            stockPrice,
            entryPrice,
          });

        if (!activated) {
          await supabase
            .from(
              "stock_trade_setups"
            )
            .update({
              last_seen_at:
                nowIso,

              current_price:
                stockPrice,
            })
            .eq(
              "id",
              id
            );

          results.push({
            id,
            symbol,
            side,
            status:
              "مراقبة",

            message:
              side === "CALL"
                ? `بانتظار اختراق ${entryPrice}`
                : `بانتظار كسر ${entryPrice}`,

            stockPrice,
            entryPrice,
          });

          continue;
        }

        let selectedContract:
          ContractData |
          null = null;

        if (savedTicker) {
          try {
            const snapshot =
              await getContractSnapshot(
                symbol,
                savedTicker
              );

            const details =
              asRecord(
                snapshot.details
              );

            const day =
              asRecord(
                snapshot.day
              );

            const greeks =
              asRecord(
                snapshot.greeks
              );

            const price =
              getOptionPrice(
                snapshot
              );

            if (
              price.mid >=
                MIN_CONTRACT_PRICE &&
              price.mid <=
                MAX_CONTRACT_PRICE
            ) {
              selectedContract = {
                ticker:
                  savedTicker,

                strike:
                  numberValue(
                    details.strike_price ??
                    row.contract_strike
                  ),

                expiration,

                side,

                bid:
                  price.bid,

                ask:
                  price.ask,

                last:
                  price.last,

                mid:
                  price.mid,

                volume:
                  numberValue(
                    day.volume ??
                    day.v
                  ),

                openInterest:
                  numberValue(
                    snapshot.open_interest
                  ),

                delta:
                  Number.isFinite(
                    Number(
                      greeks.delta
                    )
                  )
                    ? Number(
                        greeks.delta
                      )
                    : null,

                gamma:
                  Number.isFinite(
                    Number(
                      greeks.gamma
                    )
                  )
                    ? Number(
                        greeks.gamma
                      )
                    : null,

                score: 0,
              };
            }
          } catch (
            contractError
          ) {
            console.error(
              `تعذر إعادة فحص العقد ${savedTicker}:`,
              contractError
            );
          }
        }

        /*
          إذا خرج العقد الأصلي من النطاق،
          نبحث عن عقد بديل بنفس شروط البوت.
        */
        if (!selectedContract) {
          selectedContract =
            await findAlternativeContract(
              symbol,
              expiration,
              side,
              stockPrice
            );
        }

        if (!selectedContract) {
          await supabase
            .from(
              "stock_trade_setups"
            )
            .update({
              last_seen_at:
                nowIso,

              current_price:
                stockPrice,

              invalidation_reason:
                `تحقق دخول السهم ولكن لا يوجد عقد داخل النطاق ${MIN_CONTRACT_PRICE} - ${MAX_CONTRACT_PRICE}`,
            })
            .eq(
              "id",
              id
            );

          results.push({
            id,
            symbol,
            side,
            status:
              "مراقبة",

            message:
              "تحقق الدخول ولكن لم يتم العثور على عقد مناسب",

            stockPrice,
          });

          continue;
        }

        /*
          منع تفعيل فرصة إذا كانت هناك
          صفقة نشطة أخرى للرمز نفسه.
        */
        const {
          data:
            activeRows,
          error:
            activeRowsError,
        } = await supabase
          .from(
            "stock_trade_setups"
          )
          .select(
            "id,status,contract_status"
          )
          .eq(
            "symbol",
            symbol
          )
          .in(
            "status",
            [
              "active",
              "ACTIVE",
            ]
          )
          .neq(
            "id",
            id
          );

        if (
          activeRowsError
        ) {
          throw activeRowsError;
        }

        if (
          (
            activeRows ||
            []
          ).length > 0
        ) {
          await supabase
            .from(
              "stock_trade_setups"
            )
            .update({
              status:
                "invalidated",

              contract_status:
                "CLOSED",

              invalidated_at:
                nowIso,

              invalidation_reason:
                "تم إلغاء فرصة المراقبة لوجود صفقة نشطة على الرمز",
            })
            .eq(
              "id",
              id
            );

          results.push({
            id,
            symbol,
            status:
              "ملغاة",

            message:
              "توجد صفقة نشطة على الرمز",
          });

          continue;
        }

        const optionEntry =
          selectedContract.mid;

        const optionStop =
          Math.max(
            optionEntry -
            CONTRACT_STOP_DROP,
            0.01
          );

        const gammaSnapshot =
          asRecord(
            row.gamma_snapshot
          );

        const oldSelectedContract =
          asRecord(
            gammaSnapshot
              .selectedContract
          );

        const contractChanged =
          savedTicker !==
          selectedContract.ticker;

        const updatedSnapshot = {
          ...gammaSnapshot,

          stage:
            "ACTIVE",

          stageArabic:
            "صفقة نشطة",

          activatedAt:
            nowIso,

          activationStockPrice:
            stockPrice,

          contractChanged,

          contractChangeArabic:
            contractChanged
              ? "تم تغيير العقد وقت التفعيل بسبب خروجه من النطاق السعري"
              : "تم اعتماد العقد الأصلي",

          originalSelectedContract:
            oldSelectedContract,

          selectedContract: {
            ticker:
              selectedContract.ticker,

            type:
              side,

            expiration:
              selectedContract.expiration,

            strike:
              selectedContract.strike,

            bid:
              selectedContract.bid,

            ask:
              selectedContract.ask,

            midpoint:
              selectedContract.mid,

            lastTradePrice:
              selectedContract.last,

            volume:
              selectedContract.volume,

            openInterest:
              selectedContract.openInterest,

            delta:
              selectedContract.delta,

            gamma:
              selectedContract.gamma,

            decisionContractScore:
              selectedContract.score,
          },

          optionStop,
        };

        const {
          data: activatedRow,
          error:
            activationError,
        } = await supabase
          .from(
            "stock_trade_setups"
          )
          .update({
            status:
              "active",

            contract_status:
              "ACTIVE",

            activated_at:
              nowIso,

            last_seen_at:
              nowIso,

            current_price:
              stockPrice,

            best_price:
              stockPrice,

            best_price_at:
              nowIso,

            contract_ticker:
              selectedContract.ticker,

            contract_strike:
              selectedContract.strike,

            contract_expiration:
              selectedContract.expiration,

            contract_entry_price:
              optionEntry,

            contract_current_price:
              optionEntry,

            contract_best_price:
              optionEntry,

            contract_best_price_at:
              nowIso,

            contract_stop_price:
              optionStop,

            contract_bid:
              selectedContract.bid,

            contract_ask:
              selectedContract.ask,

            contract_profit_dollars:
              0,

            contract_profit_pct:
              0,

            contract_quote_at:
              nowIso,

            gamma_snapshot:
              updatedSnapshot,

            invalidated_at:
              null,

            invalidation_reason:
              null,
          })
          .eq(
            "id",
            id
          )
          .eq(
            "status",
            "watching"
          )
          .select("*")
          .single();

        if (
          activationError ||
          !activatedRow
        ) {
          throw (
            activationError ||
            new Error(
              "تعذر تفعيل فرصة المراقبة"
            )
          );
        }

        results.push({
          id,
          symbol,
          side,

          status:
            "تم التفعيل",

          message:
            contractChanged
              ? "تم تفعيل الصفقة بعقد بديل"
              : "تم تفعيل الصفقة بالعقد الأصلي",

          stockPrice,
          entryPrice,

          contract: {
            ticker:
              selectedContract.ticker,

            strike:
              selectedContract.strike,

            expiration:
              selectedContract.expiration,

            entry:
              optionEntry,

            stop:
              optionStop,
          },
        });
      } catch (rowError) {
        const message =
          rowError instanceof Error
            ? rowError.message
            : String(rowError);

        console.error(
          `خطأ متابعة ${symbol}:`,
          message
        );

        results.push({
          id,
          symbol,

          status:
            "فشل",

          message,
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,

        service:
          "متابعة محرك قرار البوتات",

        checked:
          (data || []).length,

        activated:
          results.filter(
            (result) =>
              result.status ===
              "تم التفعيل"
          ).length,

        watching:
          results.filter(
            (result) =>
              result.status ===
              "مراقبة"
          ).length,

        failed:
          results.filter(
            (result) =>
              result.status ===
              "فشل"
          ).length,

        results,

        elapsedMs:
          Date.now() -
          startedAt,

        checkedAt:
          new Date()
            .toISOString(),
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "خطأ متابعة فرص محرك البوتات:",
      message
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          "تعذر متابعة فرص محرك البوتات",

        details:
          message,
      },
      {
        status: 500,
      }
    );
  }
}
