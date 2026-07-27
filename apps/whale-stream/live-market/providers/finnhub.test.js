"use strict";

require("dotenv").config();

const {
  setPrice,
  getAllPrices,
  clearPrices,
} = require("../cache/prices");

const {
  createFinnhubProvider,
} = require("./finnhub");

clearPrices();

const symbols = [
  "AAPL",
  "NVDA",
];

let receivedTrades = 0;

const provider =
  createFinnhubProvider({
    onTrade(trade) {
      receivedTrades += 1;

      const quote =
        setPrice(trade);

      console.log(
        `📈 ${quote.symbol} ${quote.price} @ ${new Date(
          quote.timestamp,
        ).toISOString()}`,
      );
    },

    onStatus(event) {
      console.log(
        `ℹ️ Finnhub: ${event.status}`,
      );
    },

    onError(error) {
      console.error(
        "❌ Finnhub:",
        error.message,
      );
    },
  });

for (const symbol of symbols) {
  provider.subscribe(symbol);
}

provider.start();

const testDurationMs =
  Number(
    process.env.FINNHUB_TEST_DURATION_MS ||
      20_000,
  );

setTimeout(() => {
  console.log(
    "===== نتيجة الاختبار =====",
  );

  console.log(
    JSON.stringify(
      {
        receivedTrades,
        provider:
          provider.getStatus(),
        prices:
          getAllPrices(),
      },
      null,
      2,
    ),
  );

  provider.stop();

  /*
    خارج ساعات السوق قد لا تصل تداولات،
    لذلك نجاح الاتصال والاشتراك كافٍ
    في هذا الاختبار الأول.
  */
  if (
    provider
      .getStatus()
      .subscriptions.length !==
    symbols.length
  ) {
    process.exitCode = 1;
  }

  setTimeout(
    () => process.exit(),
    250,
  );
}, testDurationMs);
