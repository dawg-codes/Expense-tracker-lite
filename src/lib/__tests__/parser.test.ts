import { describe, expect, it } from 'vitest';
import { parseOne, parseSms } from '../parser';
import { sms } from './helpers';

const one = (body: string, address = 'VM-HDFCBK') => parseOne(sms(body, { address }));

describe('direction and type', () => {
  it('expense: ₹1,250 debited', () => {
    const t = one('₹1,250 debited from A/c XX1234 on 15-09-26. Avl bal ₹10,000');
    expect(t).toMatchObject({ direction: 'debit', type: 'expense', amount: 1250, account: 'XX1234' });
  });

  it('income: ₹25,000 credited', () => {
    const t = one('₹25,000 credited to your A/c XX9876 on 01-09-26 by NEFT from ACME TECHNOLOGIES PVT LTD');
    expect(t).toMatchObject({ direction: 'credit', type: 'income', amount: 25000, category: 'Income', merchant: 'Acme Technologies' });
  });

  it('SBI style amount without currency marker', () => {
    const t = one('Dear UPI user A/C X4321 debited by 500.0 on date 26Sep26 trf to ZOMATO LTD Refno 612345678902', 'JD-SBIUPI');
    expect(t).toMatchObject({ amount: 500, type: 'expense', merchant: 'Zomato', category: 'Food', ref: '612345678902' });
  });

  it('refund wording on a credit', () => {
    const t = one('Refund of Rs 2,499.00 from AMAZON has been credited to your HDFC Bank Card x1234 on 20-09-26');
    expect(t).toMatchObject({ direction: 'credit', type: 'refund', merchant: 'Amazon', category: 'Shopping' });
  });

  it('self-transfer wording', () => {
    const t = one('Rs 10,000 transferred to own account XX9999 via self transfer');
    expect(t).toMatchObject({ direction: 'debit', type: 'transfer' });
  });

  it('"transferred to your account" is a credit, not a debit', () => {
    const t = one('Rs 5,000 has been transferred to your a/c XX1234 and credited on 12-09');
    expect(t?.direction).toBe('credit');
  });

  it('ambiguous: transaction with no direction and no merchant becomes unknown', () => {
    const t = one('Txn of Rs 700.00 on your card XX1234 on 26-09-26');
    expect(t?.type).toBe('unknown');
    expect(t!.confidence).toBeLessThan(0.5);
  });

  it('"Txn of Rs X on your card at MERCHANT" is a card purchase', () => {
    const t = one('Txn of Rs 700.00 on your card XX1234 at XYZ TRADERS on 26-09-26');
    expect(t).toMatchObject({ type: 'expense', direction: 'debit', merchant: 'Xyz Traders' });
  });

  it('never takes "Rs" as the payee name', () => {
    const t = one('Your A/C XXXXX9876 has been credited by Rs.25000.00 on 03-09-26 by IMPS transfer from A/c XX1234');
    expect(t?.merchant).toBeUndefined();
    expect(t).toMatchObject({ account: 'XX9876', counterAccount: 'XX1234' });
  });

  it('captures the other account in IMPS/NEFT transfers', () => {
    const t = one('Rs.20000 debited from A/c XX1234 on 10-09-26. IMPS to A/c XX9876 Ref 612345678905');
    expect(t).toMatchObject({ account: 'XX1234', counterAccount: 'XX9876' });
    expect(t?.tags).toContain('rail');
  });

  it('masks phone-number VPAs', () => {
    const t = one('Rs.60.00 debited from a/c **1234 to VPA 9876543210@ybl (UPI Ref No 612345678904)');
    expect(t?.merchantRaw).toBe('••3210@ybl');
    expect(t?.merchant).toBe('UPI ••3210');
    expect(JSON.stringify(t)).not.toContain('9876543210');
  });

  it('both debit and credit words lower the confidence', () => {
    const clear = one('Rs 300 debited from A/c XX1234 at SWIGGY')!;
    const mixed = one('Rs 300 debited from A/c XX1234 at SWIGGY and credited back')!;
    expect(mixed.confidence).toBeLessThan(clear.confidence);
  });
});

describe('credit-card bill payments', () => {
  it('bank-account side', () => {
    const t = one('Rs 15,000 debited from A/c XX1234 towards credit card bill payment. Ref 612345678907');
    expect(t).toMatchObject({ direction: 'debit', type: 'card_payment' });
  });

  it('card side confirmation', () => {
    const t = one('Thank you for payment of Rs 15,000.00 towards your HDFC Bank Credit Card ending 5678');
    expect(t).toMatchObject({ direction: 'credit', type: 'card_payment', account: 'XX5678' });
  });

  it('spending ON a credit card is still an expense', () => {
    expect(one('Rs 999 paid to AMAZON using credit card XX1234 on 12-09')?.type).toBe('expense');
    expect(one('Rs 999 spent on your ICICI credit card XX1234 at FLIPKART. Pay your credit card bill on time')?.type).toBe(
      'expense',
    );
  });
});

