/**
 * Totals and comparisons. All figures are based on recorded (SMS-derived)
 * transactions only; the UI says so wherever it shows savings.
 */
import { catMeta, type CategoryMap } from './categories';
import { REVIEW_THRESHOLD, categoryIsUserSet } from './analyze';
import { monthRange, type Range } from './dates';
import type { TxnView } from './types';

export interface Summary {
  /** Spending net of refunds. */
  spent: number;
  gross: number;
  refunds: number;
  income: number;
  transfers: number;
  /** Transactions in range that count towards totals. */
  count: number;
  byCategory: Array<[string, number]>;
  committed: number;
  discretionary: number;
  unclassified: number;
  topMerchants: Array<{ name: string; amount: number; count: number }>;
}

export function inRange(all: TxnView[], r: Range): TxnView[] {
  return all.filter((v) => v.date >= r.start && v.date <= r.end);
}

export type Nature = 'committed' | 'discretionary' | 'unclassified';

/** Committed if recurring or a commitment category; unclassified when we're unsure. */
export function natureOf(v: TxnView, cats: CategoryMap): Nature {
  if (v.recurringKey) return 'committed';
  if (!categoryIsUserSet(v) && v.confidence < REVIEW_THRESHOLD) return 'unclassified';
  return catMeta(cats, v.cat).nature ?? 'unclassified';
}

export function summarize(list: TxnView[], cats: CategoryMap): Summary {
  let gross = 0;
  let refunds = 0;
  let income = 0;
  let transfers = 0;
  let count = 0;
  const catTotals = new Map<string, number>();
  const nature = { committed: 0, discretionary: 0, unclassified: 0 };
  const merchants = new Map<string, { name: string; amount: number; count: number }>();

  for (const v of list) {
    if (v.kind === 'transfer' && !v.dupOf && !v.excluded && v.direction === 'debit') transfers += v.amount;
    if (!v.counted) continue;
    count++;
    if (v.kind === 'income') {
      income += v.amount;
      continue;
    }
    const sign = v.kind === 'refund' ? -1 : 1;
    if (sign > 0) gross += v.amount;
    else refunds += v.amount;
    catTotals.set(v.cat, (catTotals.get(v.cat) ?? 0) + sign * v.amount);
    nature[natureOf(v, cats)] += sign * v.amount;
    if (v.name && sign > 0) {
      const key = v.name.toLowerCase();
      const m = merchants.get(key) ?? { name: v.name, amount: 0, count: 0 };
      m.amount += v.amount;
      m.count++;
      merchants.set(key, m);
    }
  }

  const byCategory = [...catTotals].filter(([, a]) => a > 0.005).sort((a, b) => b[1] - a[1]);
  const clamp = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  return {
    spent: clamp(gross - refunds),
    gross,
    refunds,
    income,
    transfers,
    count,
    byCategory,
    committed: clamp(nature.committed),
    discretionary: clamp(nature.discretionary),
    unclassified: clamp(nature.unclassified),
    topMerchants: [...merchants.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}

export interface MonthPoint {
  key: string;
  label: string;
  spent: number;
  income: number;
  range: Range;
}

/** The last `n` calendar months ending with the month containing `anchor`. */
export function monthlySeries(all: TxnView[], anchor: number, n = 6): MonthPoint[] {
  const a = new Date(anchor);
  const points: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const range = monthRange(a.getFullYear(), a.getMonth() - i);
    const d = new Date(range.start);
    points.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
      spent: 0,
      income: 0,
      range,
    });
  }
  const first = points[0].range.start;
  const last = points[points.length - 1].range.end;
  for (const v of all) {
    if (!v.counted || v.date < first || v.date > last) continue;
    const p = points.find((x) => v.date >= x.range.start && v.date <= x.range.end);
    if (!p) continue;
    if (v.kind === 'income') p.income += v.amount;
    else if (v.kind === 'refund') p.spent -= v.amount;
    else p.spent += v.amount;
  }
  for (const p of points) p.spent = Math.max(0, p.spent);
  return points;
}

export interface CategoryChange {
  cat: string;
  now: number;
  before: number;
  delta: number;
}

/** Category-level changes between two periods, largest absolute change first. */
export function categoryChanges(current: Summary, previous: Summary, limit = 5): CategoryChange[] {
  const prev = new Map(previous.byCategory);
  const cur = new Map(current.byCategory);
  const keys = new Set([...prev.keys(), ...cur.keys()]);
  return [...keys]
    .map((cat) => {
      const now = cur.get(cat) ?? 0;
      const before = prev.get(cat) ?? 0;
      return { cat, now, before, delta: now - before };
    })
    .filter((c) => Math.abs(c.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

/* ---------- headline insights (Home) ---------- */

export interface Headline {
  /** Plain-text sentence; `strong` marks the part worth emphasising. */
  text: string;
  strong?: string;
}

/**
 * At most `max` short observations for the Home screen, most useful first.
 * `scope` is a phrase like "today" / "this month" / "in this period".
 */
export function headlineInsights(
  s: Summary,
  opts: { scope: string; compare?: { label: string; spent: number }; recurringMonthly?: number; categoryLabel: (id: string) => string },
  max = 2,
): Headline[] {
  const out: Headline[] = [];
  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  const catTotal = s.byCategory.reduce((a, [, x]) => a + x, 0);

  if (opts.compare && opts.compare.spent > 0) {
    const d = s.spent - opts.compare.spent;
    const pct = Math.round((Math.abs(d) / opts.compare.spent) * 100);
    if (Math.abs(d) >= 1 && pct >= 5) {
      const amount = fmt(Math.abs(d));
      out.push({ text: `You spent ${amount} ${d > 0 ? 'more' : 'less'} than ${opts.compare.label}.`, strong: amount });
    }
  }
  const top = s.byCategory[0];
  if (top && catTotal > 0) {
    const share = Math.round((top[1] / catTotal) * 100);
    const label = opts.categoryLabel(top[0]);
    if (share >= 25) out.push({ text: `${label} made up ${share}% of spending ${opts.scope}.`, strong: `${label}` });
  }
  const m = s.topMerchants[0];
  if (m && m.amount >= 0.15 * s.spent) out.push({ text: `${m.name} was your largest merchant ${opts.scope}.`, strong: m.name });
  if (opts.recurringMonthly && opts.recurringMonthly > 0) {
    const amount = `${fmt(opts.recurringMonthly)}/month`;
    out.push({ text: `Recurring commitments total ${amount}.`, strong: amount });
  }
  if (s.income > 0 && s.spent > s.income) out.unshift({ text: `You spent more than you received ${opts.scope}.`, strong: 'more than you received' });
  return out.slice(0, max);
}
