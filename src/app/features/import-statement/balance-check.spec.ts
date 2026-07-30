import { describe, expect, it } from 'vitest';
import { checkBalance, extractBalances } from './balance-check';
import { ParsedTransactionRow } from './import-types';

function row(amount: number, type: 'income' | 'expense'): ParsedTransactionRow {
  return {
    rowIndex: 0,
    date: '2024-03-15',
    amount,
    type,
    description: 'Movimento',
    raw: [],
    isDuplicateOfExisting: false,
    isDuplicateInBatch: false,
    selected: true,
    categoryId: null,
    subcategoryId: null,
  };
}

describe('extractBalances', () => {
  it('reads initial and final balance from the preamble', () => {
    const balances = extractBalances(
      [
        ['Estratto conto', '', ''],
        ['SALDO INIZIALE AL 01/06/2024', '', '1.000,00'],
        ['SALDO FINALE AL 30/06/2024', '', '1.150,50'],
      ],
      [],
    );
    expect(balances).toEqual({ initial: 1000, final: 1150.5 });
  });

  it('reads a final balance placed in a summary row at the end of the table', () => {
    const balances = extractBalances(
      [['Saldo precedente', '500,00']],
      [
        ['01/06/2024', '100,00', 'Spesa'],
        ['Saldo contabile', '400,00'],
      ],
    );
    expect(balances).toEqual({ initial: 500, final: 400 });
  });

  it('keeps the last final balance when it is repeated on every page', () => {
    const balances = extractBalances(
      [['Saldo iniziale', '100,00']],
      [
        ['Saldo finale', '200,00'],
        ['Saldo finale', '300,00'],
      ],
    );
    expect(balances?.final).toBe(300);
  });

  it('returns null when the file declares only one of the two balances', () => {
    expect(extractBalances([['Saldo iniziale', '100,00']], [])).toBeNull();
  });

  it('returns null when the file declares no balance at all', () => {
    expect(extractBalances([['Estratto conto', 'Giugno 2024']], [['01/06/2024', '10,00']])).toBeNull();
  });

  it('handles a negative balance', () => {
    const balances = extractBalances([['Saldo iniziale', '-250,00'], ['Saldo finale', '-100,00']], []);
    expect(balances).toEqual({ initial: -250, final: -100 });
  });
});

describe('checkBalance', () => {
  it('accepts a statement whose movements match the declared balances', () => {
    const result = checkBalance({ initial: 1000, final: 1050 }, [row(100, 'income'), row(50, 'expense')]);
    expect(result.ok).toBe(true);
    expect(result.actual).toBe(1050);
    expect(result.diff).toBe(0);
  });

  it('flags a statement with a missing movement, reporting the signed gap', () => {
    const result = checkBalance({ initial: 1000, final: 1050 }, [row(100, 'income')]);
    expect(result.ok).toBe(false);
    expect(result.diff).toBe(50);
    expect(result.expected).toBe(1050);
  });

  it('ignores rows that could not be interpreted', () => {
    const unusable = { ...row(0, 'expense'), amount: null, type: null };
    const result = checkBalance({ initial: 0, final: 10 }, [row(10, 'income'), unusable]);
    expect(result.ok).toBe(true);
  });

  it('tolerates rounding within one cent per row', () => {
    const rows = [row(10.004, 'income'), row(10.004, 'income')];
    const result = checkBalance({ initial: 0, final: 20 }, rows);
    expect(result.ok).toBe(true);
  });

  it('does not tolerate a gap larger than the per-row allowance', () => {
    const result = checkBalance({ initial: 0, final: 20 }, [row(10, 'income'), row(10.5, 'income')]);
    expect(result.ok).toBe(false);
  });
});
