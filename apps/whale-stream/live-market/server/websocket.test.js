"use strict";

const assert = require("assert");
const http = require("http");
const WebSocket = require("ws");

const {
  setPrice,
  clearPrices,
} = require("../cache/prices");

const {
  createLiveMarketWebSocketServer,
} = require("./websocket");

clearPrices();

const server =
  http.createServer();

const liveServer =
  createLiveMarketWebSocketServer({
    path: "/live-market",
  });

server.on(
  "upgrade",
  (request, socket, head) => {
    const handled =
      liveServer.handleUpgrade(
        request,
        socket,
        head,
      );

    if (!handled) {
      socket.destroy();
    }
  },
);

server.listen(
  0,
  "127.0.0.1",
  () => {
    const address =
      server.address();

    const client =
      new WebSocket(
        `ws://127.0.0.1:${address.port}/live-market`,
      );

    const received = [];

    client.on("message", (raw) => {
      const payload =
        JSON.parse(raw.toString());

      received.push(payload);

      if (
        payload.type === "connected"
      ) {
        client.send(
          JSON.stringify({
            type: "subscribe",
            symbols: [
              "AAPL",
              "NVDA",
            ],
          }),
        );

        return;
      }

      if (
        payload.type === "subscribed" &&
        payload.symbol === "NVDA"
      ) {
        const quote =
          setPrice({
            symbol: "AAPL",
            price: 215.75,
            timestamp: Date.now(),
            source: "finnhub",
          });

        liveServer.broadcastQuote(
          quote,
        );

        return;
      }

      if (payload.type === "quote") {
        assert.strictEqual(
          payload.data.symbol,
          "AAPL",
        );

        assert.strictEqual(
          payload.data.price,
          215.75,
        );

        console.log(
          "✅ خادم بث أسعار الموقع يعمل بنجاح",
        );

        client.close();
        liveServer.stop();

        server.close(() => {
          process.exit(0);
        });
      }
    });

    client.on("error", (error) => {
      console.error(error);
      process.exit(1);
    });
  },
);

setTimeout(() => {
  console.error(
    "❌ انتهت مهلة اختبار خادم البث",
  );

  process.exit(1);
}, 10_000).unref();
