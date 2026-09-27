import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { DEFAULT_SORT, type SortKey } from './lib/activity';
import { analyze } from './lib/analyze';
import { BUILTIN_CATEGORIES, buildCategoryMap, catMeta } from './lib/categories';
import { migrateFilter, periodHint, periodRange, previousPeriod, type Period, type Range } from './lib/dates';
import { buildBackup, mergeBackup, saveFile, stamp, toCSV, type BackupData, type BackupFile } from './lib/exporter';
import { inRange, summarize } from './lib/insights';
import { learnedRule, ruleMatches, summarizeSync, upsertRule, type SyncSummary } from './lib/learning';
import { PARSER_VERSION, parseSms } from './lib/parser';
import {
  KEYS,
  countStoredMessageText,
  loadTxns,
  readJSON,
  sanitizeBudgets,
  sanitizeCategories,
  sanitizeRules,
  saveTxns,
  storageBytes,
  writeJSON,
} from './lib/storage';
import type { Budgets, CategoryDef, MerchantRule, RawSms, Txn, TxnOverrides, TxnType, TxnView } from './lib/types';
import { Activity } from './components/Activity';
import { Ctx, EMPTY_FILTER, dismissFlag, mergeUser, type ActivityFilter, type AppCtx, type Decision, type OverridePatch, type Tab, type ToastAction } from './components/context';
import { Home, type PeriodData } from './components/Home';
import { Insights } from './components/Insights';
import { More, type MoreSheet } from './components/More';
import { PeriodBar } from './components/PeriodBar';
import { Review } from './components/Review';
import { KIND_META, TxnDetail } from './components/txn';
import { BottomNav, TABS } from './components/BottomNav';
import { closeTopOverlay } from './components/nav';
import { Empty, Icon, Sheet } from './components/ui';

interface SmsReader {
  checkPermissions?: () => Promise<Record<string, string>>;
  requestPermissions?: () => Promise<Record<string, string>>;
  getSMSList: (opts: object) => Promise<{ smsList?: RawSms[]; messages?: RawSms[] }>;
}
const SMSInboxReader = registerPlugin<SmsReader>('SMSInboxReader');

/* ---------- persistence ---------- */

