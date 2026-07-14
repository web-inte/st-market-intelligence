type WhaleRecord = Record<string, any>;

function isRecord(value: unknown): value is WhaleRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

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

  return {
    // بيانات الجدول أولًا
    ...databaseRow,

    // التفاصيل الكاملة المحفوظة داخل raw
    ...processedRow,

    // الحقول الأساسية من الجدول هي المعتمدة
    id:
      databaseRow.id ??
      processedRow.id ??
      null,

    symbol:
      databaseRow.symbol ??
      processedRow.symbol ??
      null,

    option_ticker:
      databaseRow.option_ticker ??
      processedRow.option_ticker ??
      null,

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
