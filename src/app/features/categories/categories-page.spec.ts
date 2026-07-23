import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Category, Subcategory, Transaction } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { CategoriesPage } from './categories-page';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Categoria',
    kind: 'expense',
    color: '#111111',
    subcategories: [],
    ...overrides,
  };
}

function makeSub(overrides: Partial<Subcategory> = {}): Subcategory {
  return { id: 'sub-1', name: 'Sub', ...overrides };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: '2026-01-01',
    type: 'expense',
    amount: 10,
    categoryId: 'cat-1',
    subcategoryId: null,
    description: '',
    recurringRuleId: null,
    tag: null,
    ...overrides,
  };
}

/** Fake store esponendo solo signals/metodi letti da CategoriesPage. */
class FakeCategoryStore {
  readonly categories = signal<Category[]>([]);
  readonly active = computed(() => this.categories().filter((c) => !c.archived));
  subsByCat: Record<string, Subcategory[]> = {};

  allSubs = (categoryId: string): Subcategory[] => this.subsByCat[categoryId] ?? [];
  addCategory = vi.fn();
  renameCategory = vi.fn();
  renameSubcategory = vi.fn();
  addSubcategory = vi.fn();
  removeCategory = vi.fn();
  ensureFallbackCategory = vi.fn((kind: 'expense' | 'income') =>
    makeCategory({ id: `fallback-${kind}`, name: 'Altro', kind }),
  );
}

class FakeTransactionStore {
  readonly transactions = signal<Transaction[]>([]);
  reassignCategory = vi.fn();
}