function usePersisted<T>(key: string, load: (stored: unknown) => T) {
  const [value, setValue] = useState<T>(() => load(readJSON(key)));
  useEffect(() => {
    writeJSON(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

function initialPeriod(stored: unknown): Period {
  if (stored && typeof stored === 'object' && 'mode' in stored) {
    const p = stored as Period;
    // navigation offset is not restored: reopening the app shows the current period
    return { mode: migrateFilter(p.mode), offset: 0, start: p.start, end: p.end };
  }
  return { mode: migrateFilter(readJSON(KEYS.legacyFilter)), offset: 0 };
}

/** "Synced 5:01 pm" today, "Synced 26 Sept" otherwise. */
function syncedLabel(at: number | null): string {
  if (!at) return 'Private · on-device only';
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return `Synced ${today ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

const cspBlocksNetwork = () =>
  !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes("default-src 'self'");

interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
  action?: ToastAction;
}

interface SyncError {
  kind: 'permission' | 'unavailable' | 'generic';
  message: string;
}



/* ---------- app ---------- */

export default function App() {
  const reduce = !!useReducedMotion();

  const [txns, setTxnsState] = useState<Txn[]>(loadTxns);
  const setTxns = useCallback((next: Txn[] | ((prev: Txn[]) => Txn[])) => setTxnsState(next), []);
  useEffect(() => {
    saveTxns(txns);
  }, [txns]);

  const [lastSync, setLastSync] = usePersisted<number | null>(KEYS.lastSync, (v) => (typeof v === 'number' ? v : null));
  const [theme, setTheme] = usePersisted<'dark' | 'light'>(KEYS.theme, (v) =>
    v === 'dark' || v === 'light' ? v : window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const [maskIncome, setMaskIncome] = usePersisted<boolean>(KEYS.mask, (v) => (typeof v === 'boolean' ? v : true));
  const [period, setPeriod] = usePersisted<Period>(KEYS.period, initialPeriod);
  const [rules, setRules] = usePersisted<MerchantRule[]>(KEYS.rules, sanitizeRules);
  const [customCats, setCustomCats] = usePersisted<CategoryDef[]>(KEYS.categories, sanitizeCategories);
  const [budgets, setBudgets] = usePersisted<Budgets>(KEYS.budgets, sanitizeBudgets);
  const [dismissedRecurring, setDismissedRecurring] = usePersisted<string[]>(KEYS.dismissedRecurring, (v) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [],
  );

  const [tab, setTab] = useState<Tab>('home');
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [moreSheet, setMoreSheet] = useState<MoreSheet>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SyncError | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [decisions, setDecisions] = useState<Array<Decision & { prev: Map<string, TxnOverrides | undefined>; prevRules?: MerchantRule[] }>>([]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [rulesVersion, setRulesVersion] = usePersisted<number>(KEYS.parserVersion, (v) => (typeof v === 'number' ? v : 1));
  const toastId = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#07080d' : '#f4f5fb');
  }, [theme]);



  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, type: Toast['type'] = 'info', action?: ToastAction) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-2), { id, message, type, action }]);
      window.setTimeout(() => dismissToast(id), action ? 6500 : 4200);
    },
    [dismissToast],
  );

  /* ----- derived data (memoised: only recomputed when inputs change) ----- */

  const cats = useMemo(() => buildCategoryMap(customCats), [customCats]);
  const catList = useMemo(() => [...BUILTIN_CATEGORIES, ...customCats.map((c) => ({ ...c, custom: true }))], [customCats]);
  // lastSync is a dependency so "now"-relative detection refreshes after each sync
  const analysis = useMemo(
    () => analyze(txns, rules, cats, dismissedRecurring),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txns, rules, cats, dismissedRecurring, lastSync],
  );

  const range = useMemo(() => periodRange(period), [period, lastSync]); // eslint-disable-line react-hooks/exhaustive-deps
  const periodData = useMemo<PeriodData>(() => {
    const list = range ? inRange(analysis.all, range) : [];
    const summary = summarize(list, cats);
    const prevP = previousPeriod(period);
    const prevRange = prevP ? periodRange(prevP) : null;
    let compare: PeriodData['compare'];
    let previous: PeriodData['previous'];
    if (range && prevRange) {
      previous = summarize(inRange(analysis.all, prevRange), cats);
      const now = Date.now();
      if (range.end > now && range.start <= now && period.mode !== 'day') {
        // current period still running: compare against the same number of days
        const sameDays: Range = { start: prevRange.start, end: prevRange.start + (now - range.start) };
        compare = { label: `same point ${periodHint(prevP!).toLowerCase()}`, spent: summarize(inRange(analysis.all, sameDays), cats).spent };
      } else {
        compare = { label: periodHint(prevP!).toLowerCase(), spent: previous.spent };
      }
    }
    return { valid: !!range, list, summary, compare, previous };
  }, [analysis, range, period, cats]);

  /* ----- decisions with undo ----- */

  const applyUser = useCallback(
    (changes: Map<string, TxnOverrides | undefined>) =>
      setTxns((prev) => prev.map((t) => (changes.has(t.id) ? { ...t, user: changes.get(t.id) } : t))),
    [setTxns],
  );

  const undo = useCallback(
    (decisionId: number) => {
      const d = decisions.find((x) => x.id === decisionId);
      if (!d) return;
      applyUser(d.prev);
      if (d.prevRules) setRules(d.prevRules);
      setDecisions((list) => list.filter((x) => x.id !== decisionId));
      toast('Undone', 'info');
    },
    [decisions, applyUser, toast, setRules],
  );

  const decide = useCallback(
    (ids: string[], patch: OverridePatch, label: string, nextRules?: MerchantRule[]) => {
      const prev = new Map<string, TxnOverrides | undefined>();
      const next = new Map<string, TxnOverrides | undefined>();
      for (const t of txns) {
        if (!ids.includes(t.id)) continue;
        prev.set(t.id, t.user);
        next.set(t.id, patch(t.user));
      }
      if (!prev.size) return;
      applyUser(next);
      const prevRules = nextRules ? rules : undefined;
      if (nextRules) setRules(nextRules);
      const id = ++toastId.current;
      setDecisions((list) => [{ id, label, txnIds: ids, prev, prevRules }, ...list].slice(0, 30));
      const tid = ++toastId.current;
      setToasts((t) => [
        ...t.slice(-2),
        {
          id: tid,
          message: label,
          type: 'success',
          action: {
            label: 'Undo',
            run: () => {
              applyUser(prev);
              if (prevRules) setRules(prevRules);
              setDecisions((list) => list.filter((x) => x.id !== id));
            },
          },
        },
      ]);
      window.setTimeout(() => dismissToast(tid), 5000);
    },
    [txns, rules, setRules, applyUser, dismissToast],
  );

  /**
   * A correction that also teaches a local rule, so every other payment to the
   * same payee (past and future) is handled the same way.
   */
  const learn = useCallback(
    (ids: string[], sample: TxnView, change: { category?: string; type?: TxnType }, applyToAll: boolean, label: string) => {
      const rule = applyToAll ? learnedRule(sample, change) : undefined;
      const nextRules = rule ? upsertRule(rules, rule) : undefined;
      // payments the rule will actually change: not already chosen by hand
      const byHand = new Set(txns.filter((t) => (change.category ? t.user?.category : t.user?.type)).map((t) => t.id));
      const others = rule ? ruleMatches(rule, txns).filter((id) => !ids.includes(id) && !byHand.has(id)).length : 0;
      const patch: OverridePatch = (p) =>
        mergeUser(change.type === 'transfer' || change.type === 'refund' ? dismissFlag(p, change.type) : p, {
          ...(change.category ? { category: change.category } : {}),
          ...(change.type ? { type: change.type } : {}),
          reviewed: true,
        });
      decide(ids, patch, others > 0 ? `${label} · also ${others} more from ${rule!.match}` : label, nextRules);
    },
    [rules, txns, decide],
  );

  const saveRule = useCallback(
    (rule: MerchantRule) => {
      setRules((list) => {
        const i = list.findIndex((r) => r.id === rule.id);
        return i >= 0 ? list.map((r) => (r.id === rule.id ? rule : r)) : [...list, rule];
      });
      const what = rule.category ? catMeta(cats, rule.category).label : rule.type ? KIND_META[rule.type].label : '';
      toast(`Rule saved: “${rule.match}” → ${what}`, 'success');
    },
    [setRules, toast, cats],
  );

  const deleteRule = useCallback(
    (id: string) => {
      const backup = rules;
      setRules((list) => list.filter((r) => r.id !== id));
      toast('Rule deleted', 'info', { label: 'Undo', run: () => setRules(backup) });
    },
    [rules, setRules, toast],
  );

  const saveCategory = useCallback(
    (c: CategoryDef) =>
      setCustomCats((list) => {
        const i = list.findIndex((x) => x.id === c.id);
        return i >= 0 ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c];
      }),
    [setCustomCats],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      const backup = customCats;
      setCustomCats((list) => list.filter((c) => c.id !== id));
      toast('Category deleted. Its transactions now show as Other.', 'info', { label: 'Undo', run: () => setCustomCats(backup) });
    },
    [customCats, setCustomCats, toast],
  );

  const dismissRecurring = useCallback(
    (key: string) => {
      setDismissedRecurring((l) => [...new Set([...l, key])]);
      toast('Removed from recurring payments', 'info', {
        label: 'Undo',
        run: () => setDismissedRecurring((l) => l.filter((k) => k !== key)),
      });
    },
    [setDismissedRecurring, toast],
  );

  /* ----- navigation with back history (see components/nav.ts) ----- */

  interface NavEntry {
    tab: Tab;
    filter: ActivityFilter;
    sort: SortKey;
    scrollY: number;
  }
  const history = useRef<NavEntry[]>([]);
  const pendingScroll = useRef<number | null>(null);
  const here = (): NavEntry => ({ tab, filter, sort, scrollY: window.scrollY });

  // after a screen change, scroll to the top, or back to where the user was
  useLayoutEffect(() => {
    window.scrollTo({ top: pendingScroll.current ?? 0 });
    pendingScroll.current = null;
  }, [tab]);

  /** In-app navigation (e.g. Home → Activity filtered to Shopping). Back returns here. */
  const go = useCallback(
    (t: Tab, f?: Partial<ActivityFilter>) => {
      history.current.push(here());
      if (history.current.length > 30) history.current.shift();
      if (f) setFilter({ ...EMPTY_FILTER, ...f });
      setTab(t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, filter, sort],
  );

  /** Bottom-nav switch: like Android apps, Back from any section returns to Home. */
  const switchTab = useCallback(
    (t: Tab) => {
      if (t === tab) return window.scrollTo({ top: 0, behavior: 'smooth' });
      history.current = t === 'home' ? [] : [{ tab: 'home', filter, sort, scrollY: 0 }];
      setTab(t);
    },
    [tab, filter, sort],
  );

  /** Android Back / Escape. Returns false when there is nothing left to go back to. */
  const back = useCallback((): boolean => {
    if (closeTopOverlay()) return true;
    const prev = history.current.pop();
    if (prev) {
      setFilter(prev.filter);
      setSort(prev.sort);
      pendingScroll.current = prev.scrollY;
      if (prev.tab === tab) window.scrollTo({ top: prev.scrollY });
      setTab(prev.tab);
      return true;
    }
    if (tab !== 'home') {
      setTab('home');
      return true;
    }
    return false;
  }, [tab]);

  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') backRef.current();
    };
    window.addEventListener('keydown', onKey);
    if (!Capacitor.isNativePlatform()) return () => window.removeEventListener('keydown', onKey);
    // Android back button / gesture. Without a listener the Activity would simply close.
    let remove: (() => void) | undefined;
    let cancelled = false;
    void import('@capacitor/app').then(async ({ App: CapApp }) => {
      const handle = await CapApp.addListener('backButton', () => {
        if (!backRef.current()) void CapApp.minimizeApp(); // root Home: behave like any Android app
      });
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      remove?.();
    };
  }, []);

  /* ----- sync ----- */

  /**
   * Reads the inbox and merges new transactions. `auto` is the silent one-time
   * re-check after detection rules improve: it never prompts for permission
   * and never shows errors.
   */
  const syncSms = async ({ auto = false }: { auto?: boolean } = {}) => {
    if (loading) return;
    setLoading(true);
    if (!auto) setError(null);
    try {
      if (auto) {
        if (!Capacitor.isNativePlatform() || typeof SMSInboxReader.checkPermissions !== 'function') return;
        const perm = await SMSInboxReader.checkPermissions();
        if (!Object.values(perm ?? {}).some((v) => v === 'granted')) return;
      } else if (!Capacitor.isNativePlatform()) {
        setError({
          kind: 'unavailable',
          message: 'SMS access only works in the Android app. Open the installed app on your phone to sync.',
        });
        return;
      }

      if (!auto && typeof SMSInboxReader.requestPermissions === 'function') {
        const perm = await SMSInboxReader.requestPermissions();
        if (Object.values(perm ?? {}).some((v) => v === 'denied')) {
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
        toast('No SMS messages found in your inbox.', 'info');
        return;
      }

      // Message text lives only in this function's memory; only parsed fields are kept.
      const parsed = parseSms(messages);
      const merged = new Map(txns.map((t) => [t.id, t]));
      for (const t of parsed) {
        const prev = merged.get(t.id);
        merged.set(t.id, prev?.user ? { ...t, user: prev.user } : t);
      }
      const all = [...merged.values()].sort((a, b) => b.date - a.date);
      const known = new Set(txns.map((t) => t.id));
      const newIds = parsed.filter((t) => !known.has(t.id)).map((t) => t.id);
      const after = analyze(all, rules, cats, dismissedRecurring);
      const summary = summarizeSync(after, newIds);
      // stored transactions (as previously saved) that the current rules now treat as card bill payments
      summary.reclassified = txns.filter((t) => t.type !== 'card_payment' && !t.user?.type && after.byId.get(t.id)?.kind === 'card_payment').length;
      setTxns(all);
      setLastSync(Date.now());
      setSyncSummary(summary);
      setRulesVersion(PARSER_VERSION);
      const fixed = summary.reclassified ? ` · ${summary.reclassified} older card bill payment${summary.reclassified === 1 ? '' : 's'} excluded` : '';
      toast(
        summary.newCount
          ? `Synced ${summary.newCount} new transaction${summary.newCount === 1 ? '' : 's'} · ${summary.attention ? `${summary.attention} need${summary.attention === 1 ? 's' : ''} you` : 'all handled'}${fixed}`
          : auto
            ? `Re-checked your transactions with improved detection${fixed || ' · nothing changed'}`
            : `You are up to date. No new transactions.${fixed}`,
        'success',
      );
    } catch (err: unknown) {
      if (auto) return;
      const msg = (err instanceof Error && err.message) || 'Could not read your SMS inbox.';
      const perm = /permission|denied/i.test(msg);
      setError({ kind: perm ? 'permission' : 'generic', message: perm ? 'SMS permission is required. Enable it in your phone settings and try again.' : msg });
    } finally {
      setLoading(false);
    }
  };

  // One-time re-check when detection rules have improved since the data was synced.
  const rulesOutdated = txns.length > 0 && rulesVersion < PARSER_VERSION;
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!rulesOutdated || autoChecked.current) return;
    autoChecked.current = true;
    void syncSms({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesOutdated]);

  /* ----- data management ----- */

  const snapshot = (): BackupData => ({
    transactions: txns,
    categories: customCats,
    rules,
    budgets,
    dismissedRecurring,
    settings: { theme, maskIncome },
  });

  const restoreSnapshot = (d: BackupData) => {
    setTxns(d.transactions);
    setCustomCats(d.categories);
    setRules(d.rules);
    setBudgets(d.budgets);
    setDismissedRecurring(d.dismissedRecurring);
    if (d.settings.theme) setTheme(d.settings.theme);
    if (d.settings.maskIncome !== undefined) setMaskIncome(d.settings.maskIncome);
  };

  const clearData = () => {
    const backup = snapshot();
    const backupSync = lastSync;
    restoreSnapshot({ transactions: [], categories: [], rules: [], budgets: { categories: {} }, dismissedRecurring: [], settings: {} });
    setLastSync(null);
    setDecisions([]);
    toast('All data cleared', 'info', {
      label: 'Undo',
      run: () => {
        restoreSnapshot(backup);
        setLastSync(backupSync);
      },
    });
  };

  const exportCSV = async (scope: 'period' | 'all') => {
    const list = scope === 'all' ? analysis.all : periodData.list;
    if (!list.length) return toast('Nothing to export in this range.', 'info');
    try {
      const how = await saveFile(`expenses-${scope === 'all' ? 'all' : 'period'}-${stamp()}.csv`, toCSV(list, cats), 'text/csv');
      toast(how === 'shared' ? `CSV ready (${list.length} rows)` : `Downloaded ${list.length} rows`, 'success');
    } catch (e) {
      if (!(e instanceof Error && /cancel/i.test(e.message))) toast('Export failed. Please try again.', 'error');
    }
  };

  const backup = async () => {
    try {
      const file = buildBackup(snapshot());
      await saveFile(`expense-tracker-backup-${stamp()}.json`, JSON.stringify(file), 'application/json');
      toast(`Backup created (${file.data.transactions.length} transactions)`, 'success');
    } catch (e) {
      if (!(e instanceof Error && /cancel/i.test(e.message))) toast('Backup failed. Please try again.', 'error');
    }
  };

  const restore = (file: BackupFile, mode: 'merge' | 'replace') => {
    const before = snapshot();
    const next = mode === 'merge' ? mergeBackup(before, file.data) : file.data;
    restoreSnapshot(next);
    setDecisions([]);
    toast(`${mode === 'merge' ? 'Merged' : 'Restored'} ${file.data.transactions.length} transactions`, 'success', {
      label: 'Undo',
      run: () => restoreSnapshot(before),
    });
  };

  const stats = useMemo(
    () => ({
      txns: txns.length,
      storedMessageText: countStoredMessageText(),
      bytes: storageBytes(),
      lastSync,
      networkBlocked: cspBlocksNetwork(),
    }),
    // re-measured whenever the More tab is opened or data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txns, lastSync, tab],
  );

  /* ----- context ----- */

  const ctx: AppCtx = {
    analysis,
    cats,
    catList,
    rules,
    budgets,
    period,
    setPeriod,
    maskIncome,
    reduce,
    decisions,
    go,
    openTxn: setDetailId,
    toast,
    decide,
    learn,
    undo,
    syncSummary,
    dismissSyncSummary: () => setSyncSummary(null),
    rulesOutdated,
    sync: () => void syncSms(),
    syncing: loading,
    saveRule,
    deleteRule,
    saveCategory,
    deleteCategory,
    setBudgets,
    dismissRecurring,
  };

  /* ----- render ----- */

  const hasData = txns.length > 0;
  const reviewCount = analysis.review.length;
  const showPeriod = hasData && (tab === 'home' || tab === 'activity' || tab === 'insights');

  return (
    <MotionConfig reducedMotion="user">
      <Ctx.Provider value={ctx}>
        <div className="app">
          <div className="toasts" aria-live="polite">
            <AnimatePresence>
              {toasts.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  className={`toast ${t.type}`}
                  role={t.type === 'error' ? 'alert' : 'status'}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Icon name={t.type === 'error' ? 'alert' : t.type === 'success' ? 'check' : 'info'} size={16} />
                  <span className="toast-msg">{t.message}</span>
                  {t.action && (
                    <button
                      className="toast-action"
                      onClick={() => {
                        t.action?.run();
                        dismissToast(t.id);
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <header className="header">
            <div>
              <h1>{tab === 'home' ? 'Expenses' : TABS.find(([t]) => t === tab)?.[1]}</h1>
              <p className="muted">{loading ? 'Reading your SMS…' : syncedLabel(lastSync)}</p>
            </div>
            <div className="header-actions">
              {hasData && (
                <motion.button className="sync-btn" onClick={() => syncSms()} disabled={loading} whileTap={{ scale: 0.96 }} aria-label="Sync new messages">
                  <Icon name="sync" size={15} className={loading ? 'spin' : ''} />
                  Sync
                </motion.button>
              )}
              <motion.button
                className="icon-btn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                whileTap={{ scale: 0.92 }}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
              </motion.button>
            </div>
          </header>

          <AnimatePresence>
            {error && (
              <motion.div className="alert" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="alert-inner">
                  <Icon name="alert" size={20} />
                  <div>
                    <strong>{error.kind === 'permission' ? 'Permission needed' : error.kind === 'unavailable' ? 'Not available here' : 'Something went wrong'}</strong>
                    <p>{error.message}</p>
                    {error.kind !== 'unavailable' && (
                      <button className="link" onClick={() => syncSms()}>
                        Try again
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {showPeriod && <PeriodBar />}

          {loading && !hasData ? (
            <div className="skeletons" aria-hidden="true">
              <div className="skeleton" style={{ height: 150 }} />
              <div className="skeleton" style={{ height: 200 }} />
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          ) : !hasData && tab !== 'more' ? (
            <Empty emoji="📭" title="No transactions yet">
              Sync your banking SMS and I’ll turn your bank alerts into a clean spending summary. Nothing ever leaves your phone.
              <button className="btn-primary" onClick={() => syncSms()} disabled={loading}>
                <Icon name="sync" className={loading ? 'spin' : ''} />
                {loading ? 'Reading your SMS…' : 'Sync banking SMS'}
              </button>
            </Empty>
          ) : (
            <motion.main key={tab} className="tab-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
              {tab === 'home' && <Home data={periodData} />}
              {tab === 'activity' && <Activity base={periodData.list} all={analysis.all} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} />}
              {tab === 'insights' && <Insights data={periodData} all={analysis.all} onEditBudgets={() => (go('more'), setMoreSheet('budgets'))} />}
              {tab === 'review' && <Review />}
              {tab === 'more' && (
                <More
                  theme={theme}
                  setTheme={setTheme}
                  setMaskIncome={setMaskIncome}
                  stats={stats}
                  sheet={moreSheet}
                  setSheet={setMoreSheet}
                  onExportCSV={exportCSV}
                  onBackup={backup}
                  onRestore={restore}
                  onClear={clearData}
                />
              )}
            </motion.main>
          )}

          <BottomNav tab={tab} onChange={switchTab} reviewCount={reviewCount} />

          <Sheet open={!!detailId} onClose={() => setDetailId(null)} title="Transaction">
            {detailId && <TxnDetail key={detailId} id={detailId} onClose={() => setDetailId(null)} />}
          </Sheet>
        </div>
      </Ctx.Provider>
    </MotionConfig>
  );
}
