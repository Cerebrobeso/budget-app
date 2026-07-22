import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideTrash2, lucideTriangleAlert, lucideX } from '@ng-icons/lucide';
import { isBefore, subMonths } from 'date-fns';
import { ASSET_CATEGORY_LABEL, Asset, AssetCategory, todayIso } from '../../core/models';
import { PortfolioStore, ThemeService, latest, returnPct } from '../../core/stores';
import { dateToIso, eur, formatDateItalian, isoToDate, pct } from '../../core/format';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmDialog, HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

@Component({
  selector: 'app-portfolio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgxEchartsDirective,
    HlmButton,
    HlmCard,
    HlmInput,
    HlmLabel,
    HlmBadge,
    NgIcon,
    ...HlmDialogImports,
    ...HlmSelectImports,
    ...HlmDatePickerImports,
    ...HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePlus, lucideTrash2, lucideTriangleAlert, lucideX })],
  templateUrl: './portfolio-page.html',
  styleUrl: './portfolio-page.css',
})
export class PortfolioPage {
  protected readonly store = inject(PortfolioStore);
  private readonly theme = inject(ThemeService);

  protected readonly assetCategories = (Object.entries(ASSET_CATEGORY_LABEL) as [AssetCategory, string][])
    .map(([id, label]) => ({ id, label }));

  private readonly assetDialog = viewChild.required<HlmDialog>('assetDialog');
  private readonly snapDialog = viewChild.required<HlmDialog>('snapDialog');
  private readonly deleteAssetDialog = viewChild.required<HlmDialog>('deleteAssetDialog');

  readonly from = signal(`${new Date().getFullYear()}-01-01`);
  readonly to = signal(todayIso());

  // form nuova posizione
  readonly assetName = signal('');
  readonly assetCategory = signal<AssetCategory>('conto-corrente');
  readonly assetValue = signal<number | null>(null);
  readonly assetDate = signal(todayIso());

  // form snapshot
  readonly snapAsset = signal<Asset | null>(null);
  readonly snapValue = signal<number | null>(null);
  readonly snapDate = signal(todayIso());

  readonly expanded = signal<string | null>(null);
  readonly deletingAsset = signal<Asset | null>(null);

  readonly archivedAssets = computed(() => this.store.assets().filter((a) => a.archived));

  readonly fromDate = computed(() => isoToDate(this.from()));
  readonly toDate = computed(() => isoToDate(this.to()));
  readonly assetDateValue = computed(() => isoToDate(this.assetDate()));
  readonly snapDateValue = computed(() => isoToDate(this.snapDate()));

  onFromChange(value: Date | null): void {
    if (value) this.from.set(dateToIso(value));
  }

  onToChange(value: Date | null): void {
    if (value) this.to.set(dateToIso(value));
  }

  onAssetDateChange(value: Date | null): void {
    if (value) this.assetDate.set(dateToIso(value));
  }

  onSnapDateChange(value: Date | null): void {
    if (value) this.snapDate.set(dateToIso(value));
  }

  readonly totalReturn = computed(() => returnPct(this.store.totalSeries(), this.from(), this.to()));

  protected readonly fmtDate = (iso: string): string => formatDateItalian(isoToDate(iso));

  readonly lineOptions = computed<EChartsCoreOption>(() => {
    const dark = this.theme.dark();
    const text = dark ? '#8b9390' : '#6b6f68';
    const line = dark ? '#2a323a' : '#dcd9cf';
    const primary = dark ? '#8296ff' : '#2e46d1';
    const series = this.store.totalSeries();
    return {
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', confine: true, valueFormatter: (v: unknown) => eur(Number(v)) },
      xAxis: {
        type: 'category',
        data: series.map((s) => this.fmtDate(s.date)),
        axisLine: { lineStyle: { color: line } },
        axisLabel: { color: text, fontFamily: 'Spline Sans Mono' },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: line } },
        axisLabel: { color: text, fontFamily: 'Spline Sans Mono' },
      },
      series: [{
        type: 'line',
        smooth: true,
        data: series.map((s) => Math.round(s.value * 100) / 100),
        lineStyle: { color: primary, width: 3 },
        itemStyle: { color: primary },
        areaStyle: { opacity: 0.12, color: primary },
      }],
    };
  });

  openNewAsset(): void {
    this.assetDialog().open();
  }

  onAssetCategory(value: unknown): void {
    if (typeof value === 'string' && value) this.assetCategory.set(value as AssetCategory);
  }

  saveAsset(): void {
    const name = this.assetName().trim();
    const value = Number(this.assetValue());
    if (!name || !value || value < 0) return;
    this.store.add({
      name,
      category: this.assetCategory(),
      snapshots: [{ date: this.assetDate(), value: Math.round(value * 100) / 100 }],
    });
    this.assetName.set('');
    this.assetValue.set(null);
    this.assetDialog().close({});
  }

  openSnapshot(asset: Asset): void {
    this.snapAsset.set(asset);
    this.snapValue.set(latest(asset)?.value ?? null);
    this.snapDate.set(todayIso());
    this.snapDialog().open();
  }

  saveSnapshot(): void {
    const asset = this.snapAsset();
    const value = Number(this.snapValue());
    if (!asset || !value || value < 0 || !this.snapDate()) return;
    this.store.addSnapshot(asset.id, { date: this.snapDate(), value: Math.round(value * 100) / 100 });
    this.snapDialog().close({});
  }

  askDeleteAsset(asset: Asset): void {
    this.deletingAsset.set(asset);
    this.deleteAssetDialog().open();
  }

  confirmDeleteAsset(): void {
    const asset = this.deletingAsset();
    if (!asset) return;
    this.store.remove(asset.id);
    this.deletingAsset.set(null);
    this.deleteAssetDialog().close({});
  }

  toggleHistory(id: string): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  latestValue(asset: Asset): number {
    return latest(asset)?.value ?? 0;
  }

  assetReturn(asset: Asset): number | null {
    return returnPct(asset.snapshots, this.from(), this.to());
  }

  /** Nessuno snapshot da più di un mese: il valore mostrato rischia di essere superato. */
  isStale(asset: Asset): boolean {
    const last = latest(asset);
    if (!last) return false;
    return isBefore(isoToDate(last.date), subMonths(new Date(), 1));
  }

  categoryLabel(cat: AssetCategory): string {
    return ASSET_CATEGORY_LABEL[cat];
  }

  protected readonly fmt = eur;
  protected readonly fmtPct = pct;
}
