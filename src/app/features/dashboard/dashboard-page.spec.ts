import { TestBed } from '@angular/core/testing';
import type { ECElementEvent } from 'echarts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryStore, ThemeService, TransactionStore } from '../../core/stores';
import type { Category, Transaction } from '../../core/models';
import { TRANSFER_CATEGORY_ID, todayIso } from '../../core/models';
import { eur } from '../../core/format';
import { DashboardPage } from './dashboard-page';

// -- fixtures ---------------------------------------------------------------

const CAT_A: Category = {
  id: 'cat-a',
  name: 'Alimentari',
  kind: 'expense',
  color: '#e63946',
  subcategories: [],
};
const CAT_B: Category = {
  id: 'cat-b',
  name: 'Trasporti',
  kind: 'expense',
  color: '#2a9d8f',
  subcategories: [],
};

let txId = 0;
function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  txId++;
  return {
    id: `tx-${txId}`,
    date: '2026-06-15',
    type: 'expense',
    amount: 10,
    categoryId: CAT_A.id,
    subcategoryId: null,
    description: '',
    recurringRuleId: null,
    tag: null,
    ...overrides,
  };
}

function makeCategoryStore() {
  const categories = new Map<string, Category>([
    [CAT_A.id, CAT_A],
    [CAT_B.id, CAT_B],
  ]);
  const subNames = new Map<string, Map<string, string>>([
    [CAT_A.id, new Map([['sub-a1', 'Supermercato'], ['sub-a2', 'Ristoranti']])],
  ]);
  return {
    byId: vi.fn((id: string) => categories.get(id)),
    color: vi.fn((id: string) => categories.get(id)?.color ?? '#6b6f68'),
    subName: vi.fn((catId: string, subId: string) => subNames.get(catId)?.get(subId)),
  };
}

function makeTransactionStore(txs: Transaction[] = []) {
  return { inRange: vi.fn().mockReturnValue(txs) };
}

