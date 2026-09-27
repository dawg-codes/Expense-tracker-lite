import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import { catMeta } from '../lib/categories';
import { periodHint, periodRange, periodTitle } from '../lib/dates';
import { categoryChanges, monthlySeries, type MonthPoint } from '../lib/insights';
import { inr } from '../lib/parser';
import type { TxnView } from '../lib/types';
import { useApp } from './context';
import { Delta, type PeriodData } from './Home';
import { Bar, Empty, Icon, shortDate } from './ui';

const CADENCE_LABEL = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' } as const;

const TrendChart = memo(function TrendChart({
  points,
  reduce,
  mask,
  activeKey,
  onPick,
}: {
  points: MonthPoint[];
  reduce: boolean;
  mask: boolean;
  activeKey?: string;
  onPick: (i: number) => void;
}) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.spent, mask ? 0 : p.income)));
  return (
    <div className="trend" role="img" aria-label="Spending and income by month">
      {points.map((p, i) => (
        <button key={p.key} className={`trend-col ${p.key === activeKey ? 'active' : ''}`} onClick={() => onPick(i)} aria-label={`${p.label}: spent ${inr(p.spent)}`}>
          <div className="trend-bars">
            {!mask && (
              <motion.span
                className="trend-bar income"
                initial={{ height: 0 }}
                animate={{ height: `${(p.income / max) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.04 }}
              />
            )}
            <motion.span
              className="trend-bar spent"
              initial={{ height: 0 }}
              animate={{ height: `${(p.spent / max) * 100}%` }}
              transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.04 }}
            />
          </div>
          <span className="trend-label">{p.label}</span>
        </button>
      ))}
    </div>
  );
});

export function Insights({ data, all, onEditBudgets }: { data: PeriodData; all: TxnView[]; onEditBudgets: () => void }) {
  const { period, setPeriod, cats, analysis, budgets, maskIncome, reduce, dismissRecurring, go, openTxn } = useApp();
  const hasBudgets = !!budgets.total || Object.keys(budgets.categories).length > 0;
  const s = data.summary;
  const range = periodRange(period);
  const anchor = range ? Math.min(range.end, Date.now()) : Date.now();
  const points = useMemo(() => monthlySeries(all, anchor, 6), [all, anchor]);
  const changes = useMemo(() => (data.previous ? categoryChanges(s, data.previous) : []), [s, data.previous]);
  const recurring = analysis.recurring;
  const recurringTotal = recurring.reduce((a, r) => a + r.monthly, 0);
  const net = s.income - s.spent;
  const kept = s.income > 0 ? Math.round((net / s.income) * 100) : null;
  const outflow = s.committed + s.discretionary + s.unclassified;
  const activeKey = period.mode === 'month' && range ? `${new Date(range.start).getFullYear()}-${new Date(range.start).getMonth()}` : undefined;
  const monthOffsetOf = (p: MonthPoint) => {
    const d = new Date(p.range.start);
    const now = new Date();
    return (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
  };

  if (all.length === 0) return <Empty emoji="📊" title="No insights yet">Sync your SMS to see trends.</Empty>;

  return (
    <>
      {/* income vs spending */}
      <motion.section className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="section-title">Money in &amp; out · {periodHint(period)}</h2>
        <div className="stat-grid">
          <div>
            <span className="label">Income</span>
            <strong className="pos">{maskIncome ? '••••••' : inr(s.income)}</strong>
          </div>
          <div>
            <span className="label">Spent</span>
            <strong>{inr(s.spent)}</strong>
          </div>
          <div>
            <span className="label">Net</span>
            <strong className={net >= 0 ? 'pos' : 'neg'}>{maskIncome ? '••••' : `${net >= 0 ? '+' : '−'}${inr(Math.abs(net))}`}</strong>
          </div>
        </div>
        {kept !== null && !maskIncome && (
          <p className="muted small">
            {kept >= 0 ? `You kept ${kept}% of recorded income.` : `Spending exceeded recorded income by ${Math.abs(kept)}%.`} Based only on
            transactions found in your SMS, so it may not reflect your full finances.
          </p>
        )}
      </motion.section>

      {/* budgets (monthly) */}
      {hasBudgets ? (
        <section className="card">
          <div className="row-between">
            <h2 className="section-title">Budget · {period.mode === 'month' ? periodTitle(period) : 'monthly'}</h2>
            <button className="link" onClick={onEditBudgets}>
              Edit
            </button>
          </div>
          {period.mode !== 'month' ? (
            <p className="muted small">Budgets are monthly. Switch to Month to see progress.</p>
          ) : (
            <>
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
            </>
          )}
        </section>
      ) : (
        <button className="row-link" onClick={onEditBudgets}>
          <span className="insight-mark" aria-hidden="true">
            <Icon name="plus" size={13} />
          </span>
          <span className="grow">
            <strong>Set a monthly budget</strong>
            <small>Optional. Track spending against a total or per category.</small>
          </span>
          <Icon name="right" size={18} className="chev" />
        </button>
      )}

      {/* comparison */}
      {data.compare && (
        <section className="card">
          <h2 className="section-title">Compared with before</h2>
          <div className="compare">
            <div>
              <span className="label">{periodHint(period)}</span>
              <strong>{inr(s.spent)}</strong>
            </div>
            <div>
              <span className="label">{data.compare.label}</span>
              <strong>{inr(data.compare.spent)}</strong>
            </div>
          </div>
          <p className="compare-delta">
            <Delta now={s.spent} before={data.compare.spent} />
          </p>
          {changes.length > 0 && (
            <>
              <p className="label changes-title">Biggest changes by category</p>
              <ul className="changes">
                {changes.map((c) => {
                  const meta = catMeta(cats, c.cat);
                  return (
                    <li key={c.cat}>
                      <span className="change-name">
                        <span aria-hidden="true">{meta.emoji}</span> {meta.label}
                        <small className="muted">was {inr(c.before)}</small>
                      </span>
                      <span className="change-now">
                        <strong>{inr(c.now)}</strong>
                        <Delta now={c.now} before={c.before} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {/* trend */}
      <section className="card">
        <div className="row-between">
          <h2 className="section-title">Last 6 months</h2>
          <span className="legend">
            <i className="spent" /> Spent {!maskIncome && <><i className="income" /> Income</>}
          </span>
        </div>
        <TrendChart
          points={points}
          reduce={reduce}
          mask={maskIncome}
          activeKey={activeKey}
          onPick={(i) => setPeriod({ mode: 'month', offset: monthOffsetOf(points[i]) })}
        />
      </section>

      {/* committed vs discretionary */}
      {outflow > 0 && (
        <section className="card">
          <h2 className="section-title">Committed vs discretionary</h2>
          <div className="row-between">
            <span className="label">Total outflow</span>
            <strong>{inr(outflow)}</strong>
          </div>
          <div className="stack" aria-hidden="true">
            <span className="committed" style={{ width: `${(s.committed / outflow) * 100}%` }} />
            <span className="discretionary" style={{ width: `${(s.discretionary / outflow) * 100}%` }} />
            <span className="unclassified" style={{ width: `${(s.unclassified / outflow) * 100}%` }} />
          </div>
          <ul className="split">
            <li>
              <i className="committed" /> Committed <small className="muted">EMI, insurance, bills, subscriptions, recurring</small>
              <strong>{inr(s.committed)}</strong>
            </li>
            <li>
              <i className="discretionary" /> Discretionary <small className="muted">food, shopping, travel…</small>
              <strong>{inr(s.discretionary)}</strong>
            </li>
            {s.unclassified > 0 && (
              <li>
                <i className="unclassified" /> Not sure <small className="muted">uncategorised or low confidence</small>
                <strong>{inr(s.unclassified)}</strong>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* recurring */}
      <section className="card">
        <div className="row-between">
          <h2 className="section-title">🔄 Recurring payments</h2>
          {recurring.length > 0 && <span className="chip">≈ {inr(recurringTotal)}/month</span>}
        </div>
        {recurring.length === 0 ? (
          <p className="muted small">
            Nothing detected yet. A payment shows up here once the same merchant is paid a similar amount at a regular interval (usually 3 times).
          </p>
        ) : (
          <>
            <ul className="txns">
              {recurring.map((r) => {
                const meta = catMeta(cats, r.category);
                return (
                  <li key={r.key}>
                    <button className="txn-row" onClick={() => openTxn(r.txnIds[r.txnIds.length - 1])}>
                      <span className="txn-icon" style={{ background: `${meta.color}22` }}>
                        {meta.emoji}
                      </span>
                      <span className="txn-meta">
                        <strong>{r.label}</strong>
                        <small className="muted">
                          {inr(r.amount)} · {CADENCE_LABEL[r.cadence]} · {r.count} payments · next ≈ {shortDate(r.nextDate)}
                        </small>
                      </span>
                    </button>
                    <button className="icon-btn small" onClick={() => dismissRecurring(r.key)} aria-label={`${r.label} is not recurring`}>
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="muted tiny">Estimated monthly commitment. Tap × if something isn't really recurring.</p>
          </>
        )}
      </section>

      {/* top merchants */}
      {s.topMerchants.length > 0 && (
        <section className="card">
          <h2 className="section-title">Top merchants</h2>
          <ul className="cats">
            {s.topMerchants.map((m) => (
              <li key={m.name}>
                <button className="cat-row" onClick={() => go('activity', { query: m.name })}>
                  <div className="row-between">
                    <span>{m.name}</span>
                    <span className="cat-amt">
                      {inr(m.amount)} <em>{m.count}×</em>
                    </span>
                  </div>
                  <Bar pct={(m.amount / s.topMerchants[0].amount) * 100} color="var(--accent)" reduce={reduce} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
