import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Category, RecurringRule, Subcategory, TransactionType, todayIso } from '../../core/models';
import { CategoryStore, RecurringStore } from '../../core/stores';
import { RecurringPage } from './recurring-page';

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

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    type: 'expense',
    amount: 10,
    categoryId: 'cat-1',
    subcategoryId: null,
    description: '',
    dayOfMonth: 1,
    startDate: '2026-01-01',
    ...overrides,
  };
}

/** Fake store esponendo solo signals/metodi letti da RecurringPage. */
class FakeCategoryStore {
  readonly categories = signal<Category[]>([]);
  private all: Category[] = [];
  incomeCats: Category[] = [];
  expenseCats: Category[] = [];

  setAll(categories: Category[]): void {
    this.all = categories;
    this.categories.set(categories);
  }

  incomeCategories = (): Category[] => this.incomeCats;
  expenseCategories = (): Category[] => this.expenseCats;
  activeSubs = (categoryId: string): Subcategory[] =>
    (this.all.find((c) => c.id === categoryId)?.subcategories ?? []).filter((s) => !s.archived);
  byId = (id: string): Category | undefined => this.all.find((c) => c.id === id);
  subName = (categoryId: string, subId: string): string | undefined =>
    this.all.find((c) => c.id === categoryId)?.subcategories.find((s) => s.id === subId)?.name;
}

class FakeRecurringStore {
  readonly rules = signal<RecurringRule[]>([]);
  add = vi.fn();
  installmentProgress = vi.fn((_rule: RecurringRule): { index: number; total: number } | null => null);
}

