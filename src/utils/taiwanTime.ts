const TAIWAN_TIME_ZONE = 'Asia/Taipei';

// Only request the calendar fields (year/month/day). Requesting `hour` with
// `hour12: false` makes some browsers resolve to the "h24" cycle, where
// midnight is rendered as hour 24 on the *previous* day — that rolled the
// computed date back a day around midnight and caused the「今日 / 已過期」tag
// to be off by one. Date math never needs the hour, so we drop it entirely.
function getPartsInTaiwan(date: Date): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIWAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const out: Record<string, number> = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    out[part.type] = Number(part.value);
  }
  return out;
}

export function getTaiwanTodayISO(): string {
  const p = getPartsInTaiwan(new Date());
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDaysToISODate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getTaiwanYearMonth(): { year: number; monthIndex: number } {
  const p = getPartsInTaiwan(new Date());
  return { year: p.year, monthIndex: p.month - 1 };
}

export function parseDatetimeAsTaiwan(dt: string): Date | null {
  if (!dt) return null;
  const [datePart, timePart = '00:00:00'] = dt.trim().split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  if ([y, m, d, hh, mm, ss].some((n) => Number.isNaN(n))) return null;
  const utcMs = Date.UTC(y, m - 1, d, hh - 8, mm, ss);
  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDatetimeInTaiwan(dt: string): string {
  const parsed = parseDatetimeAsTaiwan(dt);
  if (!parsed) return '--';
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIWAN_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(parsed).replace(' ', ' · ');
}
