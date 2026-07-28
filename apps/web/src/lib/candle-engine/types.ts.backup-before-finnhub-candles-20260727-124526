export type MinuteBar = {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SupportedInterval = 5 | 15 | 30 | 60 | 240 | 1440;

export type CandleEngineResult = {
  symbol: string;
  interval: SupportedInterval;
  session: "regular";
  timezone: "America/New_York";
  candles: Candle[];
  sourceBars: number;
  source: "massive-1-minute" | "massive-1-day";
  cached: boolean;
  updatedAt: string;
};

export type MassiveRawBar = {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
};

export type MassiveAggsPayload = {
  results?: MassiveRawBar[];
  next_url?: string;
  error?: string;
  message?: string;
};

export type GetCandlesParams = {
  symbol: string;
  interval: SupportedInterval;
  apiKey: string;
};
