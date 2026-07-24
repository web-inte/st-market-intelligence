import LiveWhaleTracking from "./live-whale-tracking";

type NumericValue =
  | number
  | string
  | null
  | undefined;

export type WhaleOpportunity = {
  id: number | string;

  symbol?: string | null;
  option_ticker?: string | null;
  contract_type?: string | null;
  strike?: NumericValue;
  expiration?: string | null;

  stock_price?: NumericValue;
  contract_price?: NumericValue;
  premium_value?: NumericValue;

  trade_size?: NumericValue;
  volume?: NumericValue;
  open_interest?: NumericValue;
  volume_change?: NumericValue;

  bid?: NumericValue;
  ask?: NumericValue;
  spread_pct?: NumericValue;

  execution_location?: string | null;
  estimated_side?: string | null;

  delta?: NumericValue;
  gamma?: NumericValue;
  theta?: NumericValue;
  vega?: NumericValue;
  iv?: NumericValue;

  whale_score?: NumericValue;
  money_position?: string | null;
  direction_status?: string | null;
  reason?: string | null;

  is_block?: boolean | null;
  is_sweep?: boolean | null;
  repeat_count?: NumericValue;
  hedge_flag?: boolean | null;

  trade_timestamp?: string | null;
  last_seen_at?: string | null;
};

type Props = {
  trade: WhaleOpportunity;
};

