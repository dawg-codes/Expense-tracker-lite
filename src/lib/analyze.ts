/**
 * Cross-transaction analysis. Pure and deterministic: takes stored
 * transactions + user rules and returns derived views. Nothing here is
 * persisted, so changing a rule or fixing a heuristic re-applies to history.
 *
 * Review philosophy: resolve everything that can be determined with useful
 * confidence, and only ask when a wrong guess would materially change your
 * numbers. Every transaction ends in one of three tiers:
 *
 *   high    certain: clear wording, known merchant, exact duplicate, account-to-account match…
 *   medium  resolved by a reliable heuristic (payee-name category, bank + app alert pair…)
 *   review  genuinely ambiguous: we ask you, and totals stay as-is until you decide
 */
import type { CategoryMap } from './categories';
import { dedupe, isBankSender } from './parser';
import { KNOWN_NAMES, inferCategoryFromName, merchantKey } from './merchants';
import { detectRecurring, type RecurringSeries } from './recurring';
import type { Flag, FlagKind, MerchantRule, Txn, TxnView } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const REVIEW_THRESHOLD = 0.6;

/** An unknown merchant is only worth asking about once it adds up. */
export const CATEGORY_ASK_MIN_COUNT = 3;
export const CATEGORY_ASK_MIN_TOTAL = 2000;
/** A lone IMPS/NEFT debit this large with no payee might be to your own account elsewhere. */
export const LONE_TRANSFER_MIN = 5000;

export interface AutoStats {
  /** Transactions resolved without asking (includes duplicates ignored). */
  resolved: number;
  duplicates: number;
  transfers: number;
  refunds: number;
  cardPayments: number;
  /** Placed in a category automatically (known merchant, keyword, payee name, rule). */
  categorised: number;
  /** Small one-off payments to unknown payees, kept in Other without asking. */
  otherKept: number;
}

export interface Analysis {
  /** Every transaction (duplicates included), newest first. */
  all: TxnView[];
  byId: Map<string, TxnView>;
  /** Items needing attention, highest priority first. */
  review: ReviewItem[];
  /** Duplicates dropped automatically. */
  autoDupes: TxnView[];
  recurring: RecurringSeries[];
  stats: AutoStats;
}

export interface ReviewItem {
  txn: TxnView;
  flag: Flag;
}

const FLAG_PRIORITY: FlagKind[] = ['duplicate', 'unknown_type', 'transfer', 'refund', 'card_payment', 'uncategorised', 'low_confidence'];

/* ---------- rules ---------- */

interface Compiled {
  rule: MerchantRule;
  needle: string;
}

/** Lowercase, punctuation → spaces, so "murugan.stores@okaxis" matches "MURUGAN STORES". */
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

export function compileRules(rules: MerchantRule[]): Compiled[] {
  // manual rules first so they win over learned ones
  return [...rules]
    .sort((a, b) => Number(!!a.learned) - Number(!!b.learned))
    .map((rule) => ({ rule, needle: norm(rule.match) }))
    .filter((c) => c.needle.trim().length > 0);
}

/** Whole-word match against the payee as written and the normalised merchant. */
export function matchRule(t: Pick<Txn, 'merchant' | 'merchantRaw' | 'direction'>, compiled: Compiled[]): MerchantRule | undefined {
  if (!compiled.length) return undefined;
  const hay = norm(`${t.merchantRaw ?? ''} ${t.merchant ?? ''}`);
  if (!hay.trim()) return undefined;
  return compiled.find((c) => (!c.rule.direction || c.rule.direction === t.direction) && hay.includes(c.needle))?.rule;
}

/** The text a learned rule should match for this transaction. */
export function ruleNeedle(t: Pick<Txn, 'merchant' | 'merchantRaw'>): string | undefined {
  if (t.merchant) return t.merchant;
  const raw = t.merchantRaw?.replace(/[*@].*$/, '').trim();
  return raw || undefined;
}

