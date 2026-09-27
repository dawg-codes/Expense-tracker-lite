import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReviewItem } from '../lib/analyze';
import { catMeta } from '../lib/categories';
import { merchantKey } from '../lib/merchants';
import { inr } from '../lib/parser';
import type { FlagKind, TxnView } from '../lib/types';
import { dismissFlag, mergeUser, useApp } from './context';
import { AmountText, CategoryPicker, displayName, txnEmoji } from './txn';
import { Empty, Icon, shortDate } from './ui';

const GROUPS: Record<FlagKind, { emoji: string; title: string; hint: string }> = {
  duplicate: { emoji: '⚠️', title: 'Possible duplicate', hint: 'Two different senders reported the same amount minutes apart. Only one is counted.' },
  unknown_type: { emoji: '❓', title: 'Unclear transaction', hint: "The alert doesn't say whether money went out or came in. Not counted until you choose." },
  transfer: { emoji: '↔️', title: 'Possible transfer', hint: 'Might be money moved between your own accounts. Still counted as spending until you confirm.' },
  refund: { emoji: '↩️', title: 'Possible refund', hint: 'Money back for the exact amount of a recent payment to the same payee.' },
  card_payment: { emoji: '💳', title: 'Card bill payment', hint: 'Not counted as spending, but no card purchases have been recorded for this card.' },
  uncategorised: { emoji: '🏷️', title: 'Needs category', hint: 'Payees we could not place. Choose once and every payment to them (past and future) follows.' },
  low_confidence: { emoji: '🧐', title: 'Unusual wording', hint: 'The alert used only abbreviations. Check that it is a real transaction.' },
};
const ORDER: FlagKind[] = ['uncategorised', 'duplicate', 'transfer', 'refund', 'unknown_type', 'card_payment', 'low_confidence'];
const QUICK_CATS = ['Groceries', 'Food', 'Shopping', 'People', 'Transport', 'Bills', 'Home', 'Health', 'Family'];

/* ---------- one payee, many transactions ---------- */

