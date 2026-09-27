/**
 * Credit-card bill payment detection.
 *
 * Paying a card bill moves money you already spent (the card purchases are
 * counted when they happen), so it must not count as spending again. This
 * module decides, from the alert wording alone, whether an SMS is:
 *
 *   certain   clearly a bill payment (either the bank-account side or the
 *             card issuer confirming receipt) → excluded automatically
 *   possible  card-related money movement without clear bill wording → Review
 *   null      not a bill payment (includes every card PURCHASE)
 *
 * Rules are data: add a phrase to BILL_SIGNALS, a purchase phrase to
 * PURCHASE_GUARDS, or an issuer to ISSUER_SENDERS. Everything runs locally.
 */

export type CardBillLevel = 'certain' | 'possible';

export interface CardBillMatch {
  level: CardBillLevel;
  /** Ids of the signals that fired (for tests and debugging). */
  signals: string[];
  /** Which side of the payment this alert describes, when the wording says so. */
  side?: 'account' | 'card';
}

/** A card noun: "credit card", "card", "cc", and issuer brand names used as nouns. */
const CARD = String.raw`(?:credit ?card|card|cc|bobcard|onecard|sbi ?card)`;
const PREP = String.raw`(?:towards|to|for|against|on|in|of)`;
/**
 * Words allowed between "towards/to/on" and "card": issuer and co-brand names
 * only, so "payment to SWIGGY via RuPay credit card" (a purchase) can't match.
 */
const ISSUER_WORD = String.raw`(?:hdfc|icici|sbi|axis|kotak|idfc|first|yes|rbl|au|indusind|hsbc|citi|citibank|amex|american|express|standard|chartered|sc|bob|baroda|bank|federal|small|finance|dbs|idbi|pnb|canara|union|bandhan|tata|neu|onecard|scapia|amazon|flipkart|pay|airtel|swiggy|regalia|millennia|moneyback|simplyclick|platinum|signature|select|visa|mastercard|rupay|my|registered)`;
const WORDS = String.raw`(?:${ISSUER_WORD}\s+){0,5}`;

/**
 * Makes wording comparable across banks: lowercase, every amount becomes
 * "amt" (so "Rs." no longer looks like the end of a sentence), "a/c" → "ac".
 */
