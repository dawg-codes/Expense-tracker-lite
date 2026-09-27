/**
 * Activity list pipeline: filter first, then sort. One pure function each, so
 * the screen (and tests) always combine them the same way.
 */
import type { TxnView } from './types';

export interface ActivityFilter {
  query: string;
  kinds: string[];
  category?: string;
  sender?: string;
  min?: number;
  max?: number;
  allTime: boolean;
  /** Restrict to these transactions (e.g. "from the last sync"). */
  ids?: string[];
  idsLabel?: string;
}

export const EMPTY_FILTER: ActivityFilter = { query: '', kinds: [], allTime: false };

export type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'merchant_asc' | 'merchant_desc';

export const SORTS: Array<[SortKey, string]> = [
  ['date_desc', 'Newest first'],
  ['date_asc', 'Oldest first'],
  ['amount_desc', 'Highest amount'],
  ['amount_asc', 'Lowest amount'],
  ['merchant_asc', 'Merchant A–Z'],
  ['merchant_desc', 'Merchant Z–A'],
];

export const DEFAULT_SORT: SortKey = 'date_desc';

export interface Labels {
  category: (id: string) => string;
  kind: (v: TxnView) => string;
  /** Display name used for merchant sorting and search. */
  name: (v: TxnView) => string;
}

/** Matches merchant, category, sender, account, reference or amount ("840" finds ₹840.00). */
export function matches(v: TxnView, q: string, labels: Labels): boolean {
  if (!q) return true;
  const digits = q.replace(/[₹,\s]/g, '');
  if (/^\d+(\.\d+)?$/.test(digits)) {
    const amt = v.amount.toFixed(2);
    if (amt.startsWith(digits) || String(Math.round(v.amount)) === digits) return true;
    if (v.ref?.includes(digits) || v.account?.includes(digits)) return true;
  }
  const hay = `${labels.name(v)} ${v.merchantRaw ?? ''} ${labels.category(v.cat)} ${v.sender} ${labels.kind(v)}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export function filterTxns(src: TxnView[], f: ActivityFilter, query: string, labels: Labels): TxnView[] {
  const only = f.ids ? new Set(f.ids) : null;
  const showDupes = f.kinds.includes('duplicate');
  return src.filter((v) => {
    if (only && !only.has(v.id)) return false;
    // duplicate alerts are hidden unless asked for
    if (v.dupOf && !showDupes) return false;
    if (f.kinds.length && !f.kinds.includes(v.dupOf ? 'duplicate' : v.kind)) return false;
    if (f.category && v.cat !== f.category) return false;
    if (f.sender && v.sender !== f.sender) return false;
    if (f.min !== undefined && v.amount < f.min) return false;
    if (f.max !== undefined && v.amount > f.max) return false;
    return matches(v, query, labels);
  });
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Returns a new, sorted array. Ties fall back to newest first so the order is stable and predictable. */
export function sortTxns(list: TxnView[], key: SortKey, name: (v: TxnView) => string): TxnView[] {
  const byDateDesc = (a: TxnView, b: TxnView) => b.date - a.date;
  const cmp: Record<SortKey, (a: TxnView, b: TxnView) => number> = {
    date_desc: byDateDesc,
    date_asc: (a, b) => a.date - b.date,
    amount_desc: (a, b) => b.amount - a.amount || byDateDesc(a, b),
    amount_asc: (a, b) => a.amount - b.amount || byDateDesc(a, b),
    merchant_asc: (a, b) => collator.compare(name(a), name(b)) || byDateDesc(a, b),
    merchant_desc: (a, b) => collator.compare(name(b), name(a)) || byDateDesc(a, b),
  };
  return [...list].sort(cmp[key]);
}