function safeNumber(
  value: NumericValue,
  fallback = 0,
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function formatNumber(
  value: NumericValue,
  digits = 2,
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatInteger(value: NumericValue) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return Math.round(number).toLocaleString("en-US");
}

function formatMoney(value: NumericValue) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  if (Math.abs(number) >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(2)} مليون`;
  }

  if (Math.abs(number) >= 1_000) {
    return `${(number / 1_000).toFixed(1)} ألف`;
  }

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function getExecutionLabel(
  value?: string | null,
) {
  const normalized = String(
    value || "",
  )
    .trim()
    .toUpperCase();

  switch (normalized) {
    case "AT_ASK":
    case "ASK":
    case "ABOVE_ASK":
      return "التنفيذ قريب من سعر الطلب، ما يرجّح الشراء.";

    case "AT_BID":
    case "BID":
    case "BELOW_BID":
      return "التنفيذ قريب من سعر العرض، ما يرجّح البيع.";

    case "MID":
    case "BETWEEN":
    case "BETWEEN_BID_ASK":
      return "التنفيذ بين سعري العرض والطلب، والاتجاه غير محسوم.";

    default:
      return value
        ? "موقع التنفيذ غير مصنّف بوضوح."
        : "موقع التنفيذ غير متوفر.";
  }
}

function getContractType(
  trade: WhaleOpportunity,
) {
  const direct = String(
    trade.contract_type || "",
  ).toLowerCase();

  if (
    direct === "call" ||
    direct === "put"
  ) {
    return direct;
  }

  const ticker = String(
    trade.option_ticker || "",
  ).toUpperCase();

  return ticker.includes("P")
    ? "put"
    : "call";
}

function getDecision(
  trade: WhaleOpportunity,
) {
  const contractType =
    getContractType(trade);

  const estimatedSide = String(
    trade.estimated_side || "",
  ).toUpperCase();

  if (
    estimatedSide === "BUY" &&
    contractType === "call"
  ) {
    return {
      title: "فرصة شراء CALL",
      contractLabel: "CALL",
      tone:
        "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
      cardTone:
        "from-emerald-400/[0.08] via-slate-950 to-slate-950",
    };
  }

  if (
    estimatedSide === "BUY" &&
    contractType === "put"
  ) {
    return {
      title: "فرصة شراء PUT",
      contractLabel: "PUT",
      tone:
        "border-rose-400/30 bg-rose-400/10 text-rose-300",
      cardTone:
        "from-rose-400/[0.08] via-slate-950 to-slate-950",
    };
  }

  return {
    title: "فرصة تحتاج تأكيدًا إضافيًا",
    contractLabel:
      contractType.toUpperCase(),
    tone:
      "border-amber-400/30 bg-amber-400/10 text-amber-300",
    cardTone:
      "from-amber-400/[0.07] via-slate-950 to-slate-950",
  };
}

function getReasons(
  trade: WhaleOpportunity,
) {
  const reasons: string[] = [];

  const decision =
    getDecision(trade);

  const premium =
    safeNumber(trade.premium_value);

  const repeatCount =
    safeNumber(trade.repeat_count);

  if (
    String(
      trade.estimated_side || "",
    ).toUpperCase() === "BUY"
  ) {
    reasons.push(
      `تنفيذ شرائي محتمل على عقود ${decision.contractLabel}.`,
    );
  }

  if (trade.is_sweep) {
    reasons.push(
      "رصد تنفيذ سريع ومتجزئ قد يشير إلى دخول مؤسسي.",
    );
  }

  if (trade.is_block) {
    reasons.push(
      "حجم التنفيذ ظهر كصفقة كبيرة مجمعة.",
    );
  }

  if (premium >= 1_000_000) {
    reasons.push(
      `قيمة التنفيذ مرتفعة وتبلغ نحو ${formatMoney(
        premium,
      )} دولار.`,
    );
  } else if (premium >= 250_000) {
    reasons.push(
      `قيمة التنفيذ ملحوظة وتبلغ نحو ${formatMoney(
        premium,
      )} دولار.`,
    );
  }

  if (repeatCount >= 3) {
    reasons.push(
      `تكرر النشاط المؤسسي ${formatInteger(
        repeatCount,
      )} مرات.`,
    );
  }

  if (
    trade.execution_location
  ) {
    reasons.push(
      getExecutionLabel(
        trade.execution_location,
      ),
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      "اجتازت الفرصة الحد الأدنى لنظام ترشيح الحيتان.",
    );
  }

  return reasons.slice(0, 4);
}

function translateSystemReason(
  value?: string | null,
) {
  if (!value) {
    return "";
  }

  return value
    .replaceAll(
      "AT_ASK",
      "قريب من سعر الطلب",
    )
    .replaceAll(
      "AT_BID",
      "قريب من سعر العرض",
    )
    .replaceAll(
      "BLOCK",
      "صفقة مجمعة",
    )
    .replaceAll(
      "Block",
      "صفقة مجمعة",
    )
    .replaceAll(
      "SWEEP",
      "تنفيذ سريع ومتجزئ",
    )
    .replaceAll(
      "Sweep",
      "تنفيذ سريع ومتجزئ",
    )
    .replaceAll(
      "CALL",
      "CALL",
    )
    .replaceAll(
      "PUT",
      "PUT",
    );
}

export default function WhaleOpportunityCard({
  trade,
}: Props) {
  const decision =
    getDecision(trade);

  const reasons =
    getReasons(trade);

  const score = Math.round(
    safeNumber(trade.whale_score),
  );

  const tradeSize =
    safeNumber(trade.trade_size) ||
    safeNumber(trade.volume_change) ||
    safeNumber(trade.volume);

  return (
    <article
      className={`overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b ${decision.cardTone} shadow-2xl shadow-black/25`}
    >
      <header className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-cyan-300">
              فرصة مؤسسية مرشحة
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-black text-white">
                {trade.symbol || "—"}
              </h2>

              <span
                className={`rounded-xl border px-3 py-2 text-xs font-black ${decision.tone}`}
              >
                {decision.contractLabel}
              </span>
            </div>

            <p className="mt-3 text-xl font-black text-white">
              {decision.title}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              سترايك{" "}
              {formatNumber(
                trade.strike,
                0,
              )}{" "}
              — الانتهاء{" "}
              {trade.expiration || "—"}
            </p>
          </div>

          <div className="min-w-24 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-3 text-center">
            <p className="text-[11px] text-cyan-200">
              درجة الثقة
            </p>

            <p className="mt-1 text-3xl font-black text-white">
              {score}%
            </p>
          </div>
        </div>

        {trade.hedge_flag && (
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-sm font-bold text-amber-300">
            تنبيه: توجد احتمالية أن يكون التنفيذ تحوطًا، لذلك تحتاج الفرصة إلى تأكيد إضافي.
          </div>
        )}
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <h3 className="text-sm font-black text-white">
            لماذا رشّح النظام هذه الفرصة؟
          </h3>

          <div className="mt-4 space-y-3">
            {reasons.map(
              (reason, index) => (
                <div
                  key={`${trade.id}-${index}`}
                  className="flex items-start gap-3 text-sm leading-6 text-slate-300"
                >
                  <span className="mt-1 text-emerald-300">
                    ✓
                  </span>

                  <p>{reason}</p>
                </div>
              ),
            )}
          </div>

          {trade.reason && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-xs font-black text-cyan-300">
                تفسير النظام
              </p>

              <p className="mt-2 text-sm leading-7 text-slate-400">
                {translateSystemReason(trade.reason)}
              </p>
            </div>
          )}
        </section>

        <LiveWhaleTracking
          whaleTradeId={trade.id}
        />

        <details className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-black text-slate-200">
            <span>
              عرض تفاصيل الحوت والعقد
            </span>

            <span className="text-cyan-300 transition group-open:rotate-180">
              ▼
            </span>
          </summary>

          <div className="border-t border-white/10 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  قيمة التنفيذ
                </p>

                <p className="mt-1 font-black text-amber-300">
                  ${formatMoney(
                    trade.premium_value,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  حجم التنفيذ
                </p>

                <p className="mt-1 font-black">
                  {formatInteger(
                    tradeSize,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  الاهتمام المفتوح
                </p>

                <p className="mt-1 font-black">
                  {formatInteger(
                    trade.open_interest,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  سعر العقد المرصود
                </p>

                <p className="mt-1 font-black">
                  $
                  {formatNumber(
                    trade.contract_price,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  سعر الطلب
                </p>

                <p className="mt-1 font-black">
                  {formatNumber(
                    trade.ask,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  سعر العرض
                </p>

                <p className="mt-1 font-black">
                  {formatNumber(
                    trade.bid,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  دلتا
                </p>

                <p className="mt-1 font-black">
                  {formatNumber(
                    trade.delta,
                    3,
                  )}
                </p>
              </div>

              <div className="rounded-xl bg-white/[0.035] p-3">
                <p className="text-xs text-slate-500">
                  جاما
                </p>

                <p className="mt-1 font-black">
                  {formatNumber(
                    trade.gamma,
                    4,
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {trade.is_sweep && (
                <span className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-300">
                  تنفيذ سريع محتمل
                </span>
              )}

              {trade.is_block && (
                <span className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300">
                  صفقة مجمعة
                </span>
              )}

              {safeNumber(
                trade.repeat_count,
              ) >= 3 && (
                <span className="rounded-lg border border-violet-400/25 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-300">
                  تكرار مؤسسي{" "}
                  {formatInteger(
                    trade.repeat_count,
                  )}{" "}
                  مرات
                </span>
              )}
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}
