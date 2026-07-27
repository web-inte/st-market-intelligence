"use client";

import {
  useLiveStockPrice,
} from "../../../lib/live-market";

type LiveStockPriceProps = {
  symbol: string;
  fallbackPrice: number;
  className?: string;
};

function formatPrice(value: number) {
  return Number(value || 0).toFixed(2);
}

export default function LiveStockPrice({
  symbol,
  fallbackPrice,
  className,
}: LiveStockPriceProps) {
  const {
    price,
    connectionStatus,
  } =
    useLiveStockPrice(symbol);

  const displayedPrice =
    price ?? fallbackPrice;

  const isConnected =
    connectionStatus ===
    "CONNECTED";

  return (
    <span
      className={className}
      title={
        isConnected
          ? "سعر لحظي من Finnhub"
          : "آخر سعر متاح"
      }
    >
      ${formatPrice(displayedPrice)}
    </span>
  );
}
