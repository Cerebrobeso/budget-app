import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import {
  CATEGORY_ADMIN_UID,
  Category,
  Subcategory,
  SubcategoryOverlay,
  TRANSFER_CATEGORY_ID,
  uid,
} from './models';
import { BUDGET_REPOSITORY } from './repository';
import { reportWriteFailure } from './write-failure';

@Injectable({ providedIn: 'root' })
export class CategoryStore {
  private readonly repo = inject(BUDGET_REPOSITORY);
  private readonly auth = inject(AuthService);
  readonly categories = signal<Category[]>([]);
  /** Sottocategorie che gli utenti aggiungono a categorie condivise: private, mai nella jsonb condivisa. */
  readonly subcategoryOverlays = signal<SubcategoryOverlay[]>([]);
  readonly ready = signal(false);

  /** Passo usato per distanziare l'ordine: le predefinite in db partono già a 100, 200, 300... */
  private readonly ORDER_GAP = 100;

  /**
   * Categoria + posizione effettiva: sortOrder se presente, altrimenti la posizione originale
   * (moltiplicata per il passo) così le categorie senza sortOrder ancora assegnato (create prima
   * di questo campo) mantengono l'ordine con cui sono arrivate dal repository.
   */
  private orderedActive(): { cat: Category; order: number }[] {
    return this.categories()
      .filter((c) => !c.archived)
      .map((cat, i) => ({ cat, order: cat.sortOrder ?? i * this.ORDER_GAP }))
      .sort((a, b) => a.order - b.order);
  }

