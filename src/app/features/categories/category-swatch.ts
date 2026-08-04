import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { CATEGORY_ICONS } from './category-icons';

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const [r, g, b] = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6)].map((c) => parseInt(c, 16) / 255);
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Bianco o nero: quale dei due si "abbina" meglio a `hex` (più chiaro se `hex` è scuro, più scuro se `hex` è chiaro). */
export function readableForeground(hex: string): 'white' | 'black' {
  const contrastWithWhite = 1.05 / (relativeLuminance(hex) + 0.05);
  return contrastWithWhite >= 3 ? 'white' : 'black';
}

/**
 * Una tinta/ombra piena (non trasparente, niente sfocatura ai bordi) dello stesso colore `hex`:
 * lo schiarisce se `hex` è scuro, lo scurisce se è chiaro, così l'icona resta "dello stesso colore"
 * dello sfondo ma visibile, invece di un bianco/nero a contrasto netto.
 */
export function iconTint(hex: string): string {
  const clean = hex.replace('#', '');
  const [r, g, b] = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6)].map((c) => parseInt(c, 16));
  const mixWith = relativeLuminance(hex) < 0.5 ? 255 : 0;
  const ratio = 0.55;
  const mix = (channel: number) => Math.round(channel * (1 - ratio) + mixWith * ratio);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

@Component({
  selector: 'app-category-swatch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon],
  providers: [provideIcons(CATEGORY_ICONS)],
  templateUrl: './category-swatch.html',
})
export class CategorySwatchComponent {
  readonly color = input.required<string>();
  readonly icon = input<string | null>(null);

  protected readonly tint = computed(() => iconTint(this.color()));
}
