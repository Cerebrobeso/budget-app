import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import type { BrnOverlayState } from '@spartan-ng/brain/overlay';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';

/**
 * Tinte di default in ordine di tonalità (come una ruota dei colori): stessa
 * saturazione e luminosità per tutte, così sono leggibili su sfondo chiaro e
 * scuro e distinguibili solo dalla tonalità — niente coppie "stesso colore,
 * sfumatura diversa" che si confondono a colpo d'occhio.
 */
const PRESET_COLORS = [
  '#CF3030',
  '#CF5830',
  '#CF8030',
  '#CFA730',
  '#CFCF30',
  '#A7CF30',
  '#80CF30',
  '#58CF30',
  '#30CF30',
  '#30CF58',
  '#30CF80',
  '#30CFA7',
  '#30CFCF',
  '#30A7CF',
  '#3080CF',
  '#3058CF',
  '#3030CF',
  '#5830CF',
  '#8030CF',
  '#A730CF',
  '#CF30CF',
  '#CF30A7',
  '#CF3080',
  '#CF3058',
];

function normalizeHex(raw: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!match) return null;
  const hex = match[1];
  const expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return `#${expanded.toUpperCase()}`;
}

@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, HlmInput, NgIcon, ...HlmPopoverImports],
  providers: [provideIcons({ lucideCheck })],
  templateUrl: './color-picker.html',
})
export class ColorPickerComponent {
  readonly color = input.required<string>();
  /** Colori già assegnati ad altre categorie: mostrati con un indicatore nella tavolozza, ma restano selezionabili. */
  readonly usedColors = input<string[]>([]);
  readonly size = input<'sm' | 'default'>('default');
  readonly buttonId = input<string>();
  readonly ariaLabel = input<string>();
  readonly colorChange = output<string>();

  protected readonly presets = PRESET_COLORS;
  protected readonly state = signal<BrnOverlayState>('closed');
  protected readonly draft = signal('');
  protected readonly draftPreview = computed(() => normalizeHex(this.draft()));
  private readonly usedColorsUpper = computed(() => new Set(this.usedColors().map((c) => c.toUpperCase())));

  protected onStateChange(state: BrnOverlayState): void {
    this.state.set(state);
    if (state === 'open') this.draft.set(this.color().toUpperCase());
  }

  protected isActive(swatch: string): boolean {
    return this.color().toUpperCase() === swatch;
  }

  protected isUsed(swatch: string): boolean {
    return this.usedColorsUpper().has(swatch);
  }

  protected choose(swatch: string): void {
    this.draft.set(swatch);
    this.colorChange.emit(swatch);
    this.state.set('closed');
  }

  protected onDraftChange(value: string): void {
    this.draft.set(value);
    const normalized = normalizeHex(value);
    if (normalized) this.colorChange.emit(normalized);
  }

  protected applyDraft(): void {
    const normalized = normalizeHex(this.draft());
    if (!normalized) return;
    this.draft.set(normalized);
    this.colorChange.emit(normalized);
    this.state.set('closed');
  }
}
