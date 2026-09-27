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