describe('exclusions', () => {
  it('balance only', () => {
    expect(one('Available balance ₹25,000 in A/c XX1234')).toBeNull();
    expect(one('Your a/c XX1234 balance is Rs 25,000 as on 12-09')).toBeNull();
  });

  it('OTP', () => {
    expect(one('482913 is your OTP to complete the transaction of Rs 2,000 debited at FLIPKART')).toBeNull();
    expect(one('Your one-time password is 1234 for Rs 500')).toBeNull();
  });

  it('failed / declined', () => {
    expect(one('Your Txn of Rs.500 has failed. Amount will be reversed.')).toBeNull();
    expect(one('Rs 900 transaction declined on card XX1234 at AMAZON')).toBeNull();
  });

  it('future debits and bill reminders', () => {
    expect(one('Rs 649 will be debited on 20-09 for NETFLIX mandate')).toBeNull();
    expect(one('Min amount due Rs 1,500. Total due Rs 30,000 on your credit card')).toBeNull();
  });
});

describe('merchant extraction and normalisation', () => {
  const cases: Array<[string, string]> = [
    ['Rs.842.00 spent on HDFC Bank Card x1234 at SWIGGY*ONLINE on 2026-09-26', 'Swiggy'],
    ['ICICI Bank Acct XX123 debited for Rs 1,299.00 on 26-Sep-26; SWIGGY INSTAMART credited. UPI:612345678901.', 'Swiggy'],
    ['Rs 300 debited from a/c XX1234 to VPA swiggy@icici (UPI Ref No 612345678904)', 'Swiggy'],
    ['INR 2,499 debited from card XX1234 at AMAZON PAY INDIA on 18-09-26', 'Amazon'],
    ['Rs.500.00 debited from a/c **1234 on 26-09-26 to VPA murugan.stores@okaxis (UPI Ref No 612345678904)', 'Murugan Stores'],
    ['Sent Rs.840.00 From HDFC Bank A/C *1234 To ABC ENTERPRISES On 26/09/26 Ref 612345678903', 'Abc Enterprises'],
    ['Rs 2,000 withdrawn at ATM S1AB2345 from A/c X1111 on 12Sep26', 'Cash withdrawal'],
    ['Rs 649.00 debited via e-mandate for NETFLIX on 15-09-26 from a/c XX1234', 'Netflix'],
    ['Rs 199 debited from a/c XX1234 Info: UPI/P2M/612345678901/BLINKIT', 'Blinkit'],
  ];
  it.each(cases)('%s → %s', (body, name) => {
    expect(one(body)?.merchant).toBe(name);
  });

  it('keeps the original payee fragment for review', () => {
    expect(one('Rs.842.00 spent on Card x1234 at SWIGGY*ONLINE on 2026-09-26')?.merchantRaw).toBe('SWIGGY*ONLINE');
  });

  it('does not invent a merchant from account wording', () => {
    const t = one('Rs.20000 debited from A/c XX1234 on 10-09-26. IMPS to A/c XX9876 Ref 612345678905');
    expect(t?.merchant).toBeUndefined();
  });

  it('ignores numeric / QR VPAs', () => {
    expect(one('Rs 50 debited from a/c XX1234 to VPA paytmqr2810050501011@paytm')?.merchant).toBeUndefined();
  });
});

describe('categories and confidence', () => {
  it('known merchant → high confidence', () => {
    const t = one('Rs.842.00 spent on HDFC Bank Card x1234 at SWIGGY on 26-09');
    expect(t?.category).toBe('Food');
    expect(t!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('unknown merchant, no keyword → Other with low confidence (needs review)', () => {
    const t = one('Sent Rs.840.00 From HDFC Bank A/C *1234 To ABC ENTERPRISES On 26/09/26 Ref 612345678903');
    expect(t?.category).toBe('Other');
    expect(t!.confidence).toBeLessThan(0.6);
  });

  it('keyword categories', () => {
    expect(one('INR 39,000.00 debited from A/c XX2222 for EMI of Loan A/c XX3333')?.category).toBe('EMI');
    expect(one('Rs 5,200 debited from a/c XX1234 for health insurance premium')?.category).toBe('Insurance');
    expect(one('Rs 1,100 paid to KUMAR GROCERY on 12-09')?.category).toBe('Groceries');
    expect(one('Rs 12,000 paid for school fees from a/c XX1234')?.category).toBe('Education');
  });

  it('tags EMI and mandate wording', () => {
    expect(one('INR 39,000.00 debited from A/c XX2222 for EMI of Loan A/c XX3333')?.tags).toContain('emi');
    expect(one('Rs 649.00 debited via e-mandate for NETFLIX from a/c XX1234')?.tags).toContain('autopay');
  });
});

describe('privacy', () => {
  it('never returns message text', () => {
    const body = 'Rs.842.00 spent on HDFC Bank Card x1234 at SWIGGY on 26-09. Avl bal Rs 20,000';
    const [t] = parseSms([sms(body)]);
    const json = JSON.stringify(t);
    expect(json).not.toContain('Avl bal');
    expect(json).not.toContain('spent on');
    expect(Object.keys(t)).not.toContain('body');
  });
});
