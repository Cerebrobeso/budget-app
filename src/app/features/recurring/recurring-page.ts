import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaskitoDirective } from '@maskito/angular';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlay, lucidePause, lucideTrash2 } from '@ng-icons/lucide';
import { RecurringRule, TransactionType, todayIso } from '../../core/models';
import { CategoryStore, RecurringStore } from '../../core/stores';
import {
  AMOUNT_MASK,
  dateToIso,
  eur,
  isoToDate,
  parseAmountMask,
} from '../../core/format';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

@Component({
  selector: 'app-recurring-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MaskitoDirective,
    NgIcon,
    HlmButton,
    HlmCard,
    HlmInput,
    HlmLabel,
    ...HlmSelectImports,
    ...HlmDatePickerImports,
    ...HlmTabsImports,
    ...HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePlay, lucidePause, lucideTrash2 })],
  templateUrl: './recurring-page.html',
  styleUrl: './recurring-page.css',
})
export class RecurringPage {
  protected readonly store = inject(RecurringStore);
  protected readonly catStore = inject(CategoryStore);

  protected readonly amountMask = AMOUNT_MASK;
  protected readonly fmt = eur;

  readonly type = signal<TransactionType | null>(null);
  readonly amountText = signal('');
  readonly categoryId = signal<string>('');
  readonly subcategoryId = signal<string | null>(null);
  readonly description = signal('');
  readonly dayOfMonth = signal(1);
  readonly startDate = signal(todayIso());
  /** Piano a rate: entrambi vuoti = ricorrenza senza fine (comportamento di default). */
  readonly startOccurrenceText = signal('');
  readonly totalOccurrencesText = signal('');

  readonly startDateValue = computed(() => isoToDate(this.startDate()));

  onStartDateChange(value: Date | null): void {
    if (value) this.startDate.set(dateToIso(value));
  }

  readonly availableCategories = computed(() => {
    const type = this.type();
    if (!type) return [];
    return type === 'income' ? this.catStore.incomeCategories() : this.catStore.expenseCategories();
  });

  readonly subs = computed(() => {
    this.catStore.categories();
    return this.categoryId() ? this.catStore.activeSubs(this.categoryId()) : [];
  });

  protected readonly categoryLabel = (id: string): string =>
    this.availableCategories().find((c) => c.id === id)?.name ?? id;

  protected readonly subcategoryLabel = (id: string): string =>
    this.subs().find((s) => s.id === id)?.name ?? id;

  readonly archived = computed(() => this.store.rules().filter((r) => r.archived));

  setType(t: TransactionType): void {
    if (t === this.type()) return;
    this.type.set(t);
    const first = this.availableCategories()[0];
    this.categoryId.set(first?.id ?? '');
    this.subcategoryId.set(first ? (this.catStore.activeSubs(first.id)[0]?.id ?? null) : null);
  }

  onCategoryChange(value: unknown): void {
    if (typeof value !== 'string' || !value) return;
    this.categoryId.set(value);
    this.subcategoryId.set(this.catStore.activeSubs(value)[0]?.id ?? null);
  }

  onSubChange(value: unknown): void {
    this.subcategoryId.set(typeof value === 'string' && value ? value : null);
  }

  categoryName(id: string): string {
    return this.catStore.byId(id)?.name ?? id;
  }

  subcategoryName(rule: RecurringRule): string | null {
    if (!rule.subcategoryId) return null;
    return this.catStore.subName(rule.categoryId, rule.subcategoryId) ?? null;
  }

  progress(rule: RecurringRule): { index: number; total: number } | null {
    return this.store.installmentProgress(rule);
  }

  /** "Completata" per un piano a rate esaurito, "In pausa" per tutto il resto. */
  archivedLabel(rule: RecurringRule): string {
    const p = this.progress(rule);
    return p && p.index >= p.total ? 'Completata' : 'In pausa';
  }

  add(): void {
    const type = this.type();
    const amount = parseAmountMask(this.amountText());
    if (!type || !amount || amount <= 0 || !this.categoryId()) return;

    const startOccurrence = parseInt(this.startOccurrenceText(), 10);
    const totalOccurrences = parseInt(this.totalOccurrencesText(), 10);
    const isInstallment =
      Number.isFinite(startOccurrence) && startOccurrence > 0 &&
      Number.isFinite(totalOccurrences) && totalOccurrences >= startOccurrence;

    this.store.add({
      type,
      amount: Math.round(amount * 100) / 100,
      categoryId: this.categoryId(),
      subcategoryId: this.subcategoryId(),
      description: this.description().trim(),
      dayOfMonth: Math.min(28, Math.max(1, Math.round(this.dayOfMonth()))),
      startDate: this.startDate(),
      ...(isInstallment ? { startOccurrence, totalOccurrences } : {}),
    });
    this.type.set(null);
    this.amountText.set('');
    this.categoryId.set('');
    this.subcategoryId.set(null);
    this.description.set('');
    this.dayOfMonth.set(1);
    this.startDate.set(todayIso());
    this.startOccurrenceText.set('');
    this.totalOccurrencesText.set('');
  }
}
