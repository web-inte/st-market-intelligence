"use strict";

const WebSocket = require("ws");

const {
  normalizeSymbol,
} = require("../cache/prices");

function createFinnhubProvider(options = {}) {
  const apiKey =
    String(
      options.apiKey ||
        process.env.FINNHUB_API_KEY ||
        "",
    ).trim();

  if (!apiKey) {
    throw new Error(
      "FINNHUB_API_KEY غير موجود",
    );
  }

  const websocketUrl =
    String(
      options.websocketUrl ||
        process.env.FINNHUB_WS_URL ||
        "wss://ws.finnhub.io",
    ).trim();

  const reconnectBaseMs =
    Math.max(
      1_000,
      Number(
        options.reconnectBaseMs ||
          process.env.FINNHUB_RECONNECT_BASE_MS ||
          2_000,
      ),
    );

  const reconnectMaxMs =
    Math.max(
      reconnectBaseMs,
      Number(
        options.reconnectMaxMs ||
          process.env.FINNHUB_RECONNECT_MAX_MS ||
          30_000,
      ),
    );

  const heartbeatMs =
    Math.max(
      10_000,
      Number(
        options.heartbeatMs ||
          process.env.FINNHUB_HEARTBEAT_MS ||
          30_000,
      ),
    );

  const onTrade =
    typeof options.onTrade === "function"
      ? options.onTrade
      : () => {};

  const onStatus =
    typeof options.onStatus === "function"
      ? options.onStatus
      : () => {};

  const onError =
    typeof options.onError === "function"
      ? options.onError
      : () => {};

  const subscriptions = new Set();

  let socket = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let reconnectAttempt = 0;
  let stopped = false;

  const metrics = {
    connected: false,
    reconnectAttempt: 0,
    messagesReceived: 0,
    tradesReceived: 0,
    lastConnectedAt: null,
    lastMessageAt: null,
    lastTradeAt: null,
    lastError: null,
  };

  function emitStatus(status, extra = {}) {
    onStatus({
      provider: "finnhub",
      status,
      timestamp: Date.now(),
      subscriptions:
        Array.from(subscriptions),
      metrics: {
        ...metrics,
      },
      ...extra,
    });
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function send(payload) {
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    socket.send(
      JSON.stringify(payload),
    );

    return true;
  }

  function subscribe(symbolValue) {
    const symbol =
      normalizeSymbol(symbolValue);

    if (!symbol) {
      return false;
    }

    subscriptions.add(symbol);

    if (
      socket &&
      socket.readyState === WebSocket.OPEN
    ) {
      send({
        type: "subscribe",
        symbol,
      });
    }

    return true;
  }

  function unsubscribe(symbolValue) {
    const symbol =
      normalizeSymbol(symbolValue);

    if (!symbol) {
      return false;
    }

    subscriptions.delete(symbol);

    if (
      socket &&
      socket.readyState === WebSocket.OPEN
    ) {
      send({
        type: "unsubscribe",
        symbol,
      });
    }

    return true;
  }

  function resubscribeAll() {
    for (const symbol of subscriptions) {
      send({
        type: "subscribe",
        symbol,
      });
    }
  }

  function processTrade(rawTrade) {
    const symbol =
      normalizeSymbol(rawTrade?.s);

    const price =
      Number(rawTrade?.p);

    const volume =
      Number(rawTrade?.v);

    const timestamp =
      Number(rawTrade?.t);

    if (
      !symbol ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(timestamp)
    ) {
      return;
    }

    metrics.tradesReceived += 1;
    metrics.lastTradeAt =
      new Date().toISOString();

    onTrade({
      symbol,
      price,
      volume:
        Number.isFinite(volume)
          ? volume
          : null,
      timestamp,
      conditions:
        Array.isArray(rawTrade?.c)
          ? rawTrade.c
          : [],
      source: "finnhub",
    });
  }

  function handleMessage(rawData) {
    metrics.messagesReceived += 1;
    metrics.lastMessageAt =
      new Date().toISOString();

    let payload;

    try {
      payload =
        JSON.parse(
          rawData.toString(),
        );
    } catch (error) {
      metrics.lastError =
        "رسالة Finnhub غير صالحة";

      onError(
        new Error(
          "رسالة Finnhub غير صالحة",
        ),
      );

      return;
    }

    if (
      payload?.type === "trade" &&
      Array.isArray(payload?.data)
    ) {
      for (const trade of payload.data) {
        processTrade(trade);
      }

      return;
    }

    if (payload?.type === "error") {
      const message =
        String(
          payload?.msg ||
            "Finnhub WebSocket error",
        );

      metrics.lastError = message;

      onError(
        new Error(message),
      );
    }
  }

  function scheduleReconnect() {
    if (
      stopped ||
      reconnectTimer
    ) {
      return;
    }

    reconnectAttempt += 1;
    metrics.reconnectAttempt =
      reconnectAttempt;

    const delay =
      Math.min(
        reconnectMaxMs,
        reconnectBaseMs *
          2 **
            Math.min(
              reconnectAttempt - 1,
              6,
            ),
      );

    emitStatus(
      "RECONNECT_SCHEDULED",
      {
        reconnectInMs: delay,
      },
    );

    reconnectTimer =
      setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);

    reconnectTimer.unref?.();
  }

  function startHeartbeat() {
    clearHeartbeatTimer();

    heartbeatTimer =
      setInterval(() => {
        if (
          !socket ||
          socket.readyState !==
            WebSocket.OPEN
        ) {
          return;
        }

        /*
          ws يدعم ping على مستوى البروتوكول.
          الهدف اكتشاف الاتصال الميت مبكرًا.
        */
        try {
          socket.ping();
        } catch (error) {
          metrics.lastError =
            error instanceof Error
              ? error.message
              : String(error);

          onError(error);
        }
      }, heartbeatMs);

    heartbeatTimer.unref?.();
  }

  function connect() {
    if (stopped) {
      return;
    }

    if (
      socket &&
      (
        socket.readyState ===
          WebSocket.OPEN ||
        socket.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return;
    }

    clearReconnectTimer();

    const url =
      `${websocketUrl}?token=${encodeURIComponent(
        apiKey,
      )}`;

    emitStatus("CONNECTING");

    socket =
      new WebSocket(url, {
        perMessageDeflate: false,
        handshakeTimeout: 15_000,
      });

    socket.on("open", () => {
      reconnectAttempt = 0;

      metrics.connected = true;
      metrics.reconnectAttempt = 0;
      metrics.lastConnectedAt =
        new Date().toISOString();
      metrics.lastError = null;

      emitStatus("CONNECTED");

      resubscribeAll();
      startHeartbeat();
    });

    socket.on(
      "message",
      handleMessage,
    );

    socket.on("error", (error) => {
      metrics.connected = false;
      metrics.lastError =
        error instanceof Error
          ? error.message
          : String(error);

      onError(error);
    });

    socket.on(
      "close",
      (code, reasonBuffer) => {
        metrics.connected = false;

        clearHeartbeatTimer();

        const reason =
          reasonBuffer?.toString?.() ||
          "";

        emitStatus("DISCONNECTED", {
          closeCode: code,
          closeReason: reason,
        });

        socket = null;

        scheduleReconnect();
      },
    );
  }

  function stop() {
    stopped = true;

    clearReconnectTimer();
    clearHeartbeatTimer();

    if (socket) {
      try {
        socket.removeAllListeners();

        if (
          socket.readyState ===
            WebSocket.OPEN ||
          socket.readyState ===
            WebSocket.CONNECTING
        ) {
          socket.close(
            1000,
            "Service shutdown",
          );
        }
      } catch {
        // الإيقاف يجب ألا يعطل إغلاق الخدمة.
      }
    }

    socket = null;
    metrics.connected = false;

    emitStatus("STOPPED");
  }

  function start() {
    stopped = false;
    connect();
  }

  function getStatus() {
    return {
      provider: "finnhub",
      connected:
        metrics.connected,
      subscriptions:
        Array.from(
          subscriptions,
        ).sort(),
      metrics: {
        ...metrics,
      },
    };
  }

  return {
    start,
    stop,
    subscribe,
    unsubscribe,
    getStatus,
  };
}

module.exports = {
  createFinnhubProvider,
};
