/**
 * CSV export and JSON backup/restore. Everything happens on-device: the file
 * is handed to the Android share sheet (or downloaded in a browser) and the
 * user decides where it goes. Message text is never exported.
 */
import { Capacitor } from '@capacitor/core';
import { catMeta, type CategoryMap } from './categories';
import {
  SCHEMA_VERSION,
  sanitizeBudgets,
  sanitizeCategories,
  sanitizeRules,
  sanitizeTxn,
  sanitizeTxns,
} from './storage';
import type { Budgets, CategoryDef, MerchantRule, Txn, TxnView } from './types';

export const APP_ID = 'expense-tracker-lite';
export const APP_VERSION = '3.0.0';

/* ---------- CSV ---------- */

const TYPE_LABEL: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  refund: 'Refund',
  card_payment: 'Card payment',
  unknown: 'Unknown',
};

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
export function csvCell(v: string | number | undefined): string {
  let s = v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(list: TxnView[], cats: CategoryMap): string {
  const header = ['Date', 'Time', 'Amount', 'Direction', 'Type', 'Merchant', 'Category', 'Sender', 'Account', 'Reference', 'Counted', 'Note'];
  const rows = list.map((v) => {
    const d = new Date(v.date);
    const p = (n: number) => String(n).padStart(2, '0');
    const note = v.dupOf ? 'Duplicate alert' : v.excluded ? 'Excluded by you' : '';
    return [
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      `${p(d.getHours())}:${p(d.getMinutes())}`,
      v.amount.toFixed(2),
      v.direction,
      TYPE_LABEL[v.kind] ?? v.kind,
      v.name,
      catMeta(cats, v.cat).label,
      v.sender,
      v.account,
      v.ref,
      v.counted ? 'yes' : 'no',
      note,
    ]
      .map(csvCell)
      .join(',');
  });
  return [header.join(','), ...rows].join('\r\n');
}

/* ---------- backup ---------- */

export interface BackupSettings {
  theme?: 'dark' | 'light';
  maskIncome?: boolean;
}

export interface BackupData {
  transactions: Txn[];
  categories: CategoryDef[];
  rules: MerchantRule[];
  budgets: Budgets;
  dismissedRecurring: string[];
  settings: BackupSettings;
}

export interface BackupFile {
  app: typeof APP_ID;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export function buildBackup(data: BackupData, now = new Date()): BackupFile {
  return {
    app: APP_ID,
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      ...data,
      transactions: data.transactions.map(sanitizeTxn).filter((t): t is Txn => !!t),
    },
  };
}

export type ParsedBackup = { ok: true; backup: BackupFile; skipped: number } | { ok: false; error: string };

/** Validates an imported backup without touching any existing data. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > 20_000_000) return { ok: false, error: 'This file is too large to be a backup.' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (typeof json !== 'object' || json === null) return { ok: false, error: 'Unrecognised file.' };
  const f = json as Record<string, unknown>;
  if (f.app !== APP_ID) return { ok: false, error: 'This is not an Expense Tracker Lite backup.' };
  const schema = typeof f.schemaVersion === 'number' ? f.schemaVersion : NaN;
  if (!(schema >= 2 && schema <= SCHEMA_VERSION)) {
    return { ok: false, error: `Backup schema v${String(f.schemaVersion)} isn't supported by this version of the app.` };
  }
  const d = (typeof f.data === 'object' && f.data !== null ? f.data : {}) as Record<string, unknown>;
  if (!Array.isArray(d.transactions)) return { ok: false, error: 'The backup has no transaction list.' };

  const transactions = sanitizeTxns(d.transactions);
  const s = (typeof d.settings === 'object' && d.settings !== null ? d.settings : {}) as Record<string, unknown>;
  const settings: BackupSettings = {};
  if (s.theme === 'dark' || s.theme === 'light') settings.theme = s.theme;
  if (typeof s.maskIncome === 'boolean') settings.maskIncome = s.maskIncome;

  return {
    ok: true,
    skipped: d.transactions.length - transactions.length,
    backup: {
      app: APP_ID,
      appVersion: typeof f.appVersion === 'string' ? f.appVersion.slice(0, 20) : '?',
      schemaVersion: schema,
      exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt.slice(0, 40) : '',
      data: {
        transactions,
        categories: sanitizeCategories(d.categories),
        rules: sanitizeRules(d.rules),
        budgets: sanitizeBudgets(d.budgets),
        dismissedRecurring: Array.isArray(d.dismissedRecurring)
          ? d.dismissedRecurring.filter((x): x is string => typeof x === 'string').slice(0, 500)
          : [],
        settings,
      },
    },
  };
}

const byId = <T extends { id: string }>(a: T[], b: T[]): T[] => {
  const map = new Map(a.map((x) => [x.id, x]));
  for (const x of b) if (!map.has(x.id)) map.set(x.id, x);
  return [...map.values()];
};

/** Merge keeps everything you have and adds what's new from the backup. */
export function mergeBackup(current: BackupData, incoming: BackupData): BackupData {
  const txns = new Map(current.transactions.map((t) => [t.id, t]));
  for (const t of incoming.transactions) {
    const existing = txns.get(t.id);
    if (!existing) txns.set(t.id, t);
    else if (!existing.user && t.user) txns.set(t.id, { ...existing, user: t.user });
  }
  return {
    transactions: [...txns.values()].sort((a, b) => b.date - a.date),
    categories: byId(current.categories, incoming.categories),
    rules: byId(current.rules, incoming.rules),
    budgets: {
      total: current.budgets.total ?? incoming.budgets.total,
      categories: { ...incoming.budgets.categories, ...current.budgets.categories },
    },
    dismissedRecurring: [...new Set([...current.dismissedRecurring, ...incoming.dismissedRecurring])],
    settings: current.settings,
  };
}

/* ---------- saving files ---------- */

/**
 * Hands a file to the user. On Android: writes it to the app cache and opens
 * the system share sheet ("Save to Files", Drive, email… the user's choice).
 * In a browser: triggers a normal download. No network involved either way.
 */
export async function saveFile(filename: string, contents: string, mime: string): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Save or share' });
    return 'shared';
  }
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export const stamp = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
