export const MARKET_NEWS_SYMBOLS = [
  "AMZN",
  "NVDA",
  "AMD",
  "AAPL",
  "META",
  "MSTR",
  "MSFT",
  "AVGO",
  "TSLA",
  "QQQ",
  "SPY",
  "GOOGL",
  "PLTR",
  "NFLX",
  "CRM",
  "ORCL",
  "JPM",
  "BAC",
  "COIN",
  "SHOP",
  "MU",
  "INTC",
  "QCOM",
  "ARM",
  "SMCI",
  "SNOW",
  "UBER",
  "DIS",
  "PYPL",
  "XOM",
  "BA",
  "TTD",
  "CRWD",
  "DDOG",
  "NET",
  "PANW",
  "ZS",
  "MDB",
  "TEAM",
  "ANET",
  "APP",
  "HOOD",
  "RBLX",
  "TTWO",
  "EA",
  "DECK",
  "ONON",
  "ABNB",
  "BKNG",
  "DE",
  "CAT",
  "GE",
  "ETN",
  "PH",
  "CMI",
  "TT",
  "LULU",
  "VRTX",
  "REGN",
  "MRK",
  "ABBV",
  "ISRG",
  "INTU",
  "ADSK",
  "ADP",
  "PAYX",
  "CB",
  "MMC",
  "ICE",
  "CME",
  "SPGI",
  "MCO",
  "MSCI",
  "AON",
  "AJG",
  "RSG",
  "WM",
  "URI",
  "FAST",
  "ODFL",
  "CPRT",
  "FERG",
  "XYL",
  "VRT",
  "KLAC",
  "LRCX",
  "APH",
  "CDNS",
  "SNPS",
  "NXPI",
  "MCHP",
  "FICO",
  "AXON",
  "HCA",
  "ELV",
  "CI",
  "HUM",
  "CNC",
  "NOC",
  "GD",
  "LMT",
  "RTX",
  "HON",
  "EMR",
  "ITW",
  "ROK",
  "JCI",
  "LEN",
  "DHI",
  "PHM",
  "NVR",
  "LOW",
  "TJX",
  "CMG",
  "ORLY",
  "ROST",
  "GWW",
] as const;

export type MarketNewsSymbol =
  (typeof MARKET_NEWS_SYMBOLS)[number];

export type MarketNewsEventType =
  | "EARNINGS"
  | "GUIDANCE"
  | "CONTRACT"
  | "ACQUISITION"
  | "REGULATORY"
  | "LEGAL"
  | "MANAGEMENT"
  | "PRODUCT"
  | "ANALYST"
  | "GENERAL";

export type MarketNewsImpact =
  | "POSITIVE"
  | "NEGATIVE"
  | "NEUTRAL";

