import { describe, expect, it } from 'vitest';
import {
  dateToIso,
  eur,
  eurSigned,
  formatDateItalian,
  formatDayLabel,
  isoToDate,
  monthLongLabel,
  monthShortLabel,
  parseAmountMask,
  parseDateItalian,
  pct,
  stringifyAmountMask,
} from './format';

// Intl.NumberFormat('it-IT', { style: 'currency', ... }) puts a non-breaking space
// (U+00A0), not a regular space, between the number and the "€" symbol.
const NBSP = ' ';

describe('eur', () => {
  it('formats a positive amount as Italian-locale EUR (no thousands separator at exactly 4 integer digits, a documented Intl.NumberFormat/it-IT quirk)', () => {
    expect(eur(1234.5)).toBe(`1234,50${NBSP}€`);
  });

  it('formats zero', () => {
    expect(eur(0)).toBe(`0,00${NBSP}€`);
  });

  it('formats a negative amount with a leading minus', () => {
    expect(eur(-42)).toBe(`-42,00${NBSP}€`);
  });
});

describe('eurSigned', () => {
  it('prefixes a positive amount with "+"', () => {
    expect(eurSigned(100)).toBe(`+100,00${NBSP}€`);
  });

  it('prefixes a negative amount with "−" (minus sign, not hyphen) and drops the sign from the number itself', () => {
    expect(eurSigned(-100)).toBe(`−100,00${NBSP}€`);
  });

  it('uses "±" for zero', () => {
    expect(eurSigned(0)).toBe(`±0,00${NBSP}€`);
  });
});

describe('monthShortLabel', () => {
  it('returns the uppercase abbreviated Italian month name', () => {
    expect(monthShortLabel(1)).toBe('GEN');
    expect(monthShortLabel(12)).toBe('DIC');
  });
});

describe('monthLongLabel', () => {
  it('returns the capitalized full Italian month name', () => {
    expect(monthLongLabel(1)).toBe('Gennaio');
    expect(monthLongLabel(12)).toBe('Dicembre');
  });
});

describe('formatDayLabel', () => {
  it('formats an ISO date as "EEE d MMMM" in Italian', () => {
    // 2026-07-23 è un giovedì.
    expect(formatDayLabel('2026-07-23')).toBe('gio 23 luglio');
  });
});

describe('isoToDate / dateToIso', () => {
  it('round-trips an ISO date', () => {
    expect(dateToIso(isoToDate('2026-01-31'))).toBe('2026-01-31');
  });

  it('parses at local midnight, not UTC midnight', () => {
    const d = isoToDate('2026-03-15');
    expect(d.getHours()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });
});

describe('formatDateItalian', () => {
  it('formats a Date as dd/MM/yyyy', () => {
    expect(formatDateItalian(new Date(2026, 0, 5))).toBe('05/01/2026');
  });
});

describe('parseDateItalian', () => {
  it('parses a valid dd/MM/yyyy string', () => {
    const d = parseDateItalian('05/01/2026');
    expect(d).not.toBeNull();
    expect(dateToIso(d!)).toBe('2026-01-05');
  });

  it('trims surrounding whitespace', () => {
    const d = parseDateItalian('  05/01/2026  ');
    expect(d).not.toBeNull();
  });

  it('rejects a calendar-invalid date (Feb 31st)', () => {
    expect(parseDateItalian('31/02/2026')).toBeNull();
  });

  it('rejects input that does not round-trip to the same formatted string (e.g. missing leading zeros)', () => {
    expect(parseDateItalian('5/1/2026')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(parseDateItalian('not a date')).toBeNull();
  });
});

describe('parseAmountMask', () => {
  it('returns null for an empty string', () => {
    expect(parseAmountMask('')).toBeNull();
  });

  it('parses a value with thousands and decimal separators', () => {
    expect(parseAmountMask('1.234,56')).toBe(1234.56);
  });

  it('parses a plain integer', () => {
    expect(parseAmountMask('42')).toBe(42);
  });
});

describe('stringifyAmountMask', () => {
  it('formats a number with the Italian thousands separator, without padding trailing decimal zeros', () => {
    expect(stringifyAmountMask(1234.5)).toBe('1.234,5');
  });

  it('round-trips through parseAmountMask', () => {
    expect(parseAmountMask(stringifyAmountMask(9999.99))).toBe(9999.99);
  });
});

describe('pct', () => {
  it('prefixes a positive value with "+"', () => {
    expect(pct(12.3)).toBe('+12,3%');
  });

  it('keeps the "-" for a negative value (no double sign)', () => {
    expect(pct(-12.3)).toBe('-12,3%');
  });

  it('adds no sign for zero', () => {
    expect(pct(0)).toBe('0%');
  });
});
