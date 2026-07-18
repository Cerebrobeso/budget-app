import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { Asset, AssetSnapshot, Category, Subcategory, Transaction, uid } from './models';
import { BUDGET_REPOSITORY } from './repository';

@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly categories = signal<Category[]>([]);
  readonly ready = signal(false);

  readonly active = computed(() => this.categories().filter((c) => !c.archived));
  readonly expenseCategories = computed(() => this.active().filter((c) => c.kind === 'expense'));
  readonly incomeCategories = computed(() => this.active().filter((c) => c.kind === 'income'));

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const user = this.auth.user();
      if (!ready) return;
      void this.reload(user);
    });
  }

  private async reload(user: User | null): Promise<void> {
    this.ready.set(false);
    if (!user) {
      this.categories.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadCategories();
    this.categories.set(stored ?? []);
    this.ready.set(true);
  }

  byId(id: string): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }

  label(categoryId: string, subcategoryId: string | null): string {
    const cat = this.byId(categoryId);
    if (!cat) return categoryId;
    const sub = subcategoryId ? cat.subcategories.find((s) => s.id === subcategoryId) : undefined;
    return sub ? `${cat.name} · ${sub.name}` : cat.name;
  }

  color(categoryId: string): string {
    return this.byId(categoryId)?.color ?? '#6B6F68';
  }

  addCategory(name: string, kind: 'expense' | 'income', color: string): void {
    const cat: Category = { id: uid(), name, kind, color, subcategories: [{ id: uid(), name: 'Altro' }] };
    this.categories.update((list) => [...list, cat]);
    void this.repo.addCategory(cat);
  }

  renameCategory(id: string, name: string): void {
    this.patch(id, () => ({ name }));
  }

  setArchived(id: string, archived: boolean): void {
    this.patch(id, () => ({ archived }));
  }

  addSubcategory(categoryId: string, name: string): void {
    this.patch(categoryId, (c) => ({ subcategories: [...c.subcategories, { id: uid(), name }] }));
  }

  renameSubcategory(categoryId: string, subId: string, name: string): void {
    this.patch(categoryId, (c) => ({
      subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, name } : s)),
    }));
  }

  setSubArchived(categoryId: string, subId: string, archived: boolean): void {
    this.patch(categoryId, (c) => ({
      subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, archived } : s)),
    }));
  }

  activeSubs(categoryId: string): Subcategory[] {
    return (this.byId(categoryId)?.subcategories ?? []).filter((s) => !s.archived);
  }

  private patch(id: string, fn: (c: Category) => Partial<Category>): void {
    const current = this.byId(id);
    if (!current) return;
    const partial = fn(current);
    this.categories.update((list) => list.map((c) => (c.id === id ? { ...c, ...partial } : c)));
    void this.repo.updateCategory(id, partial);
  }
}

@Injectable({ providedIn: 'root' })
export class TransactionStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly transactions = signal<Transaction[]>([]);
  readonly ready = signal(false);

  readonly sorted = computed(() =>
    [...this.transactions()].sort((a, b) => b.date.localeCompare(a.date)),
  );

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const user = this.auth.user();
      if (!ready) return;
      void this.reload(user);
    });
  }

  private async reload(user: User | null): Promise<void> {
    this.ready.set(false);
    if (!user) {
      this.transactions.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadTransactions();
    this.transactions.set(stored ?? []);
    this.ready.set(true);
  }

  add(tx: Omit<Transaction, 'id'>): void {
    const newTx: Transaction = { ...tx, id: uid() };
    this.transactions.update((list) => [...list, newTx]);
    void this.repo.addTransaction(newTx);
  }

  update(id: string, patch: Partial<Omit<Transaction, 'id'>>): void {
    this.transactions.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    void this.repo.updateTransaction(id, patch);
  }

  remove(id: string): void {
    this.transactions.update((list) => list.filter((t) => t.id !== id));
    void this.repo.removeTransaction(id);
  }

  /** Movimenti di un mese: month è 1-based. */
  byMonth(year: number, month: number): Transaction[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.sorted().filter((t) => t.date.startsWith(prefix));
  }

  inRange(fromIso: string, toIso: string): Transaction[] {
    return this.sorted().filter((t) => t.date >= fromIso && t.date <= toIso);
  }
}

