import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight, lucideDownload, lucidePencil, lucideSearch, lucideTrash2, lucideX } from '@ng-icons/lucide';
import { Transaction, todayIso } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { MONTHS_LONG, MONTHS_SHORT, eur, eurSigned, formatDayLabel } from '../../core/format';
import { downloadFile, toCsv } from '../../core/export';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { TransactionForm } from './transaction-form';
import {DatePipe} from '@angular/common';

interface DayGroup {
  date: string;
  label: string;
  items: Transaction[];
}

@Component({
  selector: 'app-log-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HlmButton,
    HlmCard,
    HlmInput,
    HlmLabel,
    NgIcon,
    TransactionForm,
    ...HlmDialogImports,
    ...HlmSelectImports,
    DatePipe
  ],
  providers: [
    provideIcons({ lucideChevronLeft, lucideChevronRight, lucideDownload, lucidePencil, lucideSearch, lucideTrash2, lucideX }),
  ],
  templateUrl: './log-page.html',
  styleUrl: './log-page.css',
})
export class LogPage {
  protected readonly txStore = inject(TransactionStore);
  protected readonly catStore = inject(CategoryStore);

  private readonly now = new Date();
  readonly year = signal(this.now.getFullYear());
  readonly month = signal(this.now.getMonth() + 1);
  readonly filterCategory = signal('__all__');
  readonly filterSub = signal('__all__');
  /** Testo di ricerca sulla descrizione: se valorizzato, cerca in tutti i mesi (non solo quello aperto). */
  readonly search = signal('');

  readonly editing = signal<Transaction | null>(null);
  readonly deleting = signal<Transaction | null>(null);

  private readonly editDialog = viewChild.required<HlmDialog>('editDialog');
  private readonly deleteDialog = viewChild.required<HlmDialog>('deleteDialog');

  readonly monthStamp = computed(() => MONTHS_SHORT[this.month() - 1]);
  readonly monthLong = computed(() => MONTHS_LONG[this.month() - 1]);

  readonly filterSubs = computed(() => {
    this.catStore.categories();
    const catId = this.filterCategory();
    return catId === '__all__' ? [] : this.catStore.activeSubs(catId);
  });

  /** Con una ricerca attiva si guarda in tutti i mesi, altrimenti solo in quello aperto. */
  readonly searching = computed(() => this.search().trim().length > 0);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    let items = term ? this.txStore.sorted() : this.txStore.byMonth(this.year(), this.month());
    if (term) items = items.filter((t) => t.description.toLowerCase().includes(term));
    const cat = this.filterCategory();
    if (cat !== '__all__') {
      items = items.filter((t) => t.categoryId === cat);
      const sub = this.filterSub();
      if (sub !== '__all__') items = items.filter((t) => t.subcategoryId === sub);
    }
    return items;
  });

  readonly totIncome = computed(() =>
    this.filtered().filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
  );
  readonly totExpense = computed(() =>
    this.filtered().filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
  );
  readonly balance = computed(() => this.totIncome() - this.totExpense());

  readonly groups = computed<DayGroup[]>(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of this.filtered()) {
      const list = map.get(tx.date) ?? [];
      list.push(tx);
      map.set(tx.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, label: formatDayLabel(date), items }));
  });

  shiftMonth(delta: number): void {
    let m = this.month() + delta;
    let y = this.year();
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    this.month.set(m);
    this.year.set(y);
  }

  onFilterCategory(value: unknown): void {
    if (typeof value !== 'string' || !value) return;
    this.filterCategory.set(value);
    this.filterSub.set('__all__');
  }

  onFilterSub(value: unknown): void {
    if (typeof value === 'string' && value) this.filterSub.set(value);
  }

  protected readonly categoryLabel = (id: string): string =>
    id === '__all__' ? 'Tutte le categorie' : (this.catStore.byId(id)?.name ?? id);

  protected readonly subcategoryLabel = (id: string): string =>
    id === '__all__' ? 'Tutte le sottocategorie' : (this.filterSubs().find((s) => s.id === id)?.name ?? id);

  startEdit(tx: Transaction): void {
    this.editing.set(tx);
    this.editDialog().open();
  }

  askDelete(tx: Transaction): void {
    this.deleting.set(tx);
    this.deleteDialog().open();
  }

  confirmDelete(): void {
    const tx = this.deleting();
    if (tx) this.txStore.remove(tx.id);
    this.deleteDialog().close({});
    this.deleting.set(null);
  }

  protected readonly fmt = eur;
  protected readonly fmtSigned = eurSigned;

  /** Esporta i movimenti attualmente visibili (con ricerca/filtri applicati) in CSV. */
  exportCsv(): void {
    const header = ['Data', 'Tipo', 'Categoria', 'Sottocategoria', 'Descrizione', 'Importo'];
    const rows = this.filtered().map((t) => [
      t.date,
      t.type === 'income' ? 'Entrata' : 'Uscita',
      this.catStore.byId(t.categoryId)?.name ?? t.categoryId,
      t.subcategoryId
        ? (this.catStore.byId(t.categoryId)?.subcategories.find((s) => s.id === t.subcategoryId)?.name ?? '')
        : '',
      t.description,
      t.amount.toFixed(2).replace('.', ','),
    ]);
    downloadFile(toCsv([header, ...rows]), `registro-movimenti-${todayIso()}.csv`, 'text/csv;charset=utf-8;');
  }
}
