import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { BrnDialog, BrnDialogContent } from '@spartan-ng/brain/dialog';
import { Transaction } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { MONTHS_LONG, MONTHS_SHORT, eur, eurSigned, formatDayLabel } from '../../core/format';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmDialogContent, HlmDialogOverlay, HlmDialogTitle, HlmDialogClose } from '@spartan-ng/helm/dialog';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { TransactionForm } from './transaction-form';

interface DayGroup {
  date: string;
  label: string;
  items: Transaction[];
}

@Component({
  selector: 'app-log-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmButton,
    HlmCard,
    HlmLabel,
    TransactionForm,
    BrnDialog,
    BrnDialogContent,
    HlmDialogOverlay,
    HlmDialogContent,
    HlmDialogTitle,
    HlmDialogClose,
    ...HlmSelectImports,
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

  readonly editing = signal<Transaction | null>(null);
  readonly deleting = signal<Transaction | null>(null);

  private readonly editDialog = viewChild.required<BrnDialog>('editDialog');
  private readonly deleteDialog = viewChild.required<BrnDialog>('deleteDialog');

  readonly monthStamp = computed(() => MONTHS_SHORT[this.month() - 1]);
  readonly monthLong = computed(() => MONTHS_LONG[this.month() - 1]);

  readonly filterSubs = computed(() => {
    this.catStore.categories();
    const catId = this.filterCategory();
    return catId === '__all__' ? [] : this.catStore.activeSubs(catId);
  });

  readonly filtered = computed(() => {
    let items = this.txStore.byMonth(this.year(), this.month());
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
}
