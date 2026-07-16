#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

CORE = [
    "SPY","XLK","SOXX","XLF","XLE","XLV","XLI",
    "XLY","XLP","XLC","XLB","XLRE","XLU",
]
COMPANIES = [
    "AAPL","MSFT","NVDA","AVGO","AMD","QCOM","MU",
    "JPM","BAC","GS","MS","V","MA",
    "XOM","CVX","COP","SLB",
    "LLY","UNH","JNJ","ABBV",
    "GE","CAT","HON","BA",
    "AMZN","TSLA","HD","MCD",
    "COST","WMT","KO","PG","PEP",
    "META","GOOGL","NFLX","CMCSA",
    "LIN","SHW","FCX",
    "PLD","AMT","O",
    "NEE","SO","DUK",
]
ALL = sorted(set(CORE + COMPANIES))
CORE_SET = set(CORE)
NY = ZoneInfo("America/New_York")
STOP = False


def log(message: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{stamp}] {message}", flush=True)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    raise RuntimeError("متغير مفقود: " + " أو ".join(names))


def config() -> dict:
    root = Path.cwd()
    for path in (
        root / ".env.local",
        root / ".env",
        root.parent / ".env.local",
        root.parent / ".env",
    ):
        load_env(path)
    return {
        "massive": env("MASSIVE_API_KEY"),
        "supabase": env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
        "service": env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
        "gap": float(os.environ.get("MASSIVE_MIN_GAP_SECONDS", "13.8")),
        "core_interval": int(os.environ.get("CORE_INTERVAL_SECONDS", "300")),
        "company_interval": int(os.environ.get("COMPANY_INTERVAL_SECONDS", "1800")),
        "closed_interval": int(os.environ.get("CLOSED_INTERVAL_SECONDS", "21600")),
        "lookback": int(os.environ.get("SECTOR_LOOKBACK_DAYS", "75")),
    }


def request_json(url, *, headers=None, method="GET", body=None, timeout=45):
    req = Request(url, data=body, method=method, headers=headers or {})
    with urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else None


def parse_dt(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def cache_meta(cfg):
    url = (
        cfg["supabase"].rstrip("/")
        + "/rest/v1/market_sector_bars_cache?"
        + urlencode({"select": "symbol,updated_at", "order": "symbol.asc"})
    )
    rows = request_json(
        url,
        headers={
            "apikey": cfg["service"],
            "Authorization": f"Bearer {cfg['service']}",
            "Accept": "application/json",
        },
    ) or []
    result = {}
    for row in rows:
        symbol = str(row.get("symbol") or "").upper()
        updated = parse_dt(row.get("updated_at"))
        if symbol and updated:
            result[symbol] = updated
    return result


def fetch_bars(symbol, cfg):
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=cfg["lookback"])
    url = (
        "https://api.massive.com/v2/aggs/ticker/"
        + quote(symbol, safe="")
        + "/range/1/day/"
        + start_date.isoformat()
        + "/"
        + end_date.isoformat()
        + "?"
        + urlencode({
            "adjusted": "true",
            "sort": "asc",
            "limit": "120",
            "apiKey": cfg["massive"],
        })
    )
    payload = request_json(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {cfg['massive']}",
        },
    ) or {}
    bars = []
    for item in payload.get("results", []):
        close = float(item.get("c") or 0)
        timestamp = int(item.get("t") or 0)
        if close > 0 and timestamp > 0:
            bars.append({
                "c": close,
                "v": float(item.get("v") or 0),
                "t": timestamp,
            })
    if len(bars) < 6:
        raise RuntimeError(f"جلسات غير كافية للرمز {symbol}")
    return bars