@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly assets = signal<Asset[]>([]);
  readonly ready = signal(false);

  readonly active = computed(() => this.assets().filter((a) => !a.archived));

  readonly totalValue = computed(() =>
    this.active().reduce((sum, a) => sum + (latest(a)?.value ?? 0), 0),
  );

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const user = this.auth.user();
      if (!ready) return;
      void this.reload(user);
    });
  }

  private async reload(user: User | null): Promise<void> {
    this.ready.set(false);
    if (!user) {
      this.assets.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadAssets();
    this.assets.set(stored ?? []);
    this.ready.set(true);
  }

  add(asset: Omit<Asset, 'id'>): void {
    const newAsset: Asset = { ...asset, id: uid() };
    this.assets.update((list) => [...list, newAsset]);
    void this.repo.addAsset(newAsset);
  }

  rename(id: string, name: string): void {
    this.assets.update((list) => list.map((a) => (a.id === id ? { ...a, name } : a)));
    void this.repo.updateAsset(id, { name });
  }

  setArchived(id: string, archived: boolean): void {
    this.assets.update((list) => list.map((a) => (a.id === id ? { ...a, archived } : a)));
    void this.repo.updateAsset(id, { archived });
  }

  remove(id: string): void {
    this.assets.update((list) => list.filter((a) => a.id !== id));
    void this.repo.removeAsset(id);
  }

  /** Aggiunge o sostituisce lo snapshot alla data indicata. */
  addSnapshot(assetId: string, snap: AssetSnapshot): void {
    let newSnapshots: AssetSnapshot[] = [];
    this.assets.update((list) =>
      list.map((a) => {
        if (a.id !== assetId) return a;
        const others = a.snapshots.filter((s) => s.date !== snap.date);
        newSnapshots = [...others, snap].sort((x, y) => x.date.localeCompare(y.date));
        return { ...a, snapshots: newSnapshots };
      }),
    );
    void this.repo.updateAsset(assetId, { snapshots: newSnapshots });
  }

  removeSnapshot(assetId: string, date: string): void {
    let newSnapshots: AssetSnapshot[] = [];
    this.assets.update((list) =>
      list.map((a) => {
        if (a.id !== assetId) return a;
        newSnapshots = a.snapshots.filter((s) => s.date !== date);
        return { ...a, snapshots: newSnapshots };
      }),
    );
    void this.repo.updateAsset(assetId, { snapshots: newSnapshots });
  }

  /** Serie storica del patrimonio totale: per ogni data nota, somma degli ultimi valori disponibili. */
  readonly totalSeries = computed<AssetSnapshot[]>(() => {
    const assets = this.active();
    const dates = [...new Set(assets.flatMap((a) => a.snapshots.map((s) => s.date)))].sort();
    return dates.map((date) => ({
      date,
      value: assets.reduce((sum, a) => {
        const last = [...a.snapshots].filter((s) => s.date <= date).at(-1);
        return sum + (last?.value ?? 0);
      }, 0),
    }));
  });
}

export function latest(asset: Asset): AssetSnapshot | undefined {
  return asset.snapshots.at(-1);
}

/** Rendimento % tra il primo e l'ultimo snapshot compresi nel range. */
export function returnPct(snaps: AssetSnapshot[], fromIso: string, toIso: string): number | null {
  const inRange = snaps.filter((s) => s.date >= fromIso && s.date <= toIso);
  if (inRange.length < 2) return null;
  const first = inRange[0].value;
  const last = inRange[inRange.length - 1].value;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly key = 'registro.theme';
  readonly dark = signal<boolean>(this.initial());

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle('dark', this.dark());
      localStorage.setItem(this.key, this.dark() ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.dark.update((d) => !d);
  }

  private initial(): boolean {
    const stored = localStorage.getItem(this.key);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