function dismissed(t: Txn, kind: FlagKind): boolean {
  return !!t.user?.dismissed?.includes(kind);
}

/** Applies overrides and custom rules to one transaction. */
function baseView(t: Txn, compiled: Compiled[], cats: CategoryMap): TxnView {
  const u = t.user ?? {};
  const rule = matchRule(t, compiled);
  const kind = u.type ?? rule?.type ?? t.type;
  let cat = u.category ?? rule?.category ?? t.category;
  if (!u.category && !rule?.category) {
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
    catByRule: !!rule?.category && !u.category,
    linkedId: u.linkedId,
    autoNote: rule ? `${rule.learned ? 'Learned from your earlier choice' : 'Your rule'}: “${rule.match}”` : undefined,
    tier: 'high',
    flags: [],
    counted: false,
  };
}

/** A category the user explicitly chose (override or rule). */
export const categoryIsUserSet = (v: TxnView) => !!v.user?.category || !!v.catByRule;

const isKnownMerchant = (v: TxnView) => !!v.merchant && KNOWN_NAMES.has(v.merchant);

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
  const userCat = categoryIsUserSet;

  /* 1. duplicates */
  const forceKeep = new Set(txns.filter((t) => t.user?.notDuplicate).map((t) => t.id));
  const { unique, dupes } = dedupe(txns, forceKeep);
  const autoDupes: TxnView[] = [];
  for (const d of dupes) {
    const v = byId.get(d.txn.id)!;
    v.dupOf = d.keptId;
    v.dupReason = d.reason;
    v.autoNote = d.reason;
    if (d.certain || v.user?.reviewed || dismissed(v, 'duplicate')) autoDupes.push(v);
    else v.flags.push({ kind: 'duplicate', relatedId: d.keptId, note: d.reason });
  }
  const live = unique.map((t) => byId.get(t.id)!).filter((v) => !v.excluded);

  /* 2. category from the payee's name, when nothing better is known */
  for (const v of live) {
    if (v.kind !== 'expense' || v.cat !== 'Other' || userCat(v)) continue;
    const guess = inferCategoryFromName(v.name, v.merchantRaw);
    if (guess && cats.has(guess.category)) {
      v.cat = guess.category;
      v.inferred = true;
      v.autoNote = guess.reason;
    }
  }

  /* 3. own-account transfers */
  pairTransfers(live);

  /* 4. refunds */
  linkRefunds(live);

  /* 5. credit-card bill payments: fine to exclude once we know your card spending is recorded */
  const cardEvidence = live.filter((v) => (v.kind === 'expense' && v.tags?.includes('card')) || (v.kind === 'card_payment' && v.direction === 'credit'));
  for (const v of live) {
    if (v.kind !== 'card_payment') continue;
    v.autoNote = 'Credit-card bill payment: the card purchases themselves are counted';
    if (v.direction !== 'debit' || v.user?.reviewed || v.user?.type || dismissed(v, 'card_payment')) continue;
    const seen = cardEvidence.some((e) => e.date <= v.date + 5 * DAY && v.date - e.date <= 60 * DAY);
    if (!seen) v.flags.push({ kind: 'card_payment', note: 'No card spending recorded before this bill payment' });
  }

  /* 6. remaining per-transaction questions */
  const otherGroups = new Map<string, TxnView[]>();
  for (const v of live) {
    const decided = !!v.user?.reviewed || !!v.user?.type;
    if (v.kind === 'unknown' && !decided) v.flags.push({ kind: 'unknown_type' });
    // only abbreviated "Dr/Cr" wording with no account or reference: might not be a transaction at all
    if (!decided && v.tags?.includes('weak') && !v.account && !v.ref && (v.kind === 'expense' || v.kind === 'income')) {
      v.flags.push({ kind: 'low_confidence' });
    }
    // a lone large IMPS/NEFT with no payee could be money to your own account at another bank
    if (!decided && v.kind === 'expense' && !v.name && v.cat === 'Other' && v.tags?.includes('rail') && v.amount >= LONE_TRANSFER_MIN && !dismissed(v, 'transfer')) {
      v.flags.push({ kind: 'transfer', note: 'Large bank transfer with no payee named' });
    }
    if (v.kind === 'expense' && v.cat === 'Other' && !isKnownMerchant(v) && !userCat(v) && !decided && !dismissed(v, 'uncategorised')) {
      const k = merchantKey(v.name);
      if (k) {
        const g = otherGroups.get(k) ?? [];
        g.push(v);
        otherGroups.set(k, g);
      }
    }
  }
  // Unknown payees: ask once per payee, and only when it adds up to something.
  for (const g of otherGroups.values()) {
    const total = g.reduce((a, v) => a + v.amount, 0);
    if (g.length >= CATEGORY_ASK_MIN_COUNT || total >= CATEGORY_ASK_MIN_TOTAL) {
      for (const v of g) v.flags.push({ kind: 'uncategorised', note: `${g.length} payment${g.length === 1 ? '' : 's'} to this payee` });
    }
  }

  /* 7. what counts towards totals */
  for (const v of views) {
    v.counted = !v.dupOf && !v.excluded && (v.kind === 'expense' || v.kind === 'income' || v.kind === 'refund');
  }

  /* 8. recurring payments */
  const recurring = detectRecurring(views, cats, new Set(dismissedRecurring), now);
  for (const s of recurring) for (const id of s.txnIds) byId.get(id)!.recurringKey = s.key;

  /* 9. tiers, review queue, stats */
  const stats: AutoStats = { resolved: 0, duplicates: 0, transfers: 0, refunds: 0, cardPayments: 0, categorised: 0, otherKept: 0 };
  const review: ReviewItem[] = [];
  for (const v of views) {
    if (v.excluded) continue;
    if (v.flags.length) {
      v.tier = 'review';
      const flag = [...v.flags].sort((a, b) => FLAG_PRIORITY.indexOf(a.kind) - FLAG_PRIORITY.indexOf(b.kind))[0];
      review.push({ txn: v, flag });
      continue;
    }
    const heuristic = v.inferred || (v.dupOf && v.dupReason !== 'Same reference number' && v.dupReason !== 'Identical message') || (v.kind === 'expense' && v.cat === 'Other');
    v.tier = v.user || v.ruleId ? 'high' : heuristic ? 'medium' : 'high';
    if (v.user && !v.dupOf) continue; // decided by you, not "automatic"
    stats.resolved++;
    if (v.dupOf) stats.duplicates++;
    else if (v.kind === 'transfer') stats.transfers++;
    else if (v.kind === 'refund') stats.refunds++;
    else if (v.kind === 'card_payment') stats.cardPayments++;
    else if (v.kind === 'expense' && v.cat === 'Other') stats.otherKept++;
    else stats.categorised++;
  }
  review.sort((a, b) => FLAG_PRIORITY.indexOf(a.flag.kind) - FLAG_PRIORITY.indexOf(b.flag.kind) || b.txn.date - a.txn.date);

  const all = views.sort((a, b) => b.date - a.date);
  return { all, byId, review, autoDupes, recurring, stats };
}

