import { useMemo, useRef, useState } from 'react';
import { CUSTOM_COLORS, catMeta, newCategoryId } from '../lib/categories';
import { parseBackup, type BackupFile } from '../lib/exporter';
import { inr } from '../lib/parser';
import { newRuleId } from '../lib/learning';
import type { Budgets, CategoryDef, MerchantRule, TxnType } from '../lib/types';
import { useApp } from './context';
import { CategoryPicker, KIND_META } from './txn';
import { Icon, Sheet, Toggle } from './ui';

export type MoreSheet = null | 'budgets' | 'categories' | 'rules';

/* ---------- budgets ---------- */

function BudgetEditor({ onDone }: { onDone: () => void }) {
  const { budgets, setBudgets, catList } = useApp();
  const [draft, setDraft] = useState<Budgets>(budgets);
  const set = (cat: string, v: string) => {
    const categories = { ...draft.categories };
    const n = Number(v);
    if (v === '' || !Number.isFinite(n) || n <= 0) delete categories[cat];
    else categories[cat] = n;
    setDraft({ ...draft, categories });
  };
  return (
    <>
      <p className="muted small">Monthly limits. They reset on the 1st and are only stored on this device.</p>
      <label className="field">
        <span className="label">Total monthly budget ₹</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="e.g. 50000"
          value={draft.total ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            setDraft({ ...draft, total: e.target.value === '' || !(n > 0) ? undefined : n });
          }}
        />
      </label>
      <p className="label">By category</p>
      <ul className="budget-edit">
        {catList
          .filter((c) => c.id !== 'Income')
          .map((c) => (
            <li key={c.id}>
              <span>
                {c.emoji} {c.label}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="—"
                aria-label={`${c.label} budget`}
                value={draft.categories[c.id] ?? ''}
                onChange={(e) => set(c.id, e.target.value)}
              />
            </li>
          ))}
      </ul>
      <div className="sheet-actions">
        <button
          className="btn-small ghost"
          onClick={() => {
            setBudgets({ categories: {} });
            onDone();
          }}
        >
          Remove all
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            setBudgets(draft);
            onDone();
          }}
        >
          Save budgets
        </button>
      </div>
    </>
  );
}

/* ---------- categories ---------- */

