"use client";

import type {
  LiveMarketConnectionStatus,
  LiveMarketMessage,
  LiveStockQuote,
} from "./types";

type QuoteListener = (
  quote: LiveStockQuote
) => void;

type StatusListener = (
  status: LiveMarketConnectionStatus
) => void;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CLIENT_PING_MS = 20_000;

function normalizeSymbol(
  value: string
) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function readWebSocketUrl() {
  return String(
    process.env
      .NEXT_PUBLIC_LIVE_MARKET_WS_URL ||
      ""
  ).trim();
}

class LiveMarketClient {
  private socket: WebSocket | null =
    null;

  private reconnectTimer:
    | ReturnType<typeof setTimeout>
    | null = null;

  private pingTimer:
    | ReturnType<typeof setInterval>
    | null = null;

  private reconnectAttempt = 0;

  private manuallyStopped = false;

  private status:
    LiveMarketConnectionStatus =
      "DISCONNECTED";

  private readonly quoteCache =
    new Map<string, LiveStockQuote>();

  private readonly symbolListeners =
    new Map<
      string,
      Set<QuoteListener>
    >();

  private readonly statusListeners =
    new Set<StatusListener>();

  private readonly subscriptionCounts =
    new Map<string, number>();

  getStatus() {
    return this.status;
  }

  getQuote(symbolValue: string) {
    const symbol =
      normalizeSymbol(symbolValue);

    return (
      this.quoteCache.get(symbol) ||
      null
    );
  }

  private setStatus(
    nextStatus:
      LiveMarketConnectionStatus
  ) {
    if (this.status === nextStatus) {
      return;
    }

    this.status = nextStatus;

    for (
      const listener
      of this.statusListeners
    ) {
      listener(nextStatus);
    }
  }

  subscribeToStatus(
    listener: StatusListener
  ) {
    this.statusListeners.add(listener);

    listener(this.status);

    return () => {
      this.statusListeners.delete(
        listener
      );
    };
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);

