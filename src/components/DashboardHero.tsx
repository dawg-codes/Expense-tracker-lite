import { motion } from 'motion/react';
import { periodTitle } from '../lib/dates';
import type { Summary } from '../lib/insights';
import { inr } from '../lib/parser';
import type { TxnView } from '../lib/types';
import { useApp } from './context';
import { AnimatedNumber } from './ui';

export interface PeriodData {
  valid: boolean;
  list: TxnView[];
  summary: Summary;
  /** Previous equivalent period, or same days of it when the current one is still running. */
  compare?: { label: string; spent: number };
  previous?: Summary;
}

/** "↑ ₹248 · 76%". Direction is shown by the arrow and the words, not only by colour. */
export function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const d = now - before;
  if (Math.abs(d) < 1) return <span className="delta muted">No change</span>;
  const up = d > 0;
  const good = invert ? up : !up;
  return (
    <span className={`delta ${good ? 'pos' : 'neg'}`} aria-label={`${up ? 'Up' : 'Down'} ${inr(Math.abs(d))}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span> {inr(Math.abs(d))}
      {before > 0 && ` · ${Math.round((Math.abs(d) / before) * 100)}%`}
    </span>
  );
}

/** The primary module: how much you spent, then income / net / count. */
export function DashboardHero({ data }: { data: PeriodData }) {
  const { period, maskIncome } = useApp();
  const s = data.summary;
  const net = s.income - s.spent;
  const foot = [
    s.refunds > 0 ? `${inr(s.refunds)} refunds netted` : '',
    s.transfers > 0 ? `${inr(s.transfers)} own-account transfers excluded` : '',
  ].filter(Boolean);

  return (
    <motion.section className="dash" aria-label={`Spending summary, ${periodTitle(period)}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <AnimatedNumber value={s.spent} className="hero-amount" />
      <div className="hero-sub">
        <span className="spent-word">spent</span>
        {data.compare && (
          <span>
            <Delta now={s.spent} before={data.compare.spent} /> <span className="muted delta-note">vs {data.compare.label}</span>
          </span>
        )}
      </div>
      <div className="stats">
        <div>
          <span className="eyebrow">Income</span>
          <strong className={maskIncome ? '' : 'pos'}>{maskIncome ? '••••••' : inr(s.income)}</strong>
        </div>
        <div>
          <span className="eyebrow">Net</span>
          <strong className={maskIncome ? '' : net >= 0 ? 'pos' : 'neg'}>
            {maskIncome ? '••••' : `${net >= 0 ? '+' : '−'}${inr(Math.abs(net))}`}
          </strong>
        </div>
        <div className="right">
          <span className="eyebrow">Transactions</span>
          <strong>{s.count}</strong>
        </div>
      </div>
      {foot.length > 0 && <p className="hero-foot muted">{foot.join(' · ')}</p>}
    </motion.section>
  );
}