/* ---------- transfers ---------- */

function markTransfer(d: TxnView, c: TxnView | undefined, note: string) {
  d.kind = 'transfer';
  d.autoNote = note;
  if (c) {
    c.kind = 'transfer';
    c.autoNote = note;
    d.linkedId = c.id;
    c.linkedId = d.id;
  }
}

function pairTransfers(live: TxnView[]) {
  const reserved = new Set<string>();
  const userBlocked = (v: TxnView) => !!(v.user?.type || dismissed(v, 'transfer'));
  // honour manual links first
  for (const v of live) {
    if (v.user?.type === 'transfer' && v.user.linkedId) v.linkedId = v.user.linkedId;
  }

  // Accounts you receive alerts for are yours. So are accounts you've told us were transfers.
  const own = new Set<string>();
  for (const v of live) {
    if (v.account) own.add(v.account);
    if (v.user?.type === 'transfer' && v.counterAccount) own.add(v.counterAccount);
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
    if (userBlocked(d)) continue;

    let best: TxnView | undefined;
    for (const c of credits.get(d.amount) ?? []) {
      if (c.linkedId || reserved.has(c.id) || userBlocked(c)) continue;
      const gap = Math.abs(c.date - d.date);
      if (gap > DAY) continue;
      // Same account on both sides is a reversal, not a transfer.
      if (d.account && c.account && d.account === c.account) continue;
      if (!best || gap < Math.abs(best.date - d.date)) best = c;
    }

    if (best) {
      const c = best;
      const gap = Math.abs(c.date - d.date);
      const selfWording = !!(d.tags?.includes('self') || c.tags?.includes('self'));
      const accountsMatch = (!!d.counterAccount && d.counterAccount === c.account) || (!!c.counterAccount && c.counterAccount === d.account);
      const bothBanks = isBankSender(d.sender) && isBankSender(c.sender);
      const differentAccounts = !!(d.account && c.account && d.account !== c.account);
      const knownMerchant = d.kind === 'expense' && isKnownMerchant(d);
      const noCounterparty = !d.name && !c.name;

      if (accountsMatch || selfWording) {
        markTransfer(d, c, `Own-account transfer ${d.account ?? ''} → ${c.account ?? ''}`.replace(/\s+/g, ' ').trim());
        continue;
      }
      if (differentAccounts && bothBanks && !knownMerchant && noCounterparty && gap <= 2 * HOUR) {
        markTransfer(d, c, 'Own-account transfer: matching debit and credit on two of your accounts');
        continue;
      }
      if (differentAccounts && !knownMerchant && gap <= 3 * HOUR && (noCounterparty || d.tags?.includes('rail'))) {
        // plausible but not certain: keep totals, ask the user
        d.flags.push({ kind: 'transfer', relatedId: c.id });
        c.flags.push({ kind: 'transfer', relatedId: d.id });
        reserved.add(c.id);
        continue;
      }
    }

    // single leg: the alert names another account of yours
    if (d.counterAccount && own.has(d.counterAccount) && d.kind === 'expense') {
      markTransfer(d, undefined, `Transfer to your account ${d.counterAccount}`);
    }
  }

  for (const c of live) {
    if (c.direction === 'credit' && c.kind === 'income' && !c.linkedId && !userBlocked(c) && c.counterAccount && own.has(c.counterAccount)) {
      markTransfer(c, undefined, `Transfer from your account ${c.counterAccount}`);
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
  const credits = live.filter((v) => v.direction === 'credit').sort((a, b) => a.date - b.date);

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
    const link = (orig: TxnView) => {
      used.add(orig.id);
      r.linkedId = orig.id;
      if (!r.user?.category) r.cat = orig.cat;
    };

    if (r.kind === 'refund') {
      if (r.linkedId) continue;
      const orig = findOriginal(true, 120) ?? findOriginal(false, 120);
      r.autoNote ??= 'Refund wording in the alert';
      if (orig) {
        link(orig);
        r.autoNote = `Refund of your ${orig.name || 'earlier'} purchase`;
      }
      continue;
    }

    if (r.kind !== 'income' || r.user?.type || r.user?.reviewed || dismissed(r, 'refund')) continue;
    const orig = findOriginal(true, 60);
    if (!orig) continue;
    if (isKnownMerchant(r)) {
      // Merchants like Amazon don't pay you income: the same amount back is a refund.
      r.kind = 'refund';
      link(orig);
      r.autoNote = `Refund: ${r.name} returned the exact amount of a recent purchase`;
    } else {
      used.add(orig.id);
      r.flags.push({ kind: 'refund', relatedId: orig.id });
    }
  }
}
