import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { animate } from 'motion';
import {
  CATEGORIES,
  CATEGORY_META,
  inr,
  parseSms,
  rangeFor,
  type Category,
  type FilterMode,
  type RawSms,
  type Txn,
} from './lib/parser';

const SMSInboxReader = registerPlugin<any>('SMSInboxReader');

/* ---------- helpers ---------- */

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const ICONS: Record<string, ReactNode> = {
  sync: <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-5M12 8v.5" />
    </>
  ),
};

function Icon({ name, size = 18, className }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      shown.current = value;
      if (ref.current) ref.current.textContent = inr(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shown.current = v;
        if (ref.current) ref.current.textContent = inr(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span ref={ref} className={className}>
      {inr(value)}
    </span>
  );
}

function Donut({ items, total, reduce }: { items: [Category, number][]; total: number; reduce: boolean }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const top = items[0];
  return (
    <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Spending by category">
      <circle cx="70" cy="70" r={R} className="donut-track" />
      <g transform="rotate(-90 70 70)">
        {items.map(([cat, amount]) => {
          const seg = (amount / total) * C;
          const len = Math.max(seg - 3, 0.5);
          const o = offset;
          offset += seg;
          return (
            <motion.circle
              key={cat}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={CATEGORY_META[cat].color}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDashoffset={-o}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${len} ${C - len}` }}
              transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </g>
      {top && (
        <>
          <text x="70" y="68" textAnchor="middle" className="donut-big">
            {Math.round((top[1] / total) * 100)}%
          </text>
          <text x="70" y="86" textAnchor="middle" className="donut-small">
            {CATEGORY_META[top[0]].label}
          </text>
        </>
      )}
    </svg>
  );
}

/* ---------- types ---------- */

interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
  actionLabel?: string;
  onAction?: () => void;
}

interface SyncError {
  kind: 'permission' | 'unavailable' | 'generic';
  message: string;
}

const FILTERS: FilterMode[] = ['weekly', 'monthly', 'yearly', 'custom'];
const FILTER_LABEL: Record<FilterMode, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
};

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0];

/* ---------- app ---------- */

export default function App() {
  const reduce = !!useReducedMotion();

  const [txns, setTxns] = usePersisted<Txn[]>('et:txns', []);
  const [lastSync, setLastSync] = usePersisted<number | null>('et:lastSync', null);
  const [theme, setTheme] = usePersisted<'dark' | 'light'>(
    'et:theme',
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const [maskIncome, setMaskIncome] = usePersisted<boolean>('et:mask', true);
  const [filter, setFilter] = usePersisted<FilterMode>('et:filter', 'monthly');
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SyncError | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAll, setShowAll] = useState(false);
  const toastId = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#07080d' : '#f4f5fb');
  }, [theme]);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const pushToast = useCallback(
    (message: string, type: Toast['type'] = 'info', action?: { label: string; run: () => void }) => {
      const id = ++toastId.current;
      setToasts((t) => [
        ...t.slice(-2),
        { id, message, type, actionLabel: action?.label, onAction: action?.run },
      ]);
      window.setTimeout(() => dismissToast(id), action ? 6500 : 4200);
    },
    [dismissToast],
  );

  /* ----- derived data ----- */

  const range = useMemo(
    () => rangeFor(filter, startDate, endDate),
    // txns included so weekly/monthly windows refresh after each sync
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, startDate, endDate, txns],
  );
  const customInvalid = filter === 'custom' && !range;

  const { expense, income, ranked, list } = useMemo(() => {
    const inRange = range ? txns.filter((t) => t.date >= range[0] && t.date <= range[1]) : [];
    const cats = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    let expense = 0;
    let income = 0;
    for (const t of inRange) {
      if (t.type === 'debit') {
        expense += t.amount;
        cats[t.category] += t.amount;
      } else income += t.amount;
    }
    const ranked = CATEGORIES.map((c) => [c, cats[c]] as [Category, number])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const list = [...inRange].sort((a, b) => b.date - a.date);
    return { expense, income, ranked, list };
  }, [txns, range]);

  const rangeLabel = useMemo(() => {
    if (filter === 'weekly') return 'Last 7 days';
    if (filter === 'monthly') return 'Last 30 days';
    if (filter === 'yearly') return String(new Date().getFullYear());
    const fmt = (s: string) =>
      new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `${fmt(startDate)} – ${fmt(endDate)}`;
  }, [filter, startDate, endDate]);

  /* ----- actions ----- */

  const syncSms = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      if (!Capacitor.isNativePlatform()) {
        setError({
          kind: 'unavailable',
          message: 'SMS access only works in the Android app. Open the installed app on your phone to sync.',
        });
        return;
      }

      if (typeof SMSInboxReader.requestPermissions === 'function') {
        const perm = await SMSInboxReader.requestPermissions();
        const values = Object.values(perm ?? {});
        if (values.some((v) => v === 'denied')) {
          setError({
            kind: 'permission',
            message: 'SMS permission was denied. Enable it in Settings › Apps › Expense Tracker › Permissions, then try again.',
          });
          return;
        }
      }

      const result = await SMSInboxReader.getSMSList({});
      const messages: RawSms[] = result?.smsList ?? result?.messages ?? [];
      if (messages.length === 0) {
        pushToast('No SMS messages found in your inbox.', 'info');
        return;
      }

      const parsed = parseSms(messages);
      const known = new Set(txns.map((t) => t.id));
      const fresh = parsed.filter((t) => !known.has(t.id));
      setTxns((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        parsed.forEach((t) => map.set(t.id, t));
        return [...map.values()].sort((a, b) => b.date - a.date);
      });
      setLastSync(Date.now());
      pushToast(
        fresh.length ? `${fresh.length} new transaction${fresh.length > 1 ? 's' : ''} found` : 'Already up to date',
        'success',
      );
    } catch (err: any) {
      const msg: string = err?.message || 'Could not read your SMS inbox.';
      setError({
        kind: /permission|denied/i.test(msg) ? 'permission' : 'generic',
        message: /permission|denied/i.test(msg)
          ? 'SMS permission is required. Enable it in your phone settings and try again.'
          : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const clearData = () => {
    const backup = txns;
    const backupSync = lastSync;
    setTxns([]);
    setLastSync(null);
    setShowAll(false);
    pushToast('All data cleared', 'info', {
      label: 'Undo',
      run: () => {
        setTxns(backup);
        setLastSync(backupSync);
      },
    });
  };

  /* ----- render ----- */

  const hasData = txns.length > 0;
  const topCat = ranked[0];
  const visible = showAll ? list : list.slice(0, 8);

  return (
    <div className="app">
      {/* toasts */}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`toast ${t.type}`}
              role={t.type === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: -18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <Icon name={t.type === 'error' ? 'alert' : t.type === 'success' ? 'check' : 'info'} size={16} />
              <span className="toast-msg">{t.message}</span>
              {t.actionLabel && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.onAction?.();
                    dismissToast(t.id);
                  }}
                >
                  {t.actionLabel}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* header */}
      <header className="header">
        <div>
          <h1>Expenses</h1>
          <p className="muted small">
            {lastSync
              ? `Synced ${new Date(lastSync).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
              : 'Private · on-device only'}
          </p>
        </div>
        <div className="header-actions">
          <AnimatePresence>
            {hasData && (
              <motion.button
                key="clear"
                className="icon-btn danger"
                onClick={clearData}
                aria-label="Clear all data"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                whileTap={{ scale: 0.9 }}
              >
                <Icon name="trash" />
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            whileTap={{ scale: 0.9, rotate: 20 }}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </motion.button>
        </div>
      </header>

      {/* sync */}
      <motion.button className="btn-primary" onClick={syncSms} disabled={loading} whileTap={{ scale: 0.97 }}>
        <Icon name="sync" className={loading ? 'spin' : ''} />
        {loading ? 'Reading your SMS…' : hasData ? 'Sync new messages' : 'Sync banking SMS'}
      </motion.button>

      {/* error */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="alert"
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="alert-inner">
              <Icon name="alert" size={20} />
              <div>
                <strong>
                  {error.kind === 'permission'
                    ? 'Permission needed'
                    : error.kind === 'unavailable'
                      ? 'Not available here'
                      : 'Something went wrong'}
                </strong>
                <p>{error.message}</p>
                {error.kind !== 'unavailable' && (
                  <button className="link" onClick={syncSms}>
                    Try again
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* filter */}
      <LayoutGroup>
        <div className="seg" role="tablist" aria-label="Time range">
          {FILTERS.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={filter === m}
              className={filter === m ? 'active' : ''}
              onClick={() => setFilter(m)}
            >
              {filter === m && (
                <motion.span
                  layoutId="seg-pill"
                  className="seg-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <span className="seg-label">{FILTER_LABEL[m]}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      <AnimatePresence initial={false}>
        {filter === 'custom' && (
          <motion.div
            className="range card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="range-inner">
              <label>
                <span>From</span>
                <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            {customInvalid && <p className="field-error">Start date must be on or before the end date.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* loading skeleton (first sync) */}
      {loading && !hasData ? (
        <div className="skeletons" aria-hidden="true">
          <div className="skeleton" style={{ height: 150 }} />
          <div className="skeleton" style={{ height: 200 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      ) : !hasData ? (
        <motion.div className="card empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="empty-emoji">📭</div>
          <h2>No transactions yet</h2>
          <p className="muted">
            Tap “Sync banking SMS” and I’ll turn your bank alerts into a clean spending summary. Nothing ever leaves
            your phone.
          </p>
        </motion.div>
      ) : (
        <>
          {/* hero */}
          <motion.section className="card hero" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <div className="row-between">
              <span className="label">{FILTER_LABEL[filter]} spend</span>
              <span className="chip">{rangeLabel}</span>
            </div>
            <AnimatedNumber value={expense} className="hero-amount" />
            <div className="hero-sub">
              <div>
                <span className="label">Income</span>
                <div className="income-line">
                  <strong className="pos">{maskIncome ? '••••••' : inr(income)}</strong>
                  <button
                    className="icon-btn small"
                    onClick={() => setMaskIncome(!maskIncome)}
                    aria-label={maskIncome ? 'Show income' : 'Hide income'}
                  >
                    <Icon name={maskIncome ? 'eyeOff' : 'eye'} size={15} />
                  </button>
                </div>
              </div>
              <div className="right">
                <span className="label">Transactions</span>
                <strong>{list.length}</strong>
              </div>
            </div>
          </motion.section>

          {/* breakdown */}
          <motion.section
            className="card"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
          >
            <h2 className="section-title">Where it went</h2>
            {ranked.length === 0 ? (
              <p className="muted center pad">
                {customInvalid ? 'Fix the date range to see results.' : 'No expenses in this period.'}
              </p>
            ) : (
              <>
                <Donut key={`${filter}-${expense}`} items={ranked} total={expense} reduce={reduce} />
                <ul className="cats">
                  {ranked.map(([cat, amount], i) => {
                    const pct = (amount / expense) * 100;
                    const meta = CATEGORY_META[cat];
                    return (
                      <motion.li
                        key={cat}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: reduce ? 0 : i * 0.04 }}
                      >
                        <div className="row-between">
                          <span>
                            {meta.emoji} {meta.label}
                          </span>
                          <span className="cat-amt">
                            {inr(amount)} <em>{pct.toFixed(0)}%</em>
                          </span>
                        </div>
                        <div className="bar">
                          <motion.div
                            className="bar-fill"
                            style={{ background: meta.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
                {topCat && (
                  <div className="insight">
                    <strong>💡 Insight</strong>
                    <p>
                      Most of your money went to <b>{CATEGORY_META[topCat[0]].label}</b> ({inr(topCat[1])}).{' '}
                      {income > 0 &&
                        (expense > income
                          ? '⚠️ You spent more than you received in this period.'
                          : '✅ Your cash flow is positive in this period.')}
                    </p>
                  </div>
                )}
              </>
            )}
          </motion.section>

          {/* recent */}
          {list.length > 0 && (
            <motion.section
              className="card"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <h2 className="section-title">Recent activity</h2>
              <ul className="txns">
                <AnimatePresence initial={false}>
                  {visible.map((t) => {
                    const meta = CATEGORY_META[t.category];
                    return (
                      <motion.li
                        key={t.id}
                        layout
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <span className="txn-icon" style={{ background: `${meta.color}22` }}>
                          {t.type === 'credit' ? '⬇️' : meta.emoji}
                        </span>
                        <span className="txn-meta">
                          <strong>{t.type === 'credit' ? 'Money received' : meta.label}</strong>
                          <small className="muted">
                            {t.sender} · {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </small>
                        </span>
                        <span className={`txn-amt ${t.type === 'credit' ? 'pos' : ''}`}>
                          {t.type === 'credit' ? (maskIncome ? '+ ••••' : `+${inr(t.amount, true)}`) : `−${inr(t.amount, true)}`}
                        </span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
              {list.length > 8 && (
                <button className="link center-btn" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show less' : `Show all ${list.length}`}
                </button>
              )}
            </motion.section>
          )}
        </>
      )}
    </div>
  );
}
