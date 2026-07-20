import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucidePlus, lucideTrash2, lucideX } from '@ng-icons/lucide';
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
  providers: [provideIcons({ lucidePencil, lucidePlus, lucideTrash2, lucideX })],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.css',
})
export class CategoriesPage {
  protected readonly store = inject(CategoryStore);
  private readonly txStore = inject(TransactionStore);

  readonly newName = signal('');
  readonly newColor = signal('#2e46d1');
  readonly newKind = signal<'expense' | 'income'>('expense');
  readonly newSubName = signal<Record<string, string>>({});
  readonly editingCat = signal<string | null>(null);
  readonly editingSub = signal<string | null>(null);
  readonly editName = signal('');
  readonly deletingCat = signal<Category | null>(null);
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
}
