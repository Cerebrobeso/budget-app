import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucidePlus, lucideX } from '@ng-icons/lucide';
import { Category, Subcategory } from '../../core/models';
import { CategoryStore } from '../../core/stores';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, HlmButton, HlmCard, HlmInput, HlmBadge, NgIcon, ...HlmTabsImports],
  providers: [provideIcons({ lucidePencil, lucidePlus, lucideX })],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.css',
})
export class CategoriesPage {
  protected readonly store = inject(CategoryStore);

  readonly newName = signal('');
  readonly newColor = signal('#2e46d1');
  readonly newSubName = signal<Record<string, string>>({});
  readonly editingCat = signal<string | null>(null);
  readonly editingSub = signal<string | null>(null);
  readonly editName = signal('');

  readonly archived = () => this.store.categories().filter((c) => c.archived);
  readonly archivedSubs = () => {
    const out: { cat: Category; sub: Subcategory }[] = [];
    for (const cat of this.store.categories()) {
      if (cat.archived) continue;
      for (const sub of cat.subcategories) if (sub.archived) out.push({ cat, sub });
    }
    return out;
  };

  add(kind: 'expense' | 'income'): void {
    const name = this.newName().trim();
    if (!name) return;
    this.store.addCategory(name, kind, this.newColor());
    this.newName.set('');
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
