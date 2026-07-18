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
import { Transaction, TransactionType, todayIso } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';

/**
 * Inserimento rapido: importo prima di tutto, tipo a due tasti,
 * categoria/sottocategoria, data (default oggi), descrizione opzionale.
 * In modalità edit riceve la transazione da modificare.
 */
@Component({
  selector: 'app-transaction-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, HlmButton, HlmInput, HlmLabel, ...HlmSelectImports],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.css',
})
export class TransactionForm {
  private readonly txStore = inject(TransactionStore);
  private readonly catStore = inject(CategoryStore);

  /** Transazione in modifica, null per nuovo inserimento. */
  readonly transaction = input<Transaction | null>(null);
  readonly saved = output<void>();

  readonly amount = signal<number | null>(null);
  readonly type = signal<TransactionType>('expense');
  readonly categoryId = signal<string>('spesa-quotidiana');
  readonly subcategoryId = signal<string | null>(null);
  readonly date = signal<string>(todayIso());
  readonly description = signal<string>('');
  readonly error = signal<string>('');

  readonly editing = computed(() => this.transaction() !== null);

  readonly availableCategories = computed(() =>
    this.type() === 'income' ? this.catStore.incomeCategories() : this.catStore.expenseCategories(),
  );

  readonly subs = computed(() => {
    // dipende dalle categorie per aggiornarsi se cambiano
    this.catStore.categories();
    return this.catStore.activeSubs(this.categoryId());
  });

  constructor() {
    effect(() => {
      const tx = this.transaction();
      if (tx) {
        this.amount.set(tx.amount);
        this.type.set(tx.type);
        this.categoryId.set(tx.categoryId);
        this.subcategoryId.set(tx.subcategoryId);
        this.date.set(tx.date);
        this.description.set(tx.description);
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
    const payload = {
      amount: Math.round(amount * 100) / 100,
      type: this.type(),
      categoryId: this.categoryId(),
      subcategoryId: this.subcategoryId(),
      date: this.date(),
      description: this.description().trim(),
    };
    const existing = this.transaction();
    if (existing) {
      this.txStore.update(existing.id, payload);
    } else {
      this.txStore.add(payload);
      // pronto per il movimento successivo
      this.amount.set(null);
      this.description.set('');
    }
    this.saved.emit();
  }
}
