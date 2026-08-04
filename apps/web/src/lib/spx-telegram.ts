type TelegramResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
};

export async function sendSpxTelegramMessage(
  message: string
): Promise<TelegramResult> {
  const token =
    process.env.TELEGRAM_BOT_TOKEN?.trim();

  const chatId =
    process.env.SPX_TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return {
      ok: false,
      error:
        "إعدادات تيليجرام غير مكتملة",
    };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview:
            true,
        }),
        signal:
          AbortSignal.timeout(5000),
      }
    );

    const result = await response.json();

    if (
      !response.ok ||
      !result?.ok
    ) {
      return {
        ok: false,
        error:
          result?.description ||
          `Telegram HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      messageId:
        Number(
          result?.result?.message_id
        ) || undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "تعذر إرسال رسالة تيليجرام",
    };
  }
}

export function formatSpxNumber(
  value: unknown,
  digits = 2
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "—";
  }

  return parsed.toFixed(digits);
}

export function formatSpxKsaTime(
  value: string | Date
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Riyadh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  ).format(date);
}