export type FinnhubCompanyNewsItem = {
  id?: number;
  category?: string;
  datetime?: number;
  headline?: string;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

export type MarketNewsClassification = {
  eventType: MarketNewsEventType;
  impact: MarketNewsImpact;
  importance: number;
  reason: string;
  isMaterial: boolean;
};

const positiveTerms = [
  "beat estimates",
  "beats estimates",
  "tops estimates",
  "raises guidance",
  "raised guidance",
  "raises outlook",
  "record revenue",
  "record profit",
  "approved",
  "approval",
  "wins contract",
  "awarded contract",
  "strategic partnership",
  "share buyback",
  "stock buyback",
  "dividend increase",
  "upgraded",
  "upgrade",
  "price target raised",
  "launches",
  "expands",
  "strong demand",
];

const negativeTerms = [
  "misses estimates",
  "missed estimates",
  "cuts guidance",
  "cut guidance",
  "lowers guidance",
  "lowers outlook",
  "downgraded",
  "downgrade",
  "price target cut",
  "investigation",
  "lawsuit",
  "recall",
  "rejected",
  "denied",
  "fine",
  "fraud",
  "layoffs",
  "bankruptcy",
  "profit warning",
  "weak demand",
  "data breach",
];

const materialTerms = [
  "earnings",
  "quarterly results",
  "financial results",
  "revenue",
  "guidance",
  "forecast",
  "outlook",
  "contract",
  "deal",
  "agreement",
  "partnership",
  "acquisition",
  "acquire",
  "merger",
  "takeover",
  "fda",
  "sec",
  "regulator",
  "regulatory",
  "approval",
  "antitrust",
  "lawsuit",
  "court",
  "investigation",
  "settlement",
  "fine",
  "ceo",
  "cfo",
  "resigns",
  "appointed",
  "launch",
  "product",
  "platform",
  "service",
  "upgrade",
  "downgrade",
  "price target",
  "rating",
  "buyback",
  "dividend",
  "recall",
  "layoffs",
];

function containsAny(
  text: string,
  terms: readonly string[]
) {
  return terms.some((term) =>
    text.includes(term)
  );
}

export function normalizeNewsText(
  value: unknown
) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyMarketNews(
  headlineValue: unknown,
  summaryValue: unknown
): MarketNewsClassification {
  const headline =
    normalizeNewsText(headlineValue);

  const summary =
    normalizeNewsText(summaryValue);

  const text =
    `${headline} ${summary}`.toLowerCase();

  let eventType:
    MarketNewsEventType = "GENERAL";

  let importance = 50;

  if (
    containsAny(text, [
      "earnings",
      "quarterly results",
      "financial results",
      "eps",
      "revenue",
    ])
  ) {
    eventType = "EARNINGS";
    importance = 82;
  }

  if (
    containsAny(text, [
      "guidance",
      "forecast",
      "outlook",
    ])
  ) {
    eventType = "GUIDANCE";
    importance = 90;
  } else if (
    containsAny(text, [
      "contract",
      "awarded",
      "deal",
      "agreement",
      "partnership",
    ])
  ) {
    eventType = "CONTRACT";
    importance = 84;
  } else if (
    containsAny(text, [
      "acquisition",
      "acquire",
      "merger",
      "takeover",
    ])
  ) {
    eventType = "ACQUISITION";
    importance = 94;
  } else if (
    containsAny(text, [
      "fda",
      "sec",
      "regulator",
      "regulatory",
      "approval",
      "antitrust",
    ])
  ) {
    eventType = "REGULATORY";
    importance = 91;
  } else if (
    containsAny(text, [
      "lawsuit",
      "court",
      "legal",
      "investigation",
      "settlement",
      "fine",
    ])
  ) {
    eventType = "LEGAL";
    importance = 87;
  } else if (
    containsAny(text, [
      "ceo",
      "cfo",
      "chairman",
      "resigns",
      "appointed",
    ])
  ) {
    eventType = "MANAGEMENT";
    importance = 76;
  } else if (
    containsAny(text, [
      "launch",
      "product",
      "chip",
      "platform",
      "service",
    ])
  ) {
    eventType = "PRODUCT";
    importance = 71;
  } else if (
    containsAny(text, [
      "upgrade",
      "downgrade",
      "price target",
      "rating",
    ])
  ) {
    eventType = "ANALYST";
    importance = 69;
  }

  const positive =
    containsAny(
      text,
      positiveTerms
    );

  const negative =
    containsAny(
      text,
      negativeTerms
    );

  let impact:
    MarketNewsImpact = "NEUTRAL";

  let reason =
    "الخبر جوهري محتمل، لكن اتجاه تأثيره على السعر غير محسوم.";

  if (positive && !negative) {
    impact = "POSITIVE";
    importance = Math.min(
      100,
      importance + 7
    );

    reason =
      "يتضمن الخبر عاملًا إيجابيًا محتملًا مثل نتائج قوية أو عقد أو رفع توقعات.";
  } else if (
    negative &&
    !positive
  ) {
    impact = "NEGATIVE";
    importance = Math.min(
      100,
      importance + 7
    );

    reason =
      "يتضمن الخبر عامل مخاطرة محتملًا مثل نتائج ضعيفة أو خفض توقعات أو إجراء قانوني.";
  } else if (
    positive &&
    negative
  ) {
    reason =
      "يتضمن الخبر عوامل إيجابية وسلبية معًا، لذلك لا يمكن حسم اتجاه التأثير.";
  }

  const isMaterial =
    eventType !== "GENERAL" ||
    containsAny(
      text,
      materialTerms
    );

  return {
    eventType,
    impact,
    importance,
    reason,
    isMaterial,
  };
}

export function createMarketNewsExternalId(
  symbol: string,
  news: FinnhubCompanyNewsItem
) {
  const normalizedSymbol =
    symbol.trim().toUpperCase();

  if (
    Number.isFinite(
      Number(news.id)
    )
  ) {
    return `finnhub:${normalizedSymbol}:${Number(
      news.id
    )}`;
  }

  const timestamp =
    Number(news.datetime || 0);

  const headline =
    normalizeNewsText(
      news.headline
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 120);

  return `finnhub:${normalizedSymbol}:${timestamp}:${headline}`;
}
