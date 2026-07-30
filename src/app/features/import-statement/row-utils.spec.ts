import { describe, expect, it } from 'vitest';
import { buildParsedRows, detectHeaderRow, findHeaderRowIndex, looksLikeAmount, looksLikeDate } from './row-utils';

describe('looksLikeAmount', () => {
  it.each(['120,00', '1.234,56', '-50', '-50,00'])('recognizes plain amount-like cell %s', (cell) => {
    expect(looksLikeAmount(cell)).toBe(true);
  });

  it('recognizes accounting-style parentheses as an amount', () => {
    // Pattern euristico: la '(' iniziale e la ')' finale sono ammesse dal regex.
    expect(looksLikeAmount('(120,00)')).toBe(true);
  });

  it('recognizes a trailing-minus-sign amount, like parseRowAmount does', () => {
    expect(looksLikeAmount('120,00-')).toBe(true);
  });

  it('recognizes an unseparated amount, as produced by a spreadsheet cell', () => {
    expect(looksLikeAmount('12345.67')).toBe(true);
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

describe('findHeaderRowIndex', () => {
  it('finds the header below the bank letterhead instead of assuming row 0', () => {
    const rows = [
      ['Banca Esempio SpA', '', '', ''],
      ['IBAN IT60X0542811101000000123456', '', '', ''],
      ['Data', 'Dare', 'Avere', 'Descrizione'],
      ['01/06/2024', '135,27', '', 'Addebito RID'],
    ];
    expect(findHeaderRowIndex(rows)).toBe(2);
  });

  it('returns -1 when no row qualifies as a header', () => {
    expect(findHeaderRowIndex([['01/06/2024', '135,27']])).toBe(-1);
  });
});

describe('buildParsedRows', () => {
  it('skips the preamble rows and keeps them aside, so the balances stay readable', () => {
    const result = buildParsedRows([
      ['Estratto conto giugno 2024', ''],
      ['Saldo iniziale', '1.000,00'],
      ['Data', 'Importo'],
      ['01/06/2024', '-135,27'],
      ['04/06/2024', '440,00'],
    ]);
    expect(result.columnLabels).toEqual(['Data', 'Importo']);
    expect(result.rows).toEqual([
      ['01/06/2024', '-135,27'],
      ['04/06/2024', '440,00'],
    ]);
    expect(result.preamble).toEqual([
      ['Estratto conto giugno 2024', ''],
      ['Saldo iniziale', '1.000,00'],
    ]);
  });

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
