import { describe, expect, it } from 'vitest';
import { analyze } from '../analyze';
import { buildCategoryMap } from '../categories';
import { summarize } from '../insights';
import { parseSms } from '../parser';
import type { MerchantRule, Txn } from '../types';
import { DAY, MIN, T0, sms } from './helpers';

const cats = buildCategoryMap([]);
const run = (txns: Txn[], rules: MerchantRule[] = []) => analyze(txns, rules, cats, [], T0 + DAY);

describe('duplicates', () => {
  it('certain duplicates are dropped silently and listed separately', () => {
    const body = 'Rs 500 debited from a/c XX1234 at SWIGGY';
    const a = run(parseSms([sms(body, { id: 'a' }), sms(body, { id: 'b', date: T0 + MIN })]));
    expect(a.autoDupes.map((v) => v.id)).toEqual(['b']);
    expect(a.review).toHaveLength(0);
    expect(summarize(a.all, cats).spent).toBe(500);
  });

  it('bank + payment-app alert pair is resolved automatically (no Review)', () => {
    const a = run(
      parseSms([
        sms('Rs 2,499 debited from a/c XX1234 at AMAZON', { id: 'a' }),
        sms('Paid Rs 2,499 to Amazon', { id: 'b', address: 'JD-PAYTMB', date: T0 + 2 * MIN }),
      ]),
    );
    expect(a.review).toHaveLength(0);
    expect(a.byId.get('b')?.dupOf).toBe('a');
    expect(summarize(a.all, cats).spent).toBe(2499);
  });

  it('two different banks reporting the same amount still go to Review', () => {
    const a = run(
      parseSms([
        sms('Rs 500 debited from a/c XX1234', { id: 'a' }),
        sms('Rs 500 debited from a/c XX7777', { id: 'b', address: 'AX-ICICIB', date: T0 + 3 * MIN }),
      ]),
    );
    expect(a.review.map((r) => [r.txn.id, r.flag.kind])).toEqual([['b', 'duplicate']]);
  });

  it('"not a duplicate" makes it count', () => {
    const txns = parseSms([
      sms('Rs 2,499 debited from a/c XX1234 at AMAZON', { id: 'a' }),
      sms('Paid Rs 2,499 to Amazon', { id: 'b', address: 'JD-PAYTMB', date: T0 + 2 * MIN }),
    ]);
    txns[1].user = { notDuplicate: true };
    const a = run(txns);
    expect(a.review).toHaveLength(0);
    expect(summarize(a.all, cats).spent).toBe(4998);
  });
});

describe('own-account transfers', () => {
  const legs = () =>
    parseSms([
      sms('Rs.20000 debited from A/c XX1234 on 10-09-26. IMPS to A/c XX9876 Ref 612345678905', { id: 'out' }),
      sms('Rs 20000.00 credited to your A/c XX9876 via IMPS from A/c XX1234. Ref 612345678906', {
        id: 'in',
        address: 'AX-KOTAKB',
        date: T0 + 3 * MIN,
      }),
    ]);

  it('A debited + B credited quickly becomes an internal transfer, not spending', () => {
    const a = run(legs());
    expect(a.byId.get('out')?.kind).toBe('transfer');
    expect(a.byId.get('in')?.kind).toBe('transfer');
    expect(a.byId.get('out')?.linkedId).toBe('in');
    const s = summarize(a.all, cats);
    expect(s.spent).toBe(0);
    expect(s.income).toBe(0);
    expect(s.transfers).toBe(20000);
  });

  it('slow legs are resolved when the debit names the credited account', () => {
    const a = run(
      parseSms([
        sms('Rs.20000 debited from A/c XX1234. IMPS to A/c XX9876 Ref 612345678905', { id: 'out' }),
        sms('Your A/C XXXXX9876 has been credited by Rs.20000.00 by IMPS', { id: 'in', address: 'JD-SBIINB', date: T0 + 55 * MIN }),
      ]),
    );
    expect(a.byId.get('out')?.kind).toBe('transfer');
    expect(a.byId.get('in')?.kind).toBe('transfer');
    expect(a.review).toHaveLength(0);
  });

  it('a single leg to one of your own accounts is a transfer', () => {
    const a = run(
      parseSms([
        sms('Rs 3,000 credited to your A/c XX9876 by NEFT from ACME', { id: 'salary', address: 'JD-SBIINB' }),
        sms('Rs.8000 debited from A/c XX1234. IMPS to A/c XX9876', { id: 'out', date: T0 + 3 * DAY }),
      ]),
    );
    expect(a.byId.get('out')?.kind).toBe('transfer');
  });

  it('a looser match is only flagged for review; totals are unchanged', () => {
    const txns = parseSms([
      sms('Rs 20,000 debited from A/c XX1234', { id: 'out' }),
      sms('Rs 20,000 credited to your A/c XX9876', { id: 'in', address: 'AX-KOTAKB', date: T0 + 150 * MIN }),
    ]);
    const a = run(txns);
    expect(a.byId.get('out')?.kind).toBe('expense');
    expect(a.review.some((r) => r.flag.kind === 'transfer')).toBe(true);
    expect(summarize(a.all, cats).spent).toBe(20000);
  });

  it('does not pair a known-merchant purchase with an unrelated credit', () => {
    const a = run(
      parseSms([
        sms('Rs 842 spent on HDFC Bank Card XX1234 at SWIGGY', { id: 'food' }),
        sms('Rs 842 credited to your A/c XX9876 from john@okaxis', { id: 'in', address: 'AX-KOTAKB', date: T0 + 5 * MIN }),
      ]),
    );
    expect(a.byId.get('food')?.kind).toBe('expense');
    expect(a.review.some((r) => r.flag.kind === 'transfer')).toBe(false);
  });

  it('never pairs legs on the same account (that is a reversal)', () => {
    const a = run(
      parseSms([
        sms('Rs 5,000 debited from A/c XX1234', { id: 'out' }),
        sms('Rs 5,000 credited to A/c XX1234', { id: 'in', address: 'AX-KOTAKB', date: T0 + MIN * 5 }),
      ]),
    );
    expect(a.byId.get('out')?.kind).toBe('expense');
  });

  it('user can reject the transfer suggestion', () => {
    const txns = parseSms([
      sms('Rs 20,000 debited from A/c XX1234', { id: 'out' }),
      sms('Rs 20,000 credited to your A/c XX9876', { id: 'in', address: 'AX-KOTAKB', date: T0 + 150 * MIN }),
    ]);
    txns[0].user = { dismissed: ['transfer'] };
    expect(run(txns).review.some((r) => r.flag.kind === 'transfer')).toBe(false);
  });
});

