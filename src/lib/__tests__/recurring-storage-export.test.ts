import { describe, expect, it } from 'vitest';
import { analyze } from '../analyze';
import { buildCategoryMap } from '../categories';
import { buildBackup, csvCell, mergeBackup, parseBackup, toCSV, type BackupData } from '../exporter';
import { monthlySeries } from '../insights';
import { cleanMerchant, normalizeMerchant } from '../merchants';
import { parseSms } from '../parser';
import { migrateTxns, sanitizeTxn } from '../storage';
import { DAY, sms } from './helpers';

const cats = buildCategoryMap([]);
const month = (i: number) => new Date(2026, 3 + i, 5, 9).getTime();
const NOW = new Date(2026, 8, 27).getTime();

describe('merchant normalisation', () => {
  it.each([
    ['SWIGGY', 'Swiggy'],
    ['Swiggy', 'Swiggy'],
    ['SWIGGY INSTAMART', 'Swiggy'],
    ['SWIGGY*ONLINE', 'Swiggy'],
    ['swiggy@icici', 'Swiggy'],
    ['ZOMATO LTD', 'Zomato'],
    ['AMAZON PAY INDIA', 'Amazon'],
    ['Amazon Prime', 'Prime Video'],
    ['OLACABS', 'Ola'],
    ['LIC OF INDIA', 'LIC'],
  ])('%s → %s', (raw, name) => {
    expect(normalizeMerchant(raw).name).toBe(name);
  });

  it('cleans unknown names', () => {
    expect(cleanMerchant('RAZ*MURUGAN STORES PVT LTD')).toBe('Murugan Stores');
    expect(cleanMerchant('your a/c')).toBeUndefined();
    expect(cleanMerchant('9876543210@ybl')).toBeUndefined();
  });

  it('does not match brand names inside other words', () => {
    expect(normalizeMerchant('COLA HOUSE').name).toBe('Cola House'); // not "Ola"
    expect(normalizeMerchant('SUBER TRADERS').name).toBe('Suber Traders'); // not "Uber"
  });
});

describe('recurring payments', () => {
  // one payment on the 5th of each month, the last one in September 2026
  const series = (body: string, amounts: number[]) =>
    parseSms(
      amounts.map((a, i) =>
        sms(body.replace('{amt}', String(a)), { id: `${body.slice(0, 12)}${i}`, date: month(5 - (amounts.length - 1 - i)) }),
      ),
    );

  it('detects a monthly subscription', () => {
    const a = analyze(series('Rs {amt} debited via e-mandate for NETFLIX from a/c XX1234', [649, 649, 649, 649]), [], cats, [], NOW);
    expect(a.recurring).toHaveLength(1);
    expect(a.recurring[0]).toMatchObject({ label: 'Netflix', cadence: 'monthly', amount: 649, monthly: 649 });
  });

  it('detects EMIs even without a merchant name', () => {
    const a = analyze(series('INR {amt} debited from A/c XX2222 for EMI of Loan A/c XX3333', [39000, 39000, 39000]), [], cats, [], NOW);
    expect(a.recurring[0]).toMatchObject({ category: 'EMI', monthly: 39000 });
  });

  it('ignores repeated but irregular spending', () => {
    const txns = parseSms(
      [0, 3, 4, 20, 50, 51].map((d, i) => sms('Rs 300 spent at SWIGGY on card XX1', { id: `s${i}`, date: month(0) + d * DAY })),
    );
    expect(analyze(txns, [], cats, [], month(0) + 52 * DAY).recurring).toHaveLength(0);
  });

  it('ignores series that stopped long ago', () => {
    const a = analyze(series('Rs {amt} debited via e-mandate for SPOTIFY from a/c XX1234', [119, 119, 119]), [], cats, [], NOW + 200 * DAY);
    expect(a.recurring).toHaveLength(0);
  });

  it('respects dismissals', () => {
    const txns = series('Rs {amt} debited via e-mandate for NETFLIX from a/c XX1234', [649, 649, 649]);
    const key = analyze(txns, [], cats, [], NOW).recurring[0].key;
    expect(analyze(txns, [], cats, [key], NOW).recurring).toHaveLength(0);
  });
});

