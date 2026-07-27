const assert =
  require("node:assert/strict");

const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(
    __dirname,
    "index.ts"
  ),
  "utf8"
);

assert.match(
  source,
  /MARKET_NEWS_SYMBOLS/
);

assert.match(
  source,
  /classifyMarketNews/
);

assert.match(
  source,
  /createMarketNewsExternalId/
);

const symbolMatches =
  source.match(
    /^\s{2}"[A-Z0-9.]+",$/gm
  ) || [];

assert.equal(
  symbolMatches.length,
  117
);

console.log(
  "✅ ملف أخبار السوق يحتوي 117 رمزًا وأدوات التصنيف"
);
