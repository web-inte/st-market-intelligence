"use client";

import {
  useMemo,
  useState,
} from "react";

type ShareAnalysisMenuProps = {
  symbol: string;
};

export default function ShareAnalysisMenu({
  symbol,
}: ShareAnalysisMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareText = useMemo(
    () =>
      `تحليل سهم ${symbol} عبر منصة ST Market Intelligence`,
    [symbol]
  );

  function getShareUrl() {
    if (typeof window === "undefined") {
      return "";
    }

    return window.location.href;
  }

  function openShareUrl(url: string) {
    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    setOpen(false);
  }

  function shareToWhatsApp() {
    const url = getShareUrl();

    openShareUrl(
      `https://wa.me/?text=${encodeURIComponent(
        `${shareText}\n${url}`
      )}`
    );
  }

  function shareToTelegram() {
    const url = getShareUrl();

    openShareUrl(
      `https://t.me/share/url?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(shareText)}`
    );
  }

  async function copyLink() {
    const url = getShareUrl();

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  }

  async function shareMore() {
    const url = getShareUrl();

    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: `تحليل ${symbol}`,
        text: shareText,
        url,
      });

      setOpen(false);
    } catch {
      // المستخدم أغلق نافذة المشاركة.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`مشاركة تحليل ${symbol}`}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-sky-400/20 bg-sky-400/[0.08] px-4 py-3 text-sm font-bold text-sky-300 transition hover:-translate-y-0.5 hover:border-sky-400/40 hover:bg-sky-400/[0.14]"
      >
        <span
          aria-hidden="true"
          className="text-base"
        >
          ↗
        </span>

        <span>مشاركة التحليل</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="إغلاق قائمة المشاركة"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div className="absolute left-0 top-[calc(100%+0.6rem)] z-50 w-52 overflow-hidden rounded-2xl border border-white/[0.09] bg-slate-950/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <button
              type="button"
              onClick={shareToWhatsApp}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-right text-sm font-bold text-emerald-300 transition hover:bg-emerald-400/[0.09]"
            >
              <span>واتساب</span>
              <span aria-hidden="true">◉</span>
            </button>

            <button
              type="button"
              onClick={shareToTelegram}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-right text-sm font-bold text-sky-300 transition hover:bg-sky-400/[0.09]"
            >
              <span>تيليجرام</span>
              <span aria-hidden="true">➤</span>
            </button>

            <button
              type="button"
              onClick={copyLink}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-right text-sm font-bold text-slate-200 transition hover:bg-white/[0.06]"
            >
              <span>
                {copied
                  ? "تم نسخ الرابط"
                  : "نسخ الرابط"}
              </span>

              <span aria-hidden="true">
                {copied ? "✓" : "⧉"}
              </span>
            </button>

            <button
              type="button"
              onClick={shareMore}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-right text-sm font-bold text-violet-300 transition hover:bg-violet-400/[0.09]"
            >
              <span>المزيد</span>
              <span aria-hidden="true">•••</span>
            </button>

            <div className="mx-2 mt-2 border-t border-white/[0.07] px-1 pb-1 pt-3 text-right text-[10px] leading-5 text-slate-500">
              تتم مشاركة رابط التحليل فقط، ولا تُرسل تفاصيل العقد أو الدخول أو الأهداف.
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
