import { InjectionToken } from '@angular/core';
import { Asset, Category, Transaction } from './models';
import { SEED_ASSETS, SEED_CATEGORIES, SEED_TRANSACTIONS } from './seed-data';

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

  loadAssets(): Promise<Asset[] | null>;
  addAsset(asset: Asset): Promise<void>;
  updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<void>;
  removeAsset(id: string): Promise<void>;
}

const KEYS = {
  transactions: 'registro.transactions.v1',
  categories: 'registro.categories.v1',
  assets: 'registro.assets.v1',
} as const;

/** Implementazione locale: il fallback ai dati di seed vive qui, non negli store. */
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
    return this.read<Transaction[]>(KEYS.transactions) ?? SEED_TRANSACTIONS;
  }
  async addTransaction(tx: Transaction): Promise<void> {
    const items = this.read<Transaction[]>(KEYS.transactions) ?? SEED_TRANSACTIONS;
    this.write(KEYS.transactions, [...items, tx]);
  }
  async updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>): Promise<void> {
    const items = this.read<Transaction[]>(KEYS.transactions) ?? SEED_TRANSACTIONS;
    this.write(KEYS.transactions, items.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  async removeTransaction(id: string): Promise<void> {
    const items = this.read<Transaction[]>(KEYS.transactions) ?? SEED_TRANSACTIONS;
    this.write(KEYS.transactions, items.filter((t) => t.id !== id));
  }

  async loadCategories(): Promise<Category[] | null> {
    return this.read<Category[]>(KEYS.categories) ?? SEED_CATEGORIES;
  }
  async addCategory(category: Category): Promise<void> {
    const items = this.read<Category[]>(KEYS.categories) ?? SEED_CATEGORIES;
    this.write(KEYS.categories, [...items, category]);
  }
  async updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void> {
    const items = this.read<Category[]>(KEYS.categories) ?? SEED_CATEGORIES;
    this.write(KEYS.categories, items.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async loadAssets(): Promise<Asset[] | null> {
    return this.read<Asset[]>(KEYS.assets) ?? SEED_ASSETS;
  }
  async addAsset(asset: Asset): Promise<void> {
    const items = this.read<Asset[]>(KEYS.assets) ?? SEED_ASSETS;
    this.write(KEYS.assets, [...items, asset]);
  }
  async updateAsset(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<void> {
    const items = this.read<Asset[]>(KEYS.assets) ?? SEED_ASSETS;
    this.write(KEYS.assets, items.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async removeAsset(id: string): Promise<void> {
    const items = this.read<Asset[]>(KEYS.assets) ?? SEED_ASSETS;
    this.write(KEYS.assets, items.filter((a) => a.id !== id));
  }
}

export const BUDGET_REPOSITORY = new InjectionToken<BudgetRepository>('BUDGET_REPOSITORY', {
  providedIn: 'root',
  factory: () => new LocalStorageBudgetRepository(),
});
