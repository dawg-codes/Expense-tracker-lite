/**
 * Regression tests written against the v2 parser BEFORE the v3 changes, so
 * we can prove the existing detection behaviour survives the refactor.
 * (Only the field name for debit/credit changed: `type` → `direction`.)
 */
import { describe, expect, it } from 'vitest';
import { dedupe, parseSms, type RawSms } from '../parser';

const T0 = new Date(2026, 8, 15, 10, 0).getTime();
const sms = (body: string, extra: Partial<RawSms> = {}): RawSms => ({
  id: extra.id ?? Math.random().toString(36).slice(2),
  address: 'VM-HDFCBK',
  date: T0,
  body,
  ...extra,
});

describe('v2 parser regression', () => {
  it('parses a plain debit', () => {
    const [t] = parseSms([sms('Rs.1,250.00 debited from a/c XX1234 on 15-09-26. Avl bal Rs 10,000')]);
    expect(t.direction).toBe('debit');
    expect(t.amount).toBe(1250);
  });

  it('parses a plain credit', () => {
    const [t] = parseSms([sms('INR 25,000 credited to your a/c XX1234 on 15-09-26. Avl bal INR 40,000')]);
    expect(t.direction).toBe('credit');
    expect(t.amount).toBe(25000);
  });

  it('ignores balance-only messages', () => {
    expect(parseSms([sms('Available balance in a/c XX1234 is ₹25,000 as of today')])).toHaveLength(0);
  });

  it('does not take the balance as the amount', () => {
    const [t] = parseSms([sms('Avl bal Rs 50,000. Rs 300 debited from a/c XX1234')]);
    expect(t.amount).toBe(300);
  });

  it('skips OTPs and future debits', () => {
    expect(
      parseSms([
        sms('123456 is your OTP for txn of Rs 500 debited at AMAZON'),
        sms('Rs 999 will be debited from your a/c on 20-09 for NETFLIX'),
        sms('Payment of Rs 4,000 is due on 20-09'),
      ]),
    ).toHaveLength(0);
  });

  it('uses whole-word matching for debit/credit words', () => {
    // "drive" contains "dr" but must not count as a debit
    expect(parseSms([sms('Drive safe! Rs 100 offer on fuel')])).toHaveLength(0);
  });

  it('categorises by keyword', () => {
    const out = parseSms([
      sms('Rs 450 spent at SWIGGY on card XX1111'),
      sms('Rs 2000 debited for petrol at IOCL'),
      sms('Rs 999 paid to AMAZON'),
    ]);
    expect(out.map((t) => t.category)).toEqual(['Food', 'Transport', 'Shopping']);
  });

  it('rejects absurd amounts', () => {
    expect(parseSms([sms('Rs 99,00,00,000 debited from a/c')])).toHaveLength(0);
  });

  it('extracts reference numbers', () => {
    const [t] = parseSms([sms('Rs 500 debited from a/c XX1234 UPI Ref 612345678901')]);
    expect(t.ref).toBe('612345678901');
  });

  it('keeps ids stable for the same message', () => {
    const m = sms('Rs 500 debited from a/c XX1234', { id: undefined });
    expect(parseSms([m])[0].id).toBe(parseSms([m])[0].id);
  });
});

describe('v2 dedupe regression', () => {
  it('drops same reference number', () => {
    const txns = parseSms([
      sms('Rs 500 debited from a/c XX1234 UPI Ref 612345678901', { id: 'a' }),
      sms('You paid Rs 500. UPI Ref No 612345678901', { id: 'b', address: 'AD-GPAY', date: T0 + 3_600_000 }),
    ]);
    const { unique, dupes } = dedupe(txns);
    expect(unique).toHaveLength(1);
    expect(dupes[0].reason).toBe('Same reference number');
  });

  it('drops identical messages within 2 minutes', () => {
    const body = 'Rs 500 debited from a/c XX1234';
    const { unique, dupes } = dedupe(parseSms([sms(body, { id: 'a' }), sms(body, { id: 'b', date: T0 + 60_000 })]));
    expect(unique).toHaveLength(1);
    expect(dupes[0].reason).toBe('Identical message');
  });

  it('drops a bank + app alert pair for the same amount', () => {
    const { unique, dupes } = dedupe(
      parseSms([
        sms('Rs 500 debited from a/c XX1234', { id: 'a' }),
        sms('Paid Rs 500 to merchant', { id: 'b', address: 'JD-PAYTMB', date: T0 + 120_000 }),
      ]),
    );
    expect(unique).toHaveLength(1);
    expect(dupes[0].reason).toMatch(/two senders/);
  });

  it('keeps two genuine same-amount payments from the same sender', () => {
    const { unique } = dedupe(
      parseSms([
        sms('Rs 50 debited from a/c XX1234 at TEA STALL', { id: 'a' }),
        sms('Rs 50 debited from a/c XX1234 at BAKERY', { id: 'b', date: T0 + 5 * 60_000 }),
      ]),
    );
    expect(unique).toHaveLength(2);
  });

  it('keeps same amount far apart in time', () => {
    const { unique } = dedupe(
      parseSms([
        sms('Rs 500 debited from a/c XX1234', { id: 'a' }),
        sms('Paid Rs 500 to merchant', { id: 'b', address: 'JD-PAYTMB', date: T0 + 3_600_000 }),
      ]),
    );
    expect(unique).toHaveLength(2);
  });
});
