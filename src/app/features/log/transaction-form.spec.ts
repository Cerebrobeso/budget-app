import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Category, Subcategory, Transaction, TRANSFER_CATEGORY_ID } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { TransactionForm } from './transaction-form';

const expenseCats: Category[] = [
  { id: 'spesa-quotidiana', name: 'Spesa quotidiana', kind: 'expense', color: '#333', subcategories: [] },
  { id: 'trasporti', name: 'Trasporti', kind: 'expense', color: '#444', subcategories: [] },
];

const incomeCats: Category[] = [
  { id: 'stipendio', name: 'Stipendio', kind: 'income', color: '#111', subcategories: [] },
  { id: 'bonus', name: 'Bonus', kind: 'income', color: '#222', subcategories: [] },
];

const subsByCategory: Record<string, Subcategory[]> = {
  'spesa-quotidiana': [
    { id: 'super', name: 'Supermercato' },
    { id: 'ristoranti', name: 'Ristoranti' },
  ],
  trasporti: [{ id: 'benzina', name: 'Benzina' }],
  stipendio: [{ id: 'principale', name: 'Principale' }],
  bonus: [],
};

function makeCategoryStore(): CategoryStore {
  return {
    categories: () => [...incomeCats, ...expenseCats],
    incomeCategories: () => incomeCats,
    expenseCategories: () => expenseCats,
    activeSubs: (categoryId: string) => subsByCategory[categoryId] ?? [],
    byId: (id: string) => [...incomeCats, ...expenseCats].find((c) => c.id === id),
  } as unknown as CategoryStore;
}

function makeTransactionStore(): { add: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } {
  return { add: vi.fn(), update: vi.fn() };
}