describe('RecurringPage', () => {
  let store: FakeRecurringStore;
  let catStore: FakeCategoryStore;
  let page: RecurringPage;

  // Cibo (esp1) ha una sub attiva e una archiviata; Affitto (exp2) non ha sub;
  // Stipendio (inc1) ha una sub attiva. Usati come dati di default in tutti i test.
  const foodCat = makeCategory({
    id: 'exp1',
    name: 'Cibo',
    kind: 'expense',
    subcategories: [makeSub({ id: 'exp1-sub1', name: 'Spesa' }), makeSub({ id: 'exp1-sub2', name: 'Ristorante', archived: true })],
  });
  const rentCat = makeCategory({ id: 'exp2', name: 'Affitto', kind: 'expense', subcategories: [] });
  const salaryCat = makeCategory({
    id: 'inc1',
    name: 'Stipendio',
    kind: 'income',
    subcategories: [makeSub({ id: 'inc1-sub1', name: 'Bonus' })],
  });

  beforeEach(() => {
    store = new FakeRecurringStore();
    catStore = new FakeCategoryStore();
    catStore.setAll([foodCat, rentCat, salaryCat]);
    catStore.expenseCats = [foodCat, rentCat];
    catStore.incomeCats = [salaryCat];

    TestBed.configureTestingModule({
      providers: [
        { provide: RecurringStore, useValue: store },
        { provide: CategoryStore, useValue: catStore },
      ],
    });
    page = TestBed.createComponent(RecurringPage).componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('availableCategories', () => {
    it('is empty when type is null', () => {
      expect(page.type()).toBeNull();
      expect(page.availableCategories()).toEqual([]);
    });

    it('returns incomeCategories when type is income', () => {
      page.type.set('income');
      expect(page.availableCategories()).toEqual([salaryCat]);
    });

    it('returns expenseCategories when type is expense', () => {
      page.type.set('expense');
      expect(page.availableCategories()).toEqual([foodCat, rentCat]);
    });
  });

  describe('subs', () => {
    it('is empty when categoryId is empty', () => {
      expect(page.categoryId()).toBe('');
      expect(page.subs()).toEqual([]);
    });

    it('returns catStore.activeSubs(categoryId) otherwise', () => {
      page.categoryId.set('exp1');
      expect(page.subs()).toEqual([{ id: 'exp1-sub1', name: 'Spesa' }]);
    });
  });

  describe('setType', () => {
    it('is a no-op when the given type already equals the current type', () => {
      page.type.set('expense');
      page.categoryId.set('custom-id');
      page.subcategoryId.set('custom-sub');

      page.setType('expense');

      expect(page.type()).toBe('expense');
      expect(page.categoryId()).toBe('custom-id');
      expect(page.subcategoryId()).toBe('custom-sub');
    });

    it('switches type and resets categoryId/subcategoryId to the first available category/sub', () => {
      page.setType('expense');

      expect(page.type()).toBe('expense');
      expect(page.categoryId()).toBe('exp1');
      expect(page.subcategoryId()).toBe('exp1-sub1');
    });

    it('resets categoryId to "" and subcategoryId to null when the new type has zero available categories', () => {
      catStore.incomeCats = [];

      page.setType('income');

      expect(page.type()).toBe('income');
      expect(page.categoryId()).toBe('');
      expect(page.subcategoryId()).toBeNull();
    });
  });

  describe('onCategoryChange', () => {
    it.each([
      ['a number', 42],
      ['an empty string', ''],
    ])('ignores %s', (_label, value) => {
      page.onCategoryChange(value);

      expect(page.categoryId()).toBe('');
      expect(page.subcategoryId()).toBeNull();
    });

    it('sets categoryId and resets subcategoryId to the first active sub of that category', () => {
      page.onCategoryChange('exp1');

      expect(page.categoryId()).toBe('exp1');
      expect(page.subcategoryId()).toBe('exp1-sub1');
    });

    it('resets subcategoryId to null when the new category has no active subs', () => {
      page.onCategoryChange('exp2');

      expect(page.categoryId()).toBe('exp2');
      expect(page.subcategoryId()).toBeNull();
    });
  });

  describe('onSubChange', () => {
    it('sets subcategoryId to a valid non-empty string as-is', () => {
      page.onSubChange('some-sub-id');
      expect(page.subcategoryId()).toBe('some-sub-id');
    });

    it.each([
      ['an empty string', ''],
      ['a non-string value', 42],
    ])('clears subcategoryId to null for %s', (_label, value) => {
      page.subcategoryId.set('previous-sub');

      page.onSubChange(value);

      expect(page.subcategoryId()).toBeNull();
    });
  });

  describe('categoryName / subcategoryName', () => {
    it('categoryName looks up the name via catStore.byId', () => {
      expect(page.categoryName('exp1')).toBe('Cibo');
    });

    it('categoryName falls back to the raw id when not found', () => {
      expect(page.categoryName('missing-id')).toBe('missing-id');
    });

    it('subcategoryName is null when the rule has no subcategoryId', () => {
      const rule = makeRule({ subcategoryId: null });
      expect(page.subcategoryName(rule)).toBeNull();
    });

    it('subcategoryName looks up the name via catStore.subName', () => {
      const rule = makeRule({ categoryId: 'exp1', subcategoryId: 'exp1-sub1' });
      expect(page.subcategoryName(rule)).toBe('Spesa');
    });

    it('subcategoryName is null when subName does not find a match', () => {
      const rule = makeRule({ categoryId: 'exp1', subcategoryId: 'missing-sub' });
      expect(page.subcategoryName(rule)).toBeNull();
    });
  });

  describe('progress / archivedLabel', () => {
    it('progress delegates to store.installmentProgress', () => {
      const rule = makeRule();
      store.installmentProgress.mockReturnValue({ index: 2, total: 5 });

      expect(page.progress(rule)).toEqual({ index: 2, total: 5 });
      expect(store.installmentProgress).toHaveBeenCalledWith(rule);
    });

    it('archivedLabel is "In pausa" for a non-installment rule (installmentProgress returns null)', () => {
      const rule = makeRule();
      store.installmentProgress.mockReturnValue(null);

      expect(page.archivedLabel(rule)).toBe('In pausa');
    });

    it('archivedLabel is "In pausa" while an installment plan is still in progress', () => {
      const rule = makeRule({ startOccurrence: 1, totalOccurrences: 5 });
      store.installmentProgress.mockReturnValue({ index: 2, total: 5 });

      expect(page.archivedLabel(rule)).toBe('In pausa');
    });

    it('archivedLabel is "Completata" once index reaches total', () => {
      const rule = makeRule({ startOccurrence: 1, totalOccurrences: 5 });
      store.installmentProgress.mockReturnValue({ index: 5, total: 5 });

      expect(page.archivedLabel(rule)).toBe('Completata');
    });

    it('archivedLabel is "Completata" if index somehow exceeds total', () => {
      const rule = makeRule({ startOccurrence: 1, totalOccurrences: 5 });
      store.installmentProgress.mockReturnValue({ index: 6, total: 5 });

      expect(page.archivedLabel(rule)).toBe('Completata');
    });
  });

  describe('add', () => {
    it.each([
      ['type is null', { type: null, amountText: '50,00', categoryId: 'exp1' }],
      ['amount parses to 0 (falsy)', { type: 'expense' as TransactionType, amountText: '0', categoryId: 'exp1' }],
      ['amount is negative (truthy but <= 0)', { type: 'expense' as TransactionType, amountText: '-10,00', categoryId: 'exp1' }],
      ['categoryId is empty', { type: 'expense' as TransactionType, amountText: '50,00', categoryId: '' }],
    ])('does not call store.add when %s', (_label, setup) => {
      page.type.set(setup.type);
      page.amountText.set(setup.amountText);
      page.categoryId.set(setup.categoryId);

      page.add();

      expect(store.add).not.toHaveBeenCalled();
    });

    it('rounds the amount to 2 decimals and clamps dayOfMonth into [1, 28] on the high side', () => {
      page.type.set('expense');
      page.amountText.set('1.234,567');
      page.categoryId.set('exp1');
      page.subcategoryId.set('exp1-sub1');
      page.description.set('  Affitto mensile  ');
      page.dayOfMonth.set(31);
      page.startDate.set('2026-05-01');

      page.add();

      expect(store.add).toHaveBeenCalledWith({
        type: 'expense',
        amount: 1234.57,
        categoryId: 'exp1',
        subcategoryId: 'exp1-sub1',
        description: 'Affitto mensile',
        dayOfMonth: 28,
        startDate: '2026-05-01',
      });
    });

    it('clamps dayOfMonth up to 1 on the low side', () => {
      page.type.set('expense');
      page.amountText.set('50,00');
      page.categoryId.set('exp1');
      page.dayOfMonth.set(0);

      page.add();

      expect(store.add).toHaveBeenCalledWith(expect.objectContaining({ dayOfMonth: 1 }));
    });

    it('includes startOccurrence/totalOccurrences when both are valid and totalOccurrences >= startOccurrence', () => {
      page.type.set('expense');
      page.amountText.set('50,00');
      page.categoryId.set('exp1');
      page.startOccurrenceText.set('2');
      page.totalOccurrencesText.set('5');

      page.add();

      expect(store.add).toHaveBeenCalledWith(expect.objectContaining({ startOccurrence: 2, totalOccurrences: 5 }));
    });

    it('includes installment fields when startOccurrence equals totalOccurrences (last installment)', () => {
      page.type.set('expense');
      page.amountText.set('50,00');
      page.categoryId.set('exp1');
      page.startOccurrenceText.set('5');
      page.totalOccurrencesText.set('5');

      page.add();

      expect(store.add).toHaveBeenCalledWith(expect.objectContaining({ startOccurrence: 5, totalOccurrences: 5 }));
    });

    it.each([
      ['only startOccurrence is set', '2', ''],
      ['only totalOccurrences is set', '', '5'],
      ['totalOccurrences is less than startOccurrence', '5', '3'],
      ['startOccurrence is zero', '0', '5'],
    ])('omits startOccurrence/totalOccurrences when %s', (_label, startText, totalText) => {
      page.type.set('expense');
      page.amountText.set('50,00');
      page.categoryId.set('exp1');
      page.startOccurrenceText.set(startText);
      page.totalOccurrencesText.set(totalText);

      page.add();

      const payload = store.add.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('startOccurrence');
      expect(payload).not.toHaveProperty('totalOccurrences');
    });

    it('resets all form signals to their defaults after a successful add', () => {
      page.type.set('expense');
      page.amountText.set('50,00');
      page.categoryId.set('exp1');
      page.subcategoryId.set('exp1-sub1');
      page.description.set('Qualcosa');
      page.dayOfMonth.set(15);
      page.startDate.set('2020-01-01');
      page.startOccurrenceText.set('2');
      page.totalOccurrencesText.set('5');

      page.add();

      expect(page.type()).toBeNull();
      expect(page.amountText()).toBe('');
      expect(page.categoryId()).toBe('');
      expect(page.subcategoryId()).toBeNull();
      expect(page.description()).toBe('');
      expect(page.dayOfMonth()).toBe(1);
      expect(page.startDate()).toBe(todayIso());
      expect(page.startOccurrenceText()).toBe('');
      expect(page.totalOccurrencesText()).toBe('');
    });
  });
});
