import { describe, expect, it } from 'vitest';
import { buildParsedRows, detectHeaderRow, looksLikeAmount, looksLikeDate } from './row-utils';

describe('looksLikeAmount', () => {
  it.each(['120,00', '1.234,56', '-50', '-50,00'])('recognizes plain amount-like cell %s', (cell) => {
    expect(looksLikeAmount(cell)).toBe(true);
  });

  it('recognizes accounting-style parentheses as an amount', () => {
    // Pattern euristico: la '(' iniziale e la ')' finale sono ammesse dal regex.
    expect(looksLikeAmount('(120,00)')).toBe(true);
  });

  it('does not recognize a trailing-minus-sign amount (not covered by the heuristic)', () => {
    expect(looksLikeAmount('120,00-')).toBe(false);
  });

  it('returns false for non-numeric free text', () => {
    expect(looksLikeAmount('Supermercato Rossi')).toBe(false);
  });

  it('returns false for an empty/whitespace-only cell', () => {
    expect(looksLikeAmount('   ')).toBe(false);
  });
});

describe('looksLikeDate', () => {
  it.each(['12/03/2024', '2024-03-12', '12.03.2024'])('recognizes date-like cell %s', (cell) => {
    expect(looksLikeDate(cell)).toBe(true);
  });

  it('returns false for free text', () => {
    expect(looksLikeDate('Pagamento POS')).toBe(false);
  });
});

describe('detectHeaderRow', () => {
  it('detects a header row when the first row does not look like data but subsequent rows do', () => {
    const rows = [
      ['Data', 'Importo'],
      ['01/01/2024', '100,00'],
      ['02/01/2024', '50,00'],
    ];
    expect(detectHeaderRow(rows)).toBe(true);
  });

  it('returns false when every row already looks like data (no header)', () => {
    const rows = [
      ['01/01/2024', '100,00'],
      ['02/01/2024', '50,00'],
    ];
    expect(detectHeaderRow(rows)).toBe(false);
  });

  it('returns false when there are fewer than 2 rows', () => {
    expect(detectHeaderRow([['01/01/2024', '100,00']])).toBe(false);
    expect(detectHeaderRow([])).toBe(false);
  });
});

describe('buildParsedRows', () => {
  it('pads rows of differing length to the max column count', () => {
    const result = buildParsedRows([
      ['Data', 'Importo', 'Descrizione'],
      ['01/01/2024', '100,00'],
      ['02/01/2024', '50,00', 'Spesa', 'extra'],
    ]);
    expect(result.rows).toEqual([
      ['01/01/2024', '100,00', '', ''],
      ['02/01/2024', '50,00', 'Spesa', 'extra'],
    ]);
  });

  it('extracts headers and column labels when a header row is detected', () => {
    const result = buildParsedRows([
      ['Data', '', 'Descrizione'],
      ['01/01/2024', '100,00', 'Spesa'],
      ['02/01/2024', '50,00', 'Altro'],
    ]);
    expect(result.headers).toEqual(['Data', '', 'Descrizione']);
    expect(result.rows).toEqual([
      ['01/01/2024', '100,00', 'Spesa'],
      ['02/01/2024', '50,00', 'Altro'],
    ]);
    // Fallback "Colonna N" per celle header vuote.
    expect(result.columnLabels).toEqual(['Data', 'Colonna 2', 'Descrizione']);
  });

  it('falls back to null headers and generic "Colonna N" labels when no header row is detected', () => {
    const result = buildParsedRows([
      ['01/01/2024', '100,00', 'Spesa'],
      ['02/01/2024', '50,00', 'Altro'],
    ]);
    expect(result.headers).toBeNull();
    expect(result.rows).toEqual([
      ['01/01/2024', '100,00', 'Spesa'],
      ['02/01/2024', '50,00', 'Altro'],
    ]);
    expect(result.columnLabels).toEqual(['Colonna 1', 'Colonna 2', 'Colonna 3']);
  });
});
