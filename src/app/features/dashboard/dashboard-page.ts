import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts';
import { CategoryStore, ThemeService, TransactionStore } from '../../core/stores';
import { MONTHS_SHORT, dateToIso, eur, formatDateItalian, isoToDate } from '../../core/format';
import { todayIso } from '../../core/models';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmLabel } from '@spartan-ng/helm/label';

type RangePreset = '3m' | '6m' | '12m' | 'ytd' | 'custom';

function isoShift(monthsBack: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgxEchartsDirective, HlmButton, HlmCard, HlmLabel, ...HlmDatePickerImports],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage {
  private readonly txStore = inject(TransactionStore);
  private readonly catStore = inject(CategoryStore);
  private readonly theme = inject(ThemeService);

  protected readonly presets: { id: RangePreset; label: string }[] = [
    { id: '3m', label: '3 mesi' },
    { id: '6m', label: '6 mesi' },
    { id: '12m', label: '12 mesi' },
    { id: 'ytd', label: 'Anno corrente' },
    { id: 'custom', label: 'Personalizzato' },
  ];

  readonly range = signal<RangePreset>('12m');
  readonly customFrom = signal(isoShift(5));
  readonly customTo = signal(todayIso());

  readonly customFromDate = computed(() => isoToDate(this.customFrom()));
  readonly customToDate = computed(() => isoToDate(this.customTo()));

  onCustomFromChange(value: Date | null): void {
    if (value) this.customFrom.set(dateToIso(value));
  }

  onCustomToChange(value: Date | null): void {
    if (value) this.customTo.set(dateToIso(value));
  }

  readonly from = computed(() => {
    switch (this.range()) {
      case '3m': return isoShift(2);
      case '6m': return isoShift(5);
      case '12m': return isoShift(11);
      case 'ytd': return `${new Date().getFullYear()}-01-01`;
      case 'custom': return this.customFrom();
    }
  });
  readonly to = computed(() => (this.range() === 'custom' ? this.customTo() : todayIso()));

  protected readonly fmtDate = (iso: string): string => formatDateItalian(isoToDate(iso));

  private readonly inRange = computed(() => this.txStore.inRange(this.from(), this.to()));

  /** Bucket mensili nel range. */
  private readonly monthly = computed(() => {
    const buckets = new Map<string, { income: number; expense: number }>();
    const start = this.from().slice(0, 7);
    const end = this.to().slice(0, 7);
    let [y, m] = start.split('-').map(Number);
    while (`${y}-${String(m).padStart(2, '0')}` <= end) {
      buckets.set(`${y}-${String(m).padStart(2, '0')}`, { income: 0, expense: 0 });
      m++; if (m > 12) { m = 1; y++; }
    }
    for (const tx of this.inRange()) {
      const key = tx.date.slice(0, 7);
      const b = buckets.get(key);
      if (!b) continue;
      if (tx.type === 'income') b.income += tx.amount; else b.expense += tx.amount;
    }
    return [...buckets.entries()].map(([key, v]) => {
      const [yy, mm] = key.split('-').map(Number);
      return { key, label: `${MONTHS_SHORT[mm - 1]} ${String(yy).slice(2)}`, ...v };
    });
  });

  private axisColors() {
    const dark = this.theme.dark();
    return {
      text: dark ? '#8b9390' : '#6b6f68',
      line: dark ? '#2a323a' : '#dcd9cf',
      income: dark ? '#4fc493' : '#157a54',
      expense: dark ? '#f0876f' : '#c2422c',
      primary: dark ? '#8296ff' : '#2e46d1',
    };
  }

  private baseAxes(labels: string[]) {
    const c = this.axisColors();
    return {
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: labels,
        axisLine: { lineStyle: { color: c.line } },
        axisLabel: { color: c.text, fontFamily: 'Spline Sans Mono' },
      },
      yAxis: {
        type: 'value' as const,
        splitLine: { lineStyle: { color: c.line } },
        axisLabel: { color: c.text, fontFamily: 'Spline Sans Mono' },
      },
    };
  }

  readonly barOptions = computed<EChartsCoreOption>(() => {
    const data = this.monthly();
    const c = this.axisColors();
    return {
      ...this.baseAxes(data.map((d) => d.label)),
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => eur(Number(v)) },
      legend: { top: 0, textStyle: { color: c.text } },
      series: [
        { name: 'Entrate', type: 'bar', data: data.map((d) => round2(d.income)), itemStyle: { color: c.income, borderRadius: [4, 4, 0, 0] } },
        { name: 'Uscite', type: 'bar', data: data.map((d) => round2(d.expense)), itemStyle: { color: c.expense, borderRadius: [4, 4, 0, 0] } },
      ],
    };
  });

  private readonly byCategory = computed(() => {
    const totals = new Map<string, number>();
    for (const tx of this.inRange()) {
      if (tx.type !== 'expense') continue;
      totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amount);
    }
    return [...totals.entries()]
      .map(([id, value]) => ({
        name: this.catStore.byId(id)?.name ?? id,
        value: round2(value),
        itemStyle: { color: this.catStore.color(id) },
      }))
      .sort((a, b) => b.value - a.value);
  });

  readonly donutTotal = computed(() => this.byCategory().reduce((s, x) => s + x.value, 0));

  readonly donutOptions = computed<EChartsCoreOption>(() => {
    const c = this.axisColors();
    return {
      tooltip: { trigger: 'item', valueFormatter: (v: unknown) => eur(Number(v)) },
      legend: { bottom: 0, textStyle: { color: c.text } },
      series: [{
        type: 'pie',
        radius: ['42%', '75%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
        label: {
          position: 'inside',
          formatter: '{d}%',
          color: '#fff',
          fontWeight: 600,
          textBorderColor: 'rgba(0,0,0,0.35)',
          textBorderWidth: 2,
        },
        labelLine: { show: false },
        data: this.byCategory(),
      }],
    };
  });

  readonly trendOptions = computed<EChartsCoreOption>(() => {
    const data = this.monthly();
    const c = this.axisColors();
    let cum = 0;
    const cumulative = data.map((d) => round2((cum += d.income - d.expense)));
    return {
      ...this.baseAxes(data.map((d) => d.label)),
      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => eur(Number(v)) },
      legend: { top: 0, textStyle: { color: c.text } },
      series: [
        {
          name: 'Saldo mese', type: 'bar',
          data: data.map((d) => ({
            value: round2(d.income - d.expense),
            itemStyle: { color: d.income - d.expense >= 0 ? c.income : c.expense, borderRadius: 4 },
          })),
        },
        { name: 'Cumulato', type: 'line', smooth: true, data: cumulative, lineStyle: { color: c.primary, width: 3 }, itemStyle: { color: c.primary } },
      ],
    };
  });

  setPreset(id: RangePreset): void {
    this.range.set(id);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