function PayeeGroup({ items }: { items: ReviewItem[] }) {
  const { cats, catList, learn, decide, openTxn } = useApp();
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(false);
  const txns = items.map((i) => i.txn);
  const sample = txns[0];
  const ids = txns.map((t) => t.id);
  const total = txns.reduce((a, t) => a + t.amount, 0);
  const name = displayName(sample, cats);
  const quick = QUICK_CATS.filter((c) => catList.some((x) => x.id === c));
  const pick = (cat: string) => learn(ids, sample, { category: cat }, true, `${name} → ${catMeta(cats, cat).label}`);

  return (
    <motion.li className="review-card" layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}>
      <div className="group-head">
        <span className="txn-icon">🏷️</span>
        <span className="txn-meta">
          <strong>{name}</strong>
          <small className="muted">
            {txns.length} transaction{txns.length === 1 ? '' : 's'} · {inr(total)} total · {shortDate(txns[txns.length - 1].date)}–{shortDate(txns[0].date)}
          </small>
        </span>
        <button className="icon-btn small" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Show transactions">
          <Icon name={open ? 'x' : 'list'} size={14} />
        </button>
      </div>
      {open && (
        <ul className="group-list">
          {txns.slice(0, 20).map((t) => (
            <li key={t.id}>
              <button className="link" onClick={() => openTxn(t.id)}>
                {shortDate(t.date)} · {inr(t.amount, true)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Categorise all as:</p>
      <div className="chip-row wrap">
        {quick.map((c) => (
          <button key={c} className="pill" onClick={() => pick(c)}>
            {catMeta(cats, c).emoji} {catMeta(cats, c).label}
          </button>
        ))}
        <button className="pill" onClick={() => setMore(!more)}>
          More…
        </button>
      </div>
      {more && <CategoryPicker onPick={pick} />}
      <div className="review-actions">
        <button
          className="btn-small ghost"
          onClick={() => decide(ids, (p) => mergeUser(dismissFlag(p, 'uncategorised'), { reviewed: true }), `${name}: kept as Other`)}
        >
          Keep as Other
        </button>
        <button className="btn-small ghost" onClick={() => decide(ids, (p) => mergeUser(p, { excluded: true }), `${name}: excluded`)}>
          🚫 Exclude
        </button>
      </div>
    </motion.li>
  );
}

/* ---------- single ambiguous transaction ---------- */

function ReviewCard({ item }: { item: ReviewItem }) {
  const { analysis, cats, decide, learn, openTxn, maskIncome } = useApp();
  const v = item.txn;
  const related = item.flag.relatedId ? analysis.byId.get(item.flag.relatedId) : undefined;
  const one = (patch: Parameters<typeof decide>[1], label: string) => decide([v.id], patch, label);
  const pair = related ? [v.id, related.id] : [v.id];

  let confirm: ReactNode;
  let alt: ReactNode;
  switch (item.flag.kind) {
    case 'duplicate':
      confirm = (
        <button className="btn-small" onClick={() => one((p) => mergeUser(dismissFlag(p, 'duplicate'), { reviewed: true }), 'Confirmed duplicate')}>
          ✓ Confirm duplicate
        </button>
      );
      alt = (
        <button className="btn-small ghost" onClick={() => one((p) => mergeUser(dismissFlag(p, 'duplicate'), { notDuplicate: true }), 'Counted as a separate payment')}>
          Not a duplicate
        </button>
      );
      break;
    case 'transfer':
      confirm = (
        <button
          className="btn-small"
          onClick={() =>
            decide(pair, (p) => mergeUser(dismissFlag(p, 'transfer'), { type: 'transfer', reviewed: true }), 'Marked as own-account transfer')
          }
        >
          ✓ It's a transfer
        </button>
      );
      alt = (
        <button className="btn-small ghost" onClick={() => decide(pair, (p) => mergeUser(dismissFlag(p, 'transfer'), { reviewed: true }), 'Not a transfer')}>
          Not a transfer
        </button>
      );
      break;
    case 'refund':
      confirm = (
        <button className="btn-small" onClick={() => learn([v.id], v, { type: 'refund' }, true, 'Marked as refund')}>
          ✓ It's a refund
        </button>
      );
      alt = (
        <button className="btn-small ghost" onClick={() => one((p) => mergeUser(dismissFlag(p, 'refund'), { reviewed: true }), 'Kept as income')}>
          It's income
        </button>
      );
      break;
    case 'unknown_type':
      confirm = (
        <>
          <button className="btn-small" onClick={() => one((p) => mergeUser(p, { type: 'expense', reviewed: true }), 'Marked as expense')}>
            💸 Expense
          </button>
          <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { type: 'income', reviewed: true }), 'Marked as income')}>
            ⬇️ Income
          </button>
        </>
      );
      alt = (
        <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { type: 'transfer', reviewed: true }), 'Marked as transfer')}>
          ↔️ Transfer
        </button>
      );
      break;
    default:
      confirm = (
        <button className="btn-small" onClick={() => one((p) => mergeUser(p, { reviewed: true }), 'Confirmed')}>
          ✓ Confirm
        </button>
      );
      alt = null;
  }

  return (
    <motion.li className="review-card" layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}>
      <button className="txn-row" onClick={() => openTxn(v.id)}>
        <span className="txn-icon" style={{ background: `${catMeta(cats, v.cat).color}22` }}>
          {txnEmoji(v, cats)}
        </span>
        <span className="txn-meta">
          <strong>{displayName(v, cats)}</strong>
          <small className="muted">
            {shortDate(v.date)} · {v.sender}
            {v.account ? ` · ${v.account}` : ''}
          </small>
        </span>
        <AmountText v={v} mask={maskIncome} />
      </button>
      {(related || item.flag.note) && (
        <p className="muted small related">
          {related
            ? `${item.flag.kind === 'duplicate' ? 'Same as' : item.flag.kind === 'refund' ? 'Matches payment' : 'Pairs with'} ${related.direction === 'debit' ? '−' : '+'}${inr(related.amount, true)} · ${displayName(related, cats)} · ${related.sender} · ${shortDate(related.date)}`
            : item.flag.note}
        </p>
      )}
      <div className="review-actions">
        {confirm}
        {alt}
        <button className="btn-small ghost" onClick={() => openTxn(v.id)}>
          Change
        </button>
        <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { excluded: true }), 'Excluded from totals')}>
          🚫 Exclude
        </button>
      </div>
    </motion.li>
  );
}