describe('CategoriesPage', () => {
  let store: FakeCategoryStore;
  let txStore: FakeTransactionStore;
  let page: CategoriesPage;

  beforeEach(() => {
    store = new FakeCategoryStore();
    txStore = new FakeTransactionStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: CategoryStore, useValue: store },
        { provide: TransactionStore, useValue: txStore },
      ],
    });
    // CategoriesPage declares its own component-level `providers` (provideIcons(...)), so its
    // factory needs a real node injector: TestBed.inject() (a plain Injector.get) can't resolve
    // it, unlike simpler components with no component-level providers. createComponent() gives
    // us an instance without calling detectChanges(), so the (required) viewChild below still
    // isn't resolved yet — which is what we want, since we stub it out next anyway.
    page = TestBed.createComponent(CategoriesPage).componentInstance;
    // deleteCatDialog is viewChild.required<HlmDialog>, which only resolves after a real
    // template render. confirmDeleteCat() calls .close({}) unconditionally, so without
    // rendering the fixture it would throw NG0951. Per house style (test-writer.md) we test
    // the reassignment/removal logic in isolation and stub the dialog handle instead of
    // asserting on its open()/close() calls, which belong to @spartan-ng/helm.
    (page as unknown as { deleteCatDialog: () => { open: () => void; close: () => void } }).deleteCatDialog =
      () => ({ open: vi.fn(), close: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reassignOptions', () => {
    it('is empty when deletingCat is null', () => {
      page.deletingCat.set(null);
      expect(page.reassignOptions()).toEqual([]);
    });

    it('returns only active categories of the same kind, excluding the category itself', () => {
      const target = makeCategory({ id: 'cat-1', kind: 'expense' });
      const sameKindOther = makeCategory({ id: 'cat-2', kind: 'expense' });
      const differentKind = makeCategory({ id: 'cat-3', kind: 'income' });
      const sameKindArchived = makeCategory({ id: 'cat-4', kind: 'expense', archived: true });
      store.categories.set([target, sameKindOther, differentKind, sameKindArchived]);

      page.deletingCat.set(target);

      expect(page.reassignOptions()).toEqual([sameKindOther]);
    });
  });

  describe('otherColors', () => {
    it('returns colors of all active categories when no id is excluded', () => {
      store.categories.set([
        makeCategory({ id: 'cat-1', color: '#111' }),
        makeCategory({ id: 'cat-2', color: '#222' }),
      ]);

      expect(page.otherColors()).toEqual(['#111', '#222']);
    });

    it('excludes the color of the category matching excludeId', () => {
      store.categories.set([
        makeCategory({ id: 'cat-1', color: '#111' }),
        makeCategory({ id: 'cat-2', color: '#222' }),
        makeCategory({ id: 'cat-3', color: '#333', archived: true }),
      ]);

      expect(page.otherColors('cat-2')).toEqual(['#111']);
    });
  });

  describe('archived', () => {
    it('returns categories flagged archived from the full categories list', () => {
      const archived = makeCategory({ id: 'cat-1', archived: true });
      const active = makeCategory({ id: 'cat-2', archived: false });
      store.categories.set([archived, active]);

      expect(page.archived()).toEqual([archived]);
    });

    it('is empty when nothing is archived', () => {
      store.categories.set([makeCategory({ id: 'cat-1' })]);
      expect(page.archived()).toEqual([]);
    });
  });

  describe('archivedSubs', () => {
    it('flattens archived subcategories across non-archived categories only', () => {
      const cat1 = makeCategory({ id: 'cat-1', archived: false });
      const cat2 = makeCategory({ id: 'cat-2', archived: true });
      store.categories.set([cat1, cat2]);
      const archivedSub = makeSub({ id: 'sub-1', archived: true });
      const activeSub = makeSub({ id: 'sub-2', archived: false });
      store.subsByCat['cat-1'] = [archivedSub, activeSub];
      // cat-2 is archived itself, so its subs must be skipped even though sub-3 is archived.
      store.subsByCat['cat-2'] = [makeSub({ id: 'sub-3', archived: true })];

      expect(page.archivedSubs()).toEqual([{ cat: cat1, sub: archivedSub }]);
    });

    it('is empty when there are no archived subcategories', () => {
      const cat1 = makeCategory({ id: 'cat-1', archived: false });
      store.categories.set([cat1]);
      store.subsByCat['cat-1'] = [makeSub({ id: 'sub-1', archived: false })];

      expect(page.archivedSubs()).toEqual([]);
    });
  });

  describe('add', () => {
    it('does not call addCategory and does not touch newName when the trimmed name is empty', () => {
      page.newName.set('   ');

      page.add();

      expect(store.addCategory).not.toHaveBeenCalled();
      expect(page.newName()).toBe('   ');
    });

    it('trims the name, calls addCategory with kind/color, and resets newName', () => {
      page.newName.set('  Bollette  ');
      page.newKind.set('income');
      page.newColor.set('#abcdef');

      page.add();

      expect(store.addCategory).toHaveBeenCalledWith('Bollette', 'income', '#abcdef');
      expect(page.newName()).toBe('');
    });
  });

  describe('linkedTxCount', () => {
    it('counts only transactions matching the given category id', () => {
      txStore.transactions.set([
        makeTx({ id: 't1', categoryId: 'cat-1' }),
        makeTx({ id: 't2', categoryId: 'cat-2' }),
        makeTx({ id: 't3', categoryId: 'cat-1' }),
      ]);

      expect(page.linkedTxCount('cat-1')).toBe(2);
      expect(page.linkedTxCount('cat-2')).toBe(1);
      expect(page.linkedTxCount('cat-3')).toBe(0);
    });
  });

  describe('subDraft / setNewSub', () => {
    it('keeps drafts independent per category id', () => {
      expect(page.subDraft('cat-1')).toBe('');

      page.setNewSub('cat-1', 'Bar');
      page.setNewSub('cat-2', 'Ristorante');

      expect(page.subDraft('cat-1')).toBe('Bar');
      expect(page.subDraft('cat-2')).toBe('Ristorante');
    });
  });

  describe('addSub', () => {
    it('does not call addSubcategory when the draft is empty/blank', () => {
      const cat = makeCategory({ id: 'cat-1' });
      page.setNewSub('cat-1', '   ');

      page.addSub(cat);

      expect(store.addSubcategory).not.toHaveBeenCalled();
    });

    it('trims the draft, calls addSubcategory, and clears that category draft only', () => {
      const cat = makeCategory({ id: 'cat-1' });
      page.setNewSub('cat-1', '  Bar  ');
      page.setNewSub('cat-2', 'Altro draft');

      page.addSub(cat);

      expect(store.addSubcategory).toHaveBeenCalledWith('cat-1', 'Bar');
      expect(page.subDraft('cat-1')).toBe('');
      expect(page.subDraft('cat-2')).toBe('Altro draft');
    });
  });

  describe('startEditCat / saveCatName', () => {
    it('startEditCat sets editingCat/editName and clears editingSub', () => {
      page.editingSub.set('cat-x/sub-x');
      const cat = makeCategory({ id: 'cat-1', name: 'Spesa' });

      page.startEditCat(cat);

      expect(page.editingCat()).toBe('cat-1');
      expect(page.editName()).toBe('Spesa');
      expect(page.editingSub()).toBeNull();
    });

    it('saveCatName calls renameCategory with the trimmed name when non-empty', () => {
      const cat = makeCategory({ id: 'cat-1' });
      page.editingCat.set('cat-1');
      page.editName.set('  Nuovo Nome  ');

      page.saveCatName(cat);

      expect(store.renameCategory).toHaveBeenCalledWith('cat-1', 'Nuovo Nome');
      expect(page.editingCat()).toBeNull();
    });

    it('saveCatName does not call renameCategory when the trimmed name is empty, but still clears editingCat', () => {
      const cat = makeCategory({ id: 'cat-1' });
      page.editingCat.set('cat-1');
      page.editName.set('   ');

      page.saveCatName(cat);

      expect(store.renameCategory).not.toHaveBeenCalled();
      expect(page.editingCat()).toBeNull();
    });
  });

  describe('startEditSub / saveSubName', () => {
    it('startEditSub sets editingSub as a catId/subId composite key and clears editingCat', () => {
      page.editingCat.set('cat-x');
      const cat = makeCategory({ id: 'cat-1' });
      const sub = makeSub({ id: 'sub-1', name: 'Bar' });

      page.startEditSub(cat, sub);

      expect(page.editingSub()).toBe('cat-1/sub-1');
      expect(page.editName()).toBe('Bar');
      expect(page.editingCat()).toBeNull();
    });

    it('saveSubName calls renameSubcategory with the trimmed name when non-empty', () => {
      const cat = makeCategory({ id: 'cat-1' });
      const sub = makeSub({ id: 'sub-1' });
      page.editingSub.set('cat-1/sub-1');
      page.editName.set('  Nuovo Sub  ');

      page.saveSubName(cat, sub);

      expect(store.renameSubcategory).toHaveBeenCalledWith('cat-1', 'sub-1', 'Nuovo Sub');
      expect(page.editingSub()).toBeNull();
    });

    it('saveSubName does not call renameSubcategory when the trimmed name is empty, but still clears editingSub', () => {
      const cat = makeCategory({ id: 'cat-1' });
      const sub = makeSub({ id: 'sub-1' });
      page.editingSub.set('cat-1/sub-1');
      page.editName.set('   ');

      page.saveSubName(cat, sub);

      expect(store.renameSubcategory).not.toHaveBeenCalled();
      expect(page.editingSub()).toBeNull();
    });
  });

  // confirmDeleteCat is exercised directly on the class (without a real detectChanges/dialog
  // render): it reads/writes deletingCat/reassignMode/reassignTarget signals, which are public,
  // and calls the dialog viewChild only for open()/close() side effects that belong to
  // @spartan-ng/helm, not to this app's logic — see house style in .claude/agents/test-writer.md.
  describe('confirmDeleteCat reassignment logic', () => {
    it('reassigns to the picked target when reassignMode is "pick" and a target is set, and removes the category', () => {
      const cat = makeCategory({ id: 'cat-1', kind: 'expense' });
      txStore.transactions.set([makeTx({ id: 't1', categoryId: 'cat-1' })]);
      page.deletingCat.set(cat);
      page.reassignMode.set('pick');
      page.reassignTarget.set('cat-2');

      page.confirmDeleteCat();

      expect(txStore.reassignCategory).toHaveBeenCalledWith('cat-1', 'cat-2');
      expect(store.removeCategory).toHaveBeenCalledWith('cat-1');
    });

    it('falls back to ensureFallbackCategory when reassignMode is "fallback" (the default)', () => {
      const cat = makeCategory({ id: 'cat-1', kind: 'income' });
      txStore.transactions.set([makeTx({ id: 't1', categoryId: 'cat-1', type: 'income' })]);
      page.deletingCat.set(cat);
      // reassignMode left at its default 'fallback'

      page.confirmDeleteCat();

      expect(store.ensureFallbackCategory).toHaveBeenCalledWith('income');
      expect(txStore.reassignCategory).toHaveBeenCalledWith('cat-1', 'fallback-income');
      expect(store.removeCategory).toHaveBeenCalledWith('cat-1');
    });

    it('falls back to ensureFallbackCategory when reassignMode is "pick" but no target is chosen', () => {
      const cat = makeCategory({ id: 'cat-1', kind: 'expense' });
      txStore.transactions.set([makeTx({ id: 't1', categoryId: 'cat-1' })]);
      page.deletingCat.set(cat);
      page.reassignMode.set('pick');
      page.reassignTarget.set('');

      page.confirmDeleteCat();

      expect(txStore.reassignCategory).toHaveBeenCalledWith('cat-1', 'fallback-expense');
    });

    it('does not call reassignCategory when there are no linked transactions, but still removes the category', () => {
      const cat = makeCategory({ id: 'cat-1' });
      txStore.transactions.set([makeTx({ id: 't1', categoryId: 'other-cat' })]);
      page.deletingCat.set(cat);

      page.confirmDeleteCat();

      expect(txStore.reassignCategory).not.toHaveBeenCalled();
      expect(store.removeCategory).toHaveBeenCalledWith('cat-1');
    });

    it('does nothing (no reassign, no remove) when deletingCat is null', () => {
      page.deletingCat.set(null);

      page.confirmDeleteCat();

      expect(txStore.reassignCategory).not.toHaveBeenCalled();
      expect(store.removeCategory).not.toHaveBeenCalled();
    });
  });
});
