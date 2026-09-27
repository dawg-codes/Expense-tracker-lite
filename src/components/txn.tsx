import { memo, useState } from 'react';
import { catMeta, type CategoryMap } from '../lib/categories';
import { ruleNeedle } from '../lib/analyze';
import { learnByDefault, newRuleId } from '../lib/learning';
import { inr } from '../lib/parser';
import type { TxnType, TxnView } from '../lib/types';
import { dismissFlag, mergeUser, useApp } from './context';
import { useBackHandler } from './nav';
import { Icon, Toggle, longDate, shortDate } from './ui';

export const KIND_META: Record<TxnType, { label: string; emoji: string }> = {
  expense: { label: 'Expense', emoji: '💸' },
  income: { label: 'Income', emoji: '⬇️' },
  transfer: { label: 'Internal transfer', emoji: '↔️' },
  refund: { label: 'Refund', emoji: '↩️' },
  card_payment: { label: 'Card bill payment', emoji: '💳' },
  unknown: { label: 'Unclear', emoji: '❓' },
};

export const TIER_LABEL: Record<TxnView['tier'], { label: string; tone: 'pos' | 'warn' | 'muted' }> = {
  high: { label: 'High', tone: 'pos' },
  medium: { label: 'Medium · resolved automatically', tone: 'muted' },
  review: { label: 'Needs your decision', tone: 'warn' },
};

export function displayName(v: TxnView, cats: CategoryMap): string {
  if (v.name) return v.name;
  if (v.kind === 'income') return 'Money received';
  if (v.kind === 'transfer') return 'Transfer';
  if (v.kind === 'card_payment') return 'Card bill payment';
  if (v.kind === 'refund') return 'Refund';
  if (v.kind === 'unknown') return 'Unclear transaction';
  if (v.dupOf) return 'Duplicate alert';
  return catMeta(cats, v.cat).label;
}

export function txnEmoji(v: TxnView, cats: CategoryMap): string {
  if (v.kind === 'expense') return catMeta(cats, v.cat).emoji;
  return KIND_META[v.kind].emoji;
}

export function AmountText({ v, mask }: { v: TxnView; mask: boolean }) {
  const inflow = v.direction === 'credit';
  const muted = !v.counted;
  const sign = v.kind === 'transfer' || v.kind === 'card_payment' || v.kind === 'unknown' ? '' : inflow ? '+' : '−';
  const text = inflow && v.kind === 'income' && mask ? '+ ••••' : `${sign}${inr(v.amount, true)}`;
  return <span className={`txn-amt ${inflow && v.counted ? 'pos' : ''} ${muted ? 'struck' : ''}`}>{text}</span>;
}

export const TxnRow = memo(function TxnRow({
  v,
  cats,
  mask,
  onOpen,
}: {
  v: TxnView;
  cats: CategoryMap;
  mask: boolean;
  onOpen: (id: string) => void;
}) {
  const meta = catMeta(cats, v.cat);
  const note = v.dupOf
    ? 'Duplicate'
    : v.excluded
      ? 'Excluded'
      : v.kind !== 'expense' && v.kind !== 'income'
        ? KIND_META[v.kind].label
        : meta.label;
  return (
    <li>
      <button className="txn-row" onClick={() => onOpen(v.id)}>
        <span className="txn-icon" style={{ background: `${meta.color}22` }}>
          {txnEmoji(v, cats)}
        </span>
        <span className="txn-meta">
          <strong>
            {displayName(v, cats)}
            {v.flags.length > 0 && <span className="dot-warn" aria-label="Needs review" />}
            {v.recurringKey && <span className="mini-tag">🔄</span>}
          </strong>
          <small className="muted">
            {note} · {shortDate(v.date)} · {v.sender}
          </small>
        </span>
        <AmountText v={v} mask={mask} />
      </button>
    </li>
  );
});

const TYPE_CHOICES: TxnType[] = ['expense', 'income', 'transfer', 'refund', 'card_payment'];

