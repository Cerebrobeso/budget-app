import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { dateToIso, isoToDate } from './format';
import { RecurringRule, Transaction, todayIso, uid } from './models';
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

/** Distanza in mesi tra due date ISO (il giorno non conta): 0 se nello stesso mese. */
function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Numero della rata che cade in `dateIso`, per un piano che parte da `startOccurrence` nel mese di `startDate`. */
function installmentIndex(rule: RecurringRule, dateIso: string): number {
  return rule.startOccurrence! + monthsBetween(rule.startDate, dateIso);
}

/** Stesso movimento della regola a meno della data: tipo, importo e categorie. */
function matchesRule(tx: Transaction, rule: RecurringRule): boolean {
  return (
    tx.type === rule.type &&
    tx.amount === rule.amount &&
    tx.categoryId === rule.categoryId &&
    tx.subcategoryId === rule.subcategoryId
  );
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

  /**
   * Progresso di un piano a rate: null se la regola è una ricorrenza senza fine.
   * Il numero della rata si ricava dalla data dell'ultimo movimento, non da quanti sono:
   * cancellandone uno a mano il conteggio tornerebbe indietro e la regola genererebbe una rata in più.
   */
  installmentProgress(rule: RecurringRule): { index: number; total: number } | null {
    if (rule.startOccurrence == null || rule.totalOccurrences == null) return null;
    const lastDate = this.lastGeneratedDate(rule);
    const index = lastDate ? installmentIndex(rule, lastDate) : rule.startOccurrence;
    return { index: Math.min(Math.max(index, rule.startOccurrence), rule.totalOccurrences), total: rule.totalOccurrences };
  }

  /** Data del movimento più recente generato da questa regola, null se non ne ha ancora. */
  private lastGeneratedDate(rule: RecurringRule): string | null {
    const linked = this.txStore.transactions().filter((t) => t.recurringRuleId === rule.id);
    return linked.length ? linked.reduce((m, t) => (t.date > m ? t.date : m), linked[0].date) : null;
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
    // Cambiare data di partenza o giorno può scoprire mesi non ancora generati.
    this.generateDue();
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
    // Un caricamento fallito lascia la lista vuota: generare ora rifarebbe tutta la storia.
    if (this.txStore.loadFailed()) return;
    const today = todayIso();
    for (const rule of this.active()) {
      const lastDate = this.lastGeneratedDate(rule);
      // Al massimo un movimento al mese per regola: il collegamento via recurringRuleId non basta,
      // il movimento del mese può esserci senza (inserito a mano, importato, o da una regola
      // ricreata). Confronto per "firma" (tipo/importo/categorie), non per id.
      const coveredMonths = new Set(
        this.txStore
          .transactions()
          .filter((t) => t.recurringRuleId === rule.id || matchesRule(t, rule))
          .map((t) => t.date.slice(0, 7)),
      );
      const dates = duePeriods(rule, lastDate, today).filter((d) => !coveredMonths.has(d.slice(0, 7)));

      const isInstallment = rule.startOccurrence != null && rule.totalOccurrences != null;
      // La rata si ricava dal mese in cui cade, non da quante ne sono già state generate.
      for (const date of dates) {
        const index = isInstallment ? installmentIndex(rule, date) : 0;
        if (isInstallment && index > rule.totalOccurrences!) break;
        const description = isInstallment
          ? formatInstallmentDescription(rule.description, index, rule.totalOccurrences!)
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

      const progress = this.installmentProgress(rule);
      if (progress && progress.index >= progress.total) this.setArchived(rule.id, true);
    }
  }
}
