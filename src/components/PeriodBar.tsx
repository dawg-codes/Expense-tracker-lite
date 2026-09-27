import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { canNavigate, periodHint, periodRange, periodTitle, toISODate, type PeriodMode } from '../lib/dates';
import { useApp } from './context';
import { Icon } from './ui';

const MODES: Array<[PeriodMode, string]> = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['all', 'All'],
  ['custom', 'Custom'],
];

export function PeriodBar() {
  const { period, setPeriod } = useApp();
  const valid = !!periodRange(period);
  const nav = canNavigate(period);

  const pick = (mode: PeriodMode) => {
    if (mode === 'custom' && !period.start) {
      const now = new Date();
      setPeriod({ mode, offset: 0, start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: toISODate(now) });
    } else setPeriod({ ...period, mode, offset: 0 });
  };

  return (
    <div className="period">
      <LayoutGroup id="period">
        <div className="seg" role="tablist" aria-label="Time range">
          {MODES.map(([m, label]) => (
            <button key={m} role="tab" aria-selected={period.mode === m} className={period.mode === m ? 'active' : ''} onClick={() => pick(m)}>
              {period.mode === m && (
                <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
              )}
              <span className="seg-label">{label}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      {nav && (
        <div className="period-nav">
          <button className="icon-btn small" aria-label="Previous period" onClick={() => setPeriod({ ...period, offset: period.offset - 1 })}>
            <Icon name="left" size={16} />
          </button>
          <div className="period-title" aria-live="polite">
            <strong>{periodTitle(period)}</strong>
            <button
              className={`period-hint ${period.offset !== 0 ? 'link' : 'muted'}`}
              disabled={period.offset === 0}
              onClick={() => setPeriod({ ...period, offset: 0 })}
            >
              {periodHint(period)}
              {period.offset !== 0 && ' · back to now'}
            </button>
          </div>
          <button
            className="icon-btn small"
            aria-label="Next period"
            disabled={period.offset >= 0}
            onClick={() => setPeriod({ ...period, offset: Math.min(0, period.offset + 1) })}
          >
            <Icon name="right" size={16} />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {period.mode === 'custom' && (
          <motion.div className="range card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="range-inner">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={period.start ?? ''}
                  max={period.end}
                  onChange={(e) => setPeriod({ ...period, start: e.target.value })}
                />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={period.end ?? ''} min={period.start} onChange={(e) => setPeriod({ ...period, end: e.target.value })} />
              </label>
            </div>
            {!valid && <p className="field-error">Start date must be on or before the end date.</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
