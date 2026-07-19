import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { toast } from '@spartan-ng/brain/sonner';
import { AuthService } from './auth.service';
import { isoToDate } from './format';
import { Asset, AssetSnapshot, Category, RecurringRule, Subcategory, Transaction, todayIso, uid } from './models';
import { BUDGET_REPOSITORY } from './repository';

/** Annulla l'update ottimistico e avvisa l'utente se la scrittura remota fallisce. */
function reportWriteFailure(err: unknown, rollback: () => void): void {
  console.error(err);
  rollback();
  toast.error('Salvataggio non riuscito. Controlla la connessione e riprova.');
}

@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly categories = signal<Category[]>([]);
  readonly ready = signal(false);

  readonly active = computed(() => this.categories().filter((c) => !c.archived));
  readonly expenseCategories = computed(() => this.active().filter((c) => c.kind === 'expense'));
  readonly incomeCategories = computed(() => this.active().filter((c) => c.kind === 'income'));

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
      this.categories.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadCategories();
    this.categories.set(stored ?? []);
    this.ready.set(true);
  }

  byId(id: string): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }

  label(categoryId: string, subcategoryId: string | null): string {
    const cat = this.byId(categoryId);
    if (!cat) return categoryId;
    const sub = subcategoryId ? cat.subcategories.find((s) => s.id === subcategoryId) : undefined;
    return sub ? `${cat.name} · ${sub.name}` : cat.name;
  }

  color(categoryId: string): string {
    return this.byId(categoryId)?.color ?? '#6B6F68';
  }

  addCategory(name: string, kind: 'expense' | 'income', color: string): void {
    const cat: Category = { id: uid(), name, kind, color, subcategories: [{ id: uid(), name: 'Altro' }] };
    this.categories.update((list) => [...list, cat]);
    this.repo.addCategory(cat).catch((err) =>
      reportWriteFailure(err, () => this.categories.update((list) => list.filter((c) => c.id !== cat.id))),
    );
  }

  renameCategory(id: string, name: string): void {
    this.patch(id, () => ({ name }));
  }

  setArchived(id: string, archived: boolean): void {
    this.patch(id, () => ({ archived }));
  }

  addSubcategory(categoryId: string, name: string): void {
    this.patch(categoryId, (c) => ({ subcategories: [...c.subcategories, { id: uid(), name }] }));
  }

  renameSubcategory(categoryId: string, subId: string, name: string): void {
    this.patch(categoryId, (c) => ({
      subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, name } : s)),
    }));
  }

  setSubArchived(categoryId: string, subId: string, archived: boolean): void {
    this.patch(categoryId, (c) => ({
      subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, archived } : s)),
    }));
  }

  activeSubs(categoryId: string): Subcategory[] {
    return (this.byId(categoryId)?.subcategories ?? []).filter((s) => !s.archived);
  }

  private patch(id: string, fn: (c: Category) => Partial<Category>): void {
    const current = this.byId(id);
    if (!current) return;
    const partial = fn(current);
    this.categories.update((list) => list.map((c) => (c.id === id ? { ...c, ...partial } : c)));
    this.repo.updateCategory(id, partial).catch((err) =>
      reportWriteFailure(err, () => this.categories.update((list) => list.map((c) => (c.id === id ? current : c)))),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class TransactionStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly transactions = signal<Transaction[]>([]);
  readonly ready = signal(false);

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

  add(tx: Omit<Transaction, 'id'>): void {
    const newTx: Transaction = { ...tx, id: uid() };
    this.transactions.update((list) => [...list, newTx]);
    this.repo.addTransaction(newTx).catch((err) =>
      reportWriteFailure(err, () => this.transactions.update((list) => list.filter((t) => t.id !== newTx.id))),
    );
  }

  update(id: string, patch: Partial<Omit<Transaction, 'id'>>): void {
    const current = this.transactions().find((t) => t.id === id);
    this.transactions.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    this.repo.updateTransaction(id, patch).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.transactions.update((list) => list.map((t) => (t.id === id ? current : t)));
      }),
    );
  }

  remove(id: string): void {
    const removed = this.transactions().find((t) => t.id === id);
    this.transactions.update((list) => list.filter((t) => t.id !== id));
    this.repo.removeTransaction(id).catch((err) =>
      reportWriteFailure(err, () => {
        if (removed) this.transactions.update((list) => [...list, removed]);
      }),
    );
  }

  /** Movimenti di un mese: month è 1-based. */
  byMonth(year: number, month: number): Transaction[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.sorted().filter((t) => t.date.startsWith(prefix));
  }

  inRange(fromIso: string, toIso: string): Transaction[] {
    return this.sorted().filter((t) => t.date >= fromIso && t.date <= toIso);
  }
}

/** Ultimo giorno valido del mese (es. dayOfMonth 31 in febbraio -> 28/29). */
function clampDay(year: number, month1: number, day: number): number {
  const lastDay = new Date(year, month1, 0).getDate();
  return Math.min(day, lastDay);
}

