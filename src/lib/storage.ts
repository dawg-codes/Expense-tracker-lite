/**
 * Persistence + schema migration.
 *
 * Schema history
 *   v2  key "et:txns:v2": Txn[] with { id, type: 'debit'|'credit', amount, category, date, sender, ref?, fp }
 *   v3  key "et:txns:v3": { schema: 3, txns: Txn[] } — adds direction, classification, merchant, confidence, overrides
 *
 * Every transaction written to storage (or a backup) passes through
 * `sanitizeTxn`, which copies only whitelisted fields. That is what
 * guarantees SMS text can never be persisted, even by accident.
 */
import type { Budgets, CategoryDef, Direction, FlagKind, MerchantRule, ParseTag, Txn, TxnOverrides, TxnType } from './types';

export const SCHEMA_VERSION = 3;

export const KEYS = {
  txns: 'et:txns:v3',
  legacyTxns: 'et:txns:v2',
  lastSync: 'et:lastSync',
  theme: 'et:theme',
  mask: 'et:mask',
  legacyFilter: 'et:filter',
  period: 'et:period',
  rules: 'et:rules',
  categories: 'et:categories',
  budgets: 'et:budgets',
  dismissedRecurring: 'et:recurring:dismissed',
} as const;

const TYPES: TxnType[] = ['expense', 'income', 'transfer', 'refund', 'card_payment', 'unknown'];
const TAGS: ParseTag[] = ['self', 'refund', 'card', 'cc', 'cc_bill', 'emi', 'autopay', 'weak'];
const FLAGS: FlagKind[] = ['duplicate', 'transfer', 'refund', 'uncategorised', 'unknown_type', 'low_confidence', 'card_payment'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 80): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);

function sanitizeOverrides(v: unknown): TxnOverrides | undefined {
  if (!isObj(v)) return undefined;
  const o: TxnOverrides = {};
  const type = oneOf(v.type, TYPES);
  if (type) o.type = type;
  const category = str(v.category, 60);
  if (category) o.category = category;
  const merchant = str(v.merchant, 60);
  if (merchant) o.merchant = merchant;
  if (v.excluded === true) o.excluded = true;
  if (v.reviewed === true) o.reviewed = true;
  if (v.notDuplicate === true) o.notDuplicate = true;
  const linkedId = str(v.linkedId, 80);
  if (linkedId) o.linkedId = linkedId;
  if (Array.isArray(v.dismissed)) {
    const d = v.dismissed.filter((x): x is FlagKind => FLAGS.includes(x as FlagKind));
    if (d.length) o.dismissed = [...new Set(d)];
  }
  return Object.keys(o).length ? o : undefined;
}

/**
 * Accepts a v2 or v3 transaction and returns a clean v3 one (or null if
 * unusable). Unknown fields are dropped.
 */
export function sanitizeTxn(v: unknown): Txn | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 80);
  const amount = num(v.amount);
  const date = num(v.date);
  if (!id || amount === undefined || amount <= 0 || date === undefined) return null;

  // v2 stored the direction in `type`
  const legacy = v.type === 'debit' || v.type === 'credit';
  const direction: Direction | undefined = oneOf(v.direction, ['debit', 'credit'] as const) ?? (legacy ? (v.type as Direction) : undefined);
  if (!direction) return null;
  const type: TxnType = oneOf(v.type, TYPES) ?? (direction === 'debit' ? 'expense' : 'income');

  let category = str(v.category, 60) ?? 'Other';
  if (legacy && direction === 'credit' && category === 'Other') category = 'Income';

  const t: Txn = {
    id,
    direction,
    type,
    amount,
    date,
    category,
    sender: str(v.sender, 40) ?? 'Bank',
    fp: str(v.fp, 20) ?? id,
    // v2 records predate confidence scoring; they were already trusted in totals.
    confidence: Math.min(1, Math.max(0, num(v.confidence) ?? 0.7)),
  };
  const merchant = str(v.merchant, 60);
  if (merchant) t.merchant = merchant;
  const merchantRaw = str(v.merchantRaw, 40);
  if (merchantRaw) t.merchantRaw = merchantRaw;
  const account = str(v.account, 12);
  if (account && /^[X*]{0,4}\d{3,6}$/i.test(account)) t.account = account;
  const ref = str(v.ref, 20);
  if (ref && /^\d{6,20}$/.test(ref)) t.ref = ref;
  if (Array.isArray(v.tags)) {
    const tags = v.tags.filter((x): x is ParseTag => TAGS.includes(x as ParseTag));
    if (tags.length) t.tags = [...new Set(tags)];
  }
  const user = sanitizeOverrides(v.user);
  if (user) t.user = user;
  return t;
}

