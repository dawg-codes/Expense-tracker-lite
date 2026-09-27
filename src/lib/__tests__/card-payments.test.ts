import { describe, expect, it } from 'vitest';
import { analyze } from '../analyze';
import { detectCardBill, isCardBillPayee } from '../cardPayments';
import { buildCategoryMap } from '../categories';
import { summarizeSync } from '../learning';
import { parseOne, parseSms } from '../parser';
import { migrateTxns } from '../storage';
import { CARD_AMBIGUOUS, CARD_BILL_PAYMENTS, CARD_PURCHASES } from './fixtures/card-sms';
import { T0, sms } from './helpers';

const cats = buildCategoryMap([]);
const parse = ([address, body]: [string, string], id = body) => parseOne({ id, address, body, date: T0 });

describe('credit-card bill payments are detected automatically', () => {
  it.each(CARD_BILL_PAYMENTS)('%s: %s', (sender, body) => {
    const t = parse([sender, body])!;
    expect(t).not.toBeNull();
    expect(t.type).toBe('card_payment');
    expect(t.category).not.toBe('Other');
  });

  it('the ₹8,815 bank-side payment is excluded from spending and needs no attention', () => {
    const txns = parseSms([sms('Rs.8,815.00 debited from A/c XX1234 on 20-09-26 towards Credit Card XX5678. Avl Bal Rs 20,000', { id: 'b' })]);
    const a = analyze(txns, [], cats);
    const v = a.byId.get('b')!;
    expect(v).toMatchObject({ kind: 'card_payment', counted: false, direction: 'debit' });
    expect(v.flags).toEqual([]);
    expect(a.review).toHaveLength(0);
    expect(a.stats.cardPayments).toBe(1);
  });

  it('both sides of one bill payment are excluded (not spending, not income)', () => {
    const a = analyze(
      parseSms([
        sms('Rs.8,815.00 debited from A/c XX1234 towards Credit Card XX5678', { id: 'out' }),
        sms('DEAR CARDMEMBER, PAYMENT OF RS. 8815.00 RECEIVED TOWARDS YOUR CREDIT CARD ENDING WITH 5678', { id: 'in', date: T0 + 3_600_000 }),
      ]),
      [],
      cats,
    );
    expect(a.all.every((v) => v.kind === 'card_payment' && !v.counted)).toBe(true);
  });

  it('counts as "card bill payments excluded" in the sync summary', () => {
    const txns = parseSms(CARD_BILL_PAYMENTS.slice(0, 5).map(([address, body], i) => sms(body, { id: `c${i}`, address, date: T0 + i * 86_400_000 })));
    const s = summarizeSync(analyze(txns, [], cats), txns.map((t) => t.id));
    expect(s).toMatchObject({ cardPayments: 5, attention: 0 });
  });
});

describe('card purchases are never mistaken for bill payments', () => {
  it.each(CARD_PURCHASES)('%s: %s', (sender, body) => {
    const t = parse([sender, body])!;
    expect(t).not.toBeNull();
    expect(t.type).toBe('expense');
    expect(t.tags ?? []).not.toContain('cc_bill');
  });

  it('purchase wording beats card wording', () => {
    expect(detectCardBill('Rs.2,500.00 spent using HDFC Bank Credit Card XX5678 at AMAZON')).toBeNull();
    expect(detectCardBill('Card purchase of Rs 1,200 at SWIGGY on your credit card XX5678')).toBeNull();
    expect(detectCardBill('Refund of Rs 499 credited to your credit card XX5678')).toBeNull();
    expect(detectCardBill('Payment of Rs 4,000 on your credit card is due on 25-09')).toBeNull();
  });
});

describe('ambiguous card-related alerts go to Review', () => {
  it.each(CARD_AMBIGUOUS)('%s: %s', (sender, body) => {
    const t = parse([sender, body], 'amb')!;
    expect(t.type).toBe('expense');
    expect(t.tags).toContain('cc_maybe');
    const a = analyze([t], [], cats);
    expect(a.review.map((r) => r.flag.kind)).toEqual(['maybe_card_payment']);
    // totals unchanged until the user decides
    expect(a.byId.get('amb')?.counted).toBe(true);
  });

  it('confirming it as a card bill excludes it', () => {
    const t = parse(CARD_AMBIGUOUS[0], 'amb')!;
    t.user = { type: 'card_payment', reviewed: true };
    const a = analyze([t], [], cats);
    expect(a.review).toHaveLength(0);
    expect(a.byId.get('amb')?.counted).toBe(false);
  });
});

describe('existing (stored) transactions', () => {
  // Stored by an older version: parsed as an "Other" expense, no SMS text kept.
  const old = (merchant: string | undefined, merchantRaw: string | undefined, id: string) =>
    migrateTxns({ schema: 3, txns: [{ id, direction: 'debit', type: 'expense', amount: 8815, date: T0, category: 'Other', sender: 'VM-HDFCBK', fp: id, confidence: 0.45, merchant, merchantRaw }] })[0];

  it('are reclassified when the saved payee proves a card bill', () => {
    const a = analyze([old('Cred Club', 'cred.club@axisb', 'a'), old(undefined, 'credit card bill payment', 'b'), old('CRED', 'CRED', 'c')], [], cats);
    for (const id of ['a', 'b', 'c']) expect(a.byId.get(id)).toMatchObject({ kind: 'card_payment', counted: false });
    expect(a.review).toHaveLength(0);
  });

  it('are left alone when the evidence is weak', () => {
    const a = analyze([old('Abc Enterprises', 'ABC ENTERPRISES', 'x'), old('Cred Rentpay', 'cred rentpay', 'y'), old('Credence Traders', 'CREDENCE TRADERS', 'z')], [], cats);
    for (const id of ['x', 'y', 'z']) expect(a.byId.get(id)?.kind).toBe('expense');
  });

  it('a user decision still wins over the new rule', () => {
    const t = old('CRED', 'CRED', 'u');
    t.user = { type: 'expense' };
    expect(analyze([t], [], cats).byId.get('u')?.kind).toBe('expense');
  });

  it('payee check is narrow', () => {
    expect(isCardBillPayee('Credit Card Bill Payment', undefined)).toBe(true);
    expect(isCardBillPayee('Credited Stores', undefined)).toBe(false);
  });
});
