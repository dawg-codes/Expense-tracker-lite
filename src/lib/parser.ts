import type { Direction, ParseTag, RawSms, Txn, TxnType } from './types';
import { detectCardBill } from './cardPayments';
import { normalizeMerchant } from './merchants';

export type { RawSms, Txn } from './types';

/**
 * Bump when detection rules change in a way that should re-check transactions
 * already stored. The app re-reads the inbox once (see App.tsx) to apply them.
 *   2: robust credit-card bill payment detection
 */
export const PARSER_VERSION = 2;

const MAX_AMOUNT = 1_000_000;
const MIN = 60_000;

/* ---------- keyword categorisation (fallback when the merchant is unknown) ---------- */

const RULES: Array<[string, RegExp]> = [
  ['Food', /swiggy|zomato|restaurant|\bfood|\bcafe|bakery|pizza|biryani/],
  ['Groceries', /grocer(?:y|ies)|supermarket|kirana|provision|blinkit|zepto|bigbasket/],
  ['Home', /\brent\b|maintenance|society|furniture|\bhome\b/],
  ['EMI', /\bemi\b|\bloan\b|instal(?:l)?ment/],
  ['Insurance', /insurance|\bpremium\b|\bpolicy\b/],
  ['Subscriptions', /subscription|netflix|spotify|hotstar|\bprime\b/],
  ['Transport', /petrol|fuel|diesel|\bshell\b|iocl|\buber\b|\bola\b|metro|parking|\btoll\b|fastag/],
  ['Shopping', /amazon|flipkart|myntra|shopping|\bstore\b|ajio|zara/],
  ['Bills', /electricity|water|wifi|broadband|mobile (?:bill|recharge)|postpaid|prepaid|recharge|\bjio\b|airtel|\bbill/],
  ['Health', /pharmacy|medical|doctor|hospital|apollo|health|clinic|diagnostic/],
  ['Education', /school|college|tuition|university|\bcourse\b/],
  ['Family', /kids|parents|family/],
  ['Travel', /flight|\btrain\b|irctc|makemytrip|travel|airline|oyo rooms|hotel booking/],
  ['Entertainment', /movie|pvr|bookmyshow|cinema/],
  ['Finance', /mutual fund|\bsip\b|zerodha|groww|investment|\bstock\b|\btax\b/],
];

/* ---------- message patterns ---------- */

/** Not a completed transaction: OTPs, reminders, requests, failures. */
const SKIP =
  /\botp\b|one[- ]time password|will be (?:debited|credited)|is due|min(?:imum)? (?:amount )?due|has been requested|collect request|\b(?:declined|failed|unsuccessful)\b/;
const STRONG_DEBIT = /\b(?:debited|spent|withdrawn)\b|thank you for using/;
const DEBIT = /\b(?:debited|spent|paid|sent|withdrawn|purchase|dr)\b|\btransferred\b(?! to your)|thank you for using|\bpayment of (?:rs\.?|inr|₹) ?[\d,]+(?:\.\d+)? (?:made |done )?to\b/;
const CREDIT = /\b(?:credited|received|deposited|refund(?:ed)?|reversed|cr)\b/;
const STRONG_CREDIT = /\b(?:credited|deposited)\b/;
const WEAK_ONLY = /\b(?:dr|cr)\b/;
/** A transaction with no direction wording, e.g. "Txn of Rs 500 on card XX12". */
const UNDIRECTED = /\b(?:txn|transaction) of\b/;
const BALANCE =
  /\b(?:avl\.?\s*(?:bal(?:ance)?|lmt|limit)|available\s*(?:bal(?:ance)?|limit)|(?:closing\s*)?bal(?:ance)?|total\s*(?:due|outstanding))\b[^0-9₹]*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?/gi;