describe('refunds', () => {
  it('links a refund to the original purchase and nets it out', () => {
    const a = run(
      parseSms([
        sms('INR 2,499 debited from card XX1234 at AMAZON on 18-09-26', { id: 'buy' }),
        sms('Refund of Rs 2,499.00 from AMAZON has been credited to your card XX1234', { id: 'ref', date: T0 + 3 * DAY }),
      ]),
    );
    const r = a.byId.get('ref')!;
    expect(r.kind).toBe('refund');
    expect(r.linkedId).toBe('buy');
    expect(r.cat).toBe('Shopping');
    const s = summarize(a.all, cats);
    expect(s.gross).toBe(2499);
    expect(s.refunds).toBe(2499);
    expect(s.spent).toBe(0);
    expect(s.income).toBe(0);
  });

  it('a known merchant returning the exact amount is resolved as a refund automatically', () => {
    const a = run(
      parseSms([
        sms('Rs 1,299 debited from a/c XX1234 at AMAZON', { id: 'buy' }),
        sms('Rs 1,299 credited to your a/c XX1234 from AMAZON', { id: 'cr', date: T0 + DAY }),
      ]),
    );
    expect(a.byId.get('cr')).toMatchObject({ kind: 'refund', linkedId: 'buy' });
    expect(a.review).toHaveLength(0);
  });

  it('an unknown payee sending back the same amount is only a possible refund', () => {
    const a = run(
      parseSms([
        sms('Sent Rs.1,299.00 From A/C *1234 To ABC ENTERPRISES', { id: 'buy' }),
        sms('Rs 1,299 credited to your a/c XX1234 from ABC ENTERPRISES', { id: 'cr', date: T0 + DAY }),
      ]),
    );
    expect(a.byId.get('cr')?.kind).toBe('income');
    expect(a.review.find((r) => r.txn.id === 'cr')?.flag).toMatchObject({ kind: 'refund', relatedId: 'buy' });
  });
});

describe('credit-card payments', () => {
  it('bill payments are not spending', () => {
    const a = run(parseSms([sms('Rs 15,000 debited from A/c XX1234 towards credit card bill payment', { id: 'cc' })]));
    expect(summarize(a.all, cats).spent).toBe(0);
  });

  it('asks for review when no card spending was ever recorded', () => {
    const a = run(parseSms([sms('Rs 15,000 debited from A/c XX1234 towards credit card bill payment', { id: 'cc' })]));
    expect(a.review.map((r) => r.flag.kind)).toContain('card_payment');
  });

  it('no review needed when card spends were recorded', () => {
    const a = run(
      parseSms([
        sms('Rs 999 spent on your ICICI credit card XX1234 at FLIPKART', { id: 'spend', address: 'VM-ICICIB' }),
        sms('Rs 999 debited from A/c XX5555 towards credit card bill payment', { id: 'cc', date: T0 + 20 * DAY }),
      ]),
    );
    expect(a.review.map((r) => r.flag.kind)).not.toContain('card_payment');
    expect(summarize(a.all, cats).spent).toBe(999);
  });

  it('user can count a card payment as an expense', () => {
    const txns = parseSms([sms('Rs 15,000 debited from A/c XX1234 towards credit card bill payment', { id: 'cc' })]);
    txns[0].user = { type: 'expense' };
    expect(summarize(run(txns).all, cats).spent).toBe(15000);
  });
});

