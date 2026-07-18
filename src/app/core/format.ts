const EUR = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

export function eur(value: number): string {
  return EUR.format(value);
}

/** +1.234,56 € / −1.234,56 € con segno esplicito, stile split di gara. */
export function eurSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${EUR.format(Math.abs(value))}`;
}

export const MONTHS_SHORT = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
export const MONTHS_LONG = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export function formatDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' });
}

export function pct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}
