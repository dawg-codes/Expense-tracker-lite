import { describe, expect, it } from 'vitest';
import { migrateFilter, periodHint, periodRange, periodTitle } from '../dates';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 9, 27);
const within = (ms: number, r: { start: number; end: number } | null) => !!r && ms >= r.start && ms <= r.end;

describe('calendar month', () => {
  const sep = periodRange({ mode: 'month', offset: 0 }, NOW);

  it('"This month" is 1 Sep 00:00 → 30 Sep 23:59:59.999, not the last 30 days', () => {
    expect(sep!.start).toBe(new Date(2026, 8, 1).getTime());
    expect(sep!.end).toBe(new Date(2026, 9, 1).getTime() - 1);
  });

  it('includes September 1 and September 30, excludes October 1 and August 31', () => {
    expect(within(at(2026, 9, 1, 0, 0), sep)).toBe(true);
    expect(within(at(2026, 9, 30, 23, 59), sep)).toBe(true);
    expect(within(at(2026, 10, 1, 0, 0), sep)).toBe(false);
    expect(within(at(2026, 8, 31, 23, 59), sep)).toBe(false);
  });

  it('last month = August', () => {
    const aug = periodRange({ mode: 'month', offset: -1 }, NOW);
    expect(within(at(2026, 8, 1, 0, 0), aug)).toBe(true);
    expect(within(at(2026, 8, 31, 23, 59), aug)).toBe(true);
    expect(within(at(2026, 9, 1, 0, 0), aug)).toBe(false);
    expect(periodHint({ mode: 'month', offset: -1 })).toBe('Last month');
  });

  it('navigates across year boundaries', () => {
    const r = periodRange({ mode: 'month', offset: -9 }, NOW);
    expect(periodTitle({ mode: 'month', offset: -9 }, NOW)).toBe('December 2025');
    expect(within(at(2025, 12, 31), r)).toBe(true);
  });

  it('titles the period for the UI', () => {
    expect(periodTitle({ mode: 'month', offset: 0 }, NOW)).toBe('September 2026');
    expect(periodHint({ mode: 'month', offset: 0 })).toBe('This month');
  });
});

describe('other periods', () => {
  it('today', () => {
    const r = periodRange({ mode: 'day', offset: 0 }, NOW);
    expect(within(at(2026, 9, 27, 0, 0), r)).toBe(true);
    expect(within(at(2026, 9, 26, 23, 59), r)).toBe(false);
  });

  it('week starts on Monday', () => {
    // 27 Sep 2026 is a Sunday → week is Mon 21 – Sun 27
    const r = periodRange({ mode: 'week', offset: 0 }, NOW)!;
    expect(new Date(r.start).getDate()).toBe(21);
    expect(within(at(2026, 9, 27, 23, 0), r)).toBe(true);
    expect(within(at(2026, 9, 20, 23, 0), r)).toBe(false);
  });

  it('year', () => {
    const r = periodRange({ mode: 'year', offset: 0 }, NOW);
    expect(within(at(2026, 1, 1, 0, 0), r)).toBe(true);
    expect(within(at(2026, 12, 31, 23, 59), r)).toBe(true);
    expect(within(at(2027, 1, 1, 0, 0), r)).toBe(false);
  });

  it('custom range is inclusive of the end day', () => {
    const r = periodRange({ mode: 'custom', offset: 0, start: '2026-09-01', end: '2026-09-30' }, NOW);
    expect(within(at(2026, 9, 30, 23, 59), r)).toBe(true);
    expect(within(at(2026, 10, 1, 0, 0), r)).toBe(false);
  });

  it('invalid custom range returns null', () => {
    expect(periodRange({ mode: 'custom', offset: 0, start: '2026-09-30', end: '2026-09-01' }, NOW)).toBeNull();
    expect(periodRange({ mode: 'custom', offset: 0, start: '', end: '2026-09-01' }, NOW)).toBeNull();
  });

  it('migrates the v2 filter setting', () => {
    expect(migrateFilter('monthly')).toBe('month');
    expect(migrateFilter('weekly')).toBe('week');
    expect(migrateFilter('yearly')).toBe('year');
    expect(migrateFilter('custom')).toBe('custom');
    expect(migrateFilter(undefined)).toBe('month');
  });
});