describe('review queue', () => {
  it('a small one-off unknown payee is kept in Other without asking', () => {
    const a = run(parseSms([sms('Sent Rs.840.00 From HDFC Bank A/C *1234 To ABC ENTERPRISES On 26/09/26', { id: 'x' })]));
    expect(a.review).toHaveLength(0);
    expect(a.byId.get('x')).toMatchObject({ cat: 'Other', tier: 'medium', counted: true });
    expect(summarize(a.all, cats).spent).toBe(840);
  });

  it('a repeated unknown payee → one "needs category" group', () => {
    const a = run(
      parseSms([1, 2, 3].map((i) => sms(`Sent Rs.${i * 100}.00 From HDFC Bank A/C *1234 To ABC ENTERPRISES`, { id: `x${i}`, date: T0 + i * DAY }))),
    );
    expect(a.review.map((r) => r.flag.kind)).toEqual(['uncategorised', 'uncategorised', 'uncategorised']);
    // still counted: uncertain results are never hidden
    expect(summarize(a.all, cats).spent).toBe(600);
  });

  it('payee names place obvious businesses and people automatically', () => {
    const a = run(
      parseSms([
        sms('Sent Rs.120.00 From HDFC Bank A/C *1234 To SRI LAKSHMI STORES', { id: 'shop' }),
        sms('Sent Rs.500.00 From HDFC Bank A/C *1234 To RAHUL KUMAR', { id: 'friend' }),
        sms('Rs.90.00 debited from a/c **1234 to VPA annapoornahotel@ybl', { id: 'hotel' }),
      ]),
    );
    expect(a.byId.get('shop')).toMatchObject({ cat: 'Groceries', inferred: true, tier: 'medium' });
    expect(a.byId.get('friend')?.cat).toBe('People');
    expect(a.byId.get('hotel')?.cat).toBe('Food');
    expect(a.review).toHaveLength(0);
  });

  it('unknown type is excluded from totals until decided', () => {
    const a = run(parseSms([sms('Txn of Rs 700.00 on your card XX1234', { id: 'u' })]));
    expect(a.review[0].flag.kind).toBe('unknown_type');
    expect(summarize(a.all, cats).spent).toBe(0);
  });

  it('confirmed (reviewed) items leave the queue', () => {
    const txns = parseSms([sms('Sent Rs.840.00 From A/C *1234 To ABC ENTERPRISES', { id: 'x' })]);
    txns[0].user = { reviewed: true };
    expect(run(txns).review).toHaveLength(0);
  });

  it('excluded items leave totals and the queue', () => {
    const txns = parseSms([sms('Sent Rs.840.00 From A/C *1234 To ABC ENTERPRISES', { id: 'x' })]);
    txns[0].user = { excluded: true };
    const a = run(txns);
    expect(a.review).toHaveLength(0);
    expect(summarize(a.all, cats).spent).toBe(0);
  });
});

describe('custom merchant rules', () => {
  const txns = () => parseSms([sms('Rs.500.00 debited from a/c **1234 to VPA murugan.stores@okaxis', { id: 'm' })]);

  it('rule category beats automatic categorisation', () => {
    const a = run(txns(), [{ id: 'r1', match: 'MURUGAN STORES', category: 'Groceries' }]);
    const v = a.byId.get('m')!;
    expect(v.cat).toBe('Groceries');
    expect(v.ruleId).toBe('r1');
    expect(a.review).toHaveLength(0);
  });

  it('rule can rename the merchant', () => {
    const a = run(txns(), [{ id: 'r1', match: 'murugan', category: 'Groceries', rename: 'Murugan Stores (local)' }]);
    expect(a.byId.get('m')?.name).toBe('Murugan Stores (local)');
  });

  it('rules beat known-merchant categories too', () => {
    const a = run(parseSms([sms('Rs 400 spent at SWIGGY on card XX1111', { id: 's' })]), [
      { id: 'r', match: 'swiggy', category: 'Groceries' },
    ]);
    expect(a.byId.get('s')?.cat).toBe('Groceries');
  });

  it('a manual category beats a rule', () => {
    const t = txns();
    t[0].user = { category: 'Home' };
    expect(run(t, [{ id: 'r1', match: 'murugan', category: 'Groceries' }]).byId.get('m')?.cat).toBe('Home');
  });

  it('deleted custom category falls back to Other', () => {
    const t = txns();
    t[0].user = { category: 'c_gone_123' };
    expect(run(t).byId.get('m')?.cat).toBe('Other');
  });
});

describe('committed vs discretionary', () => {
  it('splits by category nature and leaves uncertain spending unclassified', () => {
    const a = run(
      parseSms([
        sms('INR 39,000.00 debited from A/c XX2222 for EMI of Loan A/c XX3333', { id: 'emi' }),
        sms('Rs 842 spent on Card XX1234 at SWIGGY', { id: 'food' }),
        sms('Sent Rs.840.00 From A/C *1234 To ABC ENTERPRISES', { id: 'abc' }),
      ]),
    );
    const s = summarize(a.all, cats);
    expect(s.committed).toBe(39000);
    expect(s.discretionary).toBe(842);
    expect(s.unclassified).toBe(840);
  });
});