describe('monthly trend', () => {
  it('buckets by calendar month', () => {
    const txns = parseSms([
      sms('Rs 100 spent at SWIGGY on card XX1', { id: 'a', date: new Date(2026, 7, 31, 23, 59).getTime() }),
      sms('Rs 200 spent at SWIGGY on card XX1', { id: 'b', date: new Date(2026, 8, 1, 0, 1).getTime() }),
      sms('Rs 5000 credited to your a/c XX1 by NEFT from ACME', { id: 'c', date: new Date(2026, 8, 10).getTime() }),
    ]);
    const pts = monthlySeries(analyze(txns, [], cats, [], NOW).all, NOW, 2);
    expect(pts.map((p) => [p.spent, p.income])).toEqual([
      [100, 0],
      [200, 5000],
    ]);
  });
});

describe('storage migration (v2 → v3)', () => {
  const v2 = [
    { id: '1', type: 'debit', amount: 842, category: 'Food', date: 1, sender: 'HDFCBK', ref: '612345678901', fp: 'abc' },
    { id: '2', type: 'credit', amount: 5000, category: 'Other', date: 2, sender: 'HDFCBK', fp: 'def' },
    { id: '3', type: 'debit', amount: -1, category: 'Food', date: 3, sender: 'X', fp: 'x' },
  ];

  it('keeps every valid v2 transaction with sensible defaults', () => {
    const out = migrateTxns(v2);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: '1', direction: 'debit', type: 'expense', amount: 842, category: 'Food', ref: '612345678901' });
    expect(out[1]).toMatchObject({ direction: 'credit', type: 'income', category: 'Income' });
    expect(out[0].confidence).toBe(0.7);
  });

  it('reads the v3 envelope', () => {
    expect(migrateTxns({ schema: 3, txns: migrateTxns(v2) })).toHaveLength(2);
  });

  it('strips any message text or unknown fields', () => {
    const t = sanitizeTxn({ ...v2[0], body: 'Rs 842 spent at SWIGGY. Avl bal Rs 9,000', raw: 'x', user: { category: 'Home', body: 'x' } });
    const json = JSON.stringify(t);
    expect(json).not.toContain('Avl bal');
    expect(t).not.toHaveProperty('body');
    expect(t).not.toHaveProperty('raw');
    expect(t?.user).toEqual({ category: 'Home' });
  });
});

describe('CSV', () => {
  it('exports structured fields and escapes safely', () => {
    const a = analyze(parseSms([sms('Rs 842 spent on Card XX1234 at SWIGGY, Ref 612345678901', { id: 'a' })]), [], cats);
    const csv = toCSV(a.all, cats);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('Date,Time,Amount,Direction,Type,Merchant,Category,Sender,Account,Reference,Counted,Note');
    expect(row).toContain('842.00,debit,Expense,Swiggy,Food,VM-HDFCBK,XX1234,612345678901,yes');
    expect(csv).not.toContain('spent on');
  });

  it('neutralises formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});

describe('backup', () => {
  const data = (): BackupData => ({
    transactions: migrateTxns([{ id: '1', type: 'debit', amount: 10, category: 'Food', date: 1, sender: 'X', fp: 'f' }]),
    categories: [{ id: 'c_pets_1', label: 'Pets', emoji: '🐶', color: '#f43f5e', custom: true }],
    rules: [{ id: 'r1', match: 'murugan', category: 'Groceries' }],
    budgets: { total: 50000, categories: { Food: 10000 } },
    dismissedRecurring: [],
    settings: { theme: 'dark', maskIncome: true },
  });

  it('round-trips', () => {
    const file = buildBackup(data(), new Date('2026-09-27T10:00:00Z'));
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.schemaVersion).toBe(3);
    expect(parsed.backup.data).toEqual(data());
  });

  it('rejects files that are not backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'expense-tracker-lite', schemaVersion: 99, data: { transactions: [] } })).ok).toBe(false);
  });

  it('drops invalid rows and reports how many', () => {
    const file = buildBackup(data());
    (file.data.transactions as unknown[]).push({ id: 'bad' }, { body: 'secret sms' });
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok && parsed.skipped).toBe(2);
  });

  it('merge keeps existing data and adds new', () => {
    const cur = data();
    const inc = data();
    inc.transactions = migrateTxns([{ id: '2', type: 'credit', amount: 99, category: 'Other', date: 2, sender: 'Y', fp: 'g' }]);
    inc.budgets = { total: 1, categories: { Travel: 5 } };
    const merged = mergeBackup(cur, inc);
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(['1', '2']);
    expect(merged.budgets).toEqual({ total: 50000, categories: { Food: 10000, Travel: 5 } });
  });
});