def upsert(symbol, bars, cfg):
    url = (
        cfg["supabase"].rstrip("/")
        + "/rest/v1/market_sector_bars_cache?on_conflict=symbol"
    )
    body = json.dumps([{
        "symbol": symbol,
        "bars": bars,
        "source": "massive_individual_live_worker",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }]).encode("utf-8")
    request_json(
        url,
        method="POST",
        body=body,
        headers={
            "apikey": cfg["service"],
            "Authorization": f"Bearer {cfg['service']}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )


def market_open():
    now = datetime.now(timezone.utc).astimezone(NY)
    if now.weekday() >= 5:
        return False
    minute = now.hour * 60 + now.minute
    return 9 * 60 + 25 <= minute <= 16 * 60 + 15


def interval(symbol, cfg, active):
    if not active:
        return cfg["closed_interval"]
    return cfg["core_interval"] if symbol in CORE_SET else cfg["company_interval"]


def update(symbol, cfg):
    for attempt in range(1, 5):
        try:
            bars = fetch_bars(symbol, cfg)
            upsert(symbol, bars, cfg)
            log(f"✅ {symbol}: تم حفظ {len(bars)} جلسة")
            return True
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            if error.code == 429 and attempt < 4:
                log(f"⏳ {symbol}: حد Massive؛ انتظار 65 ثانية")
                time.sleep(65)
                continue
            log(f"❌ {symbol}: HTTP {error.code} - {details[:180]}")
            return False
        except (URLError, TimeoutError, RuntimeError) as error:
            if attempt < 4:
                log(f"⏳ {symbol}: إعادة المحاولة بعد 20 ثانية - {error}")
                time.sleep(20)
                continue
            log(f"❌ {symbol}: {error}")
            return False
        except Exception as error:
            log(f"❌ {symbol}: {error}")
            return False
    return False


def bootstrap(cfg, all_symbols=False):
    meta = cache_meta(cfg)
    symbols = ALL if all_symbols else [s for s in ALL if s not in meta]
    symbols = sorted(symbols, key=lambda s: (0 if s in CORE_SET else 1, s))
    if not symbols:
        log("جميع القطاعات والشركات موجودة في Supabase.")
        return 0
    log(f"بدء تجهيز {len(symbols)} رمزًا.")
    failed = 0
    for index, symbol in enumerate(symbols, 1):
        if STOP:
            break
        log(f"[{index}/{len(symbols)}] تحديث {symbol}")
        if not update(symbol, cfg):
            failed += 1
        if index < len(symbols):
            time.sleep(cfg["gap"])
    log(f"اكتمل التجهيز: {len(symbols)-failed} ناجح، {failed} فاشل.")
    return 1 if failed else 0


def run(cfg):
    meta = cache_meta(cfg)
    last_request = 0.0
    last_mode = None
    log(
        f"بدأ العامل: القطاعات كل {cfg['core_interval']//60} دقائق، "
        f"الشركات كل {cfg['company_interval']//60} دقيقة."
    )
    while not STOP:
        active = market_open()
        if active != last_mode:
            log("حالة الجلسة: " + ("السوق نشط" if active else "خارج الجلسة"))
            last_mode = active

        now = datetime.now(timezone.utc)
        ranked = []
        for symbol in ALL:
            last = meta.get(symbol)
            due = (
                datetime(1970, 1, 1, tzinfo=timezone.utc)
                if last is None
                else last + timedelta(seconds=interval(symbol, cfg, active))
            )
            ranked.append((due, 0 if symbol in CORE_SET else 1, symbol))
        ranked.sort()

        due, _, symbol = ranked[0]
        if due > now:
            time.sleep(max(1.0, min(10.0, (due - now).total_seconds())))
            continue

        remaining = cfg["gap"] - (time.monotonic() - last_request)
        if remaining > 0:
            time.sleep(remaining)

        ok = update(symbol, cfg)
        last_request = time.monotonic()
        if ok:
            meta[symbol] = datetime.now(timezone.utc)
        else:
            meta[symbol] = datetime.now(timezone.utc) - timedelta(
                seconds=max(0, interval(symbol, cfg, active) - 120)
            )

    log("تم إيقاف العامل بأمان.")
    return 0


def stop_handler(signum, _frame):
    global STOP
    STOP = True
    log(f"استلام إشارة الإيقاف {signum}.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap-missing", action="store_true")
    parser.add_argument("--bootstrap-all", action="store_true")
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)

    try:
        cfg = config()
        if args.bootstrap_missing:
            return bootstrap(cfg)
        if args.bootstrap_all:
            return bootstrap(cfg, all_symbols=True)
        return run(cfg)
    except Exception as error:
        log(f"❌ تعذر تشغيل العامل: {error}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
