import { describe, expect, it } from 'vitest';
import { migrateFilter, periodHint, periodRange, periodScope, periodTitle } from '../dates';
import { headlineInsights, type Summary } from '../insights';

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

  it('phrases the period for sentences', () => {
    expect(periodScope({ mode: 'day', offset: 0 })).toBe('today');
    expect(periodScope({ mode: 'month', offset: -1 })).toBe('last month');
    expect(periodScope({ mode: 'month', offset: -3 })).toBe('in this period');
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


describe('headline insights', () => {
  const base: Summary = {
    spent: 573, gross: 573, refunds: 0, income: 0, transfers: 0, count: 4,
    byCategory: [['Food', 390], ['Transport', 183]],
    committed: 0, discretionary: 573, unclassified: 0,
    topMerchants: [{ name: 'Swiggy', amount: 390, count: 2 }],
  };
  const label = (id: string) => id;

  it('leads with the change vs the previous period, then the top category', () => {
    const h = headlineInsights(base, { scope: 'today', compare: { label: 'yesterday', spent: 325 }, categoryLabel: label });
    expect(h.map((x) => x.text)).toEqual(['You spent ₹248 more than yesterday.', 'Food made up 68% of spending today.']);
  });

  it('shows at most two and skips tiny changes', () => {
    const h = headlineInsights(base, { scope: 'today', compare: { label: 'yesterday', spent: 570 }, recurringMonthly: 45099, categoryLabel: label });
    expect(h).toHaveLength(2);
    expect(h[0].text).toMatch(/^Food made up/);
  });

  it('warns first when spending exceeded income', () => {
    const h = headlineInsights({ ...base, income: 100 }, { scope: 'this month', categoryLabel: label });
    expect(h[0].text).toBe('You spent more than you received this month.');
  });

  it('returns nothing for an empty period', () => {
    expect(headlineInsights({ ...base, spent: 0, gross: 0, byCategory: [], topMerchants: [] }, { scope: 'today', categoryLabel: label })).toEqual([]);
  });
});
