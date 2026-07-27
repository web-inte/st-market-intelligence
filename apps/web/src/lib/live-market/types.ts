export type LivePriceStatus =
  | "LIVE"
  | "STALE";

export type LiveStockQuote = {
  symbol: string;
  price: number;
  volume: number | null;
  timestamp: number;
  receivedAt: number;
  source: string;
  sequence: number;
  ageMs?: number;
  status?: LivePriceStatus;
};

export type LiveMarketConnectionStatus =
  | "DISABLED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "ERROR";

export type LiveMarketMessage =
  | {
      type: "connected";
      service: string;
      timestamp: number;
    }
  | {
      type: "subscribed";
      symbol: string;
    }
  | {
      type: "unsubscribed";
      symbol: string;
    }
  | {
      type: "quote";
      data: LiveStockQuote;
    }
  | {
      type: "pong";
      timestamp: number;
    }
  | {
      type: "error";
      error: string;
    };