const AMOUNT = /(?:\b(?:rs\.?|inr)|₹)\s*([\d,]+(?:\.\d+)?)/i;
/** SBI style "debited by 500.0" with no currency marker. Requires decimals to stay safe. */
const BARE_AMOUNT = /\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+\.\d{1,2})\b/i;
const REF = /(?:upi|ref|txn|rrn|utr|imps|neft)[^\d]{0,12}(\d{9,16})/i;
const ACCOUNT = /(?:^|[\s(:.,/-])(?:[x*]{1,12}|\.{2,})(\d{3,6})\b|\bending\s*(?:in|with)?\s*[x*]*(\d{4})\b/i;

const TAG_RULES: Array<[ParseTag, RegExp]> = [
  ['self', /\bself[- ]?(?:transfer|trf)\b|\bto self\b|\bown (?:a\/?c|acc(?:oun)?t)\b|\bbetween (?:your|own) accounts\b|\bsweep|fixed deposit/],
  ['refund', /\brefund(?:ed)?\b|\breversal\b|\breversed\b|\bchargeback\b/],
  ['card', /\bcard\b/],
  ['cc', /\bcredit ?card\b|\bcc\b/],
  ['emi', /\bemi\b|\bloan\b|instal(?:l)?ment/],
  ['autopay', /\bmandate\b|\bauto ?pay\b|standing instruction|\be-?nach\b|\bnach\b/],
  ['rail', /\b(?:imps|neft|rtgs)\b/],
];

/** The other account in "IMPS to A/c XX9876" / "transfer from A/c XX1234". */
const COUNTER_TO = /\bto\s+(?:your\s+)?(?:a\/?c|acct|account)(?:\s*no\.?)?\s*[:\-]?\s*(?:[x*.]+\s*)?(\d{3,6})\b/i;
const COUNTER_FROM = /\bfrom\s+(?:your\s+)?(?:a\/?c|acct|account)(?:\s*no\.?)?\s*[:\-]?\s*(?:[x*.]+\s*)?(\d{3,6})\b/i;

/* credit-card bill payments: see cardPayments.ts */

const BANK_SENDER =
  /HDFC|ICICI|SBI|AXIS|KOTAK|YESB|IDFC|INDUS|PNB|BOB|BARODA|CANBNK|CANARA|UNION|FEDBNK|FEDERAL|RBL|AUBANK|IDBI|BOI|CENTBK|IOB|UCO|PAYTM|AMEX|CITI|HSBC|SCB|DBS|ONECARD|SLICE|JUPITER/;

/* ---------- merchant extraction ---------- */

const END = String.raw`(?=\s+(?:on|via|using|with|for|ref\w*|txn|upi|avl|dated|thru|through|is|has|and|from|at)\b|\s*[.,;()]|\s*$)`;
const VPA = String.raw`([a-z0-9][a-z0-9._-]*@[a-z][a-z0-9]*)`;
const FRAG = String.raw`([A-Za-z0-9][\w&.'@*\/ -]{1,50}?)`;
const DEBIT_PAYEE = [
  new RegExp(String.raw`\b(?:to|trf to)\s+(?:vpa\s+)?${VPA}`, 'gi'),
  new RegExp(String.raw`;\s*([A-Za-z0-9][^;.]{1,40}?)\s+credited\b`, 'gi'), // ICICI: "...; SWIGGY credited"
  new RegExp(String.raw`\b(?:at|@)\s+${FRAG}${END}`, 'gi'),
  new RegExp(String.raw`\b(?:trf to|transfer(?:red)? to|paid to|sent to|to|towards)\s+(?:vpa\s+|merchant\s+)?${FRAG}${END}`, 'gi'),
  new RegExp(String.raw`\binfo[:\s-]+([^.;\n]{2,50})`, 'gi'),
];
const CREDIT_PAYER = [
  new RegExp(String.raw`\b(?:from|by)\s+(?:vpa\s+)?${VPA}`, 'gi'),
  new RegExp(String.raw`\b(?:from|by)\s+(?:vpa\s+)?${FRAG}${END}`, 'gi'),
  new RegExp(String.raw`\binfo[:\s-]+([^.;\n]{2,50})`, 'gi'),
];
const NOT_PAYEE = /^(?:your|ur|the|a\/?c|ac|acct|account|card|mobile|beneficiary|self|neft|imps|rtgs|upi|rs\.?|inr)\b|^₹|[x*]{2,}\d/i;

/** Picks the most name-like segment of "UPI/P2M/612345678901/SWIGGY". */
function pickSegment(frag: string): string {
  if (!frag.includes('/') || /@/.test(frag)) return frag;
  const segs = frag
    .split('/')
    .map((s) => s.trim())
    .filter((s) => /[a-z]{3}/i.test(s) && !/^(?:upi|p2m|p2a|imps|neft|rtgs|ecom|pos|dr|cr)$/i.test(s));
  return segs[segs.length - 1] ?? frag;
}

function extractPayee(text: string, direction: Direction): { raw?: string } {
  const patterns = direction === 'debit' ? DEBIT_PAYEE : CREDIT_PAYER;
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      let frag = pickSegment(m[1].trim());
      if (NOT_PAYEE.test(frag)) continue;
      // phone-number VPA: keep only the last 4 digits
      const phone = frag.match(/^\+?\d{6,}(\d{4})@([a-z]+)$/i);
      if (phone) frag = `••${phone[1]}@${phone[2]}`;
      const n = normalizeMerchant(frag);
      if (n.name) return { raw: frag.slice(0, 40) };
    }
  }
  return {};
}

