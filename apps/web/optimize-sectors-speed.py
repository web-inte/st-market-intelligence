#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys

ROOT = Path.cwd()
ROUTE = ROOT / "src/app/api/sectors/route.ts"
RADAR = ROOT / "src/components/sector-radar.tsx"
DETAIL = ROOT / "src/app/sectors/[symbol]/page.tsx"

for path in (ROUTE, RADAR, DETAIL):
    if not path.exists():
        print(f"خطأ: الملف غير موجود: {path}")
        print("شغّل الملف من داخل مجلد apps/web")
        sys.exit(1)

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup_dir = Path("/tmp") / f"sector-speed-backup-{stamp}"
backup_dir.mkdir(parents=True, exist_ok=True)

for source in (ROUTE, RADAR, DETAIL):
    destination = backup_dir / source.relative_to(ROOT)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)

# ------------------------------------------------------------------
# 1) تسريع API القطاعات: طلبان متوازيان + كاش Next + كاش أطول.
# ------------------------------------------------------------------
route = ROUTE.read_text(encoding="utf-8")

route = route.replace(
    "for (let attempt = 1; attempt <= 4; attempt += 1)",
    "for (let attempt = 1; attempt <= 3; attempt += 1)",
)
route = route.replace(
    "() => controller.abort(),\n      20_000",
    "() => controller.abort(),\n      12_000",
)
route = route.replace(
'''      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });''',
'''      const response = await fetch(url, {
        next: {
          revalidate: 120,
        },
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });''',
)
route = route.replace(
    "await sleep(attempt * 900);",
    "await sleep(attempt * 500);",
)

route = route.replace(
    "`sector-bars:v4-individual:${symbol}`",
    "`sector-bars:v5-fast:${symbol}`",
)
route = route.replace(
    '"sector-overview:v4-individual"',
    '"sector-overview:v5-fast"',
)
route = route.replace(
    "`sector-detail:v4-individual:${symbol}`",
    "`sector-detail:v5-fast:${symbol}`",
)

route = route.replace(
'''ttlMs: 2 * 60_000,
      staleMs: 30 * 60_000,''',
'''ttlMs: 10 * 60_000,
      staleMs: 60 * 60_000,''',
)
route = route.replace(
'''ttlMs: 2 * 60_000,
        staleMs:
          30 * 60_000,''',
'''ttlMs: 5 * 60_000,
        staleMs:
          60 * 60_000,''',
)
route = route.replace(
'''ttlMs: 2 * 60_000,
            staleMs:
              30 * 60_000,''',
'''ttlMs: 5 * 60_000,
            staleMs:
              60 * 60_000,''',
)

helper = r'''async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] =
        await worker(
          items[currentIndex]
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          concurrency,
          Math.max(
            items.length,
            1
          )
        ),
      },
      () => runWorker()
    )
  );

  return results;
}

'''

if "async function mapWithConcurrency" not in route:
    anchor = "async function loadOverview() {"
    if anchor not in route:
        print("خطأ: لم أجد دالة loadOverview.")
        sys.exit(1)
    route = route.replace(anchor, helper + anchor, 1)

overview_pattern = re.compile(
    r'''  const rawSectors: SectorItem\[\] = \[\];\n\n  for \(\n    let index = 0;\n    index < SECTORS\.length;\n    index \+= 1\n  \) \{.*?\n  \}\n\n  const sectors =''',
    re.S,
)

overview_replacement = r'''  const rawSectors =
    await mapWithConcurrency(
      SECTORS,
      2,
      async (definition) => {
        try {
          const bars =
            await getBars(
              definition.symbol,
              apiKey
            );

          const metrics =
            buildMetrics(
              definition.symbol,
              bars,
              benchmark
                .fiveDayChangePct
            );

          return {
            ...metrics,
            name:
              definition.name,
            icon:
              definition.icon,
            companies:
              definition.companies,
            rank: 0,
            rotationScore:
              metrics.dataAvailable
                ? calculateRotationScore(
                    metrics
                  )
                : -999,
          } satisfies SectorItem;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "تعذر تحميل القطاع.";

          const metrics =
            unavailableMetrics(
              definition.symbol,
              message
            );

          return {
            ...metrics,
            name:
              definition.name,
            icon:
              definition.icon,
            companies:
              definition.companies,
            rank: 0,
            rotationScore: -999,
          } satisfies SectorItem;
        }
      }
    );

  const sectors ='''

