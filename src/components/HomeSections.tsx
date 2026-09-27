import { useState } from 'react';
import type { Headline } from '../lib/insights';
import { useApp } from './context';
import { Icon, Sheet } from './ui';

/** One or two short observations. Plain text on the background, no card. */
export function InsightList({ items }: { items: Headline[] }) {
  if (!items.length) return null;
  return (
    <section className="section" aria-labelledby="insight-title">
      <h2 id="insight-title" className="eyebrow">
        Insight
      </h2>
      <ul className="insights">
        {items.map((h) => {
          const i = h.strong ? h.text.indexOf(h.strong) : -1;
          return (
            <li key={h.text}>
              <span className="insight-mark" aria-hidden="true">
                <Icon name="spark" size={13} />
              </span>
              <span>
                {i < 0 ? (
                  h.text
                ) : (
                  <>
                    {h.text.slice(0, i)}
                    <b>{h.strong}</b>
                    {h.text.slice(i + h.strong!.length)}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Secondary: noticeable, never dominant. */
export function ReviewSummary() {
  const { analysis, go } = useApp();
  const n = analysis.review.length;
  if (n === 0) {
    if (!analysis.stats.resolved) return null;
    return (
      <p className="all-handled small">
        <Icon name="check" size={14} /> All {analysis.stats.resolved.toLocaleString('en-IN')} transactions handled automatically
      </p>
    );
  }
  return (
    <button className="row-link attention" onClick={() => go('review')}>
      <span className="attn-dot" aria-hidden="true">
        <Icon name="alert" size={17} />
      </span>
      <span className="grow">
        <strong>Needs attention</strong>
        <small>
          {n} transaction{n === 1 ? '' : 's'} · {analysis.stats.resolved.toLocaleString('en-IN')} handled automatically
        </small>
      </span>
      <Icon name="right" size={18} className="chev" />
    </button>
  );
}

/** Compact, dismissible result of the last sync. The full breakdown lives in a sheet. */
export function SyncStatus() {
  const { syncSummary: s, dismissSyncSummary, go } = useApp();
  const [open, setOpen] = useState(false);
  if (!s) return null;
  // new = handled + need attention; ignored duplicate alerts are listed in Details
  const handled = s.newCount - s.attention;
  const fromSync = { allTime: true, ids: s.ids, idsLabel: 'From last sync' };
  const rows: Array<[string, number, () => void]> = [
    ['Categorised automatically', s.categorised, () => go('activity', fromSync)],
    ['Small one-off payments kept in Other', s.otherKept, () => go('activity', { ...fromSync, category: 'Other' })],
    ['Duplicate alerts ignored', s.duplicates, () => go('review')],
    ['Own-account transfers excluded', s.transfers, () => go('activity', { ...fromSync, kinds: ['transfer'] })],
    ['Refunds matched', s.refunds, () => go('activity', { ...fromSync, kinds: ['refund'] })],
    ['Card bill payments excluded', s.cardPayments, () => go('activity', { ...fromSync, kinds: ['card_payment'] })],
    ['Older card bill payments re-classified', s.reclassified ?? 0, () => go('activity', { allTime: true, kinds: ['card_payment'] })],
  ];
  const tap = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <div className="sync-status" role="status">
        <Icon name="check" size={15} className="pos" />
        <span className="grow">
          {s.newCount ? (
            <>
              <b>{s.newCount.toLocaleString('en-IN')} new</b> · {handled.toLocaleString('en-IN')} handled automatically
              {s.attention ? ` · ${s.attention} need attention` : ''}
              {s.reclassified ? ` · ${s.reclassified} older card bills excluded` : ''}
            </>
          ) : (
            <b>Up to date</b>
          )}
        </span>
        {(s.newCount > 0 || !!s.reclassified) && (
          <button className="link" onClick={() => setOpen(true)}>
            Details
          </button>
        )}
        <button className="icon-btn small" onClick={dismissSyncSummary} aria-label="Dismiss sync result">
          <Icon name="x" size={14} />
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Synced ${s.newCount.toLocaleString('en-IN')} new transactions`}>
        <ul className="sync-rows">
          {rows
            .filter(([, n]) => n > 0)
            .map(([label, n, fn]) => (
              <li key={label}>
                <button onClick={tap(fn)}>
                  <span>{label}</span>
                  <strong>{n.toLocaleString('en-IN')}</strong>
                </button>
              </li>
            ))}
          <li className={s.attention ? 'attention' : ''}>
            <button onClick={tap(() => go('review'))} disabled={!s.attention}>
              <span>{s.attention ? 'Need your attention' : 'Nothing needs your attention'}</span>
              <strong>{s.attention || '✓'}</strong>
            </button>
          </li>
        </ul>
      </Sheet>
    </>
  );
}

/** Shown when detection rules improved but the one-time re-check couldn't run automatically. */
export function RulesUpdateNotice() {
  const { rulesOutdated, sync, syncing } = useApp();
  if (!rulesOutdated) return null;
  return (
    <div className="sync-status" role="status">
      <Icon name="spark" size={15} className="warn" />
      <span className="grow">
        <b>Card bill detection improved.</b> Sync once to re-check older transactions.
      </span>
      <button className="link" onClick={sync} disabled={syncing}>
        Sync
      </button>
    </div>
  );
}