export function CategoryPicker({ value, onPick }: { value?: string; onPick: (id: string) => void }) {
  const { catList } = useApp();
  return (
    <div className="cat-grid">
      {catList.map((c) => (
        <button key={c.id} className={`cat-chip ${value === c.id ? 'active' : ''}`} onClick={() => onPick(c.id)}>
          <span>{c.emoji}</span>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** Contents of the transaction detail sheet. */
export function TxnDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { analysis, cats, decide, learn, saveRule, openTxn, maskIncome } = useApp();
  const v = analysis.byId.get(id);
  const [picking, setPicking] = useState(false);
  const [applyAll, setApplyAll] = useState(() => (v ? learnByDefault(v) : true));
  const [renaming, setRenaming] = useState(false);
  // inline editors close before the sheet does
  useBackHandler(picking, () => setPicking(false));
  useBackHandler(renaming, () => setRenaming(false));
  const [name, setName] = useState(v?.name ?? '');

  if (!v) return <p className="muted center pad">This transaction no longer exists.</p>;
  const meta = catMeta(cats, v.cat);
  const tier = TIER_LABEL[v.tier];
  const needle = ruleNeedle(v);
  const samePayee = needle && !v.ruleId ? analysis.all.filter((x) => x.id !== v.id && ruleNeedle(x) === needle).length : 0;
  const linked = v.linkedId ? analysis.byId.get(v.linkedId) : undefined;
  const dupOf = v.dupOf ? analysis.byId.get(v.dupOf) : undefined;
  const title = displayName(v, cats);
  const hasEdits = !!v.user;

  const status = v.dupOf
    ? `Not counted: ${v.dupReason?.toLowerCase() ?? 'duplicate alert'}`
    : v.excluded
      ? 'Not counted: excluded by you'
      : v.kind === 'transfer'
        ? 'Not counted: money moved between your accounts'
        : v.kind === 'card_payment'
          ? 'Not counted: the card purchases themselves are counted'
          : v.kind === 'unknown'
            ? 'Not counted until you choose a type'
            : v.kind === 'refund'
              ? 'Reduces your spending'
              : 'Counted in totals';

  return (
    <div className="detail">
      <div className="detail-hero">
        <span className="detail-emoji" style={{ background: `${meta.color}22` }}>
          {txnEmoji(v, cats)}
        </span>
        <h3>{title}</h3>
        <div className="detail-amt">
          <AmountText v={v} mask={maskIncome} />
        </div>
        <p className="muted small">
          {v.kind === 'expense' || v.kind === 'refund' ? `${meta.label} · ` : ''}
          {longDate(v.date)}
        </p>
      </div>

      {v.flags.length > 0 && (
        <div className="notice warn">
          <Icon name="alert" size={16} />
          <span>{v.flags.map((f) => FLAG_TEXT[f.kind]).join(' · ')}</span>
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>Type</dt>
          <dd>{KIND_META[v.kind].label}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>
            {meta.emoji} {meta.label}
            {v.ruleId && <span className="mini-tag">rule</span>}
          </dd>
        </div>
        <div>
          <dt>Merchant</dt>
          <dd>{v.name || '—'}</dd>
        </div>
        {v.merchantRaw && v.merchantRaw.toLowerCase() !== v.name.toLowerCase() && (
          <div>
            <dt>As written</dt>
            <dd className="mono">{v.merchantRaw}</dd>
          </div>
        )}
        <div>
          <dt>From</dt>
          <dd>
            {v.sender}
            {v.account ? ` · ${v.account}` : ''}
          </dd>
        </div>
        {v.ref && (
          <div>
            <dt>Reference</dt>
            <dd className="mono">{v.ref}</dd>
          </div>
        )}
        <div>
          <dt>Confidence</dt>
          <dd className={tier.tone}>{v.user ? 'Confirmed by you' : tier.label}</dd>
        </div>
        {v.autoNote && !v.user && (
          <div>
            <dt>Why</dt>
            <dd>{v.autoNote}</dd>
          </div>
        )}
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        {v.recurringKey && (
          <div>
            <dt>Pattern</dt>
            <dd>🔄 Recurring payment</dd>
          </div>
        )}
        {(linked || dupOf) && (
          <div>
            <dt>{dupOf ? 'Same as' : v.kind === 'refund' ? 'Refund of' : 'Linked to'}</dt>
            <dd>
              <button className="link" onClick={() => openTxn((dupOf ?? linked)!.id)}>
                {inr((dupOf ?? linked)!.amount, true)} · {shortDate((dupOf ?? linked)!.date)} ·{' '}
                {displayName((dupOf ?? linked)!, cats)}
              </button>
            </dd>
          </div>
        )}
      </dl>

      <p className="label">Change</p>
      <div className="type-row" role="radiogroup" aria-label="Transaction type">
        {TYPE_CHOICES.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={v.kind === k}
            className={`pill ${v.kind === k ? 'active' : ''}`}
            onClick={() =>
              k !== v.kind && learn([v.id], v, { type: k }, applyAll, `Marked as ${KIND_META[k].label.toLowerCase()}`)
            }
          >
            {KIND_META[k].emoji} {KIND_META[k].label}
          </button>
        ))}
      </div>

      <div className="action-list">
        <button className="action" onClick={() => setPicking(!picking)}>
          <span>🏷️ Change category</span>
          <Icon name="right" size={16} />
        </button>
        {picking && (
          <CategoryPicker
            value={v.cat}
            onPick={(c) => {
              learn([v.id], v, { category: c }, applyAll, `Category set to ${catMeta(cats, c).label}`);
              setPicking(false);
            }}
          />
        )}
        {needle && !v.ruleId && (
          <label className="check">
            <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
            Remember for “{needle}”{samePayee > 0 ? ` (and apply to ${samePayee} other payment${samePayee === 1 ? '' : 's'})` : ''}
          </label>
        )}

        <button
          className="action"
          onClick={() => {
            setName(v.name);
            setRenaming(!renaming);
          }}
        >
          <span>✏️ Rename merchant</span>
          <Icon name="right" size={16} />
        </button>
        {renaming && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim().slice(0, 60);
              decide([v.id], (p) => mergeUser(p, { merchant: n || undefined }), n ? `Renamed to ${n}` : 'Name reset');
              setRenaming(false);
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Merchant name" autoFocus maxLength={60} />
            <button className="btn-small" type="submit">
              Save
            </button>
          </form>
        )}

        {needle && !v.ruleId && v.kind === 'expense' && (
          <button
            className="action"
            onClick={() => {
              // normalised name catches every spelling ("SWIGGY*ONLINE", "Swiggy Instamart"…)
              saveRule({ id: newRuleId(), match: needle, category: v.cat, rename: v.user?.merchant });
            }}
          >
            <span>📌 Always use {meta.label} for “{v.name}”</span>
            <Icon name="plus" size={16} />
          </button>
        )}

        {v.flags.some((f) => f.kind === 'duplicate') || v.dupOf ? (
          <button
            className="action"
            onClick={() => decide([v.id], (p) => mergeUser(dismissFlag(p, 'duplicate'), { notDuplicate: true }), 'Counted as a separate payment')}
          >
            <span>➕ Not a duplicate: count it</span>
          </button>
        ) : null}

        <div className="action">
          <span>🚫 Exclude from totals</span>
          <Toggle
            on={v.excluded}
            label="Exclude from totals"
            onChange={(on) => decide([v.id], (p) => mergeUser(p, { excluded: on }), on ? 'Excluded from totals' : 'Included again')}
          />
        </div>

        {hasEdits && (
          <button
            className="action subtle"
            onClick={() => {
              decide([v.id], () => undefined, 'Reset to automatic detection');
              onClose();
            }}
          >
            <span>
              <Icon name="undo" size={15} /> Reset all my changes
            </span>
          </button>
        )}
      </div>
      <p className="muted tiny center">Only these extracted details are stored. The SMS text itself is never saved.</p>
    </div>
  );
}

export const FLAG_TEXT: Record<string, string> = {
  duplicate: 'Possible duplicate alert',
  transfer: 'Possible transfer between your accounts',
  refund: 'Possible refund',
  uncategorised: 'Unknown merchant: pick a category',
  unknown_type: 'Not sure if money went out or came in',
  low_confidence: 'Unusual wording, please double-check',
  card_payment: 'Card bill payment not counted as spending',
  maybe_card_payment: 'Might be a credit-card bill payment',
};
