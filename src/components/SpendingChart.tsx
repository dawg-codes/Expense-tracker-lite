import { useState } from 'react';
import { motion } from 'motion/react';
import { catMeta, type CategoryMap } from '../lib/categories';
import { inr } from '../lib/parser';
import { useApp } from './context';
import { Bar, Icon, Sheet } from './ui';

const LEGEND_MAX = 5;

/** Thin ring with a soft glow; the centre shows the largest category's share. */
function Ring({ items, total, cats, reduce }: { items: [string, number][]; total: number; cats: CategoryMap; reduce: boolean }) {
  const R = 58;
  const C = 2 * Math.PI * R;
  const GAP = items.length > 1 ? 4 : 0;
  let offset = 0;
  const top = items[0];
  return (
    <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`Spending by category. Largest: ${catMeta(cats, top[0]).label}, ${Math.round((top[1] / total) * 100)}%`}>
      <circle cx="70" cy="70" r={R} className="donut-track" />
      <g transform="rotate(-90 70 70)">
        {items.map(([cat, amount], i) => {
          const seg = (amount / total) * C;
          const len = Math.max(seg - GAP, 0.6);
          const o = offset;
          offset += seg;
          const color = catMeta(cats, cat).color;
          return (
            <motion.circle
              key={cat}
              className="donut-seg"
              style={{ color }}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDashoffset={-o}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${len} ${C - len}` }}
              transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : Math.min(i, 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </g>
      <text x="70" y="70" textAnchor="middle" className="donut-big">
        {Math.round((top[1] / total) * 100)}%
      </text>
      <text x="70" y="88" textAnchor="middle" className="donut-small">
        {catMeta(cats, top[0]).label}
      </text>
    </svg>
  );
}

export function SpendingChart({ byCategory, valid }: { byCategory: [string, number][]; valid: boolean }) {
  const { cats, reduce, go, period } = useApp();
  const [all, setAll] = useState(false);
  const total = byCategory.reduce((a, [, x]) => a + x, 0);
  const pct = (x: number) => (total > 0 ? Math.round((x / total) * 100) : 0);
  const open = (cat: string) => {
    setAll(false);
    go('activity', { category: cat, kinds: [] });
  };

  return (
    <section className="section" aria-labelledby="where-title">
      <div className="section-head">
        <h2 id="where-title" className="eyebrow">
          Where it went
        </h2>
        {byCategory.length > 0 && (
          <button className="link" onClick={() => setAll(true)}>
            Details
          </button>
        )}
      </div>

      {byCategory.length === 0 ? (
        <p className="muted small">{valid ? 'No spending in this period.' : 'Fix the date range to see results.'}</p>
      ) : (
        <div className="spend-chart">
          <Ring key={`${period.mode}-${period.offset}-${total}`} items={byCategory} total={total} cats={cats} reduce={reduce} />
          <ul className="legend-list">
            {byCategory.slice(0, LEGEND_MAX).map(([cat, amount]) => {
              const meta = catMeta(cats, cat);
              return (
                <li key={cat}>
                  <button onClick={() => open(cat)} aria-label={`${meta.label}: ${inr(amount)}, ${pct(amount)}%. Show transactions`}>
                    <span className="legend-dot" style={{ background: meta.color }} />
                    <span className="legend-name">{meta.label}</span>
                    <span className="legend-pct">{pct(amount)}%</span>
                  </button>
                </li>
              );
            })}
            {byCategory.length > LEGEND_MAX && (
              <li>
                <button className="link legend-more" onClick={() => setAll(true)}>
                  +{byCategory.length - LEGEND_MAX} more
                </button>
              </li>
            )}
          </ul>
        </div>
      )}

      <Sheet open={all} onClose={() => setAll(false)} title="Where it went">
        <ul className="cats">
          {byCategory.map(([cat, amount]) => {
            const meta = catMeta(cats, cat);
            return (
              <li key={cat}>
                <button className="cat-row" onClick={() => open(cat)}>
                  <div className="row-between">
                    <span>
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="cat-amt">
                      {inr(amount)} <em>{pct(amount)}%</em>
                    </span>
                  </div>
                  <Bar pct={pct(amount)} color={meta.color} reduce={reduce} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="muted tiny">
          <Icon name="info" size={12} /> Tap a category to see its transactions.
        </p>
      </Sheet>
    </section>
  );
}
