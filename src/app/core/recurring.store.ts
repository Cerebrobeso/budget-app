import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { dateToIso, isoToDate } from './format';
import { RecurringRule, todayIso, uid } from './models';
import { BUDGET_REPOSITORY } from './repository';
import { TransactionStore } from './transaction.store';
import { reportWriteFailure } from './write-failure';

/** Ultimo giorno valido del mese (es. dayOfMonth 31 in febbraio -> 28/29). */
function clampDay(year: number, month1: number, day: number): number {
  const lastDay = new Date(year, month1, 0).getDate();
  return Math.min(day, lastDay);
}

function isoAt(year: number, month1: number, day: number): string {
  return dateToIso(new Date(year, month1 - 1, clampDay(year, month1, day)));
}

/** "19º rata di 36" — o "<descrizione> — 19º rata di 36" se la regola ha una descrizione. */
function formatInstallmentDescription(base: string, index: number, total: number): string {
  const suffix = `${index}º rata di ${total}`;
  return base ? `${base} — ${suffix}` : suffix;
}

/**
 * Date (in ordine) da generare per una regola, tra l'ultima generata (esclusa, se presente)
 * e oggi (inclusa). Il giorno di `rule.startDate` non conta: solo l'anno/mese di partenza.
 */
function duePeriods(rule: RecurringRule, lastGeneratedIso: string | null, todayIsoStr: string): string[] {
  const from = isoToDate(lastGeneratedIso ?? rule.startDate);
  let year = from.getFullYear();
  let month = from.getMonth() + 1;
  if (lastGeneratedIso) {
    month++;
    if (month > 12) { month = 1; year++; }
  }
  const dates: string[] = [];
  while (dates.length < 1200) {
    const candidate = isoAt(year, month, rule.dayOfMonth);
    if (candidate > todayIsoStr) break;
    dates.push(candidate);
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return dates;
}

@Injectable({ providedIn: 'root' })
export class RecurringStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  private readonly txStore = inject(TransactionStore);
  readonly rules = signal<RecurringRule[]>([]);
  readonly ready = signal(false);

  readonly active = computed(() => this.rules().filter((r) => !r.archived));

  constructor() {
    effect(() => {
      const ready = this.auth.ready();
      const user = this.auth.user();
      if (!ready) return;
      void this.reload(user);
    });

    // Non appena regole e movimenti sono pronti, genera una tantum i movimenti mancanti.
    // `untracked` evita che l'effect si ripeta ad ogni nuovo movimento aggiunto.
    effect(() => {
      const rulesReady = this.ready();
      const txReady = this.txStore.ready();
      if (rulesReady && txReady) untracked(() => this.generateDue());
    });
  }

  private async reload(user: User | null): Promise<void> {
    this.ready.set(false);
    if (!user) {
      this.rules.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadRecurringRules();
    this.rules.set(stored ?? []);
    this.ready.set(true);
  }

  byId(id: string): RecurringRule | undefined {
    return this.rules().find((r) => r.id === id);
  }

  /** Progresso di un piano a rate: null se la regola è una ricorrenza senza fine. */
  installmentProgress(rule: RecurringRule): { index: number; total: number } | null {
    if (rule.startOccurrence == null || rule.totalOccurrences == null) return null;
    const linked = this.txStore.transactions().filter((t) => t.recurringRuleId === rule.id);
    const index = Math.min(rule.startOccurrence + Math.max(linked.length - 1, 0), rule.totalOccurrences);
    return { index, total: rule.totalOccurrences };
  }

  add(rule: Omit<RecurringRule, 'id'>): void {
    const newRule: RecurringRule = { ...rule, id: uid() };
    this.rules.update((list) => [...list, newRule]);
    this.repo.addRecurringRule(newRule).catch((err) =>
      reportWriteFailure(err, () => this.rules.update((list) => list.filter((r) => r.id !== newRule.id))),
    );
    this.generateDue();
  }

  setArchived(id: string, archived: boolean): void {
    const current = this.byId(id);
    if (!current) return;
    this.rules.update((list) => list.map((r) => (r.id === id ? { ...r, archived } : r)));
    this.repo.updateRecurringRule(id, { archived }).catch((err) =>
      reportWriteFailure(err, () => this.rules.update((list) => list.map((r) => (r.id === id ? current : r)))),
    );
  }

  update(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): void {
    const current = this.byId(id);
    if (!current) return;
    this.rules.update((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    this.repo.updateRecurringRule(id, patch).catch((err) =>
      reportWriteFailure(err, () => this.rules.update((list) => list.map((r) => (r.id === id ? current : r)))),
    );
  }

  remove(id: string): void {
    const removed = this.byId(id);
    this.rules.update((list) => list.filter((r) => r.id !== id));
    this.repo.removeRecurringRule(id).catch((err) =>
      reportWriteFailure(err, () => {
        if (removed) this.rules.update((list) => [...list, removed]);
      }),
    );
  }

  /** Ripristina una regola già rimossa (stesso id), per l'"Annulla" dopo un'eliminazione. */
  restore(rule: RecurringRule): void {
    this.rules.update((list) => [...list, rule]);
    this.repo.addRecurringRule(rule).catch((err) =>
      reportWriteFailure(err, () => this.rules.update((list) => list.filter((r) => r.id !== rule.id))),
    );
  }

  /**
   * Genera i movimenti dovuti fino a oggi per ogni regola attiva, guardando i movimenti già
   * collegati a ciascuna regola per capire da dove riprendere. Best-effort lato client: con più
   * dispositivi aperti nello stesso istante una doppia generazione è in teoria possibile ma
   * estremamente improbabile per un uso personale, e si autocorregge al giro successivo.
   */
  private generateDue(): void {
    const today = todayIso();
    for (const rule of this.active()) {
      const linked = this.txStore.transactions().filter((t) => t.recurringRuleId === rule.id);
      const lastDate = linked.length ? linked.reduce((m, t) => (t.date > m ? t.date : m), linked[0].date) : null;
      let dates = duePeriods(rule, lastDate, today);

      const isInstallment = rule.startOccurrence != null && rule.totalOccurrences != null;
      // Numero di rate che questa regola deve generare in tutto (può iniziare a metà piano).
      const neededCount = isInstallment ? rule.totalOccurrences! - rule.startOccurrence! + 1 : Infinity;
      if (isInstallment) dates = dates.slice(0, Math.max(0, neededCount - linked.length));

      let count = linked.length;
      for (const date of dates) {
        count++;
        const description = isInstallment
          ? formatInstallmentDescription(rule.description, rule.startOccurrence! + count - 1, rule.totalOccurrences!)
          : rule.description;
        this.txStore.add({
          type: rule.type,
          amount: rule.amount,
          categoryId: rule.categoryId,
          subcategoryId: rule.subcategoryId,
          date,
          description,
          recurringRuleId: rule.id,
          tag: null,
        });
      }

      if (isInstallment && count >= neededCount) this.setArchived(rule.id, true);
    }
  }
}