function CategoryEditor() {
  const { catList, saveCategory, deleteCategory } = useApp();
  const [edit, setEdit] = useState<CategoryDef | null>(null);
  const custom = catList.filter((c) => c.custom);
  const blank = (): CategoryDef => ({ id: '', label: '', emoji: '🏷️', color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length], custom: true });

  if (edit) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const label = edit.label.trim();
          if (!label) return;
          saveCategory({ ...edit, label, id: edit.id || newCategoryId(label) });
          setEdit(null);
        }}
      >
        <div className="field-row">
          <label className="field emoji-field">
            <span className="label">Emoji</span>
            <input value={edit.emoji} maxLength={4} onChange={(e) => setEdit({ ...edit, emoji: e.target.value || '🏷️' })} />
          </label>
          <label className="field">
            <span className="label">Name</span>
            <input value={edit.label} maxLength={30} autoFocus placeholder="e.g. Pets" onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
          </label>
        </div>
        <p className="label">Colour</p>
        <div className="swatches">
          {CUSTOM_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch ${edit.color === c ? 'active' : ''}`}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              onClick={() => setEdit({ ...edit, color: c })}
            />
          ))}
        </div>
        <p className="label">Kind of spending</p>
        <div className="chip-row">
          {([undefined, 'committed', 'discretionary'] as const).map((n) => (
            <button type="button" key={n ?? 'none'} className={`pill ${edit.nature === n ? 'active' : ''}`} onClick={() => setEdit({ ...edit, nature: n })}>
              {n === 'committed' ? 'Committed' : n === 'discretionary' ? 'Discretionary' : 'Not sure'}
            </button>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn-small ghost" onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!edit.label.trim()}>
            Save category
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <p className="muted small">Built-in categories can't be removed. Deleting a custom category moves its transactions to Other.</p>
      <div className="cat-grid static">
        {catList
          .filter((c) => !c.custom)
          .map((c) => (
            <span key={c.id} className="cat-chip">
              <span>{c.emoji}</span>
              {c.label}
            </span>
          ))}
      </div>
      <p className="label">Your categories</p>
      {custom.length === 0 && <p className="muted small">None yet.</p>}
      <ul className="rule-list">
        {custom.map((c) => (
          <li key={c.id}>
            <span className="swatch" style={{ background: c.color }} />
            <span className="grow">
              {c.emoji} {c.label}
            </span>
            <button className="icon-btn small" onClick={() => setEdit(c)} aria-label={`Edit ${c.label}`}>
              <Icon name="edit" size={14} />
            </button>
            <button className="icon-btn small danger" onClick={() => deleteCategory(c.id)} aria-label={`Delete ${c.label}`}>
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-primary" onClick={() => setEdit(blank())}>
        <Icon name="plus" /> New category
      </button>
    </>
  );
}

/* ---------- merchant rules ---------- */

const RULE_TYPES: Array<[TxnType | undefined, string]> = [
  [undefined, '🏷️ Just categorise'],
  ['transfer', '↔️ Transfer'],
  ['refund', '↩️ Refund'],
  ['income', '⬇️ Income'],
];

function describeRule(r: MerchantRule, cats: ReturnType<typeof useApp>['cats']): string {
  const parts: string[] = [];
  if (r.type) parts.push(KIND_META[r.type].label);
  if (r.category) parts.push(`${catMeta(cats, r.category).emoji} ${catMeta(cats, r.category).label}`);
  return parts.join(' · ');
}

function RuleEditor() {
  const { rules, saveRule, deleteRule, cats, analysis } = useApp();
  const [edit, setEdit] = useState<MerchantRule | null>(null);
  const [showLearned, setShowLearned] = useState(true);
  const hits = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of analysis.all) if (v.ruleId) m.set(v.ruleId, (m.get(v.ruleId) ?? 0) + 1);
    return m;
  }, [analysis]);
  const manual = rules.filter((r) => !r.learned);
  const learned = rules.filter((r) => r.learned);

  if (edit) {
    const valid = !!edit.match.trim() && (!!edit.category || !!edit.type);
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const direction = edit.type === 'refund' || edit.type === 'income' ? 'credit' : edit.type === 'transfer' ? edit.direction : undefined;
          // editing a learned rule makes it yours
          saveRule({ ...edit, match: edit.match.trim(), rename: edit.rename?.trim() || undefined, direction, learned: undefined, id: edit.id || newRuleId() });
          setEdit(null);
        }}
      >
        <label className="field">
          <span className="label">If merchant / payee contains</span>
          <input value={edit.match} autoFocus maxLength={60} placeholder="e.g. ABC STORES" onChange={(e) => setEdit({ ...edit, match: e.target.value })} />
        </label>
        <p className="label">Treat as</p>
        <div className="chip-row wrap">
          {RULE_TYPES.map(([t, label]) => (
            <button type="button" key={label} className={`pill ${edit.type === t ? 'active' : ''}`} onClick={() => setEdit({ ...edit, type: t, category: t && t !== 'refund' ? undefined : edit.category })}>
              {label}
            </button>
          ))}
        </div>
        {(!edit.type || edit.type === 'refund') && (
          <>
            <p className="label">Category{edit.type ? ' (optional)' : ''}</p>
            <CategoryPicker value={edit.category} onPick={(category) => setEdit({ ...edit, category: edit.category === category && edit.type ? undefined : category })} />
          </>
        )}
        <label className="field">
          <span className="label">Show it as (optional)</span>
          <input value={edit.rename ?? ''} maxLength={60} placeholder="e.g. ABC Stores" onChange={(e) => setEdit({ ...edit, rename: e.target.value })} />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn-small ghost" onClick={() => setEdit(null)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            Save rule
          </button>
        </div>
      </form>
    );
  }

  const row = (r: MerchantRule) => (
    <li key={r.id}>
      <span className="grow">
        <strong>“{r.match}”</strong> → {describeRule(r, cats)}
        {r.rename && <small className="muted"> as {r.rename}</small>}
        <small className="muted block">
          {r.learned ? 'Learned · ' : ''}
          {hits.get(r.id) ?? 0} transaction(s)
        </small>
      </span>
      <button className="icon-btn small" onClick={() => setEdit(r)} aria-label="Edit rule">
        <Icon name="edit" size={14} />
      </button>
      <button className="icon-btn small danger" onClick={() => deleteRule(r.id)} aria-label="Delete rule">
        <Icon name="trash" size={14} />
      </button>
    </li>
  );

  return (
    <>
      <p className="muted small">
        Rules beat automatic detection and apply to past and future transactions (whole-word, case-insensitive). A choice you make on a single
        transaction still wins. Rules are stored only on this device.
      </p>
      <p className="label">Your rules</p>
      {manual.length === 0 && <p className="muted small">None yet. Create one below or from any transaction.</p>}
      <ul className="rule-list">{manual.map(row)}</ul>
      {learned.length > 0 && (
        <>
          <button className="dupe-head" onClick={() => setShowLearned(!showLearned)} aria-expanded={showLearned}>
            <span className="label">Learned from your corrections · {learned.length}</span>
            <span className="link">{showLearned ? 'Hide' : 'Show'}</span>
          </button>
          {showLearned && <ul className="rule-list">{learned.map(row)}</ul>}
        </>
      )}
      <button className="btn-primary" onClick={() => setEdit({ id: '', match: '', category: 'Groceries' })}>
        <Icon name="plus" /> New rule
      </button>
    </>
  );
}

/* ---------- screen ---------- */

export interface MoreProps {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  setMaskIncome: (v: boolean) => void;
  stats: { txns: number; storedMessageText: number; bytes: number; lastSync: number | null; networkBlocked: boolean };
  sheet: MoreSheet;
  setSheet: (s: MoreSheet) => void;
  onExportCSV: (scope: 'period' | 'all') => void;
  onBackup: () => void;
  onRestore: (b: BackupFile, mode: 'merge' | 'replace') => void;
  onClear: () => void;
}

export function More(p: MoreProps) {
  const { maskIncome, rules, catList, budgets, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; skipped: number } | null>(null);
  const customCount = catList.filter((c) => c.custom).length;
  const budgetCount = Object.keys(budgets.categories).length + (budgets.total ? 1 : 0);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const res = parseBackup(await f.text());
      if (!res.ok) toast(res.error, 'error');
      else setPending({ backup: res.backup, skipped: res.skipped });
    } catch {
      toast('Could not read that file.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <section className="card">
        <h2 className="section-title">Personalise</h2>
        <div className="action-list">
          <button className="action" onClick={() => p.setSheet('budgets')}>
            <span>🎯 Budgets</span>
            <span className="muted small">{budgetCount ? `${budgetCount} set` : 'Not set'}</span>
          </button>
          <button className="action" onClick={() => p.setSheet('rules')}>
            <span>📌 Merchant rules</span>
            <span className="muted small">{rules.length}</span>
          </button>
          <button className="action" onClick={() => p.setSheet('categories')}>
            <span>🏷️ Categories</span>
            <span className="muted small">{customCount ? `${customCount} custom` : 'Built-in'}</span>
          </button>
          <div className="action">
            <span>🌗 Dark theme</span>
            <Toggle on={p.theme === 'dark'} label="Dark theme" onChange={(on) => p.setTheme(on ? 'dark' : 'light')} />
          </div>
          <div className="action">
            <span>🙈 Hide income amounts</span>
            <Toggle on={maskIncome} label="Hide income" onChange={p.setMaskIncome} />
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Your data</h2>
        <div className="action-list">
          <button className="action" onClick={() => p.onExportCSV('period')}>
            <span>
              <Icon name="download" size={16} /> Export selected period (CSV)
            </span>
          </button>
          <button className="action" onClick={() => p.onExportCSV('all')}>
            <span>
              <Icon name="download" size={16} /> Export everything (CSV)
            </span>
          </button>
          <button className="action" onClick={p.onBackup}>
            <span>
              <Icon name="shield" size={16} /> Create backup (JSON)
            </span>
          </button>
          <button className="action" onClick={() => fileRef.current?.click()}>
            <span>
              <Icon name="upload" size={16} /> Restore from backup
            </span>
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <p className="muted tiny">Files are created on your phone and handed to Android's share sheet. You choose where they go.</p>
      </section>

      {/* privacy center */}
      <section className="card privacy">
        <h2 className="section-title">🔐 Privacy center</h2>
        <div className="privacy-grid">
          <div>
            <strong>{p.stats.txns.toLocaleString('en-IN')}</strong>
            <span>Transactions stored</span>
          </div>
          <div>
            <strong className={p.stats.storedMessageText === 0 ? 'pos' : 'neg'}>{p.stats.storedMessageText}</strong>
            <span>SMS messages stored</span>
          </div>
          <div>
            <strong className="pos">0</strong>
            <span>Cloud uploads</span>
          </div>
          <div>
            <strong className="pos">0</strong>
            <span>Accounts connected</span>
          </div>
          <div>
            <strong className="pos">None</strong>
            <span>Analytics / tracking</span>
          </div>
          <div>
            <strong className={p.stats.networkBlocked ? 'pos' : 'muted'}>{p.stats.networkBlocked ? 'Blocked' : 'Not enforced'}</strong>
            <span>Outside connections</span>
          </div>
          <div>
            <strong>{(p.stats.bytes / 1024).toFixed(0)} KB</strong>
            <span>On this device</span>
          </div>
        </div>
        <ul className="privacy-points">
          <li>✓ Your banking SMS is processed locally on your device.</li>
          <li>✓ Raw SMS content is not stored: only amount, date, merchant, category, sender ID, masked account and reference.</li>
          <li>✓ No banking credentials are collected. There is no login.</li>
          <li>
            ✓ No transaction data is sent to a server. The app has no backend or analytics code
            {p.stats.networkBlocked ? ', and its content security policy blocks connections to any other site.' : '.'}
          </li>
        </ul>
        <p className="muted tiny">
          “SMS messages stored” and “Outside connections” are checked live on this device. Backups and CSV files you export leave the app only where
          you send them.
          {!p.stats.networkBlocked && ' (The connection-blocking policy is only added to production builds.)'}
        </p>
        <button className="btn-small danger-btn" onClick={p.onClear}>
          <Icon name="trash" size={14} /> Clear all data
        </button>
      </section>

      <p className="muted tiny center">
        Expense Tracker Lite · offline &amp; open source
        {p.stats.lastSync ? ` · last sync ${new Date(p.stats.lastSync).toLocaleDateString('en-IN')}` : ''}
      </p>

      <Sheet open={p.sheet === 'budgets'} onClose={() => p.setSheet(null)} title="Monthly budgets">
        <BudgetEditor onDone={() => p.setSheet(null)} />
      </Sheet>
      <Sheet open={p.sheet === 'categories'} onClose={() => p.setSheet(null)} title="Categories">
        <CategoryEditor />
      </Sheet>
      <Sheet open={p.sheet === 'rules'} onClose={() => p.setSheet(null)} title="Merchant rules">
        <RuleEditor />
      </Sheet>
      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restore backup">
        {pending && (
          <>
            <dl className="facts">
              <div>
                <dt>Created</dt>
                <dd>{pending.backup.exportedAt ? new Date(pending.backup.exportedAt).toLocaleString('en-IN') : 'Unknown'}</dd>
              </div>
              <div>
                <dt>Transactions</dt>
                <dd>{pending.backup.data.transactions.length.toLocaleString('en-IN')}</dd>
              </div>
              <div>
                <dt>Rules · categories</dt>
                <dd>
                  {pending.backup.data.rules.length} · {pending.backup.data.categories.length}
                </dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd>{pending.backup.data.budgets.total ? inr(pending.backup.data.budgets.total) : '—'}</dd>
              </div>
              {pending.skipped > 0 && (
                <div>
                  <dt>Skipped</dt>
                  <dd className="neg">{pending.skipped} invalid row(s)</dd>
                </div>
              )}
            </dl>
            <p className="muted small">
              <b>Merge</b> keeps everything you have and adds what's new. <b>Replace</b> swaps all current data for the backup (you can undo right after).
            </p>
            <div className="sheet-actions">
              <button
                className="btn-small ghost"
                onClick={() => {
                  p.onRestore(pending.backup, 'replace');
                  setPending(null);
                }}
              >
                Replace
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  p.onRestore(pending.backup, 'merge');
                  setPending(null);
                }}
              >
                Merge
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
