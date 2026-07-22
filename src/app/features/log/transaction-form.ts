import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaskitoDirective } from '@maskito/angular';
import { Transaction, TransactionTag, TransactionType, TRANSFER_CATEGORY_ID, todayIso } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { AMOUNT_MASK, dateToIso, isoToDate, parseAmountMask, stringifyAmountMask } from '../../core/format';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';

let formIdSeq = 0;

/**
 * Inserimento rapido: importo prima di tutto, tipo a due tasti,
 * categoria/sottocategoria, data (default oggi), descrizione opzionale.
 * In modalità edit riceve la transazione da modificare.
 */
@Component({
  selector: 'app-transaction-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MaskitoDirective, HlmButton, HlmInput, HlmLabel, ...HlmSelectImports, ...HlmDatePickerImports],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.css',
})
export class TransactionForm {
  private readonly txStore = inject(TransactionStore);
  private readonly catStore = inject(CategoryStore);

  /** Unico per istanza: quickAdd ed editDialog possono restare montati insieme
   * (la scorciatoia "N" apre quickAdd anche a editDialog aperto), quindi il
   * bottone submit nel footer del dialog non può puntare a un id statico. */
  readonly formId = `tx-form-${++formIdSeq}`;

  /** Transazione in modifica, null per nuovo inserimento. */
  readonly transaction = input<Transaction | null>(null);
  readonly saved = output<void>();

  /** Testo del campo importo, formattato dalla maschera Maskito (punto delle migliaia, virgola decimale). */
  readonly amountText = signal<string>('');
  readonly amount = computed<number | null>(() => parseAmountMask(this.amountText()));
  protected readonly amountMask = AMOUNT_MASK;
  /** Nullo finché l'utente non sceglie Entrata/Uscita: gli input successivi restano disabilitati. */
  readonly type = signal<TransactionType | null>(null);
  readonly categoryId = signal<string>('spesa-quotidiana');
  readonly subcategoryId = signal<string | null>(null);
  readonly date = signal<string>(todayIso());
  readonly description = signal<string>('');
  readonly tag = signal<TransactionTag | null>(null);
  readonly error = signal<string>('');

  readonly dateValue = computed(() => isoToDate(this.date()));

  onDateChange(value: Date | null): void {
    if (value) this.date.set(dateToIso(value));
  }

  readonly availableCategories = computed(() => {
    const type = this.type();
    if (type === 'income') return this.catStore.incomeCategories();
    if (type === 'expense') return this.catStore.expenseCategories();
    return [];
  });

  readonly subs = computed(() => {
    // dipende dalle categorie per aggiornarsi se cambiano
    this.catStore.categories();
    return this.catStore.activeSubs(this.categoryId());
  });

  constructor() {
    effect(() => {
      const tx = this.transaction();
      if (tx) {
        this.amountText.set(stringifyAmountMask(tx.amount));
        this.type.set(tx.type);
        this.categoryId.set(tx.categoryId);
        this.subcategoryId.set(tx.subcategoryId);
        this.date.set(tx.date);
        this.description.set(tx.description);
        this.tag.set(tx.tag);
      }
    });
  }

  setType(t: TransactionType): void {
    if (t === this.type()) return;
    this.type.set(t);
    const first = this.availableCategories()[0];
    if (first && !this.availableCategories().some((c) => c.id === this.categoryId())) {
      this.categoryId.set(first.id);
      this.subcategoryId.set(this.catStore.activeSubs(first.id)[0]?.id ?? null);
    }
  }

  setTag(t: TransactionTag): void {
    this.tag.set(this.tag() === t ? null : t);
  }

  onCategoryChange(value: unknown): void {
    if (typeof value !== 'string' || !value) return;
    this.categoryId.set(value);
    this.subcategoryId.set(this.catStore.activeSubs(value)[0]?.id ?? null);
  }

  onSubChange(value: unknown): void {
    this.subcategoryId.set(typeof value === 'string' && value ? value : null);
  }

  protected readonly categoryLabel = (id: string): string =>
    this.availableCategories().find((c) => c.id === id)?.name ?? id;

  protected readonly subcategoryLabel = (id: string): string =>
    this.subs().find((s) => s.id === id)?.name ?? id;

  save(): void {
    const type = this.type();
    if (!type) {
      this.error.set('Seleziona Entrata, Uscita o Trasferimento.');
      return;
    }
    const amount = Number(this.amount());
    if (!amount || amount <= 0) {
      this.error.set('Inserisci un importo maggiore di zero.');
      return;
    }
    if (!this.date()) {
      this.error.set('Inserisci una data.');
      return;
    }
    this.error.set('');
    const existing = this.transaction();
    const isTransfer = type === 'transfer';
    const payload = {
      amount: Math.round(amount * 100) / 100,
      type,
      categoryId: isTransfer ? TRANSFER_CATEGORY_ID : this.categoryId(),
      subcategoryId: isTransfer ? null : this.subcategoryId(),
      date: this.date(),
      description: this.description().trim(),
      recurringRuleId: existing?.recurringRuleId ?? null,
      tag: this.tag(),
    };
    if (existing) {
      this.txStore.update(existing.id, payload);
    } else {
      this.txStore.add(payload);
      // pronto per il movimento successivo
      this.amountText.set('');
      this.description.set('');
      this.tag.set(null);
    }
    this.saved.emit();
  }
}