/* ---------- bulk confirm per section ---------- */

function bulkConfirm(kind: FlagKind, items: ReviewItem[]): { label: string; ids: string[]; patch: Parameters<ReturnType<typeof useApp>['decide']>[1] } | null {
  const ids = items.map((i) => i.txn.id);
  switch (kind) {
    case 'duplicate':
      return { label: `Confirm all ${ids.length} duplicates`, ids, patch: (p) => mergeUser(dismissFlag(p, 'duplicate'), { reviewed: true }) };
    case 'card_payment':
      return { label: `Keep all ${ids.length} out of spending`, ids, patch: (p) => mergeUser(dismissFlag(p, 'card_payment'), { reviewed: true }) };
    case 'transfer': {
      const all = [...new Set(items.flatMap((i) => [i.txn.id, i.flag.relatedId].filter((x): x is string => !!x)))];
      return { label: `Mark all as transfers`, ids: all, patch: (p) => mergeUser(dismissFlag(p, 'transfer'), { type: 'transfer', reviewed: true }) };
    }
    case 'refund':
      return { label: `Mark all ${ids.length} as refunds`, ids, patch: (p) => mergeUser(dismissFlag(p, 'refund'), { type: 'refund', reviewed: true }) };
    case 'low_confidence':
      return { label: `Confirm all ${ids.length}`, ids, patch: (p) => mergeUser(p, { reviewed: true }) };
    default:
      return null;
  }
}

/* ---------- screen ---------- */

