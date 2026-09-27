import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, filterTxns, sortTxns, type Labels } from '../activity';
import { analyze } from '../analyze';
import { buildCategoryMap } from '../categories';
import { parseSms } from '../parser';
import { DAY, T0, sms } from './helpers';

const cats = buildCategoryMap([]);
const all = analyze(
  parseSms([
    sms('Rs 450 spent at SWIGGY on card XX1111', { id: 'swiggy', date: T0 }),
    sms('Rs 1,200 spent at ZOMATO on card XX1111', { id: 'zomato', date: T0 + DAY }),
    sms('Rs 2,499 spent at AMAZON on card XX1111', { id: 'amazon', date: T0 + 2 * DAY }),
    sms('Rs 90 spent at BLINKIT on card XX1111', { id: 'blinkit', date: T0 + 3 * DAY }),
    sms('Rs 25,000 credited to your a/c XX1234 by NEFT from ACME', { id: 'salary', date: T0 + 4 * DAY }),
  ]),
  [],
  cats,
).all;
const labels: Labels = { category: (id) => id, kind: (v) => v.kind, name: (v) => v.name || v.kind };
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('sorting', () => {
  it('by date', () => {
    expect(ids(sortTxns(all, 'date_desc', labels.name))).toEqual(['salary', 'blinkit', 'amazon', 'zomato', 'swiggy']);
    expect(ids(sortTxns(all, 'date_asc', labels.name))).toEqual(['swiggy', 'zomato', 'amazon', 'blinkit', 'salary']);
  });

  it('by amount', () => {
    expect(ids(sortTxns(all, 'amount_desc', labels.name))).toEqual(['salary', 'amazon', 'zomato', 'swiggy', 'blinkit']);
    expect(ids(sortTxns(all, 'amount_asc', labels.name))).toEqual(['blinkit', 'swiggy', 'zomato', 'amazon', 'salary']);
  });

  it('by merchant, case-insensitive', () => {
    expect(sortTxns(all, 'merchant_asc', labels.name).map(labels.name)).toEqual(['Acme', 'Amazon', 'Blinkit', 'Swiggy', 'Zomato']);
    expect(sortTxns(all, 'merchant_desc', labels.name).map(labels.name)).toEqual(['Zomato', 'Swiggy', 'Blinkit', 'Amazon', 'Acme']);
  });

  it('does not mutate the input', () => {
    const before = ids(all);
    sortTxns(all, 'amount_asc', labels.name);
    expect(ids(all)).toEqual(before);
  });
});

describe('filter + sort together', () => {
  it('Food only, highest amount first', () => {
    const food = filterTxns(all, { ...EMPTY_FILTER, category: 'Food' }, '', labels);
    expect(ids(sortTxns(food, 'amount_desc', labels.name))).toEqual(['zomato', 'swiggy']);
  });

  it('expenses only, merchant A–Z', () => {
    const exp = filterTxns(all, { ...EMPTY_FILTER, kinds: ['expense'] }, '', labels);
    expect(sortTxns(exp, 'merchant_asc', labels.name).map(labels.name)).toEqual(['Amazon', 'Blinkit', 'Swiggy', 'Zomato']);
  });

  it('amount range + lowest first', () => {
    const mid = filterTxns(all, { ...EMPTY_FILTER, min: 100, max: 3000 }, '', labels);
    expect(ids(sortTxns(mid, 'amount_asc', labels.name))).toEqual(['swiggy', 'zomato', 'amazon']);
  });

  it('search + oldest first', () => {
    expect(ids(sortTxns(filterTxns(all, EMPTY_FILTER, 'zomato', labels), 'date_asc', labels.name))).toEqual(['zomato']);
  });
});
