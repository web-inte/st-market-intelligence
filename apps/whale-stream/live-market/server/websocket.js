"use strict";

const WebSocket = require("ws");

const {
  normalizeSymbol,
  getPrice,
} = require("../cache/prices");

function createLiveMarketWebSocketServer(options = {}) {
  const path =
    String(options.path || "/live-market");

  const allowedOrigins =
    new Set(
      String(
        options.allowedOrigins ||
          process.env.LIVE_MARKET_ALLOWED_ORIGINS ||
          "",
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );

  const heartbeatMs =
    Math.max(
      10_000,
      Number(
        options.heartbeatMs ||
          process.env.LIVE_MARKET_CLIENT_HEARTBEAT_MS ||
          30_000,
      ),
    );

  const onSymbolSubscribe =
    typeof options.onSymbolSubscribe === "function"
      ? options.onSymbolSubscribe
      : () => {};

  const onSymbolUnsubscribe =
    typeof options.onSymbolUnsubscribe === "function"
      ? options.onSymbolUnsubscribe
      : () => {};

  const wss =
    new WebSocket.Server({
      noServer: true,
      perMessageDeflate: false,
    });

  const clientSubscriptions =
    new Map();

  let heartbeatTimer = null;

  const metrics = {
    connectedClients: 0,
    messagesReceived: 0,
    messagesSent: 0,
    subscriptions: 0,
    lastClientConnectedAt: null,
    lastBroadcastAt: null,
  };

  function sendJson(socket, payload) {
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    socket.send(
      JSON.stringify(payload),
    );

    metrics.messagesSent += 1;

    return true;
  }

  function isAllowedOrigin(request) {
    if (allowedOrigins.size === 0) {
      return true;
    }

    const origin =
      String(
        request.headers.origin || "",
      ).trim();

    return allowedOrigins.has(origin);
  }

  function getClientSymbols(socket) {
    if (!clientSubscriptions.has(socket)) {
      clientSubscriptions.set(
        socket,
        new Set(),
      );
    }

    return clientSubscriptions.get(socket);
  }

  function subscribe(socket, symbolValue) {
    const symbol =
      normalizeSymbol(symbolValue);

    if (!symbol) {
      return;
    }

    const symbols =
      getClientSymbols(socket);

    const alreadySubscribed =
      symbols.has(symbol);

    symbols.add(symbol);

    if (!alreadySubscribed) {
      onSymbolSubscribe(symbol);
    }

    metrics.subscriptions =
      Array.from(
        clientSubscriptions.values(),
      ).reduce(
        (total, set) =>
          total + set.size,
        0,
      );

    sendJson(socket, {
      type: "subscribed",
      symbol,
    });

    const existing =
      getPrice(symbol);

    if (existing) {
      sendJson(socket, {
        type: "quote",
        data: existing,
      });
    }
  }

  function unsubscribe(socket, symbolValue) {
    const symbol =
      normalizeSymbol(symbolValue);

    if (!symbol) {
      return;
    }

    const symbols =
      getClientSymbols(socket);

    const wasSubscribed =
      symbols.delete(symbol);

    if (wasSubscribed) {
      onSymbolUnsubscribe(symbol);
    }

    metrics.subscriptions =
      Array.from(
        clientSubscriptions.values(),
      ).reduce(
        (total, set) =>
          total + set.size,
        0,
      );

    sendJson(socket, {
      type: "unsubscribed",
      symbol,
    });
  }

  function handleClientMessage(socket, rawData) {
    metrics.messagesReceived += 1;

    let payload;

    try {
      payload =
        JSON.parse(
          rawData.toString(),
        );
    } catch {
      sendJson(socket, {
        type: "error",
        error: "INVALID_JSON",
      });

      return;
    }

    if (payload?.type === "subscribe") {
      const symbols =
        Array.isArray(payload.symbols)
          ? payload.symbols
          : [payload.symbol];

      for (const symbol of symbols) {
        subscribe(socket, symbol);
      }

      return;
    }

    if (payload?.type === "unsubscribe") {
      const symbols =
        Array.isArray(payload.symbols)
          ? payload.symbols
          : [payload.symbol];

      for (const symbol of symbols) {
        unsubscribe(socket, symbol);
      }

      return;
    }

    if (payload?.type === "ping") {
      sendJson(socket, {
        type: "pong",
        timestamp: Date.now(),
      });

      return;
    }

    sendJson(socket, {
      type: "error",
      error: "UNKNOWN_MESSAGE_TYPE",
    });
  }

  function handleUpgrade(request, socket, head) {
    let pathname;

    try {
      pathname =
        new URL(
          request.url,
          "http://localhost",
        ).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== path) {
      return false;
    }

    if (!isAllowedOrigin(request)) {
      socket.write(
        "HTTP/1.1 403 Forbidden\r\n\r\n",
      );
      socket.destroy();
      return true;
    }

    wss.handleUpgrade(
      request,
      socket,
      head,
      (websocket) => {
        wss.emit(
          "connection",
          websocket,
          request,
        );
      },
    );

    return true;
  }

  function broadcastQuote(quote) {
    const symbol =
      normalizeSymbol(quote?.symbol);

    if (!symbol) {
      return 0;
    }

    let delivered = 0;

    for (
      const [socket, symbols]
      of clientSubscriptions.entries()
    ) {
      if (!symbols.has(symbol)) {
        continue;
      }

      if (
        sendJson(socket, {
          type: "quote",
          data: quote,
        })
      ) {
        delivered += 1;
      }
    }

    metrics.lastBroadcastAt =
      new Date().toISOString();

    return delivered;
  }

  wss.on("connection", (socket) => {
    socket.isAlive = true;

    clientSubscriptions.set(
      socket,
      new Set(),
    );

    metrics.connectedClients =
      wss.clients.size;

    metrics.lastClientConnectedAt =
      new Date().toISOString();

    sendJson(socket, {
      type: "connected",
      service: "st-market-live",
      timestamp: Date.now(),
    });

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (data) => {
      handleClientMessage(
        socket,
        data,
      );
    });

    socket.on("close", () => {
      const symbols =
        clientSubscriptions.get(socket);

      if (symbols) {
        for (const symbol of symbols) {
          onSymbolUnsubscribe(symbol);
        }
      }

      clientSubscriptions.delete(
        socket,
      );

      metrics.connectedClients =
        wss.clients.size;

      metrics.subscriptions =
        Array.from(
          clientSubscriptions.values(),
        ).reduce(
          (total, set) =>
            total + set.size,
          0,
        );
    });
  });

  function startHeartbeat() {
    if (heartbeatTimer) {
      return;
    }

    heartbeatTimer =
      setInterval(() => {
        for (const socket of wss.clients) {
          if (socket.isAlive === false) {
            socket.terminate();
            continue;
          }

          socket.isAlive = false;

          try {
            socket.ping();
          } catch {
            socket.terminate();
          }
        }
      }, heartbeatMs);

    heartbeatTimer.unref?.();
  }

  function stop() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    for (const socket of wss.clients) {
      socket.close(
        1000,
        "Service shutdown",
      );
    }

    clientSubscriptions.clear();

    wss.close();
  }

  function getStatus() {
    return {
      path,
      ...metrics,
      connectedClients:
        wss.clients.size,
    };
  }

  startHeartbeat();

  return {
    handleUpgrade,
    broadcastQuote,
    getStatus,
    stop,
  };
}

module.exports = {
  createLiveMarketWebSocketServer,
};
