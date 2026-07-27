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
    <span className="inline-flex items-center gap-2">
      <span className={className}>
        ${formatPrice(displayedPrice)}
      </span>

      <span
        className={
          isConnected
            ? "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-300"
            : "rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] font-black text-slate-400"
        }
      >
        {isConnected
          ? "مباشر"
          : "آخر سعر متاح"}
      </span>
    </span>
  );
}
