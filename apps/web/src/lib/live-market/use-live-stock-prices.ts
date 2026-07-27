"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getLiveMarketClient,
  normalizeSymbol,
} from "./client";

import type {
  LiveMarketConnectionStatus,
  LiveStockQuote,
} from "./types";

export function useLiveStockPrice(
  symbolValue: string
) {
  const symbol =
    useMemo(
      () =>
        normalizeSymbol(
          symbolValue
        ),
      [symbolValue]
    );

  const [quote, setQuote] =
    useState<LiveStockQuote | null>(
      null
    );

  const [
    connectionStatus,
    setConnectionStatus,
  ] =
    useState<LiveMarketConnectionStatus>(
      "DISCONNECTED"
    );

  useEffect(() => {
    const client =
      getLiveMarketClient();

    if (!client || !symbol) {
      return;
    }

    setQuote(
      client.getQuote(symbol)
    );

    const unsubscribeStatus =
      client.subscribeToStatus(
        setConnectionStatus
      );

    const unsubscribeQuote =
      client.subscribe(
        symbol,
        setQuote
      );

    return () => {
      unsubscribeQuote();
      unsubscribeStatus();
    };
  }, [symbol]);

  return {
    symbol,
    quote,
    price:
      quote?.price ?? null,
    connectionStatus,
    isLive:
      connectionStatus ===
        "CONNECTED" &&
      quote?.status !== "STALE",
  };
}

export function useLiveStockPrices(
  symbolValues: string[]
) {
  const symbolsKey =
    symbolValues
      .map(normalizeSymbol)
      .filter(Boolean)
      .sort()
      .join(",");

  const symbols =
    useMemo(
      () =>
        symbolsKey
          .split(",")
          .filter(Boolean),
      [symbolsKey]
    );

  const [quotes, setQuotes] =
    useState<
      Record<
        string,
        LiveStockQuote
      >
    >({});

  const [
    connectionStatus,
    setConnectionStatus,
  ] =
    useState<LiveMarketConnectionStatus>(
      "DISCONNECTED"
    );

  useEffect(() => {
    const client =
      getLiveMarketClient();

    if (!client) {
      return;
    }

    const unsubscribeStatus =
      client.subscribeToStatus(
        setConnectionStatus
      );

    const unsubscribers =
      symbols.map((symbol) =>
        client.subscribe(
          symbol,
          (quote) => {
            setQuotes(
              (current) => ({
                ...current,
                [symbol]: quote,
              })
            );
          }
        )
      );

    return () => {
      unsubscribeStatus();

      for (
        const unsubscribe
        of unsubscribers
      ) {
        unsubscribe();
      }
    };
  }, [symbols, symbolsKey]);

  return {
    quotes,
    connectionStatus,
    isConnected:
      connectionStatus ===
      "CONNECTED",
  };
}
