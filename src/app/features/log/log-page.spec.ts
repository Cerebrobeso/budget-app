import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDayLabel } from '../../core/format';
import { Category, Transaction, TRANSACTION_TAG_LABEL, TRANSFER_CATEGORY_ID } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { LogPage } from './log-page';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-id',
    date: '2026-06-05',
    type: 'expense',
    amount: 10,
    categoryId: 'cat-food',
    subcategoryId: null,
    description: 'Test',
    recurringRuleId: null,
    tag: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-id',
    name: 'Categoria',
    kind: 'expense',
    color: '#000000',
    subcategories: [],
    ...overrides,
  };
}

/** Fake TransactionStore: solo i membri che LogPage legge/chiama, con lo stesso comportamento reale di sorted/byMonth. */
function createFakeTransactionStore(transactions: Transaction[]) {
  const transactionsSignal = signal<Transaction[]>(transactions);
  const sorted = vi.fn(() => [...transactionsSignal()].sort((a, b) => b.date.localeCompare(a.date)));
  const byMonth = vi.fn((year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return sorted().filter((t) => t.date.startsWith(prefix));
  });
  return { transactions: transactionsSignal, sorted, byMonth, update: vi.fn(), remove: vi.fn() };
}

/** Fake CategoryStore: solo categories/activeSubs/byId/subName, come usati da LogPage. */
function createFakeCategoryStore(categories: Category[]) {
  const categoriesSignal = signal<Category[]>(categories);
  const byId = vi.fn((id: string) => categoriesSignal().find((c) => c.id === id));
  const activeSubs = vi.fn((catId: string) => byId(catId)?.subcategories.filter((s) => !s.archived) ?? []);
  const subName = vi.fn((catId: string, subId: string) => byId(catId)?.subcategories.find((s) => s.id === subId)?.name);
  return { categories: categoriesSignal, activeSubs, byId, subName };
}

function createPage(transactions: Transaction[], categories: Category[]) {
  const txStore = createFakeTransactionStore(transactions);
  const catStore = createFakeCategoryStore(categories);
  TestBed.configureTestingModule({
    providers: [
      LogPage,
      { provide: TransactionStore, useValue: txStore },
      { provide: CategoryStore, useValue: catStore },
    ],
  });
  const page = TestBed.inject(LogPage);
  return { page, txStore, catStore };
}

/** editDialog/deleteDialog sono viewChild.required: si risolvono solo dopo un detectChanges reale.
 *  Li sostituiamo con uno stub via bracket-notation (bypassa il private di TS) per evitare che
 *  startEdit/askDelete/confirmDelete lancino leggendoli senza render — l'apertura/chiusura del
 *  dialog stesso è responsabilità di @spartan-ng/helm, non di questa classe. */
function stubDialogs(page: LogPage) {
  const editDialog = { open: vi.fn(), close: vi.fn() };
  const deleteDialog = { open: vi.fn(), close: vi.fn() };
  (page as unknown as Record<string, unknown>)['editDialog'] = () => editDialog;
  (page as unknown as Record<string, unknown>)['deleteDialog'] = () => deleteDialog;
  return { editDialog, deleteDialog };
}

