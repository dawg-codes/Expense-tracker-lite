/**
 * Merchant normalisation.
 *
 * Each rule maps any spelling of a merchant ("SWIGGY", "Swiggy Instamart",
 * "SWIGGY*ONLINE", "swiggy@icici") to one display name and a default
 * category. To support a new merchant, add one line to KNOWN_MERCHANTS.
 * Order matters: more specific patterns go first (Prime Video before Amazon).
 */

export interface KnownMerchant {
  name: string;
  pattern: RegExp;
  category: string;
}

const m = (name: string, pattern: RegExp, category: string): KnownMerchant => ({ name, pattern, category });

export const KNOWN_MERCHANTS: KnownMerchant[] = [
  // subscriptions (before their parent brands)
  m('Prime Video', /\b(?:amazon ?prime|prime ?video)\b/, 'Subscriptions'),
  m('Netflix', /\bnetflix/, 'Subscriptions'),
  m('Spotify', /\bspotify/, 'Subscriptions'),
  m('Disney+ Hotstar', /\b(?:hotstar|disney)/, 'Subscriptions'),
  m('YouTube Premium', /\byoutube/, 'Subscriptions'),
  m('Google Play', /\bgoogle ?play|\bplay ?store/, 'Subscriptions'),
  m('Apple', /\bapple\.com|\bitunes/, 'Subscriptions'),
  // food & groceries
  m('Swiggy', /\bswiggy|\binstamart/, 'Food'),
  m('Zomato', /\bzomato/, 'Food'),
  m("Domino's", /\bdomino/, 'Food'),
  m("McDonald's", /\bmc ?donald/, 'Food'),
  m('KFC', /\bkfc\b/, 'Food'),
  m('Starbucks', /\bstarbucks/, 'Food'),
  m('Blinkit', /\b(?:blinkit|grofers)/, 'Groceries'),
  m('Zepto', /\bzepto/, 'Groceries'),
  m('BigBasket', /\bbig ?basket|\bbbnow\b/, 'Groceries'),
  m('DMart', /\bd ?mart\b|avenue supermarts/, 'Groceries'),
  // shopping
  m('Amazon', /\bamazon|\bamzn/, 'Shopping'),
  m('Flipkart', /\bflipkart/, 'Shopping'),
  m('Myntra', /\bmyntra/, 'Shopping'),
  m('Ajio', /\bajio\b/, 'Shopping'),
  m('Meesho', /\bmeesho/, 'Shopping'),
  m('Nykaa', /\bnykaa/, 'Shopping'),
  // transport & fuel
  m('Uber', /\buber\b/, 'Transport'),
  m('Ola', /\bola\b|\bolacabs|\bola ?cabs/, 'Transport'),
  m('Rapido', /\brapido/, 'Transport'),
  m('Bharat Gas', /\bbharat ?gas/, 'Bills'),
  m('Indian Oil', /\biocl?\b|indian ?oil/, 'Transport'),
  m('HP Petrol', /\bhpcl\b|hindustan petroleum/, 'Transport'),
  m('Bharat Petroleum', /\bbpcl\b|bharat petroleum/, 'Transport'),
  m('Shell', /\bshell\b/, 'Transport'),
  m('FASTag', /\bfastag/, 'Transport'),
  // travel
  m('IRCTC', /\birctc/, 'Travel'),
  m('MakeMyTrip', /\bmake ?my ?trip|\bmmt\b/, 'Travel'),
  m('Goibibo', /\bgoibibo/, 'Travel'),
  m('IndiGo', /\bindigo\b|interglobe/, 'Travel'),
  m('Air India', /\bair ?india/, 'Travel'),
  m('redBus', /\bredbus/, 'Travel'),
  // entertainment
  m('BookMyShow', /\bbook ?my ?show|\bbms\b/, 'Entertainment'),
  m('PVR INOX', /\bpvr\b|\binox\b/, 'Entertainment'),
  // telecom & utilities
  m('Jio', /\bjio\b|reliance ?jio/, 'Bills'),
  m('Airtel', /\bairtel/, 'Bills'),
  m('Vi', /\bvodafone|\bvodaidea|\bvi ?postpaid|\bvi ?prepaid/, 'Bills'),
  m('BSNL', /\bbsnl\b/, 'Bills'),
  m('ACT Fibernet', /\bact ?fibernet/, 'Bills'),
  m('Tata Play', /\btata ?(?:play|sky)/, 'Bills'),
  m('BESCOM', /\bbescom/, 'Bills'),
  m('TNEB', /\btneb\b|tangedco/, 'Bills'),
  m('MSEDCL', /\bmsedcl|mahadiscom/, 'Bills'),
  m('BSES', /\bbses\b/, 'Bills'),
  m('Tata Power', /\btata ?power/, 'Bills'),
  m('Adani Electricity', /\badani ?electricity/, 'Bills'),
  m('Indane', /\bindane/, 'Bills'),
  m('HP Gas', /\bhp ?gas\b/, 'Bills'),
  // insurance
  m('LIC', /\blic\b|life insurance corp/, 'Insurance'),
  m('HDFC Life', /\bhdfc ?life/, 'Insurance'),
  m('ICICI Prudential', /\bicici ?pru/, 'Insurance'),
  m('SBI Life', /\bsbi ?life/, 'Insurance'),
  m('Star Health', /\bstar ?health/, 'Insurance'),
  m('Niva Bupa', /\bniva ?bupa|\bmax ?bupa/, 'Insurance'),
  m('Care Health', /\bcare ?health/, 'Insurance'),
  m('HDFC ERGO', /\bhdfc ?ergo/, 'Insurance'),
  m('Bajaj Allianz', /\bbajaj ?allianz/, 'Insurance'),
  m('Tata AIG', /\btata ?aig/, 'Insurance'),
  m('Acko', /\backo\b/, 'Insurance'),
  m('Digit Insurance', /\bgo ?digit|\bdigit ?insurance/, 'Insurance'),
  // health
  m('Apollo', /\bapollo/, 'Health'),
  m('PharmEasy', /\bpharm ?easy/, 'Health'),
  m('Tata 1mg', /\b1mg\b/, 'Health'),
  m('Netmeds', /\bnetmeds/, 'Health'),
  // investing
  m('Zerodha', /\bzerodha/, 'Finance'),
  m('Groww', /\bgroww/, 'Finance'),
  m('Upstox', /\bupstox/, 'Finance'),
  // cash
  m('Cash withdrawal', /\batm\b|cash withdrawal/, 'Other'),
];

