/**
 * Conservative recurring-payment detection.
 *
 * A series needs: the same merchant (or an EMI/mandate from the same sender),
 * a similar amount (±8%), a regular interval, at least 3 payments (2 when
 * the wording says EMI/mandate or the category is a known commitment), and a
 * payment recent enough that it still looks active.
 */
import { catMeta, type CategoryMap } from './categories';
import { merchantKey } from './merchants';
import { normSender } from './parser';
import type { TxnView } from './types';

const DAY = 86_400_000;

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const CADENCES: Array<{ cadence: Cadence; days: number; min: number; max: number }> = [
  { cadence: 'weekly', days: 7, min: 6, max: 8 },
  { cadence: 'monthly', days: 30.44, min: 25, max: 36 },
  { cadence: 'quarterly', days: 91.3, min: 84, max: 98 },
  { cadence: 'yearly', days: 365.25, min: 350, max: 380 },
];

export interface RecurringSeries {
  key: string;
  label: string;
  category: string;
  cadence: Cadence;
  amount: number;
  monthly: number;
  count: number;
  lastDate: number;
  nextDate: number;
  txnIds: string[];
}

const COMMITTED_CATS = new Set(['EMI', 'Insurance', 'Subscriptions', 'Bills', 'Home', 'Education']);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function groupKey(v: TxnView): string | undefined {
  const mk = merchantKey(v.name);
  if (mk) return `m:${mk}`;
  if (v.tags?.includes('emi') || v.tags?.includes('autopay')) return `s:${v.cat}:${normSender(v.sender)}`;
  return undefined;
}

export function detectRecurring(views: TxnView[], cats: CategoryMap, dismissed: Set<string>, now = Date.now()): RecurringSeries[] {
  const groups = new Map<string, TxnView[]>();
  for (const v of views) {
    if (!v.counted || v.kind !== 'expense') continue;
    const k = groupKey(v);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(v);
    groups.set(k, list);
  }

  const out: RecurringSeries[] = [];
  for (const [gk, list] of groups) {
    if (list.length < 2) continue;

    // bucket by similar amount
    const buckets: TxnView[][] = [];
    for (const v of [...list].sort((a, b) => a.amount - b.amount)) {
      const b = buckets[buckets.length - 1];
      if (b && Math.abs(v.amount - b[0].amount) <= b[0].amount * 0.08) b.push(v);
      else buckets.push([v]);
    }

    const seen = new Map<Cadence, number>();
    for (const bucket of buckets) {
      const items = bucket.sort((a, b) => a.date - b.date);
      const strong = items.some((v) => v.tags?.includes('emi') || v.tags?.includes('autopay')) || COMMITTED_CATS.has(items[0].cat);
      if (items.length < (strong ? 2 : 3)) continue;

      const gaps: number[] = [];
      for (let i = 1; i < items.length; i++) gaps.push((items[i].date - items[i - 1].date) / DAY);
      const med = median(gaps);
      const c = CADENCES.find((x) => med >= x.min && med <= x.max);
      if (!c) continue;
      const regular = gaps.filter((g) => g >= c.min * 0.8 && g <= c.max * 1.15).length;
      if (regular / gaps.length < 0.7) continue;

      const last = items[items.length - 1];
      if (now - last.date > c.days * 1.6 * DAY + 5 * DAY) continue; // looks ended

      const n = (seen.get(c.cadence) ?? 0) + 1;
      seen.set(c.cadence, n);
      const key = `${gk}|${c.cadence}${n > 1 ? `#${n}` : ''}`;
      if (dismissed.has(key)) continue;

      const amount = median(items.map((v) => v.amount));
      out.push({
        key,
        label: last.name || `${catMeta(cats, last.cat).label} · ${normSender(last.sender)}`,
        category: last.cat,
        cadence: c.cadence,
        amount,
        monthly: Math.round((amount * 30.44) / c.days),
        count: items.length,
        lastDate: last.date,
        nextDate: last.date + c.days * DAY,
        txnIds: items.map((v) => v.id),
      });
    }
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}
