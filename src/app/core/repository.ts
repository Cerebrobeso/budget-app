import { InjectionToken } from '@angular/core';
import { Asset, Category, RecurringRule, SubcategoryOverlay, Transaction } from './models';

/**
 * Contratto di persistenza. Le scritture sono granulari (add/update/remove)
 * per evitare di riscrivere l'intero array a ogni cambiamento — importante
 * per un backend remoto come Supabase, dove significherebbe un upsert
 * dell'intera tabella a ogni modifica.
 */
export interface BudgetRepository {
  loadTransactions(): Promise<Transaction[] | null>;
  addTransaction(tx: Transaction): Promise<void>;
  updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>): Promise<void>;
  removeTransaction(id: string): Promise<void>;

  loadCategories(): Promise<Category[] | null>;
  addCategory(category: Category): Promise<void>;
  updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void>;
  removeCategory(id: string): Promise<void>;

  /** Sottocategorie che un utente aggiunge a una categoria condivisa: private, mai nella jsonb condivisa. */
  loadSubcategoryOverlays(): Promise<SubcategoryOverlay[] | null>;
  addSubcategoryOverlay(overlay: SubcategoryOverlay): Promise<void>;
  updateSubcategoryOverlay(id: string, patch: Partial<Omit<SubcategoryOverlay, 'id'>>): Promise<void>;

  loadAssets(): Promise<Asset[] | null>;
  addAsset(asset: Asset): Promise<void>;
  updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<void>;
  removeAsset(id: string): Promise<void>;

  loadRecurringRules(): Promise<RecurringRule[] | null>;
  addRecurringRule(rule: RecurringRule): Promise<void>;
  updateRecurringRule(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): Promise<void>;
  removeRecurringRule(id: string): Promise<void>;
}

const KEYS = {
  transactions: 'registro.transactions.v1',
  categories: 'registro.categories.v1',
  assets: 'registro.assets.v1',
  recurringRules: 'registro.recurringRules.v1',
  subcategoryOverlays: 'registro.subcategoryOverlays.v1',
} as const;

/** Implementazione locale, usata solo se BUDGET_REPOSITORY non viene sovrascritto altrove. */
export class LocalStorageBudgetRepository implements BudgetRepository {
  private read<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async loadTransactions(): Promise<Transaction[] | null> {
    return this.read<Transaction[]>(KEYS.transactions) ?? [];
  }
  async addTransaction(tx: Transaction): Promise<void> {
    const items = this.read<Transaction[]>(KEYS.transactions) ?? [];
    this.write(KEYS.transactions, [...items, tx]);
  }
  async updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>): Promise<void> {
    const items = this.read<Transaction[]>(KEYS.transactions) ?? [];
    this.write(KEYS.transactions, items.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  async removeTransaction(id: string): Promise<void> {
    const items = this.read<Transaction[]>(KEYS.transactions) ?? [];
    this.write(KEYS.transactions, items.filter((t) => t.id !== id));
  }

  async loadCategories(): Promise<Category[] | null> {
    return this.read<Category[]>(KEYS.categories) ?? [];
  }
  async addCategory(category: Category): Promise<void> {
    const items = this.read<Category[]>(KEYS.categories) ?? [];
    this.write(KEYS.categories, [...items, category]);
  }
  async updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void> {
    const items = this.read<Category[]>(KEYS.categories) ?? [];
    this.write(KEYS.categories, items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  async removeCategory(id: string): Promise<void> {
    const items = this.read<Category[]>(KEYS.categories) ?? [];
    this.write(KEYS.categories, items.filter((c) => c.id !== id));
  }

  async loadSubcategoryOverlays(): Promise<SubcategoryOverlay[] | null> {
    return this.read<SubcategoryOverlay[]>(KEYS.subcategoryOverlays) ?? [];
  }
  async addSubcategoryOverlay(overlay: SubcategoryOverlay): Promise<void> {
    const items = this.read<SubcategoryOverlay[]>(KEYS.subcategoryOverlays) ?? [];
    this.write(KEYS.subcategoryOverlays, [...items, overlay]);
  }
  async updateSubcategoryOverlay(id: string, patch: Partial<Omit<SubcategoryOverlay, 'id'>>): Promise<void> {
    const items = this.read<SubcategoryOverlay[]>(KEYS.subcategoryOverlays) ?? [];
    this.write(KEYS.subcategoryOverlays, items.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  async loadAssets(): Promise<Asset[] | null> {
    return this.read<Asset[]>(KEYS.assets) ?? [];
  }
  async addAsset(asset: Asset): Promise<void> {
    const items = this.read<Asset[]>(KEYS.assets) ?? [];
    this.write(KEYS.assets, [...items, asset]);
  }
  async updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<void> {
    const items = this.read<Asset[]>(KEYS.assets) ?? [];
    this.write(KEYS.assets, items.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async removeAsset(id: string): Promise<void> {
    const items = this.read<Asset[]>(KEYS.assets) ?? [];
    this.write(KEYS.assets, items.filter((a) => a.id !== id));
  }

  async loadRecurringRules(): Promise<RecurringRule[] | null> {
    return this.read<RecurringRule[]>(KEYS.recurringRules) ?? [];
  }
  async addRecurringRule(rule: RecurringRule): Promise<void> {
    const items = this.read<RecurringRule[]>(KEYS.recurringRules) ?? [];
    this.write(KEYS.recurringRules, [...items, rule]);
  }
  async updateRecurringRule(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): Promise<void> {
    const items = this.read<RecurringRule[]>(KEYS.recurringRules) ?? [];
    this.write(KEYS.recurringRules, items.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async removeRecurringRule(id: string): Promise<void> {
    const items = this.read<RecurringRule[]>(KEYS.recurringRules) ?? [];
    this.write(KEYS.recurringRules, items.filter((r) => r.id !== id));
  }
}

export const BUDGET_REPOSITORY = new InjectionToken<BudgetRepository>('BUDGET_REPOSITORY', {
  providedIn: 'root',
  factory: () => new LocalStorageBudgetRepository(),
});