/** Payment rails and aggregators: not the actual merchant. */
const INTERMEDIARY = /^(?:paytm|phonepe|gpay|google ?pay|bhim|razorpay|raz|payu|pyu|cca|ccavenue|billdesk|bd|cashfree|upi|imps|neft|rtgs|pos|ecom|vpa)$/i;

/** Words that are never a payee. */
const NOT_A_NAME =
  /^(?:your|you|a\/?c|ac|acct|account|bank|card|credit card|debit card|self|beneficiary|merchant|mobile|wallet|the|on|ref|info|txn|null|na|n\/a)$/i;

const NOISE_WORDS =
  /\b(?:pvt|private|ltd|limited|llp|inc|com)\b\.?/gi;

export function findKnown(text: string): KnownMerchant | undefined {
  const s = text.toLowerCase();
  for (const k of KNOWN_MERCHANTS) if (k.pattern.test(s)) return k;
  return undefined;
}

function titleCase(s: string): string {
  const alreadyMixed = /[a-z]/.test(s) && /[A-Z]/.test(s);
  if (alreadyMixed) return s;
  return s.toLowerCase().replace(/(^|[\s&(/-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/**
 * Turns a raw payee fragment into a readable name, or undefined if it is not
 * a usable name (a bare VPA of digits, "your a/c", a payment rail…).
 */
export function cleanMerchant(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  if (/^(?:your|ur)\b/i.test(s)) return undefined;

  // phone-number VPA ("••3210@ybl" after masking): a person
  if (/^[•*x]+\d{2,4}@/i.test(s)) return `UPI ••${s.match(/(\d{2,4})@/)![1]}`;
  // VPA like "swiggy@icici" or "john.doe-1@okaxis": keep the handle
  const vpa = s.match(/^([a-z0-9._-]+)@[a-z]+$/i);
  if (vpa) {
    s = vpa[1].replace(/[._-]+/g, ' ');
    if (/^\d/.test(s) || /^(?:paytmqr|q\d|bharatpe|mab)/i.test(s)) return undefined;
  }

  // "RAZ*MURUGAN STORES", "SWIGGY*ONLINE": drop the aggregator / suffix part
  if (s.includes('*')) {
    const parts = s.split('*').map((p) => p.trim()).filter(Boolean);
    s = parts.length > 1 && INTERMEDIARY.test(parts[0]) ? parts[1] : parts[0] ?? '';
  }

  s = s
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(NOISE_WORDS, ' ')
    .replace(/[^\w&.' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.'-]+|[\s.'-]+$/g, '')
    .trim();

  if (s.length < 2 || s.length > 40) return undefined;
  if (!/[a-z]{2}/i.test(s)) return undefined;
  if (NOT_A_NAME.test(s) || INTERMEDIARY.test(s)) return undefined;
  return titleCase(s);
}

export interface NormalizedMerchant {
  name?: string;
  known: boolean;
  category?: string;
}

/**
 * Resolves a payee fragment to a known merchant, falling back to a cleaned
 * version of the fragment. `context` (the lowercased message) is only used to
 * spot known brands when no fragment could be extracted.
 */
export function normalizeMerchant(raw: string | undefined, context?: string): NormalizedMerchant {
  const known = (raw && findKnown(raw)) || (context ? findKnown(context) : undefined);
  if (known) return { name: known.name, known: true, category: known.category };
  const name = cleanMerchant(raw);
  return { name, known: false };
}

/** Stable key for grouping (recurring detection, refund matching). */
export function merchantKey(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return k.length >= 2 ? k : undefined;
}

/* ---------- name-based inference ---------- */

export const KNOWN_NAMES = new Set(KNOWN_MERCHANTS.map((k) => k.name));

/** Business words in payee names → category. Checked on the payee name only, never the SMS. */
const NAME_HINTS: Array<[string, RegExp]> = [
  ['Groceries', /\b(?:stores?|kirana|provisions?|super ?market|mart|grocer(?:y|ies)|general store|departmental|vegetables?|fruits?|dairy|milk)\b/],
  ['Food', /\b(?:hotel|restaurants?|cafe|caf[eé]|bakery|bakers|sweets?|biryani|dhaba|mess|canteen|tea|coffee|juice|foods?|kitchen|pizza|chicken)\b/],
  ['Health', /\b(?:medicals?|pharma(?:cy)?|chemists?|clinic|hospitals?|diagnostics?|labs?|dental|health ?care)\b/],
  ['Transport', /\b(?:fuels?|petroleum|petrol|filling station|service station|auto|parking|travels)\b/],
  ['Home', /\b(?:hardware|electricals|furnitures?|interiors?|plumbing|paints?|rent)\b/],
  ['Shopping', /\b(?:textiles?|garments|fashions?|footwear|silks?|jewell?ers?|mobiles?|electronics|boutique)\b/],
  ['Education', /\b(?:school|college|academy|tuitions?|institute|coaching)\b/],
];

const GLUED_HINTS: Array<[string, RegExp]> = [
  ['Groceries', /(?:stores?|kirana|mart|provisions?|supermarket)$/],
  ['Food', /(?:hotel|restaurant|cafe|bakery|sweets|biryani|foods)$/],
  ['Health', /(?:medicals?|pharmacy|chemists?|clinic|hospital)$/],
];

/** Words that make a name look like a business rather than a person. */
const BUSINESS = /\b(?:enterprises?|traders?|trading|agenc(?:y|ies)|services?|solutions?|industries|associates|co|company|corporation|centre|center|shop|point|world|house|zone|hub|india|pvt|ltd|llp|bank|payments?|technologies)\b/;

/** Personal UPI handles (@okaxis, @ybl…) vs merchant QR codes. */
const PERSONAL_VPA = /@(?:ok(?:axis|sbi|icici|hdfcbank)|ybl|ibl|axl|apl|upi|paytm)$/i;

export interface NameInference {
  category: string;
  reason: string;
}

/**
 * Guesses a category from a payee name for payments the parser couldn't place.
 * Conservative: returns undefined when the name gives no real signal.
 */
export function inferCategoryFromName(name: string | undefined, raw: string | undefined): NameInference | undefined {
  if (!name || KNOWN_NAMES.has(name)) return undefined;
  const n = name.toLowerCase();
  const hint = (category: string) => ({ category, reason: `“${name}” looks like a ${category.toLowerCase()} business` });
  for (const [category, re] of NAME_HINTS) if (re.test(n)) return hint(category);
  // glued VPA handles: "srilakshmistores", "annapoornahotel"
  const compact = n.replace(/[^a-z]/g, '');
  for (const [category, re] of GLUED_HINTS) if (re.test(compact)) return hint(category);
  if (BUSINESS.test(n) || /(?:enterprises?|traders|agency|services)$/.test(compact)) return undefined;

  if (/^UPI ••\d+$/.test(name)) return { category: 'People', reason: 'UPI payment to a phone number' };
  const personalVpa = !!raw && raw.includes('@') && PERSONAL_VPA.test(raw) && !/\d{3,}/.test(raw.split('@')[0]);
  // 1–3 purely alphabetic words, e.g. "Rahul Kumar", "Priya S", "Anand R"
  const words = name.split(/\s+/);
  const personShape = words.length >= 2 && words.length <= 3 && words.every((w) => /^[a-z]{1,15}\.?$/i.test(w)) && words.some((w) => w.length >= 3);
  const fromUpiName = !!raw && !raw.includes('@');
  if (personShape && (personalVpa || fromUpiName)) return { category: 'People', reason: 'Looks like a payment to a person' };
  return undefined;
}