if overview_pattern.search(route):
    route = overview_pattern.sub(
        overview_replacement,
        route,
        count=1,
    )
elif "await mapWithConcurrency(\n      SECTORS" not in route:
    print("خطأ: لم أتمكن من تحويل تحميل القطاعات إلى تحميل متوازٍ.")
    sys.exit(1)

company_pattern = re.compile(
    r'''  const companies: CompanyItem\[\] = \[\];\n\n  for \(\n    let index = 0;\n    index <\n    definition\.companies\.length;\n    index \+= 1\n  \) \{.*?\n  \}\n\n  const sortedCompanies =''',
    re.S,
)

company_replacement = r'''  const companies =
    await mapWithConcurrency(
      definition.companies,
      2,
      async (company) => {
        try {
          const bars =
            await getBars(
              company.symbol,
              apiKey
            );

          const metrics =
            buildMetrics(
              company.symbol,
              bars,
              overview.benchmark
                .fiveDayChangePct
            );

          return {
            ...company,
            ...metrics,
            rank: 0,
          } satisfies CompanyItem;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "تعذر تحميل الشركة.";

          return {
            ...company,
            ...unavailableMetrics(
              company.symbol,
              message
            ),
            rank: 0,
          } satisfies CompanyItem;
        }
      }
    );

  const sortedCompanies ='''

if company_pattern.search(route):
    route = company_pattern.sub(
        company_replacement,
        route,
        count=1,
    )
elif "await mapWithConcurrency(\n      definition.companies" not in route:
    print("خطأ: لم أتمكن من تحويل تحميل الشركات إلى تحميل متوازٍ.")
    sys.exit(1)

ROUTE.write_text(route, encoding="utf-8")

# ------------------------------------------------------------------
# 2) إظهار آخر خريطة ناجحة فورًا من ذاكرة المتصفح ثم تحديثها بالخلفية.
# ------------------------------------------------------------------
radar = RADAR.read_text(encoding="utf-8")

if "SECTOR_STORAGE_KEY" not in radar:
    anchor = "function changeClass(value: number) {"
    if anchor not in radar:
        print("خطأ: لم أجد موضع كاش واجهة القطاعات.")
        sys.exit(1)
    radar = radar.replace(
        anchor,
        'const SECTOR_STORAGE_KEY = "st-sector-overview-v5";\n\n' + anchor,
        1,
    )

old_effect = '''  useEffect(() => {
    let cancelled = false;
    let running = false;

    async function load() {'''
new_effect = '''  useEffect(() => {
    let cancelled = false;
    let running = false;

    try {
      const cached =
        window.localStorage.getItem(
          SECTOR_STORAGE_KEY
        );

      if (cached) {
        const parsed =
          JSON.parse(
            cached
          ) as SectorResponse;

        if (
          parsed?.ok &&
          Array.isArray(
            parsed.sectors
          )
        ) {
          setData(parsed);
          setLoading(false);
        }
      }
    } catch (cacheError) {
      console.warn(
        "Failed to restore sector cache:",
        cacheError
      );
    }

    async function load() {'''

if "Failed to restore sector cache" not in radar:
    if old_effect not in radar:
        print("خطأ: لم أجد useEffect في خريطة القطاعات.")
        sys.exit(1)
    radar = radar.replace(old_effect, new_effect, 1)

old_set = '''        if (!cancelled) {
          setData(payload);
          setError("");
        }'''
