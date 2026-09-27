import { useMemo } from 'react';
import { motion } from 'motion/react';
import { catMeta, type CategoryMap } from '../lib/categories';
import { periodHint, periodTitle } from '../lib/dates';
import type { Summary } from '../lib/insights';
import { inr } from '../lib/parser';
import type { TxnView } from '../lib/types';
import { useApp } from './context';
import { TxnRow } from './txn';
import { AnimatedNumber, Bar, Icon } from './ui';

export interface PeriodData {
  valid: boolean;
  list: TxnView[];
  summary: Summary;
  /** Previous equivalent period, or same days of it when the current one is still running. */
  compare?: { label: string; spent: number };
  previous?: Summary;
}

function Donut({ items, total, cats, reduce }: { items: [string, number][]; total: number; cats: CategoryMap; reduce: boolean }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const top = items[0];
  return (
    <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Spending by category">
      <circle cx="70" cy="70" r={R} className="donut-track" />
      <g transform="rotate(-90 70 70)">
        {items.map(([cat, amount]) => {
          const seg = (amount / total) * C;
          const len = Math.max(seg - 3, 0.5);
          const o = offset;
          offset += seg;
          return (
            <motion.circle
              key={cat}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={catMeta(cats, cat).color}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDashoffset={-o}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${len} ${C - len}` }}
              transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </g>
      {top && (
        <>
          <text x="70" y="68" textAnchor="middle" className="donut-big">
            {Math.round((top[1] / total) * 100)}%
          </text>
          <text x="70" y="86" textAnchor="middle" className="donut-small">
            {catMeta(cats, top[0]).label}
          </text>
        </>
      )}
    </svg>
  );
}

export function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const d = now - before;
  if (Math.abs(d) < 1) return <span className="delta muted">no change</span>;
  const up = d > 0;
  const good = invert ? up : !up;
  return (
    <span className={`delta ${good ? 'pos' : 'neg'}`}>
      {up ? '▲' : '▼'} {inr(Math.abs(d))}
      {before > 0 && ` (${Math.round((Math.abs(d) / before) * 100)}%)`}
    </span>
  );
}

/** "Synced 84 new transactions: 79 categorised, 3 duplicates ignored…" with tappable rows. */
function SyncSummaryCard() {
  const { syncSummary: s, dismissSyncSummary, go } = useApp();
  if (!s) return null;
  const rows: Array<[string, number, () => void]> = [
    ['🏷️ Categorised automatically', s.categorised, () => go('activity', { allTime: true, ids: s.ids, idsLabel: 'From last sync' })],
    ['📦 Small one-off payments kept in Other', s.otherKept, () => go('activity', { allTime: true, ids: s.ids, idsLabel: 'From last sync', category: 'Other' })],
    ['🔁 Duplicate alerts ignored', s.duplicates, () => go('review')],
    ['↔️ Own-account transfers excluded', s.transfers, () => go('activity', { allTime: true, ids: s.ids, idsLabel: 'From last sync', kinds: ['transfer'] })],
    ['↩️ Refunds matched', s.refunds, () => go('activity', { allTime: true, ids: s.ids, idsLabel: 'From last sync', kinds: ['refund'] })],
    ['💳 Card bill payments excluded', s.cardPayments, () => go('activity', { allTime: true, ids: s.ids, idsLabel: 'From last sync', kinds: ['card_payment'] })],
  ];
  return (
    <motion.section className="card sync-card" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="row-between">
        <h2 className="section-title">
          <span className="pos">✓</span> {s.newCount ? `Synced ${s.newCount} new transaction${s.newCount === 1 ? '' : 's'}` : 'Up to date'}
        </h2>
        <button className="icon-btn small" onClick={dismissSyncSummary} aria-label="Dismiss sync summary">
          <Icon name="x" size={14} />
        </button>
      </div>
      <ul className="sync-rows">
        {rows
          .filter(([, n]) => n > 0)
          .map(([label, n, onTap]) => (
            <li key={label}>
              <button onClick={onTap}>
                <span>{label}</span>
                <strong>{n}</strong>
              </button>
            </li>
          ))}
        <li className={s.attention ? 'attention' : ''}>
          <button onClick={() => go('review')} disabled={!s.attention}>
            <span>{s.attention ? '🧐 Need your attention' : '✨ Nothing needs your attention'}</span>
            <strong>{s.attention || ''}</strong>
          </button>
        </li>
      </ul>
    </motion.section>
  );
}

export function Home({ data, onEditBudgets }: { data: PeriodData; onEditBudgets: () => void }) {
  const { period, cats, analysis, budgets, maskIncome, reduce, go, openTxn, syncSummary } = useApp();
  const { summary: s, list, valid } = data;
  const net = s.income - s.spent;
  const review = analysis.review.length;
  // duplicate alerts are already handled: keep them out of the feed
  const recent = useMemo(() => list.filter((v) => !v.dupOf).slice(0, 8), [list]);
  const shownCount = useMemo(() => list.filter((v) => !v.dupOf).length, [list]);
  const monthly = period.mode === 'month';
  const catTotal = s.byCategory.reduce((a, [, x]) => a + x, 0);
  const hasBudgets = !!budgets.total || Object.keys(budgets.categories).length > 0;

  return (
    <>
      {syncSummary && <SyncSummaryCard />}

      {review > 0 ? (
        <motion.button className="card review-banner" onClick={() => go('review')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="review-emoji">🧐</span>
          <span>
            <strong>
              {review} transaction{review === 1 ? '' : 's'} need{review === 1 ? 's' : ''} your attention
            </strong>
            <small className="muted">{analysis.stats.resolved.toLocaleString('en-IN')} handled automatically</small>
          </span>
          <Icon name="right" />
        </motion.button>
      ) : (
        analysis.stats.resolved > 0 && (
          <p className="all-handled muted small">
            <Icon name="check" size={14} /> All {analysis.stats.resolved.toLocaleString('en-IN')} transactions handled automatically
          </p>
        )
      )}

      {/* hero: spent first, then income / net / count; the fine print goes last */}
      <motion.section className="card hero" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="row-between">
          <span className="label">Spent</span>
          <span className="chip">{periodHint(period)}</span>
        </div>
        <AnimatedNumber value={s.spent} className="hero-amount" />
        {data.compare && (
          <p className="hero-caption small-note">
            <Delta now={s.spent} before={data.compare.spent} /> <span className="muted">vs {data.compare.label}</span>
          </p>
        )}
        <div className="hero-grid">
          <div>
            <span className="label">Income</span>
            <strong className="pos">{maskIncome ? '••••••' : inr(s.income)}</strong>
          </div>
          <div>
            <span className="label">Net</span>
            <strong className={net >= 0 ? 'pos' : 'neg'}>{maskIncome ? '••••' : `${net >= 0 ? '+' : '−'}${inr(Math.abs(net))}`}</strong>
          </div>
          <div className="right">
            <span className="label">Transactions</span>
            <strong>{s.count}</strong>
          </div>
        </div>
        <p className="hero-foot muted">
          {[
            s.transfers > 0 ? `Excludes ${inr(s.transfers)} moved between your accounts` : '',
            s.refunds > 0 ? `${inr(s.refunds)} refunds netted` : '',
            'From your bank SMS only',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </motion.section>

      {/* budget */}
      {monthly && hasBudgets && (
        <motion.section className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <div className="row-between">
            <h2 className="section-title">{periodTitle(period).split(' ')[0]} budget</h2>
            <button className="link" onClick={onEditBudgets}>
              Edit
            </button>
          </div>
          {budgets.total ? (
            <div className="budget-line big">
              <div className="row-between">
                <span>
                  <strong>{inr(s.spent)}</strong> <span className="muted">/ {inr(budgets.total)}</span>
                </span>
                <span className={s.spent > budgets.total ? 'neg' : 'muted'}>
                  {s.spent > budgets.total ? `${inr(s.spent - budgets.total)} over` : `${inr(budgets.total - s.spent)} left`}
                </span>
              </div>
              <Bar pct={(s.spent / budgets.total) * 100} color="var(--accent)" reduce={reduce} over={s.spent > budgets.total} />
            </div>
          ) : null}
          <ul className="cats">
            {Object.entries(budgets.categories).map(([cat, limit]) => {
              const spent = s.byCategory.find(([c]) => c === cat)?.[1] ?? 0;
              const meta = catMeta(cats, cat);
              return (
                <li key={cat}>
                  <div className="row-between">
                    <span>
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="cat-amt">
                      {inr(spent)} <em>/ {inr(limit)}</em>
                    </span>
                  </div>
                  <Bar pct={(spent / limit) * 100} color={meta.color} reduce={reduce} over={spent > limit} />
                </li>
              );
            })}
          </ul>
        </motion.section>
      )}

      {/* breakdown */}
      <motion.section className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <h2 className="section-title">Where it went</h2>
        {s.byCategory.length === 0 ? (
          <p className="muted center pad">{valid ? 'No spending in this period.' : 'Fix the date range to see results.'}</p>
        ) : (
          <>
            <Donut key={`${period.mode}-${period.offset}-${s.spent}`} items={s.byCategory} total={catTotal} cats={cats} reduce={reduce} />
            <ul className="cats">
              {s.byCategory.map(([cat, amount], i) => {
                const pct = catTotal > 0 ? (amount / catTotal) * 100 : 0;
                const meta = catMeta(cats, cat);
                return (
                  <motion.li
                    key={cat}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : Math.min(i, 10) * 0.04 }}
                  >
                    <button className="cat-row" onClick={() => go('activity', { category: cat, kinds: [] })}>
                      <div className="row-between">
                        <span>
                          {meta.emoji} {meta.label}
                        </span>
                        <span className="cat-amt">
                          {inr(amount)} <em>{pct.toFixed(0)}%</em>
                        </span>
                      </div>
                      <Bar pct={pct} color={meta.color} reduce={reduce} />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
            {s.byCategory[0] && (
              <div className="insight">
                <strong>💡 Insight</strong>
                <p>
                  Most of your money went to <b>{catMeta(cats, s.byCategory[0][0]).label}</b> ({inr(s.byCategory[0][1])}).{' '}
                  {s.income > 0 &&
                    (s.spent > s.income
                      ? '⚠️ You spent more than you received in this period.'
                      : '✅ Your recorded cash flow is positive in this period.')}
                </p>
              </div>
            )}
          </>
        )}
      </motion.section>

      {/* recent */}
      {recent.length > 0 && (
        <motion.section className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="row-between">
            <h2 className="section-title">Recent activity</h2>
            <button className="link" onClick={() => go('activity')}>
              See all {shownCount}
            </button>
          </div>
          <ul className="txns">
            {recent.map((v) => (
              <TxnRow key={v.id} v={v} cats={cats} mask={maskIncome} onOpen={openTxn} />
            ))}
          </ul>
        </motion.section>
      )}
    </>
  );
}