    this.reconnectTimer = null;
  }

  private stopPing() {
    if (!this.pingTimer) {
      return;
    }

    clearInterval(this.pingTimer);

    this.pingTimer = null;
  }

  private startPing() {
    this.stopPing();

    this.pingTimer =
      setInterval(() => {
        if (
          this.socket?.readyState !==
          WebSocket.OPEN
        ) {
          return;
        }

        this.send({
          type: "ping",
        });
      }, CLIENT_PING_MS);
  }

  private send(
    payload: Record<
      string,
      unknown
    >
  ) {
    if (
      this.socket?.readyState !==
      WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(
      JSON.stringify(payload)
    );

    return true;
  }

  private sendSubscribe(
    symbol: string
  ) {
    this.send({
      type: "subscribe",
      symbol,
    });
  }

  private sendUnsubscribe(
    symbol: string
  ) {
    this.send({
      type: "unsubscribe",
      symbol,
    });
  }

  private resubscribeAll() {
    for (
      const [
        symbol,
        count,
      ]
      of this.subscriptionCounts
    ) {
      if (count > 0) {
        this.sendSubscribe(symbol);
      }
    }
  }

  private processQuote(
    quote: LiveStockQuote
  ) {
    const symbol =
      normalizeSymbol(quote.symbol);

    const price =
      Number(quote.price);

    const timestamp =
      Number(quote.timestamp);

    if (
      !symbol ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(timestamp)
    ) {
      return;
    }

    const previous =
      this.quoteCache.get(symbol);

    if (
      previous &&
      timestamp < previous.timestamp
    ) {
      return;
    }

    const normalizedQuote = {
      ...quote,
      symbol,
      price,
      timestamp,
    };

    this.quoteCache.set(
      symbol,
      normalizedQuote
    );

    const listeners =
      this.symbolListeners.get(symbol);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(normalizedQuote);
    }
  }

  private handleMessage(
    event: MessageEvent<string>
  ) {
    let message: LiveMarketMessage;

    try {
      message = JSON.parse(
        event.data
      ) as LiveMarketMessage;
    } catch {
      return;
    }

    if (
      message.type === "connected"
    ) {
      this.resubscribeAll();
      return;
    }

    if (message.type === "quote") {
      this.processQuote(
        message.data
      );
    }
  }

  private scheduleReconnect() {
    if (
      this.manuallyStopped ||
      this.reconnectTimer ||
      this.subscriptionCounts.size ===
        0
    ) {
      return;
    }

    this.reconnectAttempt += 1;

    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS *
        2 **
          Math.min(
            this.reconnectAttempt - 1,
            5
          )
    );

    this.setStatus(
      "RECONNECTING"
    );

    this.reconnectTimer =
      setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
  }

  connect() {
    if (
      typeof window === "undefined"
    ) {
      return;
    }

    const url =
      readWebSocketUrl();

    if (!url) {
      this.setStatus("DISABLED");
      return;
    }

    if (
      this.socket &&
      (
        this.socket.readyState ===
          WebSocket.OPEN ||
        this.socket.readyState ===
          WebSocket.CONNECTING
      )
    ) {
      return;
    }

    this.manuallyStopped = false;

    this.clearReconnectTimer();

    this.setStatus("CONNECTING");

    const socket =
      new WebSocket(url);

    this.socket = socket;

    socket.addEventListener(
      "open",
      () => {
        if (this.socket !== socket) {
          return;
        }

        this.reconnectAttempt = 0;

        this.setStatus(
          "CONNECTED"
        );

        this.resubscribeAll();
        this.startPing();
      }
    );

    socket.addEventListener(
      "message",
      (event) => {
        if (this.socket !== socket) {
          return;
        }

        this.handleMessage(
          event as MessageEvent<string>
        );
      }
    );

    socket.addEventListener(
      "error",
      () => {
        if (this.socket !== socket) {
          return;
        }

        this.setStatus("ERROR");
      }
    );

    socket.addEventListener(
      "close",
      () => {
        if (this.socket !== socket) {
          return;
        }

        this.socket = null;

        this.stopPing();

        this.setStatus(
          "DISCONNECTED"
        );

        this.scheduleReconnect();
      }
    );
  }

  subscribe(
    symbolValue: string,
    listener: QuoteListener
  ) {
    const symbol =
      normalizeSymbol(symbolValue);

    if (!symbol) {
      return () => {};
    }

    let listeners =
      this.symbolListeners.get(symbol);

    if (!listeners) {
      listeners =
        new Set<QuoteListener>();

      this.symbolListeners.set(
        symbol,
        listeners
      );
    }

    listeners.add(listener);

    const previousCount =
      this.subscriptionCounts.get(
        symbol
      ) || 0;

    this.subscriptionCounts.set(
      symbol,
      previousCount + 1
    );

    const cached =
      this.quoteCache.get(symbol);

    if (cached) {
      listener(cached);
    }

    if (previousCount === 0) {
      if (
        this.socket?.readyState ===
        WebSocket.OPEN
      ) {
        this.sendSubscribe(symbol);
      } else {
        this.connect();
      }
    }

    let active = true;

    return () => {
      if (!active) {
        return;
      }

      active = false;

      const currentListeners =
        this.symbolListeners.get(
          symbol
        );

      currentListeners?.delete(
        listener
      );

      if (
        currentListeners?.size === 0
      ) {
        this.symbolListeners.delete(
          symbol
        );
      }

      const currentCount =
        this.subscriptionCounts.get(
          symbol
        ) || 0;

      const nextCount =
        Math.max(
          0,
          currentCount - 1
        );

      if (nextCount === 0) {
        this.subscriptionCounts.delete(
          symbol
        );

        this.sendUnsubscribe(symbol);
      } else {
        this.subscriptionCounts.set(
          symbol,
          nextCount
        );
      }
    };
  }

  stop() {
    this.manuallyStopped = true;

    this.clearReconnectTimer();
    this.stopPing();

    if (this.socket) {
      const socket =
        this.socket;

      this.socket = null;

      try {
        socket.close(
          1000,
          "Client shutdown"
        );
      } catch {
        // لا نعطل إغلاق الصفحة.
      }
    }

    this.setStatus(
      "DISCONNECTED"
    );
  }
}

declare global {
  interface Window {
    __stLiveMarketClient?:
      LiveMarketClient;
  }
}

function getLiveMarketClient() {
  if (typeof window === "undefined") {
    return null;
  }

  if (
    !window.__stLiveMarketClient
  ) {
    window.__stLiveMarketClient =
      new LiveMarketClient();
  }

  return window.__stLiveMarketClient;
}

export {
  LiveMarketClient,
  getLiveMarketClient,
  normalizeSymbol,
};