describe('TransactionForm', () => {
  let txStore: ReturnType<typeof makeTransactionStore>;
  let catStore: CategoryStore;
  let fixture: ReturnType<typeof TestBed.createComponent<TransactionForm>>;
  let component: TransactionForm;

  beforeEach(() => {
    txStore = makeTransactionStore();
    catStore = makeCategoryStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: TransactionStore, useValue: txStore },
        { provide: CategoryStore, useValue: catStore },
      ],
    });
    fixture = TestBed.createComponent(TransactionForm);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('edit-mode effect (populating from the transaction input)', () => {
    it('populates every form field from the given transaction', () => {
      const tx: Transaction = {
        id: 'tx-1',
        date: '2026-05-10',
        type: 'expense',
        amount: 1234.5,
        categoryId: 'trasporti',
        subcategoryId: 'benzina',
        description: 'Pieno di benzina',
        recurringRuleId: 'rule-1',
        tag: 'unexpected',
      };

      fixture.componentRef.setInput('transaction', tx);
      TestBed.flushEffects();

      // stringifyAmountMask does not pad trailing decimal zeros.
      expect(component.amountText()).toBe('1.234,5');
      expect(component.type()).toBe('expense');
      expect(component.categoryId()).toBe('trasporti');
      expect(component.subcategoryId()).toBe('benzina');
      expect(component.date()).toBe('2026-05-10');
      expect(component.description()).toBe('Pieno di benzina');
      expect(component.tag()).toBe('unexpected');
    });

    it('populates a null subcategoryId and null tag as-is when the transaction has none', () => {
      const tx: Transaction = {
        id: 'tx-2',
        date: '2026-06-01',
        type: 'income',
        amount: 100,
        categoryId: 'stipendio',
        subcategoryId: null,
        description: '',
        recurringRuleId: null,
        tag: null,
      };

      fixture.componentRef.setInput('transaction', tx);
      TestBed.flushEffects();

      expect(component.subcategoryId()).toBeNull();
      expect(component.tag()).toBeNull();
    });
  });

  describe('availableCategories', () => {
    it('is empty when no type is selected', () => {
      expect(component.type()).toBeNull();
      expect(component.availableCategories()).toEqual([]);
    });

    it('returns the income categories when type is income', () => {
      component.type.set('income');
      expect(component.availableCategories()).toEqual(incomeCats);
    });

    it('returns the expense categories when type is expense', () => {
      component.type.set('expense');
      expect(component.availableCategories()).toEqual(expenseCats);
    });
  });

  describe('setType', () => {
    it('is a no-op when setting the same type again, even if categoryId is currently invalid', () => {
      component.setType('income');
      expect(component.categoryId()).toBe('stipendio');

      // bypass setType to force an invalid categoryId, then call setType with the *same* type
      component.categoryId.set('not-a-real-category');
      component.setType('income');

      expect(component.categoryId()).toBe('not-a-real-category');
    });

    it('leaves categoryId alone when it is already valid for the new type', () => {
      expect(component.categoryId()).toBe('spesa-quotidiana'); // default value
      expect(component.subcategoryId()).toBeNull(); // default value

      component.setType('expense');

      expect(component.type()).toBe('expense');
      expect(component.categoryId()).toBe('spesa-quotidiana');
      expect(component.subcategoryId()).toBeNull();
    });

    it('resets categoryId (and subcategoryId) to the first available category when the current one is invalid for the new type', () => {
      expect(component.categoryId()).toBe('spesa-quotidiana'); // invalid for income

      component.setType('income');

      expect(component.type()).toBe('income');
      expect(component.categoryId()).toBe('stipendio');
      expect(component.subcategoryId()).toBe('principale');
    });

  });

  describe('setTag', () => {
    it('sets the tag when none is currently set', () => {
      expect(component.tag()).toBeNull();
      component.setTag('unexpected');
      expect(component.tag()).toBe('unexpected');
    });

    it('clears the tag when called again with the currently-set tag', () => {
      component.setTag('planned');
      component.setTag('planned');
      expect(component.tag()).toBeNull();
    });

    it('switches to a different tag when one is already set', () => {
      component.setTag('unexpected');
      component.setTag('planned');
      expect(component.tag()).toBe('planned');
    });
  });

  describe('onCategoryChange', () => {
    it('ignores a non-string value', () => {
      component.categoryId.set('trasporti');
      component.onCategoryChange(42);
      expect(component.categoryId()).toBe('trasporti');
    });

    it('ignores an empty string', () => {
      component.categoryId.set('trasporti');
      component.onCategoryChange('');
      expect(component.categoryId()).toBe('trasporti');
    });

    it('sets categoryId and resets subcategoryId to the first active sub for a valid string', () => {
      component.subcategoryId.set('stale-sub');
      component.onCategoryChange('trasporti');
      expect(component.categoryId()).toBe('trasporti');
      expect(component.subcategoryId()).toBe('benzina');
    });

    it('resets subcategoryId to null when the new category has no active subs', () => {
      component.onCategoryChange('bonus');
      expect(component.categoryId()).toBe('bonus');
      expect(component.subcategoryId()).toBeNull();
    });
  });

  describe('onSubChange', () => {
    it('sets subcategoryId for a non-empty string', () => {
      component.onSubChange('ristoranti');
      expect(component.subcategoryId()).toBe('ristoranti');
    });

    it('sets subcategoryId to null for a non-string value', () => {
      component.subcategoryId.set('ristoranti');
      component.onSubChange(7);
      expect(component.subcategoryId()).toBeNull();
    });

    it('sets subcategoryId to null for an empty string', () => {
      component.subcategoryId.set('ristoranti');
      component.onSubChange('');
      expect(component.subcategoryId()).toBeNull();
    });
  });

  describe('save() validation guards', () => {
    beforeEach(() => {
      // otherwise-valid baseline so each test isolates a single guard
      component.date.set('2026-07-01');
      component.amountText.set('10');
    });

    it('requires a type to be selected', () => {
      component.save();
      expect(component.error()).toBe('Seleziona Entrata, Uscita o Trasferimento.');
      expect(txStore.add).not.toHaveBeenCalled();
      expect(txStore.update).not.toHaveBeenCalled();
    });

    it('requires a positive amount when amountText is empty', () => {
      component.type.set('expense');
      component.amountText.set('');
      component.save();
      expect(component.error()).toBe('Inserisci un importo maggiore di zero.');
      expect(txStore.add).not.toHaveBeenCalled();
    });

    it('requires a positive amount when amountText parses to zero', () => {
      component.type.set('expense');
      component.amountText.set('0');
      component.save();
      expect(component.error()).toBe('Inserisci un importo maggiore di zero.');
      expect(txStore.add).not.toHaveBeenCalled();
    });

    it('requires a date', () => {
      component.type.set('expense');
      component.date.set('');
      component.save();
      expect(component.error()).toBe('Inserisci una data.');
      expect(txStore.add).not.toHaveBeenCalled();
    });
  });

  describe('save() happy path — new transaction', () => {
    it('adds an expense transaction, rounds the amount to 2 decimals, trims the description, and resets amountText/description/tag but not type/category/date', () => {
      component.setType('expense');
      component.categoryId.set('trasporti');
      component.subcategoryId.set('benzina');
      component.date.set('2026-07-01');
      component.description.set('  Pieno di benzina  ');
      component.setTag('unexpected');
      component.amountText.set('12,345'); // parses to 12.345 -> rounds to 12.35

      const savedSpy = vi.fn();
      component.saved.subscribe(savedSpy);

      component.save();

      expect(component.error()).toBe('');
      expect(txStore.add).toHaveBeenCalledWith({
        amount: 12.35,
        type: 'expense',
        categoryId: 'trasporti',
        subcategoryId: 'benzina',
        date: '2026-07-01',
        description: 'Pieno di benzina',
        recurringRuleId: null,
        tag: 'unexpected',
      });
      expect(txStore.update).not.toHaveBeenCalled();

      // reset fields
      expect(component.amountText()).toBe('');
      expect(component.description()).toBe('');
      expect(component.tag()).toBeNull();
      // not reset
      expect(component.type()).toBe('expense');
      expect(component.categoryId()).toBe('trasporti');
      expect(component.date()).toBe('2026-07-01');

      expect(savedSpy).toHaveBeenCalledTimes(1);
    });

    it('adds a transfer transaction with the fixed transfer category, a null subcategory, and a null tag', () => {
      component.setType('transfer');
      component.categoryId.set('trasporti'); // should be overridden in the payload
      component.subcategoryId.set('benzina'); // should be overridden in the payload
      component.date.set('2026-07-02');
      component.amountText.set('50');

      component.save();

      expect(txStore.add).toHaveBeenCalledWith({
        amount: 50,
        type: 'transfer',
        categoryId: TRANSFER_CATEGORY_ID,
        subcategoryId: null,
        date: '2026-07-02',
        description: '',
        recurringRuleId: null,
        tag: null,
      });
      expect(txStore.update).not.toHaveBeenCalled();
    });
  });

  describe('save() happy path — edit mode', () => {
    it('updates the existing transaction, preserves its recurringRuleId, and does not reset the form fields', () => {
      const existing: Transaction = {
        id: 'tx-99',
        date: '2026-01-01',
        type: 'expense',
        amount: 5,
        categoryId: 'spesa-quotidiana',
        subcategoryId: null,
        description: 'old description',
        recurringRuleId: 'rule-1',
        tag: null,
      };
      fixture.componentRef.setInput('transaction', existing);
      TestBed.flushEffects();

      // simulate the user editing a couple of fields after the form was populated
      component.amountText.set('20');
      component.description.set('updated description');
      component.date.set('2026-02-02');

      const savedSpy = vi.fn();
      component.saved.subscribe(savedSpy);

      component.save();

      expect(txStore.update).toHaveBeenCalledWith('tx-99', {
        amount: 20,
        type: 'expense',
        categoryId: 'spesa-quotidiana',
        subcategoryId: null,
        date: '2026-02-02',
        description: 'updated description',
        recurringRuleId: 'rule-1',
        tag: null,
      });
      expect(txStore.add).not.toHaveBeenCalled();

      // form fields are NOT reset in edit mode
      expect(component.amountText()).toBe('20');
      expect(component.description()).toBe('updated description');
      expect(component.date()).toBe('2026-02-02');

      expect(savedSpy).toHaveBeenCalledTimes(1);
    });
  });
});
