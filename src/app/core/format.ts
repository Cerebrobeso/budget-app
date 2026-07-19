import { format, isValid, parse } from 'date-fns';
import type { MaskitoOptions } from '@maskito/core';
import { maskitoNumber, maskitoParseNumber, maskitoStringifyNumber } from '@maskito/kit';

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

const ISO_DATE_FORMAT = 'yyyy-MM-dd';
const IT_DATE_FORMAT = 'dd/MM/yyyy';

/** yyyy-MM-dd -> Date locale (mezzanotte locale, non UTC). */
export function isoToDate(iso: string): Date {
  return parse(iso, ISO_DATE_FORMAT, new Date());
}

/** Date locale -> yyyy-MM-dd, per il modello dati. */
export function dateToIso(date: Date): string {
  return format(date, ISO_DATE_FORMAT);
}

/** gg/mm/aaaa per la UI (visualizzazione e digitazione nel date picker). */
export function formatDateItalian(date: Date): string {
  return format(date, IT_DATE_FORMAT);
}

/** Interpreta gg/mm/aaaa digitato dall'utente; null se non valido. */
export function parseDateItalian(value: string): Date | null {
  const trimmed = value.trim();
  const parsed = parse(trimmed, IT_DATE_FORMAT, new Date());
  if (!isValid(parsed) || format(parsed, IT_DATE_FORMAT) !== trimmed) return null;
  return parsed;
}

/**
 * Raggruppa sempre ogni 3 cifre da destra: Intl.NumberFormat con locale 'it-IT'
 * non raggruppa i numeri di esattamente 4 cifre (es. resterebbe "1234" invece di "1.234"),
 * quindi qui la maschera Maskito usa un pattern esplicito invece di derivarlo dal locale.
 */
const AMOUNT_THOUSAND_SEPARATOR_PATTERN = (digits: string): readonly string[] =>
  digits.match(/\d{1,3}(?=(?:\d{3})*$)/g) ?? [];

const AMOUNT_MASK_PARAMS = {
  thousandSeparator: '.',
  decimalSeparator: ',',
  thousandSeparatorPattern: AMOUNT_THOUSAND_SEPARATOR_PATTERN,
};

/** Maschera Maskito per il campo importo: punto delle migliaia, virgola decimale, max 2 decimali, mai negativo. */
export const AMOUNT_MASK: Required<MaskitoOptions> = maskitoNumber({
  ...AMOUNT_MASK_PARAMS,
  decimalPseudoSeparators: ['.'],
  min: 0,
  maximumFractionDigits: 2,
});

/** Testo mascherato (es. "1.234,56") -> numero, null se vuoto o non valido. */
export function parseAmountMask(value: string): number | null {
  if (!value) return null;
  const n = maskitoParseNumber(value, AMOUNT_MASK_PARAMS);
  return Number.isFinite(n) ? n : null;
}

/** Numero -> testo mascherato, per precompilare il campo importo in modalità modifica. */
export function stringifyAmountMask(value: number): string {
  return maskitoStringifyNumber(value, { ...AMOUNT_MASK_PARAMS, maximumFractionDigits: 2 });
}

export function pct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}
