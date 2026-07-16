#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

SECTOR_SYMBOLS = [
    "SPY",
    "XLK", "SOXX", "XLF", "XLE", "XLV", "XLI",
    "XLY", "XLP", "XLC", "XLB", "XLRE", "XLU",
]

COMPANY_SYMBOLS = [
    "AAPL", "MSFT", "NVDA", "AVGO", "AMD", "QCOM", "MU",
    "JPM", "BAC", "GS", "MS", "V", "MA",
    "XOM", "CVX", "COP", "SLB",
    "LLY", "UNH", "JNJ", "ABBV",
    "GE", "CAT", "HON", "BA",
    "AMZN", "TSLA", "HD", "MCD",
    "COST", "WMT", "KO", "PG", "PEP",
    "META", "GOOGL", "NFLX", "CMCSA",
    "LIN", "SHW", "FCX",
    "PLD", "AMT", "O",
    "NEE", "SO", "DUK",
]

ALL_SYMBOLS = sorted(set(SECTOR_SYMBOLS + COMPANY_SYMBOLS))


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def required_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value

    raise RuntimeError(
        "متغير مفقود: " + " أو ".join(names)
    )


def request_json(
    url: str,
    headers: dict[str, str] | None = None,
    timeout: int = 45,
):
    request = Request(
        url,
        headers=headers or {},
    )

    with urlopen(
        request,
        timeout=timeout,
    ) as response:
        payload = response.read().decode("utf-8")
        return json.loads(payload)


def fetch_massive_bars(
    symbol: str,
    api_key: str,
):
    end_date = datetime.now(
        timezone.utc
    ).date()

    start_date = (
        end_date - timedelta(days=75)
    )

    url = (
        "https://api.massive.com/v2/aggs/ticker/"
        + quote(symbol, safe="")
        + "/range/1/day/"
        + start_date.isoformat()
        + "/"
        + end_date.isoformat()
        + "?"
        + urlencode(
            {
                "adjusted": "true",
                "sort": "asc",
                "limit": "120",
                "apiKey": api_key,
            }
        )
    )

    payload = request_json(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    bars = []

    for item in payload.get("results", []):
        close = float(item.get("c") or 0)
        timestamp = int(item.get("t") or 0)

        if close <= 0 or timestamp <= 0:
            continue

        bars.append(
            {
                "c": close,
                "v": float(item.get("v") or 0),
                "t": timestamp,
            }
        )

    if len(bars) < 6:
        raise RuntimeError(
            f"جلسات غير كافية للرمز {symbol}"
        )

    return bars


def upsert_supabase(
    supabase_url: str,
    service_key: str,
    symbol: str,
    bars,
):
    endpoint = (
        supabase_url.rstrip("/")
        + "/rest/v1/market_sector_bars_cache"
        + "?on_conflict=symbol"
    )

    body = json.dumps(
        [
            {
                "symbol": symbol,
                "bars": bars,
                "source": "massive_individual",
                "updated_at": datetime.now(
                    timezone.utc
                ).isoformat(),
            }
        ]
    ).encode("utf-8")

    request = Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )

    with urlopen(
        request,
        timeout=45,
    ) as response:
        response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--core",
        action="store_true",
        help="تحديث SPY والقطاعات فقط",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=13.5,
        help="الانتظار بين طلبات Massive",
    )
    args = parser.parse_args()

    root = Path.cwd()
    load_env_file(root / ".env.local")
    load_env_file(root / ".env")

    massive_key = required_env(
        "MASSIVE_API_KEY"
    )

    supabase_url = required_env(
        "SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
    )

    service_key = required_env(
        "SUPABASE_SECRET_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
    )

    symbols = (
        SECTOR_SYMBOLS
        if args.core
        else ALL_SYMBOLS
    )

    print(
        f"سيتم تحديث {len(symbols)} رمزًا."
    )
    print(
        f"المدة التقريبية: {round(len(symbols) * args.delay / 60, 1)} دقيقة."
    )
    print(
        "لا تغلق الطرفية حتى تظهر رسالة الاكتمال."
    )

    successes = 0
    failures: list[tuple[str, str]] = []

    for index, symbol in enumerate(symbols, start=1):
        print(
            f"[{index}/{len(symbols)}] تحديث {symbol}..."
        )

        attempt = 0

        while True:
            attempt += 1

            try:
                bars = fetch_massive_bars(
                    symbol,
                    massive_key,
                )

                upsert_supabase(
                    supabase_url,
                    service_key,
                    symbol,
                    bars,
                )

                successes += 1
                print(
                    f"✅ {symbol}: تم حفظ {len(bars)} جلسة"
                )
                break

            except HTTPError as error:
                details = error.read().decode(
                    "utf-8",
                    errors="replace",
                )

                if error.code == 429 and attempt <= 4:
                    print(
                        "⏳ وصلنا لحد Massive؛ انتظار 65 ثانية ثم إعادة المحاولة."
                    )
                    time.sleep(65)
                    continue

                failures.append(
                    (
                        symbol,
                        f"HTTP {error.code}: {details[:240]}",
                    )
                )
                print(
                    f"❌ {symbol}: HTTP {error.code}"
                )
                break

            except (URLError, TimeoutError, RuntimeError) as error:
                if attempt <= 3:
                    print(
                        f"⏳ إعادة محاولة {symbol}: {error}"
                    )
                    time.sleep(20)
                    continue

                failures.append(
                    (
                        symbol,
                        str(error),
                    )
                )
                print(
                    f"❌ {symbol}: {error}"
                )
                break

        if index < len(symbols):
            time.sleep(
                max(args.delay, 12.5)
            )

    print()
    print(
        f"اكتمل التحديث: {successes} ناجح، {len(failures)} فاشل."
    )

    if failures:
        print("الرموز الفاشلة:")
        for symbol, error in failures:
            print(
                f"- {symbol}: {error}"
            )
        sys.exit(1)


if __name__ == "__main__":
    main()