function isoAt(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(clampDay(year, month1, day)).padStart(2, '0')}`;
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

  remove(id: string): void {
    const removed = this.byId(id);
    this.rules.update((list) => list.filter((r) => r.id !== id));
    this.repo.removeRecurringRule(id).catch((err) =>
      reportWriteFailure(err, () => {
        if (removed) this.rules.update((list) => [...list, removed]);
      }),
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
        });
      }

      if (isInstallment && count >= neededCount) this.setArchived(rule.id, true);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly assets = signal<Asset[]>([]);
  readonly ready = signal(false);

  readonly active = computed(() => this.assets().filter((a) => !a.archived));

  readonly totalValue = computed(() =>
    this.active().reduce((sum, a) => sum + (latest(a)?.value ?? 0), 0),
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
      this.assets.set([]);
      this.ready.set(true);
      return;
    }
    const stored = await this.repo.loadAssets();
    this.assets.set(stored ?? []);
    this.ready.set(true);
  }

  add(asset: Omit<Asset, 'id'>): void {
    const newAsset: Asset = { ...asset, id: uid() };
    this.assets.update((list) => [...list, newAsset]);
    this.repo.addAsset(newAsset).catch((err) =>
      reportWriteFailure(err, () => this.assets.update((list) => list.filter((a) => a.id !== newAsset.id))),
    );
  }

  rename(id: string, name: string): void {
    const current = this.assets().find((a) => a.id === id);
    this.assets.update((list) => list.map((a) => (a.id === id ? { ...a, name } : a)));
    this.repo.updateAsset(id, { name }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === id ? current : a)));
      }),
    );
  }

  setArchived(id: string, archived: boolean): void {
    const current = this.assets().find((a) => a.id === id);
    this.assets.update((list) => list.map((a) => (a.id === id ? { ...a, archived } : a)));
    this.repo.updateAsset(id, { archived }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === id ? current : a)));
      }),
    );
  }

  remove(id: string): void {
    const removed = this.assets().find((a) => a.id === id);
    this.assets.update((list) => list.filter((a) => a.id !== id));
    this.repo.removeAsset(id).catch((err) =>
      reportWriteFailure(err, () => {
        if (removed) this.assets.update((list) => [...list, removed]);
      }),
    );
  }

  /** Aggiunge o sostituisce lo snapshot alla data indicata. */
  addSnapshot(assetId: string, snap: AssetSnapshot): void {
    const current = this.assets().find((a) => a.id === assetId);
    let newSnapshots: AssetSnapshot[] = [];
    this.assets.update((list) =>
      list.map((a) => {
        if (a.id !== assetId) return a;
        const others = a.snapshots.filter((s) => s.date !== snap.date);
        newSnapshots = [...others, snap].sort((x, y) => x.date.localeCompare(y.date));
        return { ...a, snapshots: newSnapshots };
      }),
    );
    this.repo.updateAsset(assetId, { snapshots: newSnapshots }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === assetId ? current : a)));
      }),
    );
  }

  removeSnapshot(assetId: string, date: string): void {
    const current = this.assets().find((a) => a.id === assetId);
    let newSnapshots: AssetSnapshot[] = [];
    this.assets.update((list) =>
      list.map((a) => {
        if (a.id !== assetId) return a;
        newSnapshots = a.snapshots.filter((s) => s.date !== date);
        return { ...a, snapshots: newSnapshots };
      }),
    );
    this.repo.updateAsset(assetId, { snapshots: newSnapshots }).catch((err) =>
      reportWriteFailure(err, () => {
        if (current) this.assets.update((list) => list.map((a) => (a.id === assetId ? current : a)));
      }),
    );
  }

  /** Serie storica del patrimonio totale: per ogni data nota, somma degli ultimi valori disponibili. */
  readonly totalSeries = computed<AssetSnapshot[]>(() => {
    const assets = this.active();
    const dates = [...new Set(assets.flatMap((a) => a.snapshots.map((s) => s.date)))].sort();
    return dates.map((date) => ({
      date,
      value: assets.reduce((sum, a) => {
        const last = [...a.snapshots].filter((s) => s.date <= date).at(-1);
        return sum + (last?.value ?? 0);
      }, 0),
    }));
  });
}

export function latest(asset: Asset): AssetSnapshot | undefined {
  return asset.snapshots.at(-1);
}

/** Rendimento % tra il primo e l'ultimo snapshot compresi nel range. */
export function returnPct(snaps: AssetSnapshot[], fromIso: string, toIso: string): number | null {
  const inRange = snaps.filter((s) => s.date >= fromIso && s.date <= toIso);
  if (inRange.length < 2) return null;
  const first = inRange[0].value;
  const last = inRange[inRange.length - 1].value;
  if (first === 0) return null;
  return ((last - first) / first) * 100;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly key = 'registro.theme';
  readonly dark = signal<boolean>(this.initial());

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle('dark', this.dark());
      localStorage.setItem(this.key, this.dark() ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.dark.update((d) => !d);
  }

  private initial(): boolean {
    const stored = localStorage.getItem(this.key);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
