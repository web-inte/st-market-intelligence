export type WhaleRecord = Record<string, any>;

function isRecord(
  value: unknown
): value is WhaleRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

export function hydrateWhaleTrade<
  T extends WhaleRecord
>(value: T): T & WhaleRecord;

export function hydrateWhaleTrade(
  value: unknown
): WhaleRecord;

export function hydrateWhaleTrade(
  value: unknown
): WhaleRecord {
  const databaseRow = isRecord(value)
    ? value
    : {};

  const raw = isRecord(databaseRow.raw)
    ? databaseRow.raw
    : {};

  const processedRow = isRecord(
    raw.full_processed_row
  )
    ? raw.full_processed_row
    : {};

  const fallbackId = [
    databaseRow.option_ticker ??
      processedRow.option_ticker ??
      databaseRow.symbol ??
      processedRow.symbol ??
      "whale",

    databaseRow.created_at ??
      processedRow.created_at ??
      "unknown-time",

    databaseRow.premium_value ??
      processedRow.premium_value ??
      0,
  ].join("-");

  return {
    ...databaseRow,
    ...processedRow,

    id:
      databaseRow.id ??
      processedRow.id ??
      processedRow.trade_key ??
      fallbackId,

    symbol:
      databaseRow.symbol ??
      processedRow.symbol ??
      "",

    option_ticker:
      databaseRow.option_ticker ??
      processedRow.option_ticker ??
      "",

    contract_type:
      databaseRow.contract_type ??
      processedRow.contract_type ??
      null,

    premium_value:
      databaseRow.premium_value ??
      processedRow.premium_value ??
      0,

    created_at:
      databaseRow.created_at ??
      processedRow.created_at ??
      null,

    raw,
  };
}
