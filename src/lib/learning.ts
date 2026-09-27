/**
 * Learning from corrections. When you fix one transaction, a local rule is
 * created so the same payee is handled automatically from then on. Rules live
 * in localStorage with everything else: nothing is sent anywhere.
 */
import { compileRules, matchRule, ruleNeedle, type Analysis } from './analyze';
import { KNOWN_NAMES } from './merchants';
import type { MerchantRule, Txn, TxnType, TxnView } from './types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const newRuleId = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The rule to learn from a correction, or undefined when the pattern isn't
 * reliable enough (no payee name to match on).
 */
export function learnedRule(v: Pick<TxnView, 'merchant' | 'merchantRaw' | 'direction'>, change: { category?: string; type?: TxnType }): MerchantRule | undefined {
  const match = ruleNeedle(v);
  if (!match || norm(match).length < 2) return undefined;
  if (change.category) return { id: newRuleId(), match, category: change.category, learned: true };
  if (change.type === 'transfer') return { id: newRuleId(), match, type: 'transfer', direction: v.direction, learned: true };
  if (change.type === 'refund' && v.direction === 'credit') return { id: newRuleId(), match, type: 'refund', direction: 'credit', learned: true };
  if (change.type === 'income' && v.direction === 'credit') return { id: newRuleId(), match, type: 'income', direction: 'credit', learned: true };
  return undefined;
}

/** Should a category change on this payee apply to all its payments by default? */
export const learnByDefault = (v: Pick<TxnView, 'merchant'>) => !v.merchant || !KNOWN_NAMES.has(v.merchant);

/** Adds a rule, replacing an older learned rule for the same payee and purpose. */
export function upsertRule(rules: MerchantRule[], rule: MerchantRule): MerchantRule[] {
  const same = (r: MerchantRule) =>
    norm(r.match) === norm(rule.match) && !!r.category === !!rule.category && (r.direction ?? '') === (rule.direction ?? '');
  const existing = rules.find((r) => same(r) && (r.learned || rule.learned));
  if (!existing) return [...rules, rule];
  // never silently overwrite a rule you wrote by hand with a learned one
  if (!existing.learned && rule.learned) return rules.map((r) => (r === existing ? { ...existing, ...pick(rule) } : r));
  return rules.map((r) => (r === existing ? { ...rule, id: existing.id } : r));
}

const pick = (r: MerchantRule) => ({ category: r.category, type: r.type });

/** Ids of transactions a rule would apply to. */
export function ruleMatches(rule: MerchantRule, txns: Array<Pick<Txn, 'id' | 'merchant' | 'merchantRaw' | 'direction'>>): string[] {
  const compiled = compileRules([rule]);
  return txns.filter((t) => matchRule(t, compiled)).map((t) => t.id);
}

/* ---------- sync summary ---------- */

export interface SyncSummary {
  at: number;
  newCount: number;
  categorised: number;
  otherKept: number;
  duplicates: number;
  transfers: number;
  refunds: number;
  cardPayments: number;
  attention: number;
  ids: string[];
}

/** What happened to the transactions added by a sync. */
export function summarizeSync(a: Analysis, newIds: string[], at = Date.now()): SyncSummary {
  const s: SyncSummary = { at, newCount: 0, categorised: 0, otherKept: 0, duplicates: 0, transfers: 0, refunds: 0, cardPayments: 0, attention: 0, ids: newIds };
  for (const id of newIds) {
    const v = a.byId.get(id);
    if (!v) continue;
    if (v.dupOf && !v.flags.length) {
      s.duplicates++;
      continue;
    }
    s.newCount++;
    if (v.flags.length) s.attention++;
    else if (v.kind === 'transfer') s.transfers++;
    else if (v.kind === 'refund') s.refunds++;
    else if (v.kind === 'card_payment') s.cardPayments++;
    else if (v.kind === 'expense' && v.cat === 'Other') s.otherKept++;
    else s.categorised++;
  }
  return s;
}
