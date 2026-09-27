/**
 * Cross-transaction analysis. Pure and deterministic: takes stored
 * transactions + user rules and returns derived views. Nothing here is
 * persisted, so changing a rule or fixing a heuristic re-applies to history.
 *
 * Philosophy: only change totals when we're confident. Anything uncertain is
 * left as-is and flagged for Review.
 */
import type { CategoryMap } from './categories';
import { dedupe, isBankSender, normSender } from './parser';
import { merchantKey } from './merchants';
import { detectRecurring, type RecurringSeries } from './recurring';
import type { Flag, FlagKind, MerchantRule, Txn, TxnView } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const REVIEW_THRESHOLD = 0.6;

export interface Analysis {
  /** Every transaction (duplicates included), newest first. */
  all: TxnView[];
  byId: Map<string, TxnView>;
  /** Items needing attention, highest priority first. */
  review: ReviewItem[];
  /** Duplicates dropped with certainty (same ref / identical text). */
  autoDupes: TxnView[];
  recurring: RecurringSeries[];
}

export interface ReviewItem {
  txn: TxnView;
  flag: Flag;
}

const FLAG_PRIORITY: FlagKind[] = ['duplicate', 'unknown_type', 'transfer', 'refund', 'card_payment', 'uncategorised', 'low_confidence'];

interface Compiled {
  rule: MerchantRule;
  needle: string;
}

export function compileRules(rules: MerchantRule[]): Compiled[] {
  return rules
    .map((rule) => ({ rule, needle: rule.match.trim().toLowerCase() }))
    .filter((c) => c.needle.length > 0);
}

export function matchRule(t: Pick<Txn, 'merchant' | 'merchantRaw'>, compiled: Compiled[]): MerchantRule | undefined {
  if (!compiled.length) return undefined;
  const hay = `${t.merchantRaw ?? ''} ${t.merchant ?? ''}`.toLowerCase();
  if (!hay.trim()) return undefined;
  return compiled.find((c) => hay.includes(c.needle))?.rule;
}

function dismissed(t: Txn, kind: FlagKind): boolean {
  return !!t.user?.dismissed?.includes(kind);
}

/** Applies overrides and custom rules to one transaction. */
function baseView(t: Txn, compiled: Compiled[], cats: CategoryMap): TxnView {
  const u = t.user ?? {};
  const rule = matchRule(t, compiled);
  const kind = u.type ?? t.type;
  let cat = u.category ?? rule?.category ?? t.category;
  if (!u.category && !rule) {
    // parser category is only a fallback: keep types coherent with a changed type
    if (kind === 'income' && t.type !== 'income') cat = 'Income';
    if (kind === 'expense' && cat === 'Income') cat = 'Other';
  }
  if (!cats.has(cat)) cat = 'Other';
  return {
    ...t,
    kind,
    cat,
    name: u.merchant ?? rule?.rename ?? t.merchant ?? '',
    excluded: !!u.excluded,
    ruleId: rule?.id,
    linkedId: u.linkedId,
    flags: [],
    counted: false,
  };
}

/** A category the user explicitly chose (override or rule). */
export const categoryIsUserSet = (v: TxnView) => !!(v.user?.category || v.ruleId);

export function analyze(
  txns: Txn[],
  rules: MerchantRule[],
  cats: CategoryMap,
  dismissedRecurring: string[] = [],
  now = Date.now(),
): Analysis {
  const compiled = compileRules(rules);
  const views = txns.map((t) => baseView(t, compiled, cats));
  const byId = new Map(views.map((v) => [v.id, v]));

  /* 1. duplicates */
  const forceKeep = new Set(txns.filter((t) => t.user?.notDuplicate).map((t) => t.id));
  const { unique, dupes } = dedupe(txns, forceKeep);
  const autoDupes: TxnView[] = [];
  for (const d of dupes) {
    const v = byId.get(d.txn.id)!;
    v.dupOf = d.keptId;
    v.dupReason = d.reason;
    if (d.certain) autoDupes.push(v);
    else if (!v.user?.reviewed && !dismissed(v, 'duplicate')) v.flags.push({ kind: 'duplicate', relatedId: d.keptId, note: d.reason });
  }
  const live = unique.map((t) => byId.get(t.id)!).filter((v) => !v.excluded);

  /* 2. own-account transfers: a debit and a credit of the same amount close together */
  pairTransfers(live);

  /* 3. refunds: link refunds to the purchase they reverse, spot possible ones */
  linkRefunds(live);

  /* 4. per-transaction review flags */
  const cardSpendDates = live.filter((v) => v.kind === 'expense' && v.tags?.includes('cc')).map((v) => v.date);
  for (const v of live) {
    const decided = !!v.user?.reviewed;
    if (v.kind === 'unknown' && !decided) v.flags.push({ kind: 'unknown_type' });
    if (v.kind === 'card_payment' && v.direction === 'debit' && !decided && !v.user?.type && !dismissed(v, 'card_payment')) {
      const seen = cardSpendDates.some((d) => d <= v.date && v.date - d <= 60 * DAY);
      if (!seen) v.flags.push({ kind: 'card_payment', note: 'No card spending recorded before this bill payment' });
    }
    if (!decided && !v.user?.type && (v.kind === 'expense' || v.kind === 'income' || v.kind === 'refund')) {
      if (v.kind === 'expense' && v.cat === 'Other' && !categoryIsUserSet(v) && v.confidence < REVIEW_THRESHOLD) {
        v.flags.push({ kind: 'uncategorised' });
      } else if (v.confidence < 0.5 && !categoryIsUserSet(v)) {
        v.flags.push({ kind: 'low_confidence' });
      }
    }
  }

  /* 5. what counts towards totals */
  for (const v of views) {
    v.counted = !v.dupOf && !v.excluded && (v.kind === 'expense' || v.kind === 'income' || v.kind === 'refund');
  }

  /* 6. recurring payments */
  const recurring = detectRecurring(views, cats, new Set(dismissedRecurring), now);
  for (const s of recurring) for (const id of s.txnIds) byId.get(id)!.recurringKey = s.key;

  /* review queue */
  const review: ReviewItem[] = [];
  for (const v of views) {
    if (!v.flags.length || v.excluded) continue;
    const flag = [...v.flags].sort((a, b) => FLAG_PRIORITY.indexOf(a.kind) - FLAG_PRIORITY.indexOf(b.kind))[0];
    review.push({ txn: v, flag });
  }
  review.sort((a, b) => FLAG_PRIORITY.indexOf(a.flag.kind) - FLAG_PRIORITY.indexOf(b.flag.kind) || b.txn.date - a.txn.date);

  const all = views.sort((a, b) => b.date - a.date);
  return { all, byId, review, autoDupes, recurring };
}

