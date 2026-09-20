export type Category =
  | 'Food' | 'Home' | 'EMI' | 'Transport' | 'Shopping' | 'Bills'
  | 'Health' | 'Family' | 'Travel' | 'Entertainment' | 'Finance' | 'Other';

export type FilterMode = 'weekly' | 'monthly' | 'yearly' | 'custom';

export const CATEGORY_META: Record<Category, { label: string; emoji: string; color: string }> = {
  Food: { label: 'Food', emoji: '🍔', color: '#f59e0b' },
  Home: { label: 'Home', emoji: '🏠', color: '#10b981' },
  EMI: { label: 'EMI', emoji: '💳', color: '#8b5cf6' },
  Transport: { label: 'Transport', emoji: '⛽', color: '#3b82f6' },
  Shopping: { label: 'Shopping', emoji: '🛍️', color: '#ec4899' },
  Bills: { label: 'Bills', emoji: '💡', color: '#06b6d4' },
  Health: { label: 'Health', emoji: '🏥', color: '#ef4444' },
  Family: { label: 'Family', emoji: '👨‍👩‍👧', color: '#f97316' },
  Travel: { label: 'Travel', emoji: '✈️', color: '#6366f1' },
  Entertainment: { label: 'Entertainment', emoji: '🎬', color: '#a855f7' },
  Finance: { label: 'Finance', emoji: '💰', color: '#14b8a6' },
  Other: { label: 'Other', emoji: '📦', color: '#64748b' },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

export interface Txn {
  id: string;
  type: 'debit' | 'credit';
  amount: number;
  category: Category;
  date: number;
  sender: string;
  ref?: string;
  fp: string;
}

export interface Dupe {
  txn: Txn;
  keptId: string;
  reason: string;
}

export interface RawSms {
  id?: string | number;
  _id?: string | number;
  address?: string;
  sender?: string;
  body?: string;
  date?: string | number;
}

const MAX_AMOUNT = 1_000_000;
const MIN = 60_000;
const DAY = 86_400_000;

const RULES: Array<[Category, RegExp]> = [
  ['Food', /swiggy|zomato|restaurant|food|cafe|grocery|blinkit|zepto/],
  ['Home', /\brent\b|maintenance|society|furniture|\bhome\b/],
  ['EMI', /\bemi\b|loan|installment|cc payment/],
  ['Transport', /petrol|fuel|diesel|\bshell\b|iocl|\buber\b|\bola\b|metro/],
  ['Shopping', /amazon|flipkart|myntra|shopping|\bstore\b|ajio|zara/],
  ['Bills', /electricity|water|wifi|broadband|mobile|\bjio\b|airtel|\bbill/],
  ['Health', /pharmacy|medical|doctor|hospital|apollo|health/],
  ['Family', /school|kids|parents|family/],
  ['Travel', /flight|hotel|\btrain\b|irctc|makemytrip|travel/],
  ['Entertainment', /netflix|\bprime\b|hotstar|movie|pvr|bookmyshow/],
  ['Finance', /mutual fund|\bsip\b|zerodha|groww|investment|\bstock\b|insurance|\btax\b/],
];

const SKIP = /\botp\b|one[- ]time password|will be debited|is due|has been requested|collect request/;
const DEBIT = /\b(?:debited|spent|paid|sent|withdrawn|purchase|dr)\b/;
const CREDIT = /\b(?:credited|received|deposited|refund(?:ed)?|cr)\b/;
const BALANCE =
  /\b(?:avl\.?\s*(?:bal(?:ance)?|lmt|limit)|available\s*(?:bal(?:ance)?|limit)|(?:closing\s*)?bal(?:ance)?|total\s*(?:due|outstanding))\b[^0-9₹]*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?/gi;
const AMOUNT = /(?:\b(?:rs\.?|inr)|₹)\s*([\d,]+(?:\.\d+)?)/i;
const REF = /(?:upi|ref|txn|rrn|utr|imps|neft)[^\d]{0,12}(\d{9,16})/i;

function classify(body: string): Category {
  for (const [cat, re] of RULES) if (re.test(body)) return cat;
  return 'Other';
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function toTime(d: string | number | undefined): number {
  if (d === undefined || d === null || d === '') return Date.now();
  const n = Number(d);
  const t = Number.isFinite(n) ? n : Date.parse(String(d));
  return Number.isFinite(t) ? t : Date.now();
}

/** "VM-HDFCBK-S" and "AD-HDFCBK" both become "HDFCBK". */
function normSender(s: string): string {
  return s
    .toUpperCase()
    .replace(/^[A-Z0-9]{2}-/, '')
    .replace(/-[A-Z]$/, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function parseSms(messages: RawSms[]): Txn[] {
  const out: Txn[] = [];
  for (const sms of messages) {
    const raw = sms.body ?? '';
    const body = raw.toLowerCase();
    if (!body || SKIP.test(body)) continue;

    const di = body.search(DEBIT);
    const ci = body.search(CREDIT);
    if (di < 0 && ci < 0) continue;
    const isDebit = di >= 0 && (ci < 0 || di < ci);

    const match = body.replace(BALANCE, ' ').match(AMOUNT);
    if (!match) continue;
    const amount = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;

    const date = toTime(sms.date);
    const fp = hash(body.replace(/[^a-z0-9]/g, ''));
    out.push({
      id: String(sms.id ?? sms._id ?? hash(`${date}|${raw}`)),
      type: isDebit ? 'debit' : 'credit',
      amount,
      category: isDebit ? classify(body) : 'Other',
      date,
      sender: sms.sender || sms.address || 'Bank',
      ref: body.match(REF)?.[1],
      fp,
    });
  }
  return out;
}

/** Splits transactions into unique ones and ignored duplicates (with a reason). */
export function dedupe(all: Txn[]): { unique: Txn[]; dupes: Dupe[] } {
  const sorted = [...all].sort((a, b) => a.date - b.date);
  const unique: Txn[] = [];
  const dupes: Dupe[] = [];
  const byRef = new Map<string, Txn>();
  const paired = new Set<string>();

  for (const t of sorted) {
    let kept: Txn | undefined;
    let reason = '';

    if (t.ref) {
      const k = byRef.get(`${t.type}|${t.amount}|${t.ref}`);
      if (k) {
        kept = k;
        reason = 'Same reference number';
      }
    }

    if (!kept) {
      for (let i = unique.length - 1; i >= 0; i--) {
        const k = unique[i];
        const gap = t.date - k.date;
        if (gap > 10 * MIN) break;
        if (k.type !== t.type || k.amount !== t.amount) continue;
        if (t.ref && k.ref && t.ref !== k.ref) continue;
        if (t.fp === k.fp && gap <= 2 * MIN) {
          kept = k;
          reason = 'Identical message';
          break;
        }
        if (normSender(t.sender) !== normSender(k.sender) && !paired.has(k.id)) {
          kept = k;
          reason = 'Same amount from two senders (bank + app alert)';
          paired.add(k.id);
          break;
        }
      }
    }

    if (kept) {
      dupes.push({ txn: t, keptId: kept.id, reason });
    } else {
      unique.push(t);
      if (t.ref) byRef.set(`${t.type}|${t.amount}|${t.ref}`, t);
    }
  }
  return { unique, dupes };
}

function parseLocalDate(v: string): Date | null {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Returns [startMs, endMs] or null when a custom range is invalid. */
export function rangeFor(
  mode: FilterMode,
  start: string,
  end: string,
  now = Date.now(),
): [number, number] | null {
  if (mode === 'weekly') return [now - 7 * DAY, now];
  if (mode === 'monthly') return [now - 30 * DAY, now];
  if (mode === 'yearly') return [new Date(new Date(now).getFullYear(), 0, 1).getTime(), now];
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  if (!s || !e || s.getTime() > e.getTime()) return null;
  return [s.getTime(), e.getTime() + DAY - 1];
}

const f0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const f2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const inr = (n: number, precise = false) => (precise ? f2 : f0).format(n);