describe('LogPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('shiftMonth', () => {
    it('shifts within the same year for a normal delta', () => {
      const { page } = createPage([], []);
      page.year.set(2026);
      page.month.set(6);

      page.shiftMonth(1);

      expect(page.year()).toBe(2026);
      expect(page.month()).toBe(7);
    });

    it('rolls December + 1 over to January of the next year', () => {
      const { page } = createPage([], []);
      page.year.set(2026);
      page.month.set(12);

      page.shiftMonth(1);

      expect(page.month()).toBe(1);
      expect(page.year()).toBe(2027);
    });

    it('rolls January - 1 back to December of the previous year', () => {
      const { page } = createPage([], []);
      page.year.set(2026);
      page.month.set(1);

      page.shiftMonth(-1);

      expect(page.month()).toBe(12);
      expect(page.year()).toBe(2025);
    });
  });

  describe('filtered / displayedItems / totals / groups', () => {
    const catFood = makeCategory({
      id: 'cat-food',
      name: 'Alimentari',
      kind: 'expense',
      subcategories: [
        { id: 'sub-resto', name: 'Ristorante' },
        { id: 'sub-spesa', name: 'Spesa' },
      ],
    });
    const catSalary = makeCategory({ id: 'cat-salary', name: 'Stipendio', kind: 'income' });
    const categories = [catFood, catSalary];

    // Giugno 2026: tx4 (06-15), tx2 (06-10), tx1 e tx5 (entrambe 06-05, tx1 prima di tx5).
    const tx1 = makeTx({ id: 'tx1', date: '2026-06-05', type: 'expense', amount: 25, categoryId: 'cat-food', subcategoryId: 'sub-resto', description: 'Pizza da Mario', tag: null });
    const tx5 = makeTx({ id: 'tx5', date: '2026-06-05', type: 'expense', amount: 5, categoryId: 'cat-food', subcategoryId: null, description: 'Caffè', tag: 'planned' });
    const tx2 = makeTx({ id: 'tx2', date: '2026-06-10', type: 'income', amount: 2000, categoryId: 'cat-salary', subcategoryId: null, description: 'Stipendio giugno', tag: null });
    const tx4 = makeTx({ id: 'tx4', date: '2026-06-15', type: 'transfer', amount: 500, categoryId: TRANSFER_CATEGORY_ID, subcategoryId: null, description: 'Giroconto', tag: null });
    // Maggio 2026: usata solo per provare che la ricerca guarda anche fuori dal mese aperto.
    const tx3 = makeTx({ id: 'tx3', date: '2026-05-20', type: 'expense', amount: 15, categoryId: 'cat-food', subcategoryId: 'sub-spesa', description: 'Pizza surgelata supermercato', tag: 'unexpected' });

    function setupJune() {
      const ctx = createPage([tx1, tx2, tx3, tx4, tx5], categories);
      ctx.page.year.set(2026);
      ctx.page.month.set(6);
      return ctx;
    }

    describe('filtered', () => {
      it('with no search text, uses txStore.byMonth for the current month only', () => {
        const { page, txStore } = setupJune();

        const ids = page.filtered().map((t) => t.id);

        expect(ids).toEqual(txStore.byMonth(2026, 6).map((t) => t.id));
        expect(ids).toEqual(['tx4', 'tx2', 'tx1', 'tx5']);
      });

      it('with search text set, searches txStore.sorted() across ALL months, case-insensitively', () => {
        const { page } = setupJune();
        // Mese aperto volutamente diverso da quello dei movimenti che matchano, per provare
        // che la ricerca non si limita al mese corrente.
        page.year.set(2026);
        page.month.set(1);
        page.search.set('PiZzA');

        const ids = page.filtered().map((t) => t.id);

        expect(ids).toEqual(['tx1', 'tx3']);
      });

      it('narrows by categoryId when a category filter is active', () => {
        const { page } = setupJune();
        page.filterCategory.set('cat-food');

        const ids = page.filtered().map((t) => t.id);

        expect(ids.sort()).toEqual(['tx1', 'tx5']);
      });

      it('narrows further by subcategoryId when a sub-filter is also active', () => {
        const { page } = setupJune();
        page.filterCategory.set('cat-food');
        page.filterSub.set('sub-resto');

        const ids = page.filtered().map((t) => t.id);

        expect(ids).toEqual(['tx1']);
      });
    });

    describe('displayedItems', () => {
      it('narrows filtered() by filterTag when set', () => {
        const { page } = setupJune();
        page.filterTag.set('planned');

        expect(page.displayedItems().map((t) => t.id)).toEqual(['tx5']);
      });

      it('is unchanged from filtered() when filterTag is null', () => {
        const { page } = setupJune();

        expect(page.displayedItems().map((t) => t.id)).toEqual(page.filtered().map((t) => t.id));
      });
    });

    describe('totIncome / totExpense / balance', () => {
      it('sums income and expense from filtered(), excluding transfers, and computes the balance', () => {
        const { page } = setupJune();

        expect(page.totIncome()).toBe(2000);
        expect(page.totExpense()).toBe(30);
        expect(page.balance()).toBe(1970);
      });
    });

    describe('groups', () => {
      it('groups displayedItems() by date, sorted descending, with label from formatDayLabel', () => {
        const { page } = setupJune();

        const groups = page.groups();

        expect(groups.map((g) => g.date)).toEqual(['2026-06-15', '2026-06-10', '2026-06-05']);
        expect(groups.map((g) => g.items.map((t) => t.id))).toEqual([['tx4'], ['tx2'], ['tx1', 'tx5']]);
        for (const g of groups) {
          expect(g.label).toBe(formatDayLabel(g.date));
        }
      });
    });
  });

  describe('onFilterCategory / onFilterSub / setFilterTag / clearFilters', () => {
    it('onFilterCategory ignores non-string/empty values', () => {
      const { page } = createPage([], []);

      page.onFilterCategory(42);
      page.onFilterCategory('');
      page.onFilterCategory(null);

      expect(page.filterCategory()).toBe('__all__');
    });

    it('onFilterCategory sets filterCategory and resets filterSub to __all__', () => {
      const { page } = createPage([], []);
      page.filterSub.set('some-sub');

      page.onFilterCategory('cat-food');

      expect(page.filterCategory()).toBe('cat-food');
      expect(page.filterSub()).toBe('__all__');
    });

    it('onFilterSub ignores non-string/empty values', () => {
      const { page } = createPage([], []);

      page.onFilterSub(42);
      page.onFilterSub('');

      expect(page.filterSub()).toBe('__all__');
    });

    it('onFilterSub sets filterSub for a valid value', () => {
      const { page } = createPage([], []);

      page.onFilterSub('sub-resto');

      expect(page.filterSub()).toBe('sub-resto');
    });

    it('setFilterTag toggles: setting the same tag again clears it', () => {
      const { page } = createPage([], []);

      page.setFilterTag('unexpected');
      expect(page.filterTag()).toBe('unexpected');

      page.setFilterTag('unexpected');
      expect(page.filterTag()).toBeNull();
    });

    it('setFilterTag replaces a different active tag rather than toggling it off', () => {
      const { page } = createPage([], []);

      page.setFilterTag('unexpected');
      page.setFilterTag('planned');

      expect(page.filterTag()).toBe('planned');
    });

    it('clearFilters resets category, sub and tag filters', () => {
      const { page } = createPage([], []);
      page.filterCategory.set('cat-food');
      page.filterSub.set('sub-resto');
      page.filterTag.set('planned');

      page.clearFilters();

      expect(page.filterCategory()).toBe('__all__');
      expect(page.filterSub()).toBe('__all__');
      expect(page.filterTag()).toBeNull();
    });
  });

  describe('cycleTag', () => {
    it('cycles null -> unexpected', () => {
      const tx = makeTx({ id: 'tx1', tag: null });
      const { page, txStore } = createPage([tx], []);

      page.cycleTag(tx);

      expect(txStore.update).toHaveBeenCalledWith('tx1', { tag: 'unexpected' });
    });

    it('cycles unexpected -> planned', () => {
      const tx = makeTx({ id: 'tx1', tag: 'unexpected' });
      const { page, txStore } = createPage([tx], []);

      page.cycleTag(tx);

      expect(txStore.update).toHaveBeenCalledWith('tx1', { tag: 'planned' });
    });

    it('cycles planned -> null', () => {
      const tx = makeTx({ id: 'tx1', tag: 'planned' });
      const { page, txStore } = createPage([tx], []);

      page.cycleTag(tx);

      expect(txStore.update).toHaveBeenCalledWith('tx1', { tag: null });
    });
  });

  describe('startEdit / askDelete / confirmDelete (dialog-coupled)', () => {
    it('startEdit sets `editing` to the given transaction', () => {
      const tx = makeTx({ id: 'tx1' });
      const { page } = createPage([tx], []);
      stubDialogs(page);

      page.startEdit(tx);

      expect(page.editing()).toBe(tx);
    });

    it('askDelete sets `deleting` to the given transaction', () => {
      const tx = makeTx({ id: 'tx1' });
      const { page } = createPage([tx], []);
      stubDialogs(page);

      page.askDelete(tx);

      expect(page.deleting()).toBe(tx);
    });

    it('confirmDelete removes the transaction being deleted and clears `deleting`', () => {
      const tx = makeTx({ id: 'tx1' });
      const { page, txStore } = createPage([tx], []);
      stubDialogs(page);
      // Si imposta `deleting` direttamente invece di passare da askDelete, per non dipendere
      // dall'apertura reale del dialog (vedi nota su stubDialogs) — non si asserisce sulla
      // chiusura del dialog, solo sull'esito osservabile lato store.
      page.deleting.set(tx);

      page.confirmDelete();

      expect(txStore.remove).toHaveBeenCalledWith('tx1');
      expect(page.deleting()).toBeNull();
    });

    it('confirmDelete does not call txStore.remove when nothing is being deleted', () => {
      const { page, txStore } = createPage([], []);
      stubDialogs(page);
      page.deleting.set(null);

      page.confirmDelete();

      expect(txStore.remove).not.toHaveBeenCalled();
    });
  });

  // Il builder Angular per Vitest non supporta `vi.mock()` su import relativi ("The 'vi.mock'
  // and related methods are not supported ... Please use Angular TestBed for mocking
  // dependencies"), quindi non si può mockare '../../core/export' come suggerito in astratto.
  // Si intercetta invece l'output osservabile reale: si spia `URL.createObjectURL` (API globale,
  // non un import relativo) per recuperare il Blob costruito da downloadFile() e si legge il suo
  // testo, cioè l'output vero di toCsv() — un'asserzione sull'esito reale, non sugli argomenti di
  // una mock, e comunque equivalente a verificare le righe passate a toCsv.
  describe('exportCsv', () => {
    function spyOnDownload() {
      const blobs: Blob[] = [];
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
        blobs.push(obj as Blob);
        return 'blob:mock-url';
      });
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      return { blobs, createObjectURL, revokeObjectURL, click };
    }

    /** Nessuno dei valori di test contiene `;`, virgolette o newline: il quoting di toCsv/csvField non entra in gioco. */
    function joinCsv(rows: string[][]): string {
      return rows.map((cols) => cols.join(';')).join('\r\n');
    }

    it('builds CSV rows with transfer override, sub/no-sub, tag/no-tag, and comma decimals', async () => {
      const { blobs, click } = spyOnDownload();

      const catFood = makeCategory({ id: 'cat-food', name: 'Alimentari', subcategories: [{ id: 'sub-resto', name: 'Ristorante' }] });
      const catSalary = makeCategory({ id: 'cat-salary', name: 'Stipendio', kind: 'income' });
      // Categoria "trabocchetto": stesso id del sentinel di trasferimento, con un nome diverso,
      // per provare che l'export ignora comunque byId() e scrive sempre 'Trasferimento'.
      const catTransferDecoy = makeCategory({ id: TRANSFER_CATEGORY_ID, name: 'NON-DOVREBBE-APPARIRE' });

      const txTransfer = makeTx({ id: 'txA', date: '2026-06-01', type: 'transfer', amount: 123.4, categoryId: TRANSFER_CATEGORY_ID, subcategoryId: null, description: 'Trasferimento conto', tag: null });
      const txWithSub = makeTx({ id: 'txB', date: '2026-06-02', type: 'expense', amount: 40, categoryId: 'cat-food', subcategoryId: 'sub-resto', description: 'Pranzo', tag: null });
      const txNoSub = makeTx({ id: 'txC', date: '2026-06-03', type: 'expense', amount: 22.5, categoryId: 'cat-food', subcategoryId: null, description: 'Spesa', tag: null });
      const txTagged = makeTx({ id: 'txD', date: '2026-06-04', type: 'income', amount: 300, categoryId: 'cat-salary', subcategoryId: null, description: 'Bonus', tag: 'planned' });

      const { page } = createPage(
        [txTransfer, txWithSub, txNoSub, txTagged],
        [catFood, catSalary, catTransferDecoy],
      );
      page.year.set(2026);
      page.month.set(6);

      page.exportCsv();

      const header = ['Data', 'Tipo', 'Categoria', 'Sottocategoria', 'Descrizione', 'Importo', 'Etichetta'];
      const expectedRows = [
        header,
        ['2026-06-04', 'Entrata', 'Stipendio', '', 'Bonus', '300,00', TRANSACTION_TAG_LABEL.planned],
        ['2026-06-03', 'Uscita', 'Alimentari', '', 'Spesa', '22,50', ''],
        ['2026-06-02', 'Uscita', 'Alimentari', 'Ristorante', 'Pranzo', '40,00', ''],
        ['2026-06-01', 'Trasferimento', 'Trasferimento', '', 'Trasferimento conto', '123,40', ''],
      ];

      expect(blobs).toHaveLength(1);
      expect(blobs[0].type).toBe('text/csv;charset=utf-8;');
      await expect(blobs[0].text()).resolves.toBe(joinCsv(expectedRows));
      expect(click).toHaveBeenCalledTimes(1);
    });

    it('exports an empty CSV (header only) when there is nothing to display', async () => {
      const { blobs } = spyOnDownload();
      const { page } = createPage([], []);
      page.year.set(2026);
      page.month.set(6);

      page.exportCsv();

      await expect(blobs[0].text()).resolves.toBe(
        joinCsv([['Data', 'Tipo', 'Categoria', 'Sottocategoria', 'Descrizione', 'Importo', 'Etichetta']]),
      );
    });
  });
});