export function Review() {
  const { analysis, decisions, undo, cats, decide, maskIncome, openTxn, go } = useApp();
  const [showDupes, setShowDupes] = useState(false);
  const items = analysis.review;
  const st = analysis.stats;

  const sections = useMemo(() => {
    const byKind = new Map<FlagKind, ReviewItem[]>();
    for (const it of items) {
      const l = byKind.get(it.flag.kind) ?? [];
      l.push(it);
      byKind.set(it.flag.kind, l);
    }
    return ORDER.filter((k) => byKind.has(k)).map((kind) => {
      const list = byKind.get(kind)!;
      // group by payee so one decision resolves them all
      const payees = new Map<string, ReviewItem[]>();
      if (kind === 'uncategorised') {
        for (const it of list) {
          const k = merchantKey(it.txn.name) ?? it.txn.id;
          const g = payees.get(k) ?? [];
          g.push(it);
          payees.set(k, g);
        }
      }
      return { kind, list, payees: [...payees.values()].sort((a, b) => b.length - a.length) };
    });
  }, [items]);
  const decisionsNeeded = sections.reduce((a, s) => a + (s.kind === 'uncategorised' ? s.payees.length : s.list.length), 0);

  return (
    <>
      <section className="card hero">
        <span className="label">🧐 Review</span>
        <h2 className="review-count">
          {items.length === 0 ? 'Nothing needs you' : `${items.length} transaction${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} your attention`}
        </h2>
        {items.length > 0 && decisionsNeeded < items.length && (
          <p className="small">
            <b>
              {decisionsNeeded} decision{decisionsNeeded === 1 ? '' : 's'}
            </b>{' '}
            will clear them all.
          </p>
        )}
        <p className="muted small">
          ✓ {st.resolved.toLocaleString('en-IN')} handled automatically. Only genuinely ambiguous cases land here, and your choices teach the app for next time.
        </p>
        <div className="chip-row wrap auto-chips">
          {st.categorised > 0 && (
            <button className="pill" onClick={() => go('activity', { allTime: true, kinds: ['expense'] })}>
              🏷️ {st.categorised} categorised
            </button>
          )}
          {st.duplicates > 0 && (
            <button className="pill" onClick={() => setShowDupes(true)}>
              🔁 {st.duplicates} duplicates
            </button>
          )}
          {st.transfers > 0 && (
            <button className="pill" onClick={() => go('activity', { allTime: true, kinds: ['transfer'] })}>
              ↔️ {st.transfers} transfers
            </button>
          )}
          {st.refunds > 0 && (
            <button className="pill" onClick={() => go('activity', { allTime: true, kinds: ['refund'] })}>
              ↩️ {st.refunds} refunds
            </button>
          )}
          {st.cardPayments > 0 && <span className="pill static">💳 {st.cardPayments} card bills</span>}
        </div>
      </section>

      {items.length === 0 && decisions.length === 0 && <Empty emoji="✨" title="All clear">New questions appear here only when the app genuinely can't decide.</Empty>}

      {sections.map(({ kind, list, payees }) => {
        const bulk = bulkConfirm(kind, list);
        return (
          <section className="card" key={kind}>
            <div className="row-between">
              <h2 className="section-title">
                {GROUPS[kind].emoji} {GROUPS[kind].title} <span className="count">{list.length}</span>
              </h2>
              {bulk && list.length > 1 && (
                <button className="link" onClick={() => decide(bulk.ids, bulk.patch, `${GROUPS[kind].title}: ${bulk.ids.length} resolved`)}>
                  {bulk.label}
                </button>
              )}
            </div>
            <p className="muted small group-hint">{GROUPS[kind].hint}</p>
            <ul className="review-list">
              <AnimatePresence initial={false}>
                {kind === 'uncategorised'
                  ? payees.map((g) => <PayeeGroup key={g[0].txn.id} items={g} />)
                  : list.slice(0, 30).map((it) => <ReviewCard key={it.txn.id} item={it} />)}
              </AnimatePresence>
            </ul>
            {kind !== 'uncategorised' && list.length > 30 && <p className="muted small center">{list.length - 30} more after these</p>}
          </section>
        );
      })}

      {decisions.length > 0 && (
        <section className="card">
          <h2 className="section-title">Recently reviewed</h2>
          <ul className="txns">
            {decisions.slice(0, 10).map((d) => (
              <li key={d.id} className="decision">
                <span className="txn-meta">
                  <strong>{d.label}</strong>
                  <small className="muted">
                    {d.txnIds.length > 3
                      ? `${d.txnIds.length} transactions`
                      : d.txnIds
                          .map((id) => analysis.byId.get(id))
                          .filter((x): x is TxnView => !!x)
                          .map((x) => `${inr(x.amount)} · ${displayName(x, cats)}`)
                          .join(', ')}
                  </small>
                </span>
                <button className="btn-small ghost" onClick={() => undo(d.id)}>
                  <Icon name="undo" size={14} /> Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.autoDupes.length > 0 && (
        <section className="card">
          <button className="dupe-head" onClick={() => setShowDupes(!showDupes)} aria-expanded={showDupes}>
            <span>
              🔁 {analysis.autoDupes.length} duplicate alert{analysis.autoDupes.length === 1 ? '' : 's'} ignored automatically
            </span>
            <span className="link">{showDupes ? 'Hide' : 'Show'}</span>
          </button>
          {showDupes && (
            <ul className="txns" style={{ marginTop: 12 }}>
              {analysis.autoDupes.slice(0, 50).map((v) => (
                <li key={v.id} className="decision">
                  <button className="txn-row" onClick={() => openTxn(v.id)}>
                    <span className="txn-meta">
                      <strong>
                        {inr(v.amount, true)} · {displayName(v, cats)}
                      </strong>
                      <small className="muted">
                        {v.sender} · {shortDate(v.date)} · {v.dupReason}
                      </small>
                    </span>
                    <AmountText v={v} mask={maskIncome} />
                  </button>
                  <button className="btn-small ghost" onClick={() => decide([v.id], (p) => mergeUser(p, { notDuplicate: true }), 'Counted as a separate payment')}>
                    Count it
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