/* ---------- helpers ---------- */

function classify(body: string): string | undefined {
  for (const [cat, re] of RULES) if (re.test(body)) return cat;
  return undefined;
}

export function hash(s: string): string {
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
export function normSender(s: string): string {
  return s
    .toUpperCase()
    .replace(/^[A-Z0-9]{2}-/, '')
    .replace(/-[A-Z]$/, '')
    .replace(/[^A-Z0-9]/g, '');
}

const APP_SENDER = /PAYTM|PHONPE|PHONEPE|GPAY|GOOGLEPAY|AMAZONPAY|AMZPAY|BHIM|MOBIKWIK|FREECHARGE|CRED|NAVIUP|SUPERMONEY/;

/** UPI / wallet apps that echo payments your bank also reports. */
export function isAppSender(s: string): boolean {
  return APP_SENDER.test(normSender(s));
}

export function isBankSender(s: string): boolean {
  return BANK_SENDER.test(normSender(s));
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/* ---------- main entry ---------- */

/**
 * Turns SMS messages into transactions. Message text is only read here, in
 * memory; the returned objects contain no message body.
 */
export function parseSms(messages: RawSms[]): Txn[] {
  const out: Txn[] = [];
  for (const sms of messages) {
    const txn = parseOne(sms);
    if (txn) out.push(txn);
  }
  return out;
}

export function parseOne(sms: RawSms): Txn | null {
  const raw = sms.body ?? '';
  const body = raw.toLowerCase();
  if (!body || SKIP.test(body)) return null;

  const di = body.search(DEBIT);
  const ci = body.search(CREDIT);
  const sender = sms.sender || sms.address || 'Bank';
  const cardBill = detectCardBill(raw, sender);
  // Bill payments often have no debited/credited verb ("Payment of Rs X made … to your credit card")
  const cardSide = di < 0 && ci < 0 && cardBill?.level === 'certain';
  const undirected = di < 0 && ci < 0 && !cardSide;
  if (undirected && !UNDIRECTED.test(body)) return null;
  const direction: Direction = cardSide
    ? cardBill!.side === 'account'
      ? 'debit'
      : 'credit'
    : di >= 0 && (ci < 0 || di < ci)
      ? 'debit'
      : undirected
        ? 'debit'
        : 'credit';

  const stripped = raw.replace(BALANCE, ' ');
  let match = stripped.match(AMOUNT);
  const currency = !!match;
  if (!match) match = stripped.match(BARE_AMOUNT);
  if (!match) return null;
  const amount = parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;

  const tags = TAG_RULES.filter(([, re]) => re.test(body)).map(([t]) => t);
  if (cardBill?.level === 'certain') tags.push('cc_bill');
  else if (cardBill?.level === 'possible') tags.push('cc_maybe');
  const strong = direction === 'debit' ? STRONG_DEBIT.test(body) : STRONG_CREDIT.test(body);
  const onlyWeak =
    !undirected &&
    !strong &&
    !(direction === 'debit' ? /\b(?:paid|sent|purchase)\b/ : /\b(?:received|refund(?:ed)?|reversed)\b/).test(body) &&
    WEAK_ONLY.test(body);
  if (onlyWeak) tags.push('weak');

  // "Txn of Rs 700 on your card XX12 at AMAZON": a card purchase in practice
  const cardPurchase: { raw?: string } = undirected && tags.includes('card') ? extractPayee(stripped, 'debit') : {};

  let type: TxnType;
  if (undirected && !cardPurchase.raw) type = 'unknown';
  else if (tags.includes('cc_bill')) type = 'card_payment';
  else if (direction === 'credit' && tags.includes('refund')) type = 'refund';
  else if (tags.includes('self')) type = 'transfer';
  else type = direction === 'debit' ? 'expense' : 'income';

  // a bill payment's only "payee" is the card (or an app like CRED on the account side)
  const payee = cardSide || (tags.includes('cc_bill') && direction === 'credit') ? {} : undirected ? cardPurchase : extractPayee(stripped, direction);
  const merchant = normalizeMerchant(payee.raw, type === 'income' ? undefined : body);

  let category: string;
  if (type === 'income') category = 'Income';
  else if (type === 'card_payment') category = 'Finance';
  else if (type === 'transfer') category = 'Other';
  else category = merchant.category ?? classify(body) ?? 'Other';

  const acct = body.match(ACCOUNT);
  const accountDigits = acct ? (acct[1] ?? acct[2]) : undefined;
  const counter = (direction === 'debit' ? body.match(COUNTER_TO) : body.match(COUNTER_FROM))?.[1];
  const counterAccount = counter && counter.slice(-4) !== accountDigits?.slice(-4) ? `XX${counter.slice(-4)}` : undefined;
  const ref = body.match(REF)?.[1];

  /* confidence: how sure are we this is a real transaction… */
  let parseScore = 0.3;
  if (strong) parseScore += 0.35;
  else if (!onlyWeak && !undirected) parseScore += cardSide ? 0.2 : 0.25;
  else if (cardPurchase.raw) parseScore += 0.15;
  else if (onlyWeak) parseScore += 0.1;
  if (currency) parseScore += 0.15;
  if (accountDigits) parseScore += 0.1;
  if (ref) parseScore += 0.1;
  if (isBankSender(sender)) parseScore += 0.05;
  if (di >= 0 && ci >= 0) parseScore -= 0.2;

  /* …and how sure are we about what it was for */
  let catScore: number;
  if (type === 'unknown') catScore = 0.2;
  else if (type === 'income') catScore = 0.9;
  else if (type === 'card_payment') catScore = 0.85;
  else if (type === 'transfer') catScore = 0.8;
  else if (merchant.known) catScore = 0.95;
  else if (category !== 'Other') catScore = 0.75;
  else if (merchant.name) catScore = 0.45;
  else catScore = 0.35;

  const date = toTime(sms.date);
  return {
    id: String(sms.id ?? sms._id ?? hash(`${date}|${raw}`)),
    direction,
    type,
    amount,
    date,
    category,
    merchant: merchant.name,
    merchantRaw: payee.raw,
    sender,
    account: accountDigits ? `XX${accountDigits.slice(-4)}` : undefined,
    counterAccount,
    ref,
    fp: hash(body.replace(/[^a-z0-9]/g, '')),
    confidence: Math.round(clamp01(Math.min(parseScore, catScore)) * 100) / 100,
    tags: tags.length ? tags : undefined,
  };
}

/* ---------- duplicates ---------- */

export interface Dupe {
  txn: Txn;
  keptId: string;
  reason: string;
  /** false when the match is heuristic (two senders) and deserves a second look. */
  certain: boolean;
}

/**
 * Splits transactions into unique ones and ignored duplicates (with a reason).
 * `forceKeep` lists ids the user said are NOT duplicates.
 */
export function dedupe(all: Txn[], forceKeep?: Set<string>): { unique: Txn[]; dupes: Dupe[] } {
  const sorted = [...all].sort((a, b) => a.date - b.date);
  const unique: Txn[] = [];
  const dupes: Dupe[] = [];
  const byRef = new Map<string, Txn>();
  const paired = new Set<string>();

  for (const t of sorted) {
    let kept: Txn | undefined;
    let reason = '';
    let certain = true;

    if (!forceKeep?.has(t.id)) {
      if (t.ref) {
        const k = byRef.get(`${t.direction}|${t.amount}|${t.ref}`);
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
          if (k.direction !== t.direction || k.amount !== t.amount) continue;
          if (t.ref && k.ref && t.ref !== k.ref) continue;
          if (t.fp === k.fp && gap <= 2 * MIN) {
            kept = k;
            reason = 'Identical message';
            break;
          }
          if (normSender(t.sender) !== normSender(k.sender) && !paired.has(k.id)) {
            kept = k;
            paired.add(k.id);
            // A bank alert + a UPI-app alert, or two alerts naming the same account or
            // merchant, are the same payment. Two different banks might not be.
            const appPair = isAppSender(t.sender) !== isAppSender(k.sender);
            const sameAccount = !!t.account && t.account === k.account;
            const sameMerchant = !!t.merchant && t.merchant === k.merchant;
            certain = appPair || sameAccount || sameMerchant;
            reason = certain ? 'Same payment reported by your bank and a payment app' : 'Same amount from two senders a few minutes apart';
            break;
          }
        }
      }
    }

    if (kept) {
      dupes.push({ txn: t, keptId: kept.id, reason, certain });
    } else {
      unique.push(t);
      if (t.ref) byRef.set(`${t.direction}|${t.amount}|${t.ref}`, t);
    }
  }
  return { unique, dupes };
}

/* ---------- formatting ---------- */

const f0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const f2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const inr = (n: number, precise = false) => (precise ? f2 : f0).format(n);
