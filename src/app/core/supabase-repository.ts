import { Injectable } from '@angular/core';
import { Asset, Category, RecurringRule, Transaction } from './models';
import { BudgetRepository } from './repository';
import { supabase } from './supabase.client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Le scritture Supabase non lanciano da sole sull'errore restituito: lo facciamo qui,
 * così i chiamanti (gli store) possono fare .catch() e annullare l'update ottimistico. */
async function checkWrite(result: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await result;
  if (error) throw new Error(error.message);
}

function txToRow(tx: Transaction) {
  return {
    id: tx.id,
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    category_id: tx.categoryId,
    subcategory_id: tx.subcategoryId,
    description: tx.description,
    recurring_rule_id: tx.recurringRuleId,
  };
}
function rowToTx(row: any): Transaction {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    description: row.description ?? '',
    recurringRuleId: row.recurring_rule_id ?? null,
  };
}
function txPatchToRow(patch: Partial<Omit<Transaction, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.date !== undefined) row['date'] = patch.date;
  if (patch.type !== undefined) row['type'] = patch.type;
  if (patch.amount !== undefined) row['amount'] = patch.amount;
  if (patch.categoryId !== undefined) row['category_id'] = patch.categoryId;
  if (patch.subcategoryId !== undefined) row['subcategory_id'] = patch.subcategoryId;
  if (patch.description !== undefined) row['description'] = patch.description;
  if (patch.recurringRuleId !== undefined) row['recurring_rule_id'] = patch.recurringRuleId;
  return row;
}

function recurringToRow(rule: RecurringRule) {
  return {
    id: rule.id,
    type: rule.type,
    amount: rule.amount,
    category_id: rule.categoryId,
    subcategory_id: rule.subcategoryId,
    description: rule.description,
    day_of_month: rule.dayOfMonth,
    start_date: rule.startDate,
    archived: rule.archived ?? false,
    start_occurrence: rule.startOccurrence ?? null,
    total_occurrences: rule.totalOccurrences ?? null,
  };
}
function rowToRecurring(row: any): RecurringRule {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    description: row.description ?? '',
    dayOfMonth: row.day_of_month,
    startDate: row.start_date,
    archived: row.archived ?? undefined,
    startOccurrence: row.start_occurrence ?? undefined,
    totalOccurrences: row.total_occurrences ?? undefined,
  };
}
function recurringPatchToRow(patch: Partial<Omit<RecurringRule, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.type !== undefined) row['type'] = patch.type;
  if (patch.amount !== undefined) row['amount'] = patch.amount;
  if (patch.categoryId !== undefined) row['category_id'] = patch.categoryId;
  if (patch.subcategoryId !== undefined) row['subcategory_id'] = patch.subcategoryId;
  if (patch.description !== undefined) row['description'] = patch.description;
  if (patch.dayOfMonth !== undefined) row['day_of_month'] = patch.dayOfMonth;
  if (patch.startDate !== undefined) row['start_date'] = patch.startDate;
  if (patch.archived !== undefined) row['archived'] = patch.archived;
  if (patch.startOccurrence !== undefined) row['start_occurrence'] = patch.startOccurrence;
  if (patch.totalOccurrences !== undefined) row['total_occurrences'] = patch.totalOccurrences;
  return row;
}

function catToRow(cat: Category) {
  return {
    id: cat.id,
    name: cat.name,
    kind: cat.kind,
    color: cat.color,
    archived: cat.archived ?? false,
    subcategories: cat.subcategories,
  };
}
function rowToCat(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    archived: row.archived ?? undefined,
    subcategories: row.subcategories ?? [],
  };
}
function catPatchToRow(patch: Partial<Omit<Category, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row['name'] = patch.name;
  if (patch.kind !== undefined) row['kind'] = patch.kind;
  if (patch.color !== undefined) row['color'] = patch.color;
  if (patch.archived !== undefined) row['archived'] = patch.archived;
  if (patch.subcategories !== undefined) row['subcategories'] = patch.subcategories;
  return row;
}

function assetToRow(asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    archived: asset.archived ?? false,
    snapshots: asset.snapshots,
  };
}
function rowToAsset(row: any): Asset {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    archived: row.archived ?? undefined,
    snapshots: row.snapshots ?? [],
  };
}
function assetPatchToRow(patch: Partial<Omit<Asset, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row['name'] = patch.name;
  if (patch.category !== undefined) row['category'] = patch.category;
  if (patch.archived !== undefined) row['archived'] = patch.archived;
  if (patch.snapshots !== undefined) row['snapshots'] = patch.snapshots;
  return row;
}

/**
 * Backend Supabase per BudgetRepository. Le scritture sono granulari
 * (insert/update/delete per riga) — mai un upsert dell'intera tabella.
 * user_id non è mai incluso nei payload: lo popola il db (default/trigger
 * su auth.uid()), protetto da RLS in lettura/scrittura.
 */
@Injectable()
export class SupabaseBudgetRepository implements BudgetRepository {
  async loadTransactions(): Promise<Transaction[] | null> {
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: true });
    if (error || !data) return null;
    return data.map(rowToTx);
  }
  async addTransaction(tx: Transaction): Promise<void> {
    await checkWrite(supabase.from('transactions').insert(txToRow(tx)));
  }
  async updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>): Promise<void> {
    await checkWrite(supabase.from('transactions').update(txPatchToRow(patch)).eq('id', id));
  }
  async removeTransaction(id: string): Promise<void> {
    await checkWrite(supabase.from('transactions').delete().eq('id', id));
  }

  async loadCategories(): Promise<Category[] | null> {
    const { data, error } = await supabase.from('categories').select('*');
    if (error || !data) return null;
    return data.map(rowToCat);
  }
  async addCategory(category: Category): Promise<void> {
    await checkWrite(supabase.from('categories').insert(catToRow(category)));
  }
  async updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void> {
    await checkWrite(supabase.from('categories').update(catPatchToRow(patch)).eq('id', id));
  }

  async loadAssets(): Promise<Asset[] | null> {
    const { data, error } = await supabase.from('assets').select('*');
    if (error || !data) return null;
    return data.map(rowToAsset);
  }
  async addAsset(asset: Asset): Promise<void> {
    await checkWrite(supabase.from('assets').insert(assetToRow(asset)));
  }
  async updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<void> {
    await checkWrite(supabase.from('assets').update(assetPatchToRow(patch)).eq('id', id));
  }
  async removeAsset(id: string): Promise<void> {
    await checkWrite(supabase.from('assets').delete().eq('id', id));
  }

  async loadRecurringRules(): Promise<RecurringRule[] | null> {
    const { data, error } = await supabase.from('recurring_rules').select('*');
    if (error || !data) return null;
    return data.map(rowToRecurring);
  }
  async addRecurringRule(rule: RecurringRule): Promise<void> {
    await checkWrite(supabase.from('recurring_rules').insert(recurringToRow(rule)));
  }
  async updateRecurringRule(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): Promise<void> {
    await checkWrite(supabase.from('recurring_rules').update(recurringPatchToRow(patch)).eq('id', id));
  }
  async removeRecurringRule(id: string): Promise<void> {
    await checkWrite(supabase.from('recurring_rules').delete().eq('id', id));
  }
}
