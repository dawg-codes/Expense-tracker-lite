import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReviewItem } from '../lib/analyze';
import { catMeta } from '../lib/categories';
import { inr } from '../lib/parser';
import type { FlagKind, TxnView } from '../lib/types';
import { dismissFlag, mergeUser, useApp } from './context';
import { AmountText, displayName, txnEmoji } from './txn';
import { Empty, Icon, shortDate } from './ui';

const GROUPS: Record<FlagKind, { emoji: string; title: string; hint: string }> = {
  duplicate: { emoji: '⚠️', title: 'Possible duplicate', hint: 'Same amount reported by two senders a few minutes apart. It is not counted twice.' },
  unknown_type: { emoji: '❓', title: 'Unclear transaction', hint: 'We could not tell if money went out or came in. Not counted until you choose.' },
  transfer: { emoji: '↔️', title: 'Possible transfer', hint: 'A matching debit and credit close together. Still counted until you confirm.' },
  refund: { emoji: '↩️', title: 'Possible refund', hint: 'Money back from a merchant you recently paid the same amount.' },
  card_payment: { emoji: '💳', title: 'Card bill payment', hint: 'Not counted, so card purchases are not counted twice. No card spending is recorded yet.' },
  uncategorised: { emoji: '🏷️', title: 'Unknown merchant', hint: 'Pick a category. You can make it stick for every payment to this merchant.' },
  low_confidence: { emoji: '🧐', title: 'Unusual wording', hint: 'The message was hard to read. Check the amount and type.' },
};

const QUICK_CATS = ['Food', 'Groceries', 'Shopping', 'Transport', 'Bills', 'Home', 'Health', 'Family', 'Other'];

function ReviewCard({ item }: { item: ReviewItem }) {
  const { analysis, cats, catList, decide, saveRule, openTxn, maskIncome } = useApp();
  const [always, setAlways] = useState(false);
  const v = item.txn;
  const related = item.flag.relatedId ? analysis.byId.get(item.flag.relatedId) : undefined;
  const one = (patch: Parameters<typeof decide>[1], label: string) => decide([v.id], patch, label);
  const both = (patch: Parameters<typeof decide>[1], label: string) => decide(related ? [v.id, related.id] : [v.id], patch, label);
  const quick = QUICK_CATS.filter((c) => catList.some((x) => x.id === c));

  const pickCategory = (cat: string) => {
    one((p) => mergeUser(p, { category: cat, reviewed: true }), `${catMeta(cats, cat).label}: ${displayName(v, cats)}`);
    if (always && (v.merchant || v.merchantRaw)) {
      saveRule({ id: `r_${Date.now().toString(36)}`, match: v.merchant ?? v.merchantRaw ?? v.name, category: cat });
    }
  };

  let actions: ReactNode;
  switch (item.flag.kind) {
    case 'duplicate':
      actions = (
        <>
          <button className="btn-small" onClick={() => one((p) => mergeUser(dismissFlag(p, 'duplicate'), { reviewed: true }), 'Kept as duplicate')}>
            ✓ Yes, duplicate
          </button>
          <button className="btn-small ghost" onClick={() => one((p) => mergeUser(dismissFlag(p, 'duplicate'), { notDuplicate: true }), 'Counted as a separate payment')}>
            No, count it
          </button>
        </>
      );
      break;
    case 'transfer':
      actions = (
        <>
          <button
            className="btn-small"
            onClick={() =>
              related &&
              decide(
                [v.id, related.id],
                (p) => mergeUser(p, { type: 'transfer', reviewed: true }),
                'Marked as internal transfer',
              )
            }
          >
            ↔️ Mark transfer
          </button>
          <button className="btn-small ghost" onClick={() => both((p) => dismissFlag(p, 'transfer'), 'Not a transfer')}>
            Not a transfer
          </button>
        </>
      );
      break;
    case 'refund':
      actions = (
        <>
          <button
            className="btn-small"
            onClick={() => one((p) => mergeUser(p, { type: 'refund', reviewed: true, linkedId: related?.id }), 'Marked as refund')}
          >
            ↩️ Mark refund
          </button>
          <button className="btn-small ghost" onClick={() => one((p) => dismissFlag(p, 'refund'), 'Kept as income')}>
            It's income
          </button>
        </>
      );
      break;
    case 'card_payment':
      actions = (
        <>
          <button className="btn-small" onClick={() => one((p) => mergeUser(dismissFlag(p, 'card_payment'), { reviewed: true }), 'Card payment kept out of spending')}>
            ✓ Keep excluded
          </button>
          <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { type: 'expense', reviewed: true }), 'Card payment counted as spending')}>
            Count as expense
          </button>
        </>
      );
      break;
    case 'unknown_type':
      actions = (
        <>
          <button className="btn-small" onClick={() => one((p) => mergeUser(p, { type: 'expense', reviewed: true }), 'Marked as expense')}>
            💸 Expense
          </button>
          <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { type: 'income', reviewed: true }), 'Marked as income')}>
            ⬇️ Income
          </button>
          <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { type: 'transfer', reviewed: true }), 'Marked as transfer')}>
            ↔️ Transfer
          </button>
        </>
      );
      break;
    case 'uncategorised':
      actions = (
        <div className="review-cats">
          <div className="chip-row wrap">
            {quick.map((c) => (
              <button key={c} className="pill" onClick={() => pickCategory(c)}>
                {catMeta(cats, c).emoji} {catMeta(cats, c).label}
              </button>
            ))}
            <button className="pill" onClick={() => openTxn(v.id)}>
              More…
            </button>
          </div>
          {(v.merchant || v.merchantRaw) && (
            <label className="check">
              <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
              Always use this category for “{displayName(v, cats)}”
            </label>
          )}
        </div>
      );
      break;
    default:
      actions = (
        <>
          <button className="btn-small" onClick={() => one((p) => mergeUser(p, { reviewed: true }), 'Confirmed')}>
            ✓ Looks right
          </button>
          <button className="btn-small ghost" onClick={() => openTxn(v.id)}>
            Edit
          </button>
        </>
      );
  }

  return (
    <motion.li
      className="review-card"
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
    >
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
      {related && (
        <p className="muted small related">
          {item.flag.kind === 'duplicate' ? 'Same as' : item.flag.kind === 'refund' ? 'Matches purchase' : 'Pairs with'}{' '}
          {related.direction === 'debit' ? '−' : '+'}
          {inr(related.amount, true)} · {displayName(related, cats)} · {related.sender} · {shortDate(related.date)}
        </p>
      )}
      <div className="review-actions">
        {actions}
        <button className="btn-small ghost" onClick={() => one((p) => mergeUser(p, { excluded: true }), 'Excluded from totals')} aria-label="Exclude">
          🚫 Exclude
        </button>
      </div>
    </motion.li>
  );
}

