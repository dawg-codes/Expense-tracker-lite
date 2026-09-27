import type { CategoryDef } from './types';

/**
 * Built-in categories. Ids are the original v2 category names so existing
 * stored transactions keep working unchanged.
 */
export const BUILTIN_CATEGORIES: CategoryDef[] = [
  { id: 'Food', label: 'Food', emoji: '🍔', color: '#f59e0b', nature: 'discretionary' },
  { id: 'Groceries', label: 'Groceries', emoji: '🛒', color: '#84cc16', nature: 'discretionary' },
  { id: 'Home', label: 'Home', emoji: '🏠', color: '#10b981' },
  { id: 'EMI', label: 'EMI', emoji: '💳', color: '#8b5cf6', nature: 'committed' },
  { id: 'Transport', label: 'Transport', emoji: '⛽', color: '#3b82f6', nature: 'discretionary' },
  { id: 'Shopping', label: 'Shopping', emoji: '🛍️', color: '#ec4899', nature: 'discretionary' },
  { id: 'Bills', label: 'Bills', emoji: '💡', color: '#06b6d4', nature: 'committed' },
  { id: 'Subscriptions', label: 'Subscriptions', emoji: '📺', color: '#e11d48', nature: 'committed' },
  { id: 'Insurance', label: 'Insurance', emoji: '🛡️', color: '#0ea5e9', nature: 'committed' },
  { id: 'Health', label: 'Health', emoji: '🏥', color: '#ef4444' },
  { id: 'Education', label: 'Education', emoji: '🎓', color: '#eab308', nature: 'committed' },
  { id: 'Family', label: 'Family', emoji: '👨‍👩‍👧', color: '#f97316' },
  { id: 'Travel', label: 'Travel', emoji: '✈️', color: '#6366f1', nature: 'discretionary' },
  { id: 'Entertainment', label: 'Entertainment', emoji: '🎬', color: '#a855f7', nature: 'discretionary' },
  { id: 'Finance', label: 'Finance', emoji: '💰', color: '#14b8a6' },
  { id: 'Income', label: 'Income', emoji: '⬇️', color: '#22c55e' },
  { id: 'Other', label: 'Other', emoji: '📦', color: '#64748b' },
];

export const BUILTIN_IDS = new Set(BUILTIN_CATEGORIES.map((c) => c.id));

export const CUSTOM_COLORS = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#94a3b8'];

export type CategoryMap = Map<string, CategoryDef>;

export function buildCategoryMap(custom: CategoryDef[]): CategoryMap {
  const map: CategoryMap = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, c]));
  for (const c of custom) if (!map.has(c.id)) map.set(c.id, { ...c, custom: true });
  return map;
}

const FALLBACK = BUILTIN_CATEGORIES[BUILTIN_CATEGORIES.length - 1];

/** Unknown/deleted categories resolve to "Other" instead of crashing. */
export function catMeta(map: CategoryMap, id: string): CategoryDef {
  return map.get(id) ?? FALLBACK;
}

export function newCategoryId(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'cat';
  return `c_${slug}_${Date.now().toString(36)}`;
}
