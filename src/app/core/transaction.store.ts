import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { Transaction, uid } from './models';
import { BUDGET_REPOSITORY, TransactionQuery } from './repository';
import { reportWriteFailure } from './write-failure';

@Injectable({ providedIn: 'root' })
export class TransactionStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly transactions = signal<Transaction[]>([]);
  readonly ready = signal(false);

  /** Scatta quando una scrittura si è conclusa (successo o rollback): chi legge dal backend
   * può rileggere senza correre contro l'update ottimistico ancora in volo. */
  readonly revision = signal(0);
  private readonly bumpRevision = (): void => {
    this.revision.update((n) => n + 1);
  };

  readonly sorted = computed(() =>
    [...this.transactions()].sort((a, b) => b.date.localeCompare(a.date)),
  );

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const user = this.auth.user();
      if (!ready) return;
      void this.reload(user);
    });
  }

  private async reload(user: User | null): Promise<void> {
    this.ready.set(false);
    if (!user) {
      this.transactions.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadTransactions();
    this.transactions.set(stored ?? []);
    this.ready.set(true);
  }

  queryTransactions(query: TransactionQuery, signal?: AbortSignal): Promise<Transaction[] | null> {
    return this.repo.queryTransactions(query, signal);
  }

  add(tx: Omit<Transaction, 'id'>): void {
    const newTx: Transaction = { ...tx, id: uid() };
    this.transactions.update((list) => [...list, newTx]);
    this.repo
      .addTransaction(newTx)
      .catch((err) =>
        reportWriteFailure(err, () => this.transactions.update((list) => list.filter((t) => t.id !== newTx.id))),
      )
      .finally(this.bumpRevision);
  }

  update(id: string, patch: Partial<Omit<Transaction, 'id'>>): void {
    const current = this.transactions().find((t) => t.id === id);
    this.transactions.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    this.repo
      .updateTransaction(id, patch)
      .catch((err) =>
        reportWriteFailure(err, () => {
          if (current) this.transactions.update((list) => list.map((t) => (t.id === id ? current : t)));
        }),
      )
      .finally(this.bumpRevision);
  }

  remove(id: string): void {
    const removed = this.transactions().find((t) => t.id === id);
    this.transactions.update((list) => list.filter((t) => t.id !== id));
    this.repo
      .removeTransaction(id)
      .catch((err) =>
        reportWriteFailure(err, () => {
          if (removed) this.transactions.update((list) => [...list, removed]);
        }),
      )
      .finally(this.bumpRevision);
  }

  /** Nessun bulk insert lato Supabase: N addTransaction in parallelo, rollback solo delle righe fallite. */
  async addMany(items: Omit<Transaction, 'id'>[]): Promise<{ addedIds: string[]; failedCount: number }> {
    const newTxs: Transaction[] = items.map((tx) => ({ ...tx, id: uid() }));
    this.transactions.update((list) => [...list, ...newTxs]);
    const results = await Promise.allSettled(newTxs.map((tx) => this.repo.addTransaction(tx)));
    const failedIds = new Set(newTxs.filter((_, i) => results[i].status === 'rejected').map((t) => t.id));
    if (failedIds.size) {
      this.transactions.update((list) => list.filter((t) => !failedIds.has(t.id)));
    }
    this.bumpRevision();
    return {
      addedIds: newTxs.filter((t) => !failedIds.has(t.id)).map((t) => t.id),
      failedCount: failedIds.size,
    };
  }

  /** Sposta in blocco tutti i movimenti di una categoria su un'altra (la sottocategoria non si trasferisce). */
  reassignCategory(fromCategoryId: string, toCategoryId: string): void {
    for (const tx of this.transactions().filter((t) => t.categoryId === fromCategoryId)) {
      this.update(tx.id, { categoryId: toCategoryId, subcategoryId: null });
    }
  }

  inRange(fromIso: string, toIso: string): Transaction[] {
    return this.sorted().filter((t) => t.date >= fromIso && t.date <= toIso);
  }
}
