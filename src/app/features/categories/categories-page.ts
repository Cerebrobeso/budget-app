import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical, lucidePencil, lucidePlus, lucideTrash2, lucideX } from '@ng-icons/lucide';
import { Category, Subcategory } from '../../core/models';
import { CategoryStore, TransactionStore } from '../../core/stores';
import { ColorPickerComponent } from './color-picker';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HlmButton,
    HlmCard,
    HlmInput,
    HlmBadge,
    NgIcon,
    ColorPickerComponent,
    ...HlmTabsImports,
    ...HlmDialogImports,
    ...HlmSelectImports,
    ...HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideGripVertical, lucidePencil, lucidePlus, lucideTrash2, lucideX })],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.css',
})
export class CategoriesPage {
  protected readonly store = inject(CategoryStore);
  private readonly txStore = inject(TransactionStore);
  private readonly injector = inject(Injector);
  private readonly cardEls = viewChildren<ElementRef<HTMLElement>>('catCard');

  readonly newName = signal('');
  readonly newColor = signal('#2e46d1');
  readonly newKind = signal<'expense' | 'income'>('expense');
  readonly newSubName = signal<Record<string, string>>({});
  readonly editingCat = signal<string | null>(null);
  readonly editingSub = signal<string | null>(null);
  readonly editName = signal('');
  readonly deletingCat = signal<Category | null>(null);
  readonly draggingId = signal<string | null>(null);
  readonly dragOverId = signal<string | null>(null);
  /** Cosa fare dei movimenti già registrati con la categoria che si sta eliminando. */
  readonly reassignMode = signal<'fallback' | 'pick'>('fallback');
  readonly reassignTarget = signal<string>('');

  private readonly deleteCatDialog = viewChild.required<HlmDialog>('deleteCatDialog');

  /** Altre categorie attive dello stesso tipo, proposte come destinazione per la riassegnazione. */
  readonly reassignOptions = computed(() => {
    const cat = this.deletingCat();
    if (!cat) return [];
    return this.store.active().filter((c) => c.id !== cat.id && c.kind === cat.kind);
  });

  protected readonly reassignLabel = (id: string): string =>
    this.reassignOptions().find((c) => c.id === id)?.name ?? id;

  otherColors(excludeId?: string): string[] {
    return this.store.active().filter((c) => c.id !== excludeId).map((c) => c.color);
  }

  readonly archived = () => this.store.categories().filter((c) => c.archived);
  readonly archivedSubs = () => {
    const out: { cat: Category; sub: Subcategory }[] = [];
    for (const cat of this.store.categories()) {
      if (cat.archived) continue;
      for (const sub of this.store.allSubs(cat.id)) if (sub.archived) out.push({ cat, sub });
    }
    return out;
  };

  add(): void {
    const name = this.newName().trim();
    if (!name) return;
    this.store.addCategory(name, this.newKind(), this.newColor());
    this.newName.set('');
  }

  linkedTxCount(catId: string): number {
    return this.txStore.transactions().filter((t) => t.categoryId === catId).length;
  }

  askDeleteCat(cat: Category): void {
    this.deletingCat.set(cat);
    this.reassignMode.set('fallback');
    this.reassignTarget.set('');
    this.deleteCatDialog().open();
  }

  onReassignTargetChange(value: unknown): void {
    if (typeof value === 'string') this.reassignTarget.set(value);
  }

  confirmDeleteCat(): void {
    const cat = this.deletingCat();
    if (cat) {
      if (this.linkedTxCount(cat.id) > 0) {
        const target =
          this.reassignMode() === 'pick' && this.reassignTarget()
            ? this.reassignTarget()
            : this.store.ensureFallbackCategory(cat.kind).id;
        this.txStore.reassignCategory(cat.id, target);
      }
      this.store.removeCategory(cat.id);
    }
    this.deleteCatDialog().close({});
    this.deletingCat.set(null);
  }

  subDraft(catId: string): string {
    return this.newSubName()[catId] ?? '';
  }

  setNewSub(catId: string, value: string): void {
    this.newSubName.update((m) => ({ ...m, [catId]: value }));
  }

  addSub(cat: Category): void {
    const name = (this.newSubName()[cat.id] ?? '').trim();
    if (!name) return;
    this.store.addSubcategory(cat.id, name);
    this.setNewSub(cat.id, '');
  }

  startEditCat(cat: Category): void {
    this.editingCat.set(cat.id);
    this.editingSub.set(null);
    this.editName.set(cat.name);
  }

  saveCatName(cat: Category): void {
    const name = this.editName().trim();
    if (name) this.store.renameCategory(cat.id, name);
    this.editingCat.set(null);
  }

  startEditSub(cat: Category, sub: Subcategory): void {
    this.editingSub.set(`${cat.id}/${sub.id}`);
    this.editingCat.set(null);
    this.editName.set(sub.name);
  }

  saveSubName(cat: Category, sub: Subcategory): void {
    const name = this.editName().trim();
    if (name) this.store.renameSubcategory(cat.id, sub.id, name);
    this.editingSub.set(null);
  }

  canReorder(cat: Category): boolean {
    return !cat.shared || this.store.isAdmin();
  }

  onDragStart(cat: Category, event: DragEvent): void {
    this.draggingId.set(cat.id);
    event.dataTransfer?.setData('text/plain', cat.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(cat: Category, event: DragEvent): void {
    if (!this.draggingId()) return;
    event.preventDefault();
    this.dragOverId.set(cat.id);
  }

  onDrop(target: Category, event: DragEvent): void {
    event.preventDefault();
    const draggedId = this.draggingId();
    this.draggingId.set(null);
    this.dragOverId.set(null);
    if (!draggedId || draggedId === target.id) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const before = this.captureRects();
    this.store.moveCategory(draggedId, target.id, position);
    this.playFlip(before);
  }

  onDragEnd(): void {
    this.draggingId.set(null);
    this.dragOverId.set(null);
  }

  private captureRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const ref of this.cardEls()) {
      const el = ref.nativeElement;
      const id = el.dataset['catId'];
      if (id) rects.set(id, el.getBoundingClientRect());
    }
    return rects;
  }

  /**
   * Animazione FLIP: dopo il riordino, ogni card riparte visivamente dalla sua vecchia
   * posizione (via transform) e scivola in quella nuova, invece di scattare di colpo.
   */
  private playFlip(before: Map<string, DOMRect>): void {
    afterNextRender(
      () => {
        for (const ref of this.cardEls()) {
          const el = ref.nativeElement;
          const id = el.dataset['catId'];
          const prev = id ? before.get(id) : undefined;
          if (!prev) continue;
          const next = el.getBoundingClientRect();
          const dy = prev.top - next.top;
          if (Math.abs(dy) < 1) continue;
          el.style.transition = 'none';
          el.style.transform = `translateY(${dy}px)`;
          el.getBoundingClientRect(); // forza il reflow prima di riattivare la transition
          el.style.transition = 'transform 200ms ease';
          el.style.transform = '';
          el.addEventListener('transitionend', () => {
            el.style.transition = '';
          }, { once: true });
        }
      },
      { injector: this.injector },
    );
  }
}
