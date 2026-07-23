import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import type { AssetSnapshot, Category, RecurringRule, SubcategoryOverlay, Transaction } from './models';
import { Asset } from './models';
import { BudgetRepository, BUDGET_REPOSITORY } from './repository';
import { CategoryStore, latest, returnPct } from './stores';

function snap(date: string, value: number): AssetSnapshot {
  return { date, value };
}

describe('returnPct', () => {
  it('returns null when fewer than 2 snapshots fall in range', () => {
    expect(returnPct([snap('2026-01-01', 100)], '2026-01-01', '2026-12-31')).toBeNull();
    expect(returnPct([], '2026-01-01', '2026-12-31')).toBeNull();
  });

  it('returns null when the first value in range is zero (division by zero)', () => {
    expect(returnPct([snap('2026-01-01', 0), snap('2026-06-01', 100)], '2026-01-01', '2026-12-31')).toBeNull();
  });

  it('computes the percentage gain between the first and last snapshot in range', () => {
    expect(returnPct([snap('2026-01-01', 100), snap('2026-06-01', 150)], '2026-01-01', '2026-12-31')).toBe(50);
  });

  it('computes a negative percentage for a loss', () => {
    expect(returnPct([snap('2026-01-01', 200), snap('2026-06-01', 100)], '2026-01-01', '2026-12-31')).toBe(-50);
  });

  it('excludes snapshots outside the [fromIso, toIso] range (inclusive bounds)', () => {
    const snaps = [snap('2025-01-01', 1000), snap('2026-01-01', 100), snap('2026-06-01', 150), snap('2027-01-01', 9999)];
    expect(returnPct(snaps, '2026-01-01', '2026-06-01')).toBe(50);
  });
});

describe('latest', () => {
  it('returns undefined for an asset with no snapshots', () => {
    const asset: Asset = { id: 'a1', name: 'Conto', category: 'conto-corrente', snapshots: [] };
    expect(latest(asset)).toBeUndefined();
  });

  it('returns the last element of the snapshots array (assumes caller keeps it date-sorted)', () => {
    const asset: Asset = {
      id: 'a1',
      name: 'Conto',
      category: 'conto-corrente',
      snapshots: [snap('2026-01-01', 100), snap('2026-06-01', 200)],
    };
    expect(latest(asset)).toEqual(snap('2026-06-01', 200));
  });
});

class FakeBudgetRepository implements BudgetRepository {
  categories: Category[] = [];
  overlays: SubcategoryOverlay[] = [];
  failNextWrite = false;

  async loadTransactions(): Promise<Transaction[] | null> {
    return [];
  }
  async addTransaction(): Promise<void> {}
  async updateTransaction(): Promise<void> {}
  async removeTransaction(): Promise<void> {}

  async loadCategories(): Promise<Category[] | null> {
    return this.categories;
  }
  async addCategory(category: Category): Promise<void> {
    if (this.failNextWrite) throw new Error('boom');
    this.categories.push(category);
  }
  async updateCategory(): Promise<void> {}
  async removeCategory(): Promise<void> {}

  async loadSubcategoryOverlays(): Promise<SubcategoryOverlay[] | null> {
    return this.overlays;
  }
  async addSubcategoryOverlay(overlay: SubcategoryOverlay): Promise<void> {
    if (this.failNextWrite) throw new Error('boom');
    this.overlays.push(overlay);
  }
  async updateSubcategoryOverlay(): Promise<void> {}

  async loadAssets(): Promise<Asset[] | null> {
    return [];
  }
  async addAsset(): Promise<void> {}
  async updateAsset(): Promise<void> {}
  async removeAsset(): Promise<void> {}

  async loadRecurringRules(): Promise<RecurringRule[] | null> {
    return [];
  }
  async addRecurringRule(): Promise<void> {}
  async updateRecurringRule(): Promise<void> {}
  async removeRecurringRule(): Promise<void> {}
}

describe('CategoryStore', () => {
  let repo: FakeBudgetRepository;
  let store: CategoryStore;

  beforeEach(async () => {
    repo = new FakeBudgetRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: BUDGET_REPOSITORY, useValue: repo },
        { provide: AuthService, useValue: { user: signal({ id: 'u1' }), ready: signal(true) } },
      ],
    });
    store = TestBed.inject(CategoryStore);
    // Lascia risolvere il reload iniziale innescato dall'effect in ready()/user().
    await Promise.resolve();
    TestBed.flushEffects();
    await Promise.resolve();
  });

  it('adds a category optimistically and keeps it once the write succeeds', async () => {
    store.addCategory('Spesa', 'expense', '#ff0000');
    expect(store.categories().map((c) => c.name)).toContain('Spesa');
    await Promise.resolve();
    expect(repo.categories.map((c) => c.name)).toContain('Spesa');
  });

  it('rolls back the optimistic add when the repository write fails', async () => {
    repo.failNextWrite = true;
    store.addCategory('Spesa', 'expense', '#ff0000');
    expect(store.categories().map((c) => c.name)).toContain('Spesa');
    await Promise.resolve();
    await Promise.resolve();
    expect(store.categories().map((c) => c.name)).not.toContain('Spesa');
  });

  it('unions a shared category\'s own subcategories with its private overlays', async () => {
    const shared: Category = {
      id: 'cat1',
      name: 'Alimentari',
      kind: 'expense',
      color: '#000',
      shared: true,
      subcategories: [{ id: 'sub1', name: 'Supermercato' }],
    };
    repo.categories = [shared];
    store.categories.set([shared]);
    store.subcategoryOverlays.set([{ id: 'ov1', categoryId: 'cat1', name: 'Ristoranti' }]);

    const subs = store.allSubs('cat1').map((s) => s.name);
    expect(subs).toEqual(['Supermercato', 'Ristoranti']);
  });

  it('adds a new subcategory on a shared category as an overlay, not into the category itself', async () => {
    const shared: Category = {
      id: 'cat1',
      name: 'Alimentari',
      kind: 'expense',
      color: '#000',
      shared: true,
      subcategories: [],
    };
    store.categories.set([shared]);

    store.addSubcategory('cat1', 'Ristoranti');

    expect(store.categories()[0].subcategories).toEqual([]);
    expect(store.subcategoryOverlays().map((o) => o.name)).toContain('Ristoranti');
    await Promise.resolve();
    expect(repo.overlays.map((o) => o.name)).toContain('Ristoranti');
  });

  it('adds a new subcategory on a private category directly into its own subcategories array', () => {
    const own: Category = {
      id: 'cat2',
      name: 'Extra',
      kind: 'expense',
      color: '#000',
      subcategories: [],
    };
    store.categories.set([own]);

    store.addSubcategory('cat2', 'Varie');

    expect(store.categories()[0].subcategories.map((s) => s.name)).toEqual(['Varie']);
    expect(store.subcategoryOverlays()).toEqual([]);
  });
});
