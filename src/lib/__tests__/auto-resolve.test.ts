/**
 * The review philosophy, as tests: resolve what can be determined with useful
 * confidence; only genuinely ambiguous transactions reach Review.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../analyze';
import { buildCategoryMap } from '../categories';
import { learnedRule, ruleMatches, summarizeSync, upsertRule } from '../learning';
import { parseOne, parseSms } from '../parser';
import type { MerchantRule, Txn } from '../types';
import { buildInbox } from './fixtures/inbox';
import { DAY, MIN, T0, sms } from './helpers';

const cats = buildCategoryMap([]);
const NOW = new Date(2026, 9, 5).getTime();

describe('realistic inbox (8 months, ~600 transactions)', () => {
  const inbox = buildInbox();
  const pairs = inbox.map((m) => [m, parseOne(m)] as const).filter((p): p is [typeof p[0], Txn] => !!p[1]);
  const txns = pairs.map(([, t]) => t);
  const a = analyze(txns, [], cats, [], NOW);

  it('sends only a small fraction to Review (was 286 of 617 before v3.1)', () => {
    expect(txns.length).toBeGreaterThan(550);
    expect(a.review.length).toBeLessThanOrEqual(txns.length * 0.08);
    expect(a.stats.resolved + a.review.length).toBe(txns.length);
  });

  it('every automatic resolution matches the ground truth', () => {
    const wrong = pairs.filter(([m, t]) => {
      const v = a.byId.get(t.id)!;
      if (v.flags.length || m.truth === 'ambiguous') return false;
      const got = v.dupOf ? 'duplicate' : v.kind;
      return got !== m.truth;
    });
    expect(wrong.map(([m]) => m.body)).toEqual([]);
  });

  it('high-confidence cases never appear in Review', () => {
    const high = new Set(['duplicate', 'transfer', 'refund', 'card_payment', 'income']);
    const leaked = a.review.filter((r) => high.has(pairs.find(([, t]) => t.id === r.txn.id)![0].truth));
    expect(leaked).toEqual([]);
  });

  it('genuinely ambiguous transactions are still asked about', () => {
    const unclear = pairs.filter(([m]) => m.truth === 'ambiguous' && m.body!.startsWith('Txn of'));
    expect(unclear.length).toBeGreaterThan(0);
    for (const [, t] of unclear) expect(a.byId.get(t.id)?.flags.map((f) => f.kind)).toContain('unknown_type');
  });

  it('remaining category questions are grouped by payee: a few decisions clear them', () => {
    const payees = new Set(a.review.filter((r) => r.flag.kind === 'uncategorised').map((r) => r.txn.name));
    expect(payees.size).toBeLessThanOrEqual(4);
  });

  it('three learned rules clear every category question', () => {
    const payees = [...new Set(a.review.filter((r) => r.flag.kind === 'uncategorised').map((r) => r.txn))];
    let rules: MerchantRule[] = [];
    for (const v of payees) rules = upsertRule(rules, learnedRule(v, { category: 'Groceries' })!);
    const after = analyze(txns, rules, cats, [], NOW);
    expect(after.review.every((r) => r.flag.kind === 'unknown_type')).toBe(true);
  });
});

describe('learning from corrections', () => {
  const abc = () =>
    parseSms([1, 2, 3, 4].map((i) => sms(`Sent Rs.${i * 250}.00 From HDFC Bank A/C *1234 To ABC STOREZ`, { id: `a${i}`, date: T0 + i * DAY })));

  it('ABC → Groceries once applies to past and future payments', () => {
    const txns = abc();
    const rule = learnedRule(txns[0], { category: 'Groceries' })!;
    expect(rule).toMatchObject({ match: 'Abc Storez', category: 'Groceries', learned: true });
    expect(ruleMatches(rule, txns)).toHaveLength(4);
    const future = parseSms([sms('Sent Rs.99.00 From HDFC Bank A/C *1234 To ABC STOREZ', { id: 'f', date: T0 + 30 * DAY })]);
    const a = analyze([...txns, ...future], [rule], cats, [], NOW);
    expect([...a.byId.values()].every((v) => v.cat === 'Groceries')).toBe(true);
    expect(a.review).toHaveLength(0);
  });

  it('learned transfer rule classifies future payments to the same payee', () => {
    const [t] = parseSms([sms('Rs.5000.00 debited from a/c **1234 to VPA my.savings@okicici', { id: 't' })]);
    const rule = learnedRule(t, { type: 'transfer' })!;
    expect(rule).toMatchObject({ type: 'transfer', direction: 'debit' });
    const next = parseSms([sms('Rs.7000.00 debited from a/c **1234 to VPA my.savings@okicici', { id: 'n', date: T0 + 5 * DAY })]);
    expect(analyze(next, [rule], cats).byId.get('n')?.kind).toBe('transfer');
  });

  it('learned refund rule only applies to money coming in', () => {
    const [cr] = parseSms([sms('Rs 300 credited to your a/c XX1234 from ABC STOREZ', { id: 'c' })]);
    const rule = learnedRule(cr, { type: 'refund' })!;
    const out = parseSms([
      sms('Sent Rs.300.00 From A/C *1234 To ABC STOREZ', { id: 'o', date: T0 + DAY }),
      sms('Rs 120 credited to your a/c XX1234 from ABC STOREZ', { id: 'i', date: T0 + 2 * DAY }),
    ]);
    const a = analyze(out, [rule], cats);
    expect(a.byId.get('o')?.kind).toBe('expense');
    expect(a.byId.get('i')?.kind).toBe('refund');
  });

  it('no rule is learned without a payee to match on', () => {
    const [t] = parseSms([sms('Rs 500 debited from a/c XX1234', { id: 'x' })]);
    expect(learnedRule(t, { category: 'Food' })).toBeUndefined();
  });

  it('re-learning replaces the old learned rule; manual rules are never overwritten', () => {
    const [t] = abc();
    let rules = upsertRule([], learnedRule(t, { category: 'Groceries' })!);
    rules = upsertRule(rules, learnedRule(t, { category: 'Home' })!);
    expect(rules).toHaveLength(1);
    expect(rules[0].category).toBe('Home');
    const manual: MerchantRule = { id: 'm', match: 'Abc Storez', category: 'Shopping' };
    const kept = upsertRule([manual], learnedRule(t, { category: 'Food' })!);
    expect(kept).toHaveLength(1);
    expect(kept[0].learned).toBeUndefined();
  });

  it('manual rules beat learned ones, and rules match whole words only', () => {
    const txns = abc();
    const rules: MerchantRule[] = [
      { id: 'l', match: 'Abc Storez', category: 'Home', learned: true },
      { id: 'm', match: 'abc storez', category: 'Groceries' },
    ];
    expect(analyze(txns, rules, cats).byId.get('a1')?.cat).toBe('Groceries');
    // "ABC" must not match "ABCD MART"
    const other = parseSms([sms('Sent Rs.10.00 From A/C *1234 To ABCD TRADERS', { id: 'z' })]);
    expect(analyze(other, [{ id: 'r', match: 'abc', category: 'Food' }], cats).byId.get('z')?.cat).not.toBe('Food');
  });

  it('rule type action: "Pattern → Transfer" excludes from spending', () => {
    const txns = abc();
    const a = analyze(txns, [{ id: 'r', match: 'ABC STOREZ', type: 'transfer' }], cats);
    expect([...a.byId.values()].every((v) => v.kind === 'transfer' && !v.counted)).toBe(true);
  });
});

describe('sync summary', () => {
  it('reports what was handled for the new transactions', () => {
    const txns = parseSms([
      sms('Rs 842 spent on Card XX1234 at SWIGGY', { id: 'food' }),
      sms('Rs 842 paid using Paytm UPI from HDFC Bank a/c XX1234', { id: 'dup', address: 'JD-PAYTMB', date: T0 + MIN }),
      sms('Rs.20000 debited from A/c XX1234. IMPS to A/c XX9876', { id: 'out', date: T0 + 2 * DAY }),
      sms('Your A/C XXXXX9876 has been credited by Rs.20000.00 by IMPS', { id: 'in', address: 'JD-SBIINB', date: T0 + 2 * DAY + 5 * MIN }),
      sms('Txn of Rs 700.00 on your card XX1234', { id: 'u', date: T0 + 3 * DAY }),
    ]);
    const s = summarizeSync(analyze(txns, [], cats), txns.map((t) => t.id));
    expect(s).toMatchObject({ newCount: 4, categorised: 1, duplicates: 1, transfers: 2, attention: 1 });
  });
});
