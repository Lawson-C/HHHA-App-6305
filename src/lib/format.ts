/** Date/time formatting. Everything displays in Atlanta time (docs/data-model.md: event). */

const TZ = 'America/New_York';

/** Intl throws on invalid dates; every formatter goes through this so bad data can't crash a screen. */
function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });

const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' });
const dayFmt = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const shortDayFmt = fmt({ weekday: 'long', month: 'short', day: 'numeric' });
const monthShortFmt = fmt({ month: 'short' });
const dayNumFmt = fmt({ day: 'numeric' });
const weekdayFmt = fmt({ weekday: 'short' });

const safeFormat = (formatter: Intl.DateTimeFormat, iso: string) => {
  const date = toDate(iso);
  return date ? formatter.format(date) : '';
};

export const formatTime = (iso: string) => {
  const date = toDate(iso);
  return date ? timeFmt.format(date) : '';
};

/** "6:00 – 7:30 PM" (drops the first AM/PM when both match). */
export function formatTimeRange(startIso: string, endIso: string) {
  const start = formatTime(startIso);
  const end = formatTime(endIso);
  const [startTime, startPeriod] = start.split(' ');
  const [, endPeriod] = end.split(' ');
  return startPeriod === endPeriod ? `${startTime} – ${end}` : `${start} – ${end}`;
}

/** "Thursday, September 24" */
export const formatDayLong = (iso: string) => safeFormat(dayFmt, iso);
/** "Thursday, Sep 24" */
export const formatDayShort = (iso: string) => safeFormat(shortDayFmt, iso);
export const formatMonthShort = (iso: string) => safeFormat(monthShortFmt, iso);
export const formatDayNumber = (iso: string) => safeFormat(dayNumFmt, iso);
export const formatWeekdayShort = (iso: string) => safeFormat(weekdayFmt, iso);

/** "10 min ago", "3 hr ago", "Mon", "Sep 3" */
export function formatRelative(iso: string, now = new Date()) {
  const date = toDate(iso);
  if (!date) return '';
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return weekdayFmt.format(date);
  return fmt({ month: 'short', day: 'numeric' }).format(date);
}

/** "Today, 2:32 PM" / "Sep 3, 2:32 PM" */
export function formatStamp(iso: string, now = new Date()) {
  const date = toDate(iso);
  if (!date) return '';
  const sameDay =
    fmt({ dateStyle: 'short' }).format(date) === fmt({ dateStyle: 'short' }).format(now);
  const day = sameDay ? 'Today' : fmt({ month: 'short', day: 'numeric' }).format(date);
  return `${day}, ${formatTime(iso)}`;
}

/** "Updated 9:38 AM" */
export const formatUpdated = (iso: string | null) => {
  const time = iso ? formatTime(iso) : '';
  return time ? `Updated ${time}` : 'Not updated yet';
};

/** Calendar key (YYYY-MM-DD) in Atlanta time, for grouping events by day. */
export function dayKey(iso: string | Date) {
  const date = toDate(iso);
  if (!date) return '';
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "Sep 2026" style month title: "September 2026" */
export const formatMonthTitle = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);

/** "(404) 555-0142" from E.164 US numbers. */
export function formatPhone(e164: string | null) {
  if (!e164) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
