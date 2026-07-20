const EASTERN_TIMEZONE = "America/New_York";
const SESSION_OPEN_MINUTE = 9 * 60 + 30;
const SESSION_CLOSE_MINUTE = 16 * 60;

const easternPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type EasternParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parsePart(values: Record<string, string>, key: keyof EasternParts): number {
  const value = Number(values[key]);
  return Number.isFinite(value) ? value : 0;
}

function getEasternParts(timestampMs: number): EasternParts {
  const parts = easternPartsFormatter.formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: parsePart(values, "year"),
    month: parsePart(values, "month"),
    day: parsePart(values, "day"),
    hour: parsePart(values, "hour"),
    minute: parsePart(values, "minute"),
  };
}

export function getEasternYear(timestampMs: number): number {
  return getEasternParts(timestampMs).year;
}

export function getEasternMonth(timestampMs: number): number {
  return getEasternParts(timestampMs).month;
}

export function getEasternDay(timestampMs: number): number {
  return getEasternParts(timestampMs).day;
}

export function getEasternHour(timestampMs: number): number {
  return getEasternParts(timestampMs).hour;
}

export function getEasternMinute(timestampMs: number): number {
  return getEasternParts(timestampMs).minute;
}

export function getEasternDateKey(timestampMs: number): string {
  const year = getEasternYear(timestampMs);
  const month = String(getEasternMonth(timestampMs)).padStart(2, "0");
  const day = String(getEasternDay(timestampMs)).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getEasternSessionInfo(timestampMs: number): {
  dateKey: string;
  minuteOfDay: number;
  isRegularSession: boolean;
  minutesFromOpen: number;
} {
  const hour = getEasternHour(timestampMs);
  const minute = getEasternMinute(timestampMs);
  const minuteOfDay = hour * 60 + minute;
  const isRegularSession = minuteOfDay >= SESSION_OPEN_MINUTE && minuteOfDay < SESSION_CLOSE_MINUTE;

  return {
    dateKey: getEasternDateKey(timestampMs),
    minuteOfDay,
    isRegularSession,
    minutesFromOpen: minuteOfDay - SESSION_OPEN_MINUTE,
  };
}