function createPage(
  txStore: ReturnType<typeof makeTransactionStore>,
  catStore: ReturnType<typeof makeCategoryStore>,
  dark = false,
): DashboardPage {
  TestBed.configureTestingModule({
    providers: [
      DashboardPage,
      { provide: TransactionStore, useValue: txStore },
      { provide: CategoryStore, useValue: catStore },
      { provide: ThemeService, useValue: { dark: () => dark } },
    ],
  });
  return TestBed.inject(DashboardPage);
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('from/to range presets', () => {
    // "now" pinned to Thu 23 Jul 2026 so month-shift arithmetic is deterministic.
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 23));
    });

    it('3m shifts back 2 months (to the 1st) from now', () => {
      const page = createPage(makeTransactionStore(), makeCategoryStore());
      page.setPreset('3m');
      expect(page.from()).toBe('2026-05-01');
      expect(page.to()).toBe(todayIso());
    });

    it('6m shifts back 5 months (to the 1st) from now', () => {
      const page = createPage(makeTransactionStore(), makeCategoryStore());
      page.setPreset('6m');
      expect(page.from()).toBe('2026-02-01');
      expect(page.to()).toBe(todayIso());
    });

    it('12m shifts back 11 months (to the 1st) from now, crossing the year boundary', () => {
      const page = createPage(makeTransactionStore(), makeCategoryStore());
      page.setPreset('12m');
      expect(page.from()).toBe('2025-08-01');
      expect(page.to()).toBe(todayIso());
    });

    it('ytd starts on Jan 1st of the current year', () => {
      const page = createPage(makeTransactionStore(), makeCategoryStore());
      page.setPreset('ytd');
      expect(page.from()).toBe('2026-01-01');
      expect(page.to()).toBe(todayIso());
    });

    it('custom uses customFrom/customTo, not today, for `to`', () => {
      const page = createPage(makeTransactionStore(), makeCategoryStore());
      page.customFrom.set('2025-01-10');
      page.customTo.set('2025-03-20');
      page.setPreset('custom');
      expect(page.from()).toBe('2025-01-10');
      expect(page.to()).toBe('2025-03-20');
    });
  });

  describe('monthly bucketing (via barOptions/trendOptions)', () => {
    it('zero-fills months with no transactions instead of skipping them, across a year boundary', () => {
      const txs = [
        makeTx({ date: '2025-11-10', type: 'income', amount: 100 }),
        makeTx({ date: '2026-02-05', type: 'expense', amount: 40 }),
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2025-11-01');
      page.customTo.set('2026-02-20');
      page.setPreset('custom');

      const opts = page.barOptions() as any;
      expect(opts.xAxis.data).toEqual(['NOV 25', 'DIC 25', 'GEN 26', 'FEB 26']);
      expect(opts.series[0].data).toEqual([100, 0, 0, 0]); // Entrate
      expect(opts.series[1].data).toEqual([0, 0, 0, 40]); // Uscite
    });

    it('excludes transfers from both income and expense buckets, and counts tags per bucket', () => {
      const txs = [
        makeTx({ date: '2026-06-01', type: 'income', amount: 500, tag: null }),
        makeTx({ date: '2026-06-05', type: 'expense', amount: 200, tag: 'unexpected' }),
        makeTx({ date: '2026-06-10', type: 'expense', amount: 50, tag: 'unexpected' }),
        makeTx({ date: '2026-06-15', type: 'expense', amount: 30, tag: 'planned' }),
        makeTx({ date: '2026-06-20', type: 'transfer', amount: 1000, categoryId: TRANSFER_CATEGORY_ID }),
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      const opts = page.barOptions() as any;
      expect(opts.series[0].data).toEqual([500]); // transfer's 1000 doesn't land here
      expect(opts.series[1].data).toEqual([280]); // 200 + 50 + 30, transfer excluded

      const tooltip = opts.tooltip.formatter([
        { marker: '●', seriesName: 'Entrate', value: 500, dataIndex: 0 },
        { marker: '●', seriesName: 'Uscite', value: 280, dataIndex: 0 },
      ]) as string;
      expect(tooltip).toContain('2 imprevisti');
      expect(tooltip).toContain('1 programmata');
    });

    it('returns an empty tooltip string when there are no params', () => {
      const page = createPage(makeTransactionStore([]), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      const opts = page.barOptions() as any;
      expect(opts.tooltip.formatter([])).toBe('');
    });

    it('computes a running cumulative balance in trendOptions', () => {
      const txs = [
        makeTx({ date: '2026-01-10', type: 'income', amount: 100 }),
        makeTx({ date: '2026-01-11', type: 'expense', amount: 20 }),
        makeTx({ date: '2026-02-10', type: 'income', amount: 50 }),
        makeTx({ date: '2026-02-11', type: 'expense', amount: 90 }),
        makeTx({ date: '2026-03-10', type: 'income', amount: 10 }),
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-01-01');
      page.customTo.set('2026-03-31');
      page.setPreset('custom');

      const opts = page.trendOptions() as any;
      // month balances: +80, -40, +10 -> cumulative 80, 40, 50
      expect(opts.series[0].data.map((d: { value: number }) => d.value)).toEqual([80, -40, 10]);
      expect(opts.series[1].data).toEqual([80, 40, 50]);
      // negative month should use the expense color, positive months the income color
      expect(opts.series[0].data[0].itemStyle.color).not.toBe(opts.series[0].data[1].itemStyle.color);
    });
  });

  describe('categoryTotals (observed via donutOptions/donutData at top level)', () => {
    it('sums only expense transactions by categoryId, sorted descending, with name/color from CategoryStore', () => {
      const txs = [
        makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 30 }),
        makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 20 }),
        makeTx({ categoryId: CAT_B.id, type: 'expense', amount: 100 }),
        makeTx({ categoryId: CAT_A.id, type: 'income', amount: 999 }), // excluded: not an expense
        makeTx({ categoryId: CAT_B.id, type: 'transfer', amount: 5000 }), // excluded: not an expense
      ];
      const catStore = makeCategoryStore();
      const page = createPage(makeTransactionStore(txs), catStore);
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      const data = (page.donutOptions() as any).series[0].data;
      expect(data).toEqual([
        { id: CAT_B.id, name: 'Trasporti', value: 100, itemStyle: { color: CAT_B.color } },
        { id: CAT_A.id, name: 'Alimentari', value: 50, itemStyle: { color: CAT_A.color } },
      ]);
    });
  });

  describe('subcategoryTotals / donutData / donutTotal', () => {
    it('donutData returns categoryTotals at the top level (selectedCategoryId null)', () => {
      const txs = [makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 30 })];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      expect(page.selectedCategoryId()).toBeNull();
      const data = (page.donutOptions() as any).series[0].data;
      expect(data).toEqual([{ id: CAT_A.id, name: 'Alimentari', value: 30, itemStyle: { color: CAT_A.color } }]);
      expect(page.donutTotal()).toBe(30);
    });

    it('drills into per-subcategory totals when a category is selected, with a "Senza sottocategoria" bucket for null subcategoryId', () => {
      const txs = [
        makeTx({ categoryId: CAT_A.id, subcategoryId: 'sub-a1', type: 'expense', amount: 40 }),
        makeTx({ categoryId: CAT_A.id, subcategoryId: 'sub-a1', type: 'expense', amount: 10 }),
        makeTx({ categoryId: CAT_A.id, subcategoryId: null, type: 'expense', amount: 25 }),
        makeTx({ categoryId: CAT_B.id, subcategoryId: 'sub-b1', type: 'expense', amount: 999 }), // different category, excluded
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');
      page.selectedCategoryId.set(CAT_A.id);

      const data = (page.donutOptions() as any).series[0].data;
      expect(data.map((d: { id: string; name: string; value: number }) => ({ id: d.id, name: d.name, value: d.value }))).toEqual([
        { id: 'sub-a1', name: 'Supermercato', value: 50 },
        { id: '__none__', name: 'Senza sottocategoria', value: 25 },
      ]);
      expect(page.donutTotal()).toBe(75);
    });
  });

  describe('onDonutLegendClick', () => {
    it('drills down into the matching category when at the top level', () => {
      const txs = [
        makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 30 }),
        makeTx({ categoryId: CAT_B.id, type: 'expense', amount: 10 }),
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      page.onDonutLegendClick('Alimentari');

      expect(page.selectedCategoryId()).toBe(CAT_A.id);
    });

    it('does nothing when no category matches the given name', () => {
      const txs = [makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 30 })];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      page.onDonutLegendClick('Nome inesistente');

      expect(page.selectedCategoryId()).toBeNull();
    });

    it('does nothing when already drilled into a category', () => {
      const txs = [
        makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 30 }),
        makeTx({ categoryId: CAT_B.id, type: 'expense', amount: 10 }),
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');
      page.selectedCategoryId.set(CAT_A.id);

      page.onDonutLegendClick('Trasporti');

      expect(page.selectedCategoryId()).toBe(CAT_A.id); // unchanged, not switched to cat-b
    });
  });

  describe('onDonutSliceClick', () => {
    function sliceEvent(overrides: Partial<ECElementEvent>): ECElementEvent {
      return { componentType: 'series', data: { id: CAT_B.id }, ...overrides } as ECElementEvent;
    }

    it('drills down when the event is a series click with a data.id, at the top level', () => {
      const txs = [
        makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 30 }),
        makeTx({ categoryId: CAT_B.id, type: 'expense', amount: 10 }),
      ];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      page.onDonutSliceClick(sliceEvent({}));

      expect(page.selectedCategoryId()).toBe(CAT_B.id);
    });

    it('does nothing when componentType is not "series"', () => {
      const page = createPage(makeTransactionStore([]), makeCategoryStore());
      page.onDonutSliceClick(sliceEvent({ componentType: 'legend' }));
      expect(page.selectedCategoryId()).toBeNull();
    });

    it('does nothing when event.data has no id', () => {
      const page = createPage(makeTransactionStore([]), makeCategoryStore());
      page.onDonutSliceClick(sliceEvent({ data: {} as { id?: string } }));
      expect(page.selectedCategoryId()).toBeNull();
    });

    it('does nothing when already drilled into a category', () => {
      const page = createPage(makeTransactionStore([]), makeCategoryStore());
      page.selectedCategoryId.set(CAT_A.id);

      page.onDonutSliceClick(sliceEvent({ data: { id: CAT_B.id } }));

      expect(page.selectedCategoryId()).toBe(CAT_A.id);
    });
  });

  describe('backToCategories', () => {
    it('resets selectedCategoryId to null', () => {
      const page = createPage(makeTransactionStore([]), makeCategoryStore());
      page.selectedCategoryId.set(CAT_A.id);

      page.backToCategories();

      expect(page.selectedCategoryId()).toBeNull();
    });
  });

  describe('chart option shapes', () => {
    it('donutOptions wires a pie series with an eur-formatted tooltip valueFormatter', () => {
      const txs = [makeTx({ categoryId: CAT_A.id, type: 'expense', amount: 1234.5 })];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      const opts = page.donutOptions() as any;
      expect(opts.series[0].type).toBe('pie');
      expect(opts.tooltip.valueFormatter(1234.5)).toBe(eur(1234.5));
    });

    it('barOptions wires Entrate/Uscite bar series over the bucketed months', () => {
      const txs = [makeTx({ date: '2026-06-01', type: 'income', amount: 100 })];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      const opts = page.barOptions() as any;
      expect(opts.series.map((s: { name: string; type: string }) => [s.name, s.type])).toEqual([
        ['Entrate', 'bar'],
        ['Uscite', 'bar'],
      ]);
    });

    it('trendOptions wires a bar series (Saldo mese) and a line series (Cumulato)', () => {
      const txs = [makeTx({ date: '2026-06-01', type: 'income', amount: 100 })];
      const page = createPage(makeTransactionStore(txs), makeCategoryStore());
      page.customFrom.set('2026-06-01');
      page.customTo.set('2026-06-30');
      page.setPreset('custom');

      const opts = page.trendOptions() as any;
      expect(opts.series.map((s: { name: string; type: string }) => [s.name, s.type])).toEqual([
        ['Saldo mese', 'bar'],
        ['Cumulato', 'line'],
      ]);
    });
  });
});
