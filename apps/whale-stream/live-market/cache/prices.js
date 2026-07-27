"use strict";

/*
  مركز أسعار الأسهم اللحظية داخل الذاكرة.

  هذا الملف مستقل تمامًا عن:
  - Massive WebSocket
  - صفقات الحيتان
  - الأوبشن
  - SPX
  - قاعدة البيانات
*/

const prices = new Map();

const DEFAULT_STALE_AFTER_MS = Number(
  process.env.LIVE_PRICE_STALE_AFTER_MS ||
    15_000,
);

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function safeFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) {
    return Date.now();
  }

  // بعض المزودين يرسلون الوقت بالثواني.
  if (timestamp > 0 && timestamp < 10_000_000_000) {
    return timestamp * 1000;
  }

  return timestamp;
}

function setPrice(input) {
  const symbol = normalizeSymbol(
    input?.symbol,
  );

  const price = safeFiniteNumber(
    input?.price,
  );

  if (!symbol) {
    throw new Error(
      "رمز السهم مطلوب لحفظ السعر",
    );
  }

  if (price === null || price <= 0) {
    throw new Error(
      `سعر غير صالح للرمز ${symbol}`,
    );
  }

  const previous =
    prices.get(symbol) || null;

  const timestamp =
    normalizeTimestamp(
      input?.timestamp,
    );

  /*
    لا نسمح لتحديث قديم أن يستبدل
    تحديثًا أحدث وصل مسبقًا.
  */
  if (
    previous &&
    timestamp < previous.timestamp
  ) {
    return previous;
  }

  const quote = {
    symbol,
    price,
    volume:
      safeFiniteNumber(input?.volume),
    timestamp,
    receivedAt: Date.now(),
    source:
      String(
        input?.source || "unknown",
      ).toLowerCase(),
    sequence:
      (previous?.sequence || 0) + 1,
  };

  prices.set(symbol, quote);

  return quote;
}

function getPrice(symbolValue, options = {}) {
  const symbol =
    normalizeSymbol(symbolValue);

  if (!symbol) {
    return null;
  }

  const quote =
    prices.get(symbol) || null;

  if (!quote) {
    return null;
  }

  const staleAfterMs =
    Number.isFinite(
      Number(options.staleAfterMs),
    )
      ? Math.max(
          0,
          Number(options.staleAfterMs),
        )
      : DEFAULT_STALE_AFTER_MS;

  const ageMs =
    Math.max(
      0,
      Date.now() - quote.receivedAt,
    );

  return {
    ...quote,
    ageMs,
    status:
      ageMs <= staleAfterMs
        ? "LIVE"
        : "STALE",
  };
}

function getPrices(symbolValues, options = {}) {
  const symbols =
    Array.isArray(symbolValues)
      ? symbolValues
      : [];

  return symbols
    .map((symbol) =>
      getPrice(symbol, options),
    )
    .filter(Boolean);
}

function getAllPrices(options = {}) {
  return Array.from(prices.keys())
    .sort()
    .map((symbol) =>
      getPrice(symbol, options),
    )
    .filter(Boolean);
}

function removePrice(symbolValue) {
  const symbol =
    normalizeSymbol(symbolValue);

  return symbol
    ? prices.delete(symbol)
    : false;
}

function clearPrices() {
  prices.clear();
}

function getPriceCacheStats() {
  const all =
    getAllPrices();

  return {
    symbols: all.length,
    live: all.filter(
      (quote) =>
        quote.status === "LIVE",
    ).length,
    stale: all.filter(
      (quote) =>
        quote.status === "STALE",
    ).length,
    lastReceivedAt:
      all.reduce(
        (latest, quote) =>
          Math.max(
            latest,
            quote.receivedAt,
          ),
        0,
      ) || null,
  };
}

module.exports = {
  normalizeSymbol,
  setPrice,
  getPrice,
  getPrices,
  getAllPrices,
  removePrice,
  clearPrices,
  getPriceCacheStats,
};
