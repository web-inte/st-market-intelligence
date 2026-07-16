#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys

ROOT = Path.cwd()
ROUTE = ROOT / "src/app/api/sectors/route.ts"

if not ROUTE.exists():
    print("خطأ: شغّل الملف من داخل مجلد apps/web")
    sys.exit(1)

backups = sorted(
    Path("/tmp").glob("sector-rate-limit-backup-*.ts"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)

if not backups:
    print("خطأ: لم أجد النسخة الصحيحة السابقة داخل /tmp")
    print("نفّذ: ls -lt /tmp/sector-*.ts | head")
    sys.exit(1)

correct_overview_backup = backups[0]

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
current_backup = Path("/tmp") / f"sector-before-price-only-finnhub-{stamp}.ts"
shutil.copy2(ROUTE, current_backup)

# استعادة النسخة التي كانت تعطي SOXX والقطاعات بالقيم الصحيحة من Massive.
shutil.copy2(correct_overview_backup, ROUTE)

text = ROUTE.read_text(encoding="utf-8")

helper = r'''
type FinnhubPriceQuote = {
  c?: number;
};

type CompanyGroupedRow = {
  T?: string;
  c?: number;
  v?: number;
  t?: number;
};

type CompanyGroupedResponse = {
  results?: CompanyGroupedRow[];
  error?: string;
  message?: string;
};

function previousCompanyBusinessDay(
  date: Date,
  count = 1
) {
  const result = new Date(date);
  let moved = 0;

  while (moved < count) {
    result.setUTCDate(
      result.getUTCDate() - 1
    );

    const day = result.getUTCDay();

    if (day !== 0 && day !== 6) {
      moved += 1;
    }
  }

  return result;
}

function latestCompanyCompletedSession() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).formatToParts(new Date());

  const values =
    Object.fromEntries(
      parts.map((part) => [
        part.type,
        part.value,
      ])
    );

  const date =
    new Date(
      Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day)
      )
    );

  const hour =
    Number(values.hour) % 24;

  const minute =
    Number(values.minute);

  const isWeekday =
    [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
    ].includes(
      String(values.weekday)
    );

  const afterClose =
    hour > 16 ||
    (hour === 16 &&
      minute >= 15);

  if (isWeekday && afterClose) {
    return date;
  }

  return previousCompanyBusinessDay(
    date,
    1
  );
}

async function fetchCompanyGroupedDate(
  date: string,
  massiveApiKey: string
) {
  return getOrSetCache<
    CompanyGroupedRow[]
  >(
    `sector-company-grouped:v1:${date}`,
    {
      ttlMs: 10 * 60_000,
      staleMs: 60 * 60_000,
    },
    async () => {
      const url =
        "https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/" +
        `${date}?adjusted=true&include_otc=false&apiKey=${encodeURIComponent(
          massiveApiKey
        )}`;

      const response =
        await fetch(url, {
          cache: "no-store",
          headers: {
            Accept:
              "application/json",
            Authorization:
              `Bearer ${massiveApiKey}`,
          },
        });

      const payload =
        (await response.json()) as
          CompanyGroupedResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ||
            payload.message ||
            `تعذر تحميل جلسة ${date} من Massive.`
        );
      }

      return payload.results ?? [];
    }
  );
}

async function fetchFinnhubCurrentPrice(
  symbol: string
) {
  const finnhubKey =
    process.env.FINNHUB_API_KEY;

  if (!finnhubKey) {
    return 0;
  }

  return getOrSetCache<number>(
    `sector-company-price:v1:${symbol}`,
    {
      ttlMs: 60_000,
      staleMs: 5 * 60_000,
    },
    async () => {
      const url =
        "https://finnhub.io/api/v1/quote" +
        `?symbol=${encodeURIComponent(
          symbol
        )}` +
        `&token=${encodeURIComponent(
          finnhubKey
        )}`;

      const response =
        await fetch(url, {
          cache: "no-store",
        });

      const payload =
        (await response.json()) as
          FinnhubPriceQuote;

      if (!response.ok) {
        return 0;
      }

      const price =
        Number(payload.c);

      return Number.isFinite(price) &&
        price > 0
        ? price
        : 0;
    }
  );
}

function companyGroupedMap(
  rows: CompanyGroupedRow[]
) {
  const result =
    new Map<
      string,
      CompanyGroupedRow
    >();

  for (const row of rows) {
    const symbol =
      String(
        row.T ?? ""
      ).toUpperCase();

    if (symbol) {
      result.set(symbol, row);
    }
  }

  return result;
}

async function companyMapLimit<
  T,
  R
>(
  items: T[],
  concurrency: number,
  worker: (
    item: T
  ) => Promise<R>
) {
  const results =
    new Array<R>(items.length);

  let nextIndex = 0;

  async function run() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] =
        await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            Math.max(
              items.length,
              1
            )
          ),
      },
      () => run()
    )
  );

  return results;
}

async function getCompanyBarsMap(
  symbols: string[],
  massiveApiKey: string
) {
  const cleanSymbols =
    Array.from(
      new Set(
        symbols.map((symbol) =>
          symbol
            .trim()
            .toUpperCase()
        )
      )
    );

  const latestDate =
    latestCompanyCompletedSession();

  const previousDate =
    previousCompanyBusinessDay(
      latestDate,
      1
    );

  const fiveDayDate =
    previousCompanyBusinessDay(
      latestDate,
      5
    );

  let latestMap =
    new Map<
      string,
      CompanyGroupedRow
    >();

  let previousMap =
    new Map<
      string,
      CompanyGroupedRow
    >();

  let fiveDayMap =
    new Map<
      string,
      CompanyGroupedRow
    >();

  try {
    const [
      latestRows,
      previousRows,
      fiveDayRows,
    ] =
      await Promise.all([
        fetchCompanyGroupedDate(
          latestDate
            .toISOString()
            .slice(0, 10),
          massiveApiKey
        ),
        fetchCompanyGroupedDate(
          previousDate
            .toISOString()
            .slice(0, 10),
          massiveApiKey
        ),
        fetchCompanyGroupedDate(
          fiveDayDate
            .toISOString()
            .slice(0, 10),
          massiveApiKey
        ),
      ]);

    latestMap =
      companyGroupedMap(
        latestRows
      );

    previousMap =
      companyGroupedMap(
        previousRows
      );

    fiveDayMap =
      companyGroupedMap(
        fiveDayRows
      );
  } catch (error) {
    console.warn(
      "Massive grouped company data failed; individual Massive fallback will be used.",
      error
    );
  }

  const pairs =
    await companyMapLimit(
      cleanSymbols,
      4,
      async (symbol) => {
        const currentPrice =
          await fetchFinnhubCurrentPrice(
            symbol
          );

        const latest =
          latestMap.get(symbol);

        const previous =
          previousMap.get(symbol);

        const fiveDay =
          fiveDayMap.get(symbol);

        if (
          latest &&
          previous &&
          fiveDay
        ) {
          const bars: MassiveBar[] =
            [
              {
                c:
                  Number(
                    fiveDay.c
                  ),
                v:
                  Number(
                    fiveDay.v
                  ),
                t:
                  Number(
                    fiveDay.t
                  ) ||
                  fiveDayDate.getTime(),
              },
              {
                c:
                  Number(
                    previous.c
                  ),
                v:
                  Number(
                    previous.v
                  ),
                t:
                  Number(
                    previous.t
                  ) ||
                  previousDate.getTime(),
              },
              {
                // السعر الحالي فقط من Finnhub،
                // وباقي البيانات من Massive.
                c:
                  currentPrice > 0
                    ? currentPrice
                    : Number(
                        latest.c
                      ),
                v:
                  Number(
                    latest.v
                  ),
                t:
                  Number(
                    latest.t
                  ) ||
                  latestDate.getTime(),
              },
            ];

          return [
            symbol,
            bars,
          ] as const;
        }

        try {
          const bars =
            await getBars(
              symbol,
              massiveApiKey
            );

          if (
            currentPrice > 0 &&
            bars.length > 0
          ) {
            bars[
              bars.length - 1
            ].c =
              currentPrice;
          }

          return [
            symbol,
            bars,
          ] as const;
        } catch (error) {
          console.error(
            `تعذر تحميل بيانات ${symbol}:`,
            error
          );

          return [
            symbol,
            [] as MassiveBar[],
          ] as const;
        }
      }
    );

  return new Map<
    string,
    MassiveBar[]
  >(pairs);
}

'''

new_load_detail = r'''async function loadDetail(
  symbol: string
) {
  const definition =
    SECTORS.find(
      (sector) =>
        sector.symbol === symbol
    );

  if (!definition) {
    throw new Error(
      "رمز القطاع غير مدعوم."
    );
  }

  const overview =
    await getOrSetCache(
      "sector-overview:v4-individual",
      {
        ttlMs: 5 * 60_000,
        staleMs:
          30 * 60_000,
      },
      loadOverview
    );

  const sector =
    overview.sectors.find(
      (item: SectorItem) =>
        item.symbol === symbol
    );

  if (!sector) {
    throw new Error(
      "تعذر تحميل القطاع."
    );
  }

  const apiKey =
    process.env.MASSIVE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "MASSIVE_API_KEY غير موجود."
    );
  }

  const barsMap =
    await getCompanyBarsMap(
      definition.companies.map(
        (company) =>
          company.symbol
      ),
      apiKey
    );

  const companies: CompanyItem[] =
    sortByStrength(
      definition.companies.map(
        (company) => {
          const metrics =
            buildMetrics(
              company.symbol,
              barsMap.get(
                company.symbol
              ) ?? [],
              overview.benchmark
                .fiveDayChangePct
            );

          return {
            ...company,
            ...metrics,
            rank: 0,
          };
        }
      )
    ).map(
      (company, index) => ({
        ...company,
        rank: index + 1,
      })
    );

  const availableCompanies =
    companies.filter(
      (company) =>
        company.dataAvailable
    );

  const risingCount =
    availableCompanies.filter(
      (company) =>
        company.trend === "UP"
    ).length;

  const fallingCount =
    availableCompanies.filter(
      (company) =>
        company.trend === "DOWN"
    ).length;

  const averageDailyChangePct =
    availableCompanies.length > 0
      ? round(
          availableCompanies.reduce(
            (sum, company) =>
              sum +
              company.dailyChangePct,
            0
          ) /
            availableCompanies.length
        )
      : 0;

  const averageFiveDayChangePct =
    availableCompanies.length > 0
      ? round(
          availableCompanies.reduce(
            (sum, company) =>
              sum +
              company.fiveDayChangePct,
            0
          ) /
            availableCompanies.length
        )
      : 0;

  return {
    ok: true,
    updatedAt:
      new Date().toISOString(),
    sector,
    benchmark:
      overview.benchmark,
    companies,
    leaders:
      availableCompanies.slice(
        0,
        3
      ),
    laggards:
      [...availableCompanies]
        .reverse()
        .slice(0, 3),
    summary: {
      requestedCompanies:
        definition.companies.length,
      availableCompanies:
        availableCompanies.length,
      risingCount,
      fallingCount,
      strongestCompany:
        availableCompanies[0] ??
        null,
      weakestCompany:
        availableCompanies[
          availableCompanies.length -
            1
        ] ?? null,
      averageDailyChangePct,
      averageFiveDayChangePct,
    },
    failed:
      companies
        .filter(
          (company) =>
            !company.dataAvailable
        )
        .map((company) => ({
          symbol:
            company.symbol,
          error:
            company.dataError ||
            "بيانات غير متاحة",
        })),
  };
}

'''

start = text.find(
    "async function loadDetail("
)

end = text.find(
    "export async function GET",
    start,
)

if start == -1 or end == -1:
    print("خطأ: لم أجد دالة loadDetail في النسخة المستعادة")
    sys.exit(1)

text = (
    text[:start]
    + helper
    + new_load_detail
    + text[end:]
)

text = text.replace(
    "sector-detail:v4-individual:",
    "sector-detail:v7-finnhub-price-only:",
)

ROUTE.write_text(
    text,
    encoding="utf-8",
)

print("تم تطبيق المصدر الصحيح للبيانات.")
print("- سعر الشركة الحالي فقط من Finnhub")
print("- الإغلاق السابق وأداء 5 جلسات والحجم من Massive")
print("- خريطة القطاعات وSOXX بقيت بالكامل على Massive")
print("- لم يتم استخدام شموع Finnhub أو حجم Finnhub")
print(f"تمت استعادة النسخة الصحيحة: {correct_overview_backup}")
print(f"نسخة الكود الحالي قبل الإصلاح: {current_backup}")
print("الخطوة التالية: npm run build")
