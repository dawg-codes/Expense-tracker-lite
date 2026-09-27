/**
 * Core data model.
 *
 * PRIVACY: nothing in here holds SMS message text. A `Txn` keeps only the
 * structured facts extracted from a message. Storage goes through
 * `sanitizeTxn` (storage.ts), which whitelists these fields, so a stray
 * `body` can never reach localStorage or a backup file.
 */

/** Which way money moved on the account, exactly as the SMS reported it. */
export type Direction = 'debit' | 'credit';

/** What the movement means for your spending. */
export type TxnType = 'expense' | 'income' | 'transfer' | 'refund' | 'card_payment' | 'unknown';

/** Hints picked up from message wording, used by the analysis pass. */
export type ParseTag =
  | 'self' // "to self", "own account" wording
  | 'refund' // refund / reversal wording
  | 'card' // paid with a card
  | 'cc' // credit-card specific wording
  | 'cc_bill' // payment towards a credit-card bill
  | 'emi' // EMI / loan instalment wording
  | 'autopay' // mandate / standing instruction
  | 'rail' // IMPS / NEFT / RTGS wording
  | 'weak'; // only abbreviated/weak debit/credit words

/** Choices the user made. Always wins over automatic detection. */
export interface TxnOverrides {
  type?: TxnType;
  category?: string;
  merchant?: string;
  /** Leave out of all totals and charts. */
  excluded?: boolean;
  /** User looked at this and confirmed it. Clears low-confidence review. */
  reviewed?: boolean;
  /** "This is not a duplicate": count it even if dedupe would drop it. */
  notDuplicate?: boolean;
  /** Review flags the user dismissed ("not a transfer", "not a refund"…). */
  dismissed?: FlagKind[];
  /** Manually linked transfer leg / refunded expense. */
  linkedId?: string;
}

export interface Txn {
  id: string;
  direction: Direction;
  /** Parser's classification. The effective type also considers overrides and pairing. */
  type: TxnType;
  amount: number;
  /** Epoch milliseconds. */
  date: number;
  /** Category id (built-in name like "Food", or a custom id). */
  category: string;
  /** Normalised merchant/payee display name, e.g. "Swiggy". */
  merchant?: string;
  /** The short payee fragment as written in the alert, e.g. "SWIGGY*ONLINE". Kept for review/debugging. */
  merchantRaw?: string;
  /** SMS sender id, e.g. "VM-HDFCBK". */
  sender: string;
  /** Masked account/card tail as printed in the alert, e.g. "XX1234". */
  account?: string;
  /** The other account named in the alert ("IMPS to A/c XX9876"), masked. */
  counterAccount?: string;
  /** UPI / NEFT / IMPS reference number. */
  ref?: string;
  /** One-way hash of the normalised message, used only for duplicate detection. */
  fp: string;
  /** 0 → 1. A coarse heuristic, not a probability. */
  confidence: number;
  tags?: ParseTag[];
  user?: TxnOverrides;
}

export type FlagKind = 'duplicate' | 'transfer' | 'refund' | 'uncategorised' | 'unknown_type' | 'low_confidence' | 'card_payment';

export interface Flag {
  kind: FlagKind;
  /** Related transaction (duplicate original, transfer leg, refunded expense). */
  relatedId?: string;
  note?: string;
}

/** A transaction after rules, overrides and cross-transaction analysis. Never persisted. */
export interface TxnView extends Txn {
  kind: TxnType;
  cat: string;
  name: string;
  excluded: boolean;
  /** Set when this is a duplicate alert of another transaction. */
  dupOf?: string;
  dupReason?: string;
  /** Transfer counterpart or refunded expense. */
  linkedId?: string;
  /** Recurring series key, when part of a detected series. */
  recurringKey?: string;
  /** Matched a user merchant rule. */
  ruleId?: string;
  /** The category came from that rule. */
  catByRule?: boolean;
  /** Category guessed from the payee name (e.g. "… STORES" → Groceries, a person's name → People). */
  inferred?: boolean;
  /** Short explanation of what was resolved automatically, e.g. "Own-account transfer to XX9876". */
  autoNote?: string;
  /** high = certain, medium = resolved by heuristics, review = needs the user. */
  tier: 'high' | 'medium' | 'review';
  flags: Flag[];
  /** Counts towards totals. */
  counted: boolean;
}

export interface CategoryDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  /** committed = fixed obligations; discretionary = day-to-day choices. */
  nature?: 'committed' | 'discretionary';
  custom?: boolean;
}

export interface MerchantRule {
  id: string;
  /** Case-insensitive whole-word match against the merchant/payee. */
  match: string;
  /** Category to apply. Optional when the rule only sets a type. */
  category?: string;
  /** Classify matching transactions as this type (e.g. transfer, refund). */
  type?: TxnType;
  /** Only apply to money going out / coming in. */
  direction?: Direction;
  /** Optional display name, e.g. "Murugan Stores". */
  rename?: string;
  /** Created automatically from one of your corrections. */
  learned?: boolean;
}

export interface Budgets {
  /** Monthly total budget. */
  total?: number;
  /** Monthly budget per category id. */
  categories: Record<string, number>;
}

export interface RawSms {
  id?: string | number;
  _id?: string | number;
  address?: string;
  sender?: string;
  body?: string;
  date?: string | number;
}