/* ---------- transfers ---------- */

function pairTransfers(live: TxnView[]) {
  const reserved = new Set<string>();
  // honour manual links first
  for (const v of live) {
    if (v.user?.type === 'transfer' && v.user.linkedId) v.linkedId = v.user.linkedId;
  }

  const credits = new Map<number, TxnView[]>();
  for (const v of live) {
    if (v.direction !== 'credit' || v.linkedId) continue;
    if (v.kind !== 'income' && v.kind !== 'transfer') continue;
    const list = credits.get(v.amount) ?? [];
    list.push(v);
    credits.set(v.amount, list);
  }

  for (const d of live) {
    if (d.direction !== 'debit' || d.linkedId) continue;
    if (d.kind !== 'expense' && d.kind !== 'transfer') continue;
    const pool = credits.get(d.amount);
    if (!pool) continue;

    let best: TxnView | undefined;
    for (const c of pool) {
      if (c.linkedId || reserved.has(c.id)) continue;
      const gap = Math.abs(c.date - d.date);
      if (gap > DAY) continue;
      // Same account on both sides is a reversal, not a transfer.
      if (d.account && c.account && d.account === c.account) continue;
      if (!best || gap < Math.abs(best.date - d.date)) best = c;
    }
    if (!best) continue;
    const c = best;
    const gap = Math.abs(c.date - d.date);

    const selfWording = !!(d.tags?.includes('self') || c.tags?.includes('self'));
    const bothBanks = isBankSender(d.sender) && isBankSender(c.sender);
    const differentAccounts = !!(d.account && c.account && d.account !== c.account);
    const knownMerchant = d.confidence >= 0.9 && d.kind === 'expense' && !!d.merchant && d.cat !== 'Other';
    const userBlocked = !!(d.user?.type || c.user?.type || dismissed(d, 'transfer') || dismissed(c, 'transfer'));
    if (userBlocked) continue;

    const confident = selfWording || (differentAccounts && bothBanks && gap <= 30 * MIN && !knownMerchant);
    if (confident) {
      d.kind = 'transfer';
      c.kind = 'transfer';
      d.linkedId = c.id;
      c.linkedId = d.id;
    } else if (gap <= 3 * HOUR && !knownMerchant && (differentAccounts || normSender(d.sender) !== normSender(c.sender))) {
      // plausible but not certain: keep totals, ask the user
      d.flags.push({ kind: 'transfer', relatedId: c.id });
      c.flags.push({ kind: 'transfer', relatedId: d.id });
      reserved.add(c.id);
    }
  }
}

/* ---------- refunds ---------- */

function linkRefunds(live: TxnView[]) {
  const expensesByMerchant = new Map<string, TxnView[]>();
  for (const v of live) {
    if (v.kind !== 'expense') continue;
    const k = merchantKey(v.name);
    if (!k) continue;
    const list = expensesByMerchant.get(k) ?? [];
    list.push(v);
    expensesByMerchant.set(k, list);
  }
  const used = new Set<string>();
  const byTime = (a: TxnView, b: TxnView) => a.date - b.date;
  const credits = live.filter((v) => v.direction === 'credit').sort(byTime);

  for (const r of credits) {
    const k = merchantKey(r.name);
    const pool = k ? expensesByMerchant.get(k) : undefined;
    const findOriginal = (exact: boolean, windowDays: number) => {
      if (!pool) return undefined;
      let best: TxnView | undefined;
      for (const e of pool) {
        if (used.has(e.id) || e.date > r.date || r.date - e.date > windowDays * DAY) continue;
        if (exact ? e.amount !== r.amount : e.amount < r.amount) continue;
        if (!best || e.date > best.date) best = e;
      }
      return best;
    };

    if (r.kind === 'refund') {
      if (r.linkedId) continue;
      const orig = findOriginal(true, 120) ?? findOriginal(false, 120);
      if (orig) {
        used.add(orig.id);
        r.linkedId = orig.id;
        if (!categoryIsUserSet(r)) r.cat = orig.cat;
      }
      continue;
    }

    // Money back from a merchant you paid the same amount: maybe a refund.
    if (r.kind === 'income' && !r.user?.type && !r.user?.reviewed && !dismissed(r, 'refund')) {
      const orig = findOriginal(true, 60);
      if (orig) {
        used.add(orig.id);
        r.flags.push({ kind: 'refund', relatedId: orig.id });
      }
    }
  }
}
