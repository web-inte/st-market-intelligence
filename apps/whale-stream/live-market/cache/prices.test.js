"use strict";

const assert = require("assert");

const {
  setPrice,
  getPrice,
  getPrices,
  getAllPrices,
  clearPrices,
  getPriceCacheStats,
} = require("./prices");

clearPrices();

const first = setPrice({
  symbol: " aapl ",
  price: 210.25,
  volume: 100,
  timestamp: 1_800_000_000_000,
  source: "Finnhub",
});

assert.strictEqual(
  first.symbol,
  "AAPL",
);

assert.strictEqual(
  first.price,
  210.25,
);

const older = setPrice({
  symbol: "AAPL",
  price: 199,
  timestamp: 1_700_000_000_000,
  source: "finnhub",
});

assert.strictEqual(
  older.price,
  210.25,
);

setPrice({
  symbol: "NVDA",
  price: 180.5,
  timestamp: Date.now(),
  source: "finnhub",
});

assert.strictEqual(
  getPrice("nvda").symbol,
  "NVDA",
);

assert.strictEqual(
  getPrices(["AAPL", "NVDA"]).length,
  2,
);

assert.strictEqual(
  getAllPrices().length,
  2,
);

assert.strictEqual(
  getPriceCacheStats().symbols,
  2,
);

console.log(
  "✅ مركز الأسعار اللحظية يعمل بنجاح",
);
