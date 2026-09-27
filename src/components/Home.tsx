import { useMemo } from 'react';
import { catMeta } from '../lib/categories';
import { periodScope } from '../lib/dates';
import { headlineInsights } from '../lib/insights';
import { useApp } from './context';
import { DashboardHero, type PeriodData } from './DashboardHero';
import { InsightList, ReviewSummary, SyncStatus } from './HomeSections';
import { SpendingChart } from './SpendingChart';

export { Delta, type PeriodData } from './DashboardHero';

/**
 * Home answers "how am I doing?" in a few seconds, in this order:
 * spent → where it went → one or two insights → what needs you → last sync.
 * Everything else (feed, trends, settings) lives on its own tab.
 */
export function Home({ data }: { data: PeriodData }) {
  const { period, cats, analysis } = useApp();
  const s = data.summary;
  const recurringMonthly = useMemo(() => analysis.recurring.reduce((a, r) => a + r.monthly, 0), [analysis.recurring]);
  const insights = useMemo(
    () =>
      headlineInsights(s, {
        scope: periodScope(period),
        compare: data.compare,
        recurringMonthly: period.mode === 'month' ? recurringMonthly : undefined,
        categoryLabel: (id) => catMeta(cats, id).label,
      }),
    [s, period, data.compare, recurringMonthly, cats],
  );

  return (
    <>
      <DashboardHero data={data} />
      <SpendingChart byCategory={s.byCategory} valid={data.valid} />
      <InsightList items={insights} />
      <ReviewSummary />
      <SyncStatus />
    </>
  );
}