export function Review() {
  const { analysis, decisions, undo, cats, decide, maskIncome, openTxn } = useApp();
  const [showDupes, setShowDupes] = useState(false);
  const [limit, setLimit] = useState(40);
  const items = analysis.review;
  const groups = new Map<FlagKind, ReviewItem[]>();
  for (const it of items.slice(0, limit)) {
    const list = groups.get(it.flag.kind) ?? [];
    list.push(it);
    groups.set(it.flag.kind, list);
  }
  const uncategorised = items.filter((i) => i.flag.kind === 'uncategorised');

  return (
    <>
      <section className="card hero">
        <span className="label">🧐 Review</span>
        <h2 className="review-count">
          {items.length === 0 ? 'All clear' : `${items.length} transaction${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} your attention`}
        </h2>
        <p className="muted small">
          Uncertain results are never hidden. Anything we're unsure about lands here, and your decisions always override automatic detection.
        </p>
      </section>

      {items.length === 0 && decisions.length === 0 && <Empty emoji="✨" title="Nothing to review">New questions appear here after each sync.</Empty>}

      {[...groups].map(([kind, list]) => (
        <section className="card" key={kind}>
          <div className="row-between">
            <h2 className="section-title">
              {GROUPS[kind].emoji} {GROUPS[kind].title} <span className="count">{items.filter((i) => i.flag.kind === kind).length}</span>
            </h2>
            {kind === 'uncategorised' && uncategorised.length > 3 && (
              <button
                className="link"
                onClick={() => decide(uncategorised.map((i) => i.txn.id), (p) => mergeUser(p, { reviewed: true }), `${uncategorised.length} kept as Other`)}
              >
                Keep all as Other
              </button>
            )}
          </div>
          <p className="muted small group-hint">{GROUPS[kind].hint}</p>
          <ul className="review-list">
            <AnimatePresence initial={false}>
              {list.map((it) => (
                <ReviewCard key={it.txn.id} item={it} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      {items.length > limit && (
        <button className="link center-btn" onClick={() => setLimit(limit + 40)}>
          Show more ({items.length - limit} left)
        </button>
      )}

      {decisions.length > 0 && (
        <section className="card">
          <h2 className="section-title">Recently reviewed</h2>
          <ul className="txns">
            {decisions.slice(0, 10).map((d) => (
              <li key={d.id} className="decision">
                <span className="txn-meta">
                  <strong>{d.label}</strong>
                  <small className="muted">
                    {d.txnIds
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
                  <button
                    className="btn-small ghost"
                    onClick={() => decide([v.id], (p) => mergeUser(p, { notDuplicate: true }), 'Counted as a separate payment')}
                  >
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
