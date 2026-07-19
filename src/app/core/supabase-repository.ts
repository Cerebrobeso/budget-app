import { Injectable } from '@angular/core';
import { Asset, Category, Transaction } from './models';
import { BudgetRepository } from './repository';
import { supabase } from './supabase.client';

/* eslint-disable @typescript-eslint/no-explicit-any */

function txToRow(tx: Transaction) {
  return {
    id: tx.id,
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    category_id: tx.categoryId,
    subcategory_id: tx.subcategoryId,
    description: tx.description,
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
    await supabase.from('transactions').insert(txToRow(tx));
  }
  async updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>): Promise<void> {
    await supabase.from('transactions').update(txPatchToRow(patch)).eq('id', id);
  }
  async removeTransaction(id: string): Promise<void> {
    await supabase.from('transactions').delete().eq('id', id);
  }

  async loadCategories(): Promise<Category[] | null> {
    const { data, error } = await supabase.from('categories').select('*');
    if (error || !data) return null;
    return data.map(rowToCat);
  }
  async addCategory(category: Category): Promise<void> {
    await supabase.from('categories').insert(catToRow(category));
  }
  async updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void> {
    await supabase.from('categories').update(catPatchToRow(patch)).eq('id', id);
  }

  async loadAssets(): Promise<Asset[] | null> {
    const { data, error } = await supabase.from('assets').select('*');
    if (error || !data) return null;
    return data.map(rowToAsset);
  }
  async addAsset(asset: Asset): Promise<void> {
    await supabase.from('assets').insert(assetToRow(asset));
  }
  async updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<void> {
    await supabase.from('assets').update(assetPatchToRow(patch)).eq('id', id);
  }
  async removeAsset(id: string): Promise<void> {
    await supabase.from('assets').delete().eq('id', id);
  }
}
