import { createContext, useContext } from 'react';
import type { Analysis } from '../lib/analyze';
import type { CategoryMap } from '../lib/categories';
import type { Period } from '../lib/dates';
import type { SyncSummary } from '../lib/learning';
import type { Budgets, CategoryDef, MerchantRule, TxnOverrides, TxnType, TxnView } from '../lib/types';

export type Tab = 'home' | 'activity' | 'insights' | 'review' | 'more';

export { EMPTY_FILTER, type ActivityFilter } from '../lib/activity';
import type { ActivityFilter } from '../lib/activity';

export interface ToastAction {
  label: string;
  run: () => void;
}

/** A reversible decision, shown in Review's "Recently reviewed" list. */
export interface Decision {
  id: number;
  label: string;
  txnIds: string[];
}

export type OverridePatch = (prev: TxnOverrides | undefined) => TxnOverrides | undefined;

export interface AppCtx {
  analysis: Analysis;
  cats: CategoryMap;
  /** Categories in display order (built-in, then custom). */
  catList: CategoryDef[];
  rules: MerchantRule[];
  budgets: Budgets;
  period: Period;
  setPeriod: (p: Period) => void;
  maskIncome: boolean;
  reduce: boolean;
  decisions: Decision[];

  go: (tab: Tab, filter?: Partial<ActivityFilter>) => void;
  openTxn: (id: string) => void;
  toast: (message: string, type?: 'error' | 'success' | 'info', action?: ToastAction) => void;
  /** Applies a change to transactions' user overrides, with an Undo toast. */
  decide: (ids: string[], patch: OverridePatch, label: string, nextRules?: MerchantRule[]) => void;
  /** Correct transactions and (optionally) learn a rule for the payee. */
  learn: (ids: string[], sample: TxnView, change: { category?: string; type?: TxnType }, applyToAll: boolean, label: string) => void;
  syncSummary: SyncSummary | null;
  dismissSyncSummary: () => void;
  /** Detection rules improved since the last sync: a sync will re-check stored transactions. */
  rulesOutdated: boolean;
  sync: () => void;
  syncing: boolean;
  undo: (decisionId: number) => void;
  saveRule: (rule: MerchantRule) => void;
  deleteRule: (id: string) => void;
  saveCategory: (c: CategoryDef) => void;
  deleteCategory: (id: string) => void;
  setBudgets: (b: Budgets) => void;
  dismissRecurring: (key: string) => void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** Merges override fields; returns undefined when nothing remains. */
export function mergeUser(prev: TxnOverrides | undefined, patch: Partial<TxnOverrides>): TxnOverrides | undefined {
  const next: TxnOverrides = { ...prev, ...patch };
  for (const k of Object.keys(next) as (keyof TxnOverrides)[]) {
    if (next[k] === undefined || next[k] === false) delete next[k];
  }
  return Object.keys(next).length ? next : undefined;
}

export const dismissFlag = (prev: TxnOverrides | undefined, kind: NonNullable<TxnOverrides['dismissed']>[number]) =>
  mergeUser(prev, { dismissed: [...new Set([...(prev?.dismissed ?? []), kind])] });
