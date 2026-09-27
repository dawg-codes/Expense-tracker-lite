import { LayoutGroup, motion } from 'motion/react';
import type { Tab } from './context';
import { Icon, type IconName } from './ui';

export const TABS: Array<[Tab, string, IconName]> = [
  ['home', 'Home', 'home'],
  ['activity', 'Activity', 'list'],
  ['insights', 'Insights', 'chart'],
  ['review', 'Review', 'inbox'],
  ['more', 'More', 'more'],
];

/**
 * Floating dock. Inactive destinations are icon-only; the active one expands
 * into a labelled pill. Content padding in .app keeps it clear of everything.
 */
export function BottomNav({ tab, onChange, reviewCount }: { tab: Tab; onChange: (t: Tab) => void; reviewCount: number }) {
  return (
    <LayoutGroup id="dock">
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([t, label, icon]) => {
          const active = tab === t;
          return (
            <button
              key={t}
              className={active ? 'active' : ''}
              onClick={() => onChange(t)}
              aria-current={active ? 'page' : undefined}
              aria-label={t === 'review' && reviewCount > 0 ? `${label}, ${reviewCount} need attention` : label}
            >
              {active && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} />}
              <span className="tab-icon">
                <Icon name={icon} size={20} />
                {t === 'review' && reviewCount > 0 && <span className="badge">{reviewCount > 99 ? '99+' : reviewCount}</span>}
              </span>
              {active && (
                <motion.span className="tab-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.05 }}>
                  {label}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