export function normalizeForCard(body: string): string {
  return body
    .toLowerCase()
    .replace(/(?:\b(?:rs|inr)\.?|₹)\s*[\d,]+(?:\.\d+)?/g, ' amt ')
    .replace(/\ba\/c\b|\bacct\b/g, 'ac')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Signal {
  id: string;
  re: RegExp;
}

/** Any one of these is enough (unless a purchase guard fires). */
const BILL_SIGNALS: Signal[] = [
  // "credit card bill", "card dues", "card outstanding", "cc bill"
  { id: 'bill-words', re: new RegExp(String.raw`\b${CARD}\s+(?:bill|dues?|outstanding|o/s)\b`) },
  // "cc payment", "credit card payment"
  { id: 'card-payment', re: /\b(?:cc|credit ?card)\s+(?:bill\s+)?(?:payment|pmt|repayment)\b/ },
  // "payment of amt towards your sbi card", "payment … received on your icici bank credit card",
  // "your payment … against bobcard", "payment made from ac … to hdfc bank credit card"
  { id: 'payment-to-card', re: new RegExp(String.raw`\b(?:payment|pmt|repayment)\b[^;]{0,70}?\b${PREP}\s+(?:your\s+|the\s+)?${WORDS}${CARD}\b`) },
  // "debited … towards credit card xx5678", "transferred … to your kotak credit card"
  { id: 'money-to-credit-card', re: new RegExp(String.raw`\b(?:debited|transferred|paid|credited|received)\b[^;]{0,60}?\b(?:towards|to|into|in|on|for)\s+(?:your\s+|the\s+)?${WORDS}credit ?card\b`) },
  // "dear cardmember, payment of … received"
  { id: 'cardmember', re: /\bcard ?member\b[^;]{0,60}\b(?:payment|paid|received)\b/ },
  // paying through CRED (a card-bill payment app); not its rent/loan products
  { id: 'cred', re: /\bcred(?:\.club|\s+club)?\b(?![\s.]*(?:rent|mint|cash|pay rent))/ },
];

/** Wording that means the card was USED to buy something. Never a bill payment. */
const PURCHASE_GUARDS: RegExp[] = [
  /\bspent\b/,
  /\bthank you for using\b/,
  /\bpurchase\b/,
  /\b(?:using|via|through|with) (?:your )?(?:[a-z]+ ){0,3}(?:credit ?)?card\b/,
  /\bon upi\b|\bupi (?:payment|txn) (?:to|at)\b/,
  /\bat\s+(?!amt\b)[a-z][a-z0-9&.*' -]{1,40}\b(?:on\b|\.|$)/,
  /\brefund|\breversal|\breversed|\bcashback|\breward/,
  /\bemi\b|\bconverted\b/,
  /\bdeclined|\bfailed|\bstatement\b|\bis due\b|\bdue date\b|\bmin(?:imum)? (?:amount )?due\b/,
];

/**
 * Senders that only ever speak for a credit card (no savings accounts), so a
 * "payment received" from them is always the card side of a bill payment.
 * Add a short sender code here to support another issuer.
 */
const ISSUER_SENDERS = /^(?:SBICRD|SBICARD|SBIPSG|AMEXIN|AMEX|ONECRD|ONECARD|BOBCRD|BOBCARD|SCAPIA|UNICRD|SLICEIT|HSBCCC|CITICC)$/;
const ISSUER_RECEIPT = /\b(?:payment|paid)\b[^;]{0,60}\b(?:received|credited|successful|processed|posted)\b|\breceived\b[^;]{0,30}\bpayment\b/;

/** Masked card number mentioned ("card xx5678", "card ending 5678", "4xxx5678"). */
const CARD_NUMBER = new RegExp(String.raw`\b${CARD}\b[^;]{0,25}?(?:[x*]{2,}\s?\d{3,6}|ending (?:with |in )?[x*]*\d{3,6}|\bno\.? [x*]*\d{4})`);

function normSenderCode(s: string): string {
  return s.toUpperCase().replace(/^[A-Z0-9]{2}-/, '').replace(/-[A-Z]$/, '').replace(/[^A-Z0-9]/g, '');
}

export function detectCardBill(body: string, sender = ''): CardBillMatch | null {
  const t = normalizeForCard(body);
  if (PURCHASE_GUARDS.some((re) => re.test(t))) return null;

  const signals = BILL_SIGNALS.filter((s) => s.re.test(t)).map((s) => s.id);
  if (ISSUER_SENDERS.test(normSenderCode(sender)) && ISSUER_RECEIPT.test(t)) signals.push('issuer-receipt');

  const side: CardBillMatch['side'] = /\bfrom (?:your )?(?:ac|account|savings)\b|\b(?:ac|account)\b[^;]{0,20}\bdebited\b|\bdebited from\b/.test(t)
    ? 'account'
    : /\b(?:received|credited)\b/.test(t)
      ? 'card'
      : undefined;

  if (signals.length) return { level: 'certain', signals, side };

  // Money left an account and the only destination named is a card: probably a bill, but not certain.
  if (/\b(?:debited|transferred|paid)\b/.test(t) && CARD_NUMBER.test(t)) return { level: 'possible', signals: ['debit-to-card-number'], side: 'account' };
  return null;
}

/**
 * For transactions stored before these rules existed (no SMS text is kept),
 * decide from the saved payee fields alone. Deliberately narrow.
 */
export function isCardBillPayee(merchant: string | undefined, merchantRaw: string | undefined): boolean {
  const s = `${merchantRaw ?? ''} ${merchant ?? ''}`.toLowerCase();
  if (!s.trim() || /\brent|\bmint\b|\bcash\b/.test(s)) return false;
  return (
    /(?:^|\s)cred(?:\.club|\s+club)?(?:@|\s|$)/.test(s) ||
    /\bcredit ?card\b[^,;]{0,20}\b(?:bill|payment|dues|outstanding)\b/.test(s) ||
    /\bcc ?(?:bill|payment|pmt)\b/.test(s) ||
    /\bcard ?(?:bill|dues|outstanding)\b/.test(s)
  );
}
