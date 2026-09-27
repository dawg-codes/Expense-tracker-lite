/**
 * Calendar periods. All boundaries use the device's local time zone, so
 * "This month" is 1 Sep 00:00 → 30 Sep 23:59:59.999 wherever you are.
 */

export type PeriodMode = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom';

export interface Period {
  mode: PeriodMode;
  /** 0 = current period, -1 = previous, … (ignored for custom/all). */
  offset: number;
  /** yyyy-mm-dd, custom only */
  start?: string;
  end?: string;
}

export interface Range {
  start: number;
  /** inclusive */
  end: number;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monday-based week start. */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - dow);
  return s;
}

export function monthRange(year: number, month: number): Range {
  return { start: new Date(year, month, 1).getTime(), end: new Date(year, month + 1, 1).getTime() - 1 };
}

export function parseLocalDate(v: string | undefined): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Returns the period's time range, or null when a custom range is invalid. */
export function periodRange(p: Period, now = Date.now()): Range | null {
  const today = new Date(now);
  const o = p.offset || 0;
  switch (p.mode) {
    case 'day': {
      const s = startOfDay(today);
      s.setDate(s.getDate() + o);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      return { start: s.getTime(), end: e.getTime() - 1 };
    }
    case 'week': {
      const s = startOfWeek(today);
      s.setDate(s.getDate() + 7 * o);
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
      return { start: s.getTime(), end: e.getTime() - 1 };
    }
    case 'month':
      return monthRange(today.getFullYear(), today.getMonth() + o);
    case 'year': {
      const y = today.getFullYear() + o;
      return { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime() - 1 };
    }
    case 'all':
      return { start: 0, end: Number.MAX_SAFE_INTEGER };
    case 'custom': {
      const s = parseLocalDate(p.start);
      const e = parseLocalDate(p.end);
      if (!s || !e || s.getTime() > e.getTime()) return null;
      const end = new Date(e);
      end.setDate(end.getDate() + 1);
      return { start: s.getTime(), end: end.getTime() - 1 };
    }
  }
}

/** The equivalent previous period (for comparisons). Null for all/custom. */
export function previousPeriod(p: Period): Period | null {
  if (p.mode === 'all' || p.mode === 'custom') return null;
  return { ...p, offset: p.offset - 1 };
}

export const canNavigate = (p: Period) => p.mode !== 'all' && p.mode !== 'custom';

const fmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString('en-IN', opts);

/** Big title, e.g. "September 2026". */
export function periodTitle(p: Period, now = Date.now()): string {
  const r = periodRange(p, now);
  if (!r) return 'Custom range';
  switch (p.mode) {
    case 'day':
      return fmt(r.start, { weekday: 'short', day: 'numeric', month: 'long' });
    case 'week': {
      const sameMonth = new Date(r.start).getMonth() === new Date(r.end).getMonth();
      return `${fmt(r.start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${fmt(r.end, { day: 'numeric', month: 'short' })}`;
    }
    case 'month':
      return fmt(r.start, { month: 'long', year: 'numeric' });
    case 'year':
      return String(new Date(r.start).getFullYear());
    case 'all':
      return 'All time';
    case 'custom':
      return `${fmt(r.start, { day: 'numeric', month: 'short' })} – ${fmt(r.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
}

/** Relative label, e.g. "This month", "Last month", "3 months ago". */
export function periodHint(p: Period): string {
  const unit = { day: 'day', week: 'week', month: 'month', year: 'year' } as const;
  if (p.mode === 'all' || p.mode === 'custom') return p.mode === 'all' ? 'Everything recorded' : 'Custom range';
  const u = unit[p.mode];
  if (p.offset === 0) return p.mode === 'day' ? 'Today' : `This ${u}`;
  if (p.offset === -1) return p.mode === 'day' ? 'Yesterday' : `Last ${u}`;
  if (p.offset > 0) return p.offset === 1 ? `Next ${u}` : `In ${p.offset} ${u}s`;
  return `${-p.offset} ${u}s ago`;
}

/** Phrase for use inside a sentence: "today", "this month", "last week", "in this period". */
export function periodScope(p: Period): string {
  if (p.mode === 'all') return 'overall';
  if (p.mode === 'custom' || p.offset < -1 || p.offset > 0) return 'in this period';
  return periodHint(p).toLowerCase();
}

/** Maps the v2 persisted filter ('weekly' | 'monthly' | 'yearly' | 'custom') to a period mode. */
export function migrateFilter(v: unknown): PeriodMode {
  if (v === 'weekly') return 'week';
  if (v === 'yearly') return 'year';
  if (v === 'custom') return 'custom';
  if (v === 'day' || v === 'week' || v === 'month' || v === 'year' || v === 'all') return v;
  return 'month';
}

/** Key like "2026-09" for grouping by calendar month. */
export const monthKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const DAY = 86_400_000;