export function sanitizeTxns(list: unknown): Txn[] {
  if (!Array.isArray(list)) return [];
  const out: Txn[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const t = sanitizeTxn(x);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** Reads any known stored shape (v2 array or v3 envelope). */
export function migrateTxns(stored: unknown): Txn[] {
  if (Array.isArray(stored)) return sanitizeTxns(stored); // v2
  if (isObj(stored) && Array.isArray(stored.txns)) return sanitizeTxns(stored.txns); // v3+
  return [];
}

export function sanitizeRules(v: unknown): MerchantRule[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    if (!isObj(r)) return [];
    const id = str(r.id, 60);
    const match = str(r.match, 60);
    const category = str(r.category, 60);
    if (!id || !match || !category) return [];
    const rule: MerchantRule = { id, match, category };
    const rename = str(r.rename, 60);
    if (rename) rule.rename = rename;
    return [rule];
  });
}

export function sanitizeCategories(v: unknown): CategoryDef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    if (!isObj(c)) return [];
    const id = str(c.id, 60);
    const label = str(c.label, 30);
    if (!id || !label || !id.startsWith('c_')) return [];
    const color = typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#94a3b8';
    const nature = oneOf(c.nature, ['committed', 'discretionary'] as const);
    const def: CategoryDef = { id, label, emoji: str(c.emoji, 8) ?? '🏷️', color, custom: true };
    if (nature) def.nature = nature;
    return [def];
  });
}

export function sanitizeBudgets(v: unknown): Budgets {
  const out: Budgets = { categories: {} };
  if (!isObj(v)) return out;
  const total = num(v.total);
  if (total !== undefined && total > 0) out.total = total;
  if (isObj(v.categories)) {
    for (const [k, amount] of Object.entries(v.categories)) {
      const a = num(amount);
      if (a !== undefined && a > 0) out.categories[k.slice(0, 60)] = a;
    }
  }
  return out;
}

/* ---------- localStorage access ---------- */

export function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Loads transactions, migrating v2 data in place (the old key is removed only after v3 is safely written). */
export function loadTxns(): Txn[] {
  const current = readJSON(KEYS.txns);
  if (current !== undefined) return migrateTxns(current);
  const legacy = readJSON(KEYS.legacyTxns);
  if (legacy === undefined) return [];
  const migrated = migrateTxns(legacy);
  if (saveTxns(migrated)) {
    try {
      localStorage.removeItem(KEYS.legacyTxns);
    } catch {
      /* keep legacy copy */
    }
  }
  return migrated;
}

export function saveTxns(txns: Txn[]): boolean {
  return writeJSON(KEYS.txns, { schema: SCHEMA_VERSION, txns: txns.map(sanitizeTxn).filter(Boolean) });
}

/** Approximate bytes this app uses in localStorage. */
export function storageBytes(): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('et:')) n += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
  } catch {
    /* unavailable */
  }
  return n * 2; // UTF-16
}

/** Counts stored records that contain anything resembling message text. Used by the Privacy Center. */
export function countStoredMessageText(): number {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('et:')) continue;
      const raw = localStorage.getItem(k) ?? '';
      n += (raw.match(/"(?:body|message|sms|text)"\s*:/g) ?? []).length;
    }
  } catch {
    /* unavailable */
  }
  return n;
}
