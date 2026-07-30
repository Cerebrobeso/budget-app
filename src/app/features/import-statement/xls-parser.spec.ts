import { describe, expect, it } from 'vitest';
import { cellToString, pickLargestSheetName } from './xls-parser';

describe('cellToString', () => {
  it('converts a Date cell to an ISO date, so Excel serial dates need no locale guessing', () => {
    expect(cellToString(new Date(2024, 5, 1))).toBe('2024-06-01');
  });

  it('converts a numeric cell to a dot-decimal string, keeping the sign', () => {
    expect(cellToString(1234.56)).toBe('1234.56');
    expect(cellToString(-50)).toBe('-50');
  });

  it('trims text cells', () => {
    expect(cellToString('  Pagamento POS  ')).toBe('Pagamento POS');
  });

  it('renders empty cells as an empty string', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(undefined)).toBe('');
    expect(cellToString('')).toBe('');
  });
});

describe('pickLargestSheetName', () => {
  it('picks the sheet with the most cells, not the first one', () => {
    const sizes: Record<string, number> = { Copertina: 3, Movimenti: 250, Note: 12 };
    expect(pickLargestSheetName(['Copertina', 'Movimenti', 'Note'], (n) => sizes[n])).toBe('Movimenti');
  });

  it('keeps the first sheet when sizes are equal', () => {
    expect(pickLargestSheetName(['A', 'B'], () => 10)).toBe('A');
  });

  it('returns null for a workbook with no sheets', () => {
    expect(pickLargestSheetName([], () => 0)).toBeNull();
  });
});
