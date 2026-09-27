import { useDeferredValue, useMemo, useState } from 'react';
import { DEFAULT_SORT, SORTS, filterTxns, sortTxns, type Labels, type SortKey } from '../lib/activity';
import { catMeta } from '../lib/categories';
import { inr } from '../lib/parser';
import type { TxnView } from '../lib/types';
import { EMPTY_FILTER, useApp, type ActivityFilter } from './context';
import { KIND_META, TxnRow, displayName } from './txn';
import { Icon, Sheet } from './ui';

const KINDS: Array<[string, string]> = [
  ['expense', 'Expenses'],
  ['income', 'Income'],
  ['transfer', 'Transfers'],
  ['refund', 'Refunds'],
  ['card_payment', 'Card bills'],
  ['duplicate', 'Duplicates'],
];
const PAGE = 60;

export function Activity({
  base,
  all,
  filter,
  setFilter,
  sort,
  setSort,
}: {
  /** Transactions in the selected period. */
  base: TxnView[];
  /** Every transaction (for "All time"). */
  all: TxnView[];
  filter: ActivityFilter;
  setFilter: (f: ActivityFilter) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
}) {
  const { cats, catList, maskIncome, openTxn } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false);
  const [sortSheet, setSortSheet] = useState(false);
  const query = useDeferredValue(filter.query.trim());

  const senders = useMemo(() => [...new Set(all.map((v) => v.sender))].sort(), [all]);

  const labels = useMemo<Labels>(
    () => ({ category: (id) => catMeta(cats, id).label, kind: (v) => KIND_META[v.kind].label, name: (v) => displayName(v, cats) }),
    [cats],
  );
  // filter, then sort: one pipeline so the two never disagree
  const filteredList = useMemo(() => filterTxns(filter.allTime ? all : base, filter, query, labels), [filter, query, base, all, labels]);
  const results = useMemo(() => (sort === DEFAULT_SORT ? filteredList : sortTxns(filteredList, sort, labels.name)), [filteredList, sort, labels]);
  const sortLabel = SORTS.find(([k]) => k === sort)?.[1] ?? '';

  const total = useMemo(
    () => results.reduce((acc, v) => (v.counted ? acc + (v.kind === 'income' ? 0 : v.kind === 'refund' ? -v.amount : v.amount) : acc), 0),
    [results],
  );

  const chips: Array<[string, () => void]> = [];
  if (filter.category) chips.push([`${catMeta(cats, filter.category).emoji} ${catMeta(cats, filter.category).label}`, () => setFilter({ ...filter, category: undefined })]);
  if (filter.sender) chips.push([filter.sender, () => setFilter({ ...filter, sender: undefined })]);
  if (filter.min !== undefined) chips.push([`≥ ${inr(filter.min)}`, () => setFilter({ ...filter, min: undefined })]);
  if (filter.max !== undefined) chips.push([`≤ ${inr(filter.max)}`, () => setFilter({ ...filter, max: undefined })]);
  if (filter.allTime) chips.push(['All time', () => setFilter({ ...filter, allTime: false })]);
  if (filter.ids) chips.push([filter.idsLabel ?? 'Selected', () => setFilter({ ...filter, ids: undefined, idsLabel: undefined })]);
  const filtered = chips.length > 0 || filter.kinds.length > 0 || !!query;

  const toggleKind = (k: string) =>
    setFilter({ ...filter, kinds: filter.kinds.includes(k) ? filter.kinds.filter((x) => x !== k) : [...filter.kinds, k] });

  return (
    <>
      <div className="search">
        <Icon name="search" size={17} />
        <input
          type="search"
          inputMode="search"
          placeholder="Search merchant or amount"
          value={filter.query}
          onChange={(e) => {
            setFilter({ ...filter, query: e.target.value });
            setLimit(PAGE);
          }}
          aria-label="Search transactions"
        />
        <button className={`icon-btn small ${sort !== DEFAULT_SORT ? 'badge-dot' : ''}`} onClick={() => setSortSheet(true)} aria-label={`Sort: ${sortLabel}`}>
          <Icon name="sort" size={16} />
        </button>
        <button className={`icon-btn small ${chips.length ? 'badge-dot' : ''}`} onClick={() => setSheet(true)} aria-label="Filters">
          <Icon name="filter" size={15} />
        </button>
      </div>

      <div className="chip-row">
        {sort !== DEFAULT_SORT && (
          <button className="pill active" onClick={() => setSort(DEFAULT_SORT)} aria-label={`Remove sort ${sortLabel}`}>
            <Icon name="sort" size={12} /> {sortLabel} <Icon name="x" size={12} />
          </button>
        )}
        {KINDS.map(([k, label]) => (
          <button key={k} className={`pill ${filter.kinds.includes(k) ? 'active' : ''}`} onClick={() => toggleKind(k)} aria-pressed={filter.kinds.includes(k)}>
            {label}
          </button>
        ))}
        {chips.map(([label, clear]) => (
          <button key={label} className="pill active" onClick={clear} aria-label={`Remove filter ${label}`}>
            {label} <Icon name="x" size={12} />
          </button>
        ))}
        {filtered && (
          <button className="link" onClick={() => setFilter({ ...EMPTY_FILTER, allTime: filter.allTime })}>
            Clear
          </button>
        )}
      </div>

      <section className="card">
        <div className="row-between">
          <h2 className="section-title">
            {results.length} transaction{results.length === 1 ? '' : 's'}
          </h2>
          {results.length > 0 && <span className="muted small">{inr(Math.max(0, total))} net spend</span>}
        </div>
        {results.length === 0 ? (
          <p className="muted center pad">{filtered ? 'Nothing matches these filters.' : 'No transactions in this period.'}</p>
        ) : (
          <ul className="txns">
            {results.slice(0, limit).map((v) => (
              <TxnRow key={v.id} v={v} cats={cats} mask={maskIncome} onOpen={openTxn} />
            ))}
          </ul>
        )}
        {results.length > limit && (
          <button className="link center-btn" onClick={() => setLimit(limit + PAGE)}>
            Show {Math.min(PAGE, results.length - limit)} more
          </button>
        )}
      </section>

      <Sheet open={sortSheet} onClose={() => setSortSheet(false)} title="Sort by">
        <div className="option-list" role="radiogroup" aria-label="Sort by">
          {SORTS.map(([key, label]) => (
            <button
              key={key}
              role="radio"
              aria-checked={sort === key}
              className={`option ${sort === key ? 'active' : ''}`}
              onClick={() => {
                setSort(key);
                setLimit(PAGE);
                setSortSheet(false);
              }}
            >
              <span className="radio" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Filters">
        <p className="label">Dates</p>
        <div className="chip-row">
          <button className={`pill ${!filter.allTime ? 'active' : ''}`} onClick={() => setFilter({ ...filter, allTime: false })}>
            Selected period
          </button>
          <button className={`pill ${filter.allTime ? 'active' : ''}`} onClick={() => setFilter({ ...filter, allTime: true })}>
            All time
          </button>
        </div>

        <p className="label">Category</p>
        <div className="cat-grid">
          {catList.map((c) => (
            <button
              key={c.id}
              className={`cat-chip ${filter.category === c.id ? 'active' : ''}`}
              onClick={() => setFilter({ ...filter, category: filter.category === c.id ? undefined : c.id })}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="label">Bank / sender</span>
          <select value={filter.sender ?? ''} onChange={(e) => setFilter({ ...filter, sender: e.target.value || undefined })}>
            <option value="">Any</option>
            {senders.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="label">Min ₹</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={filter.min ?? ''}
              onChange={(e) => setFilter({ ...filter, min: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="field">
            <span className="label">Max ₹</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={filter.max ?? ''}
              onChange={(e) => setFilter({ ...filter, max: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
            />
          </label>
        </div>
        <button className="btn-primary" onClick={() => setSheet(false)}>
          Show {results.length} result{results.length === 1 ? '' : 's'}
        </button>
      </Sheet>
    </>
  );
}