  readonly active = computed(() => this.orderedActive().map((x) => x.cat));
  readonly expenseCategories = computed(() => this.active().filter((c) => c.kind === 'expense'));
  readonly incomeCategories = computed(() => this.active().filter((c) => c.kind === 'income'));
  /** Può modificare/creare qualsiasi categoria (anche condivise) e renderla predefinita. */
  readonly isAdmin = computed(() => this.auth.user()?.id === CATEGORY_ADMIN_UID);

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
      this.subcategoryOverlays.set([]);
      this.ready.set(true);
      return;
    }
    const [stored, overlays] = await Promise.all([this.repo.loadCategories(), this.repo.loadSubcategoryOverlays()]);
    this.categories.set(stored ?? []);
    this.subcategoryOverlays.set(overlays ?? []);
    this.ready.set(true);
  }

  byId(id: string): Category | undefined {
    return this.categories().find((c) => c.id === id);
  }

  /** Sottocategorie di una categoria: quelle proprie + quelle che l'utente ha aggiunto se condivisa. */
  allSubs(categoryId: string): Subcategory[] {
    const baked = this.byId(categoryId)?.subcategories ?? [];
    const overlays: Subcategory[] = this.subcategoryOverlays()
      .filter((o) => o.categoryId === categoryId)
      .map((o) => ({ id: o.id, name: o.name, archived: o.archived, overlay: true }));
    return [...baked, ...overlays];
  }

  subName(categoryId: string, subId: string): string | undefined {
    return this.allSubs(categoryId).find((s) => s.id === subId)?.name;
  }

  label(categoryId: string, subcategoryId: string | null): string {
    if (categoryId === TRANSFER_CATEGORY_ID) return 'Trasferimento';
    const cat = this.byId(categoryId);
    if (!cat) return categoryId;
    const sub = subcategoryId ? this.allSubs(categoryId).find((s) => s.id === subcategoryId) : undefined;
    return sub ? `${cat.name} · ${sub.name}` : cat.name;
  }

  color(categoryId: string): string {
    return this.byId(categoryId)?.color ?? '#6B6F68';
  }

  icon(categoryId: string): string | null {
    return this.byId(categoryId)?.icon ?? null;
  }

  addCategory(name: string, kind: 'expense' | 'income', color: string, icon: string | null = null): void {
    const cat: Category = { id: uid(), name, kind, color, icon, subcategories: [{ id: uid(), name: 'Altro' }] };
    this.categories.update((list) => [...list, cat]);
    this.repo.addCategory(cat).catch((err) =>
      reportWriteFailure(err, () => this.categories.update((list) => list.filter((c) => c.id !== cat.id))),
    );
  }

  renameCategory(id: string, name: string): void {
    this.patch(id, () => ({ name }));
  }

  setColor(id: string, color: string): void {
    this.patch(id, () => ({ color }));
  }

  setIcon(id: string, icon: string | null): void {
    this.patch(id, () => ({ icon }));
  }

  removeCategory(id: string): void {
    const removed = this.byId(id);
    this.categories.update((list) => list.filter((c) => c.id !== id));
    this.repo.removeCategory(id).catch((err) =>
      reportWriteFailure(err, () => {
        if (removed) this.categories.update((list) => [...list, removed]);
      }),
    );
  }

  setArchived(id: string, archived: boolean): void {
    this.patch(id, () => ({ archived }));
  }

  setShared(id: string, shared: boolean): void {
    this.patch(id, () => ({ shared }));
  }

  /** Sposta `draggedId` appena prima/dopo `targetId` nell'elenco, ricalcolando solo il suo sortOrder. */
  moveCategory(draggedId: string, targetId: string, position: 'before' | 'after'): void {
    if (draggedId === targetId) return;
    const rest = this.orderedActive().filter((x) => x.cat.id !== draggedId);
    const targetIdx = rest.findIndex((x) => x.cat.id === targetId);
    if (targetIdx === -1) return;
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    const prevOrder = insertAt > 0 ? rest[insertAt - 1].order : rest[0].order - this.ORDER_GAP * 2;
    const nextOrder =
      insertAt < rest.length ? rest[insertAt].order : rest[rest.length - 1].order + this.ORDER_GAP * 2;
    this.patch(draggedId, () => ({ sortOrder: (prevOrder + nextOrder) / 2 }));
  }

  addSubcategory(categoryId: string, name: string): void {
    const cat = this.byId(categoryId);
    if (!cat) return;
    if (cat.shared && !this.isAdmin()) {
      const overlay: SubcategoryOverlay = { id: uid(), categoryId, name };
      this.subcategoryOverlays.update((list) => [...list, overlay]);
      this.repo.addSubcategoryOverlay(overlay).catch((err) =>
        reportWriteFailure(err, () => this.subcategoryOverlays.update((list) => list.filter((o) => o.id !== overlay.id))),
      );
      return;
    }
    this.patch(categoryId, (c) => ({ subcategories: [...c.subcategories, { id: uid(), name }] }));
  }

  renameSubcategory(categoryId: string, subId: string, name: string): void {
    if (this.subcategoryOverlays().some((o) => o.id === subId)) {
      this.patchOverlay(subId, () => ({ name }));
      return;
    }
    this.patch(categoryId, (c) => ({
      subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, name } : s)),
    }));
  }

  setSubArchived(categoryId: string, subId: string, archived: boolean): void {
    if (this.subcategoryOverlays().some((o) => o.id === subId)) {
      this.patchOverlay(subId, () => ({ archived }));
      return;
    }
    this.patch(categoryId, (c) => ({
      subcategories: c.subcategories.map((s) => (s.id === subId ? { ...s, archived } : s)),
    }));
  }

  activeSubs(categoryId: string): Subcategory[] {
    return this.allSubs(categoryId).filter((s) => !s.archived);
  }

  /** Categoria "Altro" del tipo indicato, usata come ripiego per i movimenti orfani: la crea se manca ancora. */
  ensureFallbackCategory(kind: 'expense' | 'income'): Category {
    const existing = this.active().find((c) => c.kind === kind && c.name.trim().toLowerCase() === 'altro');
    if (existing) return existing;
    const cat: Category = { id: uid(), name: 'Altro', kind, color: '#6B6F68', subcategories: [] };
    this.categories.update((list) => [...list, cat]);
    this.repo.addCategory(cat).catch((err) =>
      reportWriteFailure(err, () => this.categories.update((list) => list.filter((c) => c.id !== cat.id))),
    );
    return cat;
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

  private patchOverlay(id: string, fn: (o: SubcategoryOverlay) => Partial<SubcategoryOverlay>): void {
    const current = this.subcategoryOverlays().find((o) => o.id === id);
    if (!current) return;
    const partial = fn(current);
    this.subcategoryOverlays.update((list) => list.map((o) => (o.id === id ? { ...o, ...partial } : o)));
    this.repo.updateSubcategoryOverlay(id, partial).catch((err) =>
      reportWriteFailure(err, () => this.subcategoryOverlays.update((list) => list.map((o) => (o.id === id ? current : o)))),
    );
  }
}