new_set = '''        if (!cancelled) {
          setData(payload);
          setError("");

          try {
            window.localStorage.setItem(
              SECTOR_STORAGE_KEY,
              JSON.stringify(
                payload
              )
            );
          } catch (cacheError) {
            console.warn(
              "Failed to save sector cache:",
              cacheError
            );
          }
        }'''

if "Failed to save sector cache" not in radar:
    if old_set not in radar:
        print("خطأ: لم أجد موضع حفظ بيانات القطاعات.")
        sys.exit(1)
    radar = radar.replace(old_set, new_set, 1)

radar = radar.replace(
    "{loading ? (",
    "{loading && !data ? (",
    1,
)
RADAR.write_text(radar, encoding="utf-8")

# ------------------------------------------------------------------
# 3) نفس التحسين لصفحة تفاصيل القطاع والشركات.
# ------------------------------------------------------------------
detail = DETAIL.read_text(encoding="utf-8")

if "sectorDetailStorageKey" not in detail:
    anchor = "function signed(value: number) {"
    if anchor not in detail:
        print("خطأ: لم أجد موضع كاش تفاصيل القطاع.")
        sys.exit(1)
    detail = detail.replace(
        anchor,
'''function sectorDetailStorageKey(
  symbol: string
) {
  return `st-sector-detail-v5:${symbol}`;
}

''' + anchor,
        1,
    )

old_detail_effect = '''  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;
    let running = false;

    async function load() {'''
new_detail_effect = '''  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;
    let running = false;

    try {
      const cached =
        window.localStorage.getItem(
          sectorDetailStorageKey(
            symbol
          )
        );

      if (cached) {
        const parsed =
          JSON.parse(
            cached
          ) as DetailResponse;

        if (
          parsed?.ok &&
          parsed.sector?.symbol ===
            symbol
        ) {
          setData(parsed);
          setLoading(false);
        }
      }
    } catch (cacheError) {
      console.warn(
        "Failed to restore sector detail cache:",
        cacheError
      );
    }

    async function load() {'''

if "Failed to restore sector detail cache" not in detail:
    if old_detail_effect not in detail:
        print("خطأ: لم أجد useEffect في تفاصيل القطاع.")
        sys.exit(1)
    detail = detail.replace(
        old_detail_effect,
        new_detail_effect,
        1,
    )

# لا نخفي البيانات القديمة أثناء التحديث الدوري.
detail = detail.replace(
'''      running = true;
      setLoading(true);

      try {''',
'''      running = true;

      try {''',
    1,
)

old_detail_set = '''        if (!cancelled) {
          setData(payload);
          setError("");
        }'''
new_detail_set = '''        if (!cancelled) {
          setData(payload);
          setError("");

          try {
            window.localStorage.setItem(
              sectorDetailStorageKey(
                symbol
              ),
              JSON.stringify(
                payload
              )
            );
          } catch (cacheError) {
            console.warn(
              "Failed to save sector detail cache:",
              cacheError
            );
          }
        }'''

if "Failed to save sector detail cache" not in detail:
    if old_detail_set not in detail:
        print("خطأ: لم أجد موضع حفظ تفاصيل القطاع.")
        sys.exit(1)
    detail = detail.replace(
        old_detail_set,
        new_detail_set,
        1,
    )

DETAIL.write_text(detail, encoding="utf-8")

print("تم تسريع خريطة القطاعات بنجاح.")
print("- تحميل قطاعين معًا بدل 12 طلبًا متسلسلًا")
print("- كاش خادم أطول وكاش Next لبيانات Massive")
print("- عرض آخر بيانات ناجحة فورًا من ذاكرة المتصفح")
print("- تحديث البيانات في الخلفية دون إخفاء الخريطة")
print("- تسريع صفحة أهم شركات القطاع بالطريقة نفسها")
print(f"النسخة الاحتياطية: {backup_dir}")
print("الخطوة التالية: npm run build")
