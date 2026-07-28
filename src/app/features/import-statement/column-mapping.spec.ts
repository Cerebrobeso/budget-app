import { describe, expect, it } from 'vitest';
import { guessFieldMapping, mapRows, parseRowAmount, parseRowDate } from './column-mapping';
import { FieldMapping, ParsedRows } from './import-types';

describe('guessFieldMapping', () => {
  it('finds date/amount/description columns case-insensitively and with accented headers, defaulting to signed mode', () => {
    const result = guessFieldMapping(['Data', 'Importo', 'Descrizione'], true);
    expect(result).toEqual({
      dateColumn: 0,
      amountColumn: 1,
      debitColumn: null,
      creditColumn: null,
      descriptionColumn: 2,
      amountMode: 'signed',
    });
  });

  it('detects debit/credit columns and switches to debitCredit mode when both are found', () => {
    const result = guessFieldMapping(['Data Operazione', 'Movimenti Dare', 'Movimenti Avere', 'Descrizione'], true);
    expect(result).toEqual({
      dateColumn: 0,
      amountColumn: null,
      debitColumn: 1,
      creditColumn: 2,
      descriptionColumn: 3,
      amountMode: 'debitCredit',
    });
  });

  it('stays in signed mode if only one of debit/credit is found', () => {
    const result = guessFieldMapping(['Data', 'Uscita', 'Descrizione'], true);
    expect(result.amountMode).toBe('signed');
    expect(result.debitColumn).toBe(1);
    expect(result.creditColumn).toBeNull();
  });

  it('returns all-null mapping when headers are not present', () => {
    const result = guessFieldMapping(['Colonna 1', 'Colonna 2', 'Colonna 3'], false);
    expect(result).toEqual({
      dateColumn: null,
      amountColumn: null,
      debitColumn: null,
      creditColumn: null,
      descriptionColumn: null,
      amountMode: 'signed',
    });
  });

  it('returns null for fields with no matching header hint', () => {
    const result = guessFieldMapping(['Col A', 'Col B'], true);
    expect(result.dateColumn).toBeNull();
    expect(result.amountColumn).toBeNull();
    expect(result.descriptionColumn).toBeNull();
  });
});

describe('parseRowDate', () => {
  it('parses a zero-padded dd/MM/yyyy date to ISO', () => {
    expect(parseRowDate('15/03/2024', 'dd/MM/yyyy')).toBe('2024-03-15');
  });

  it('accepts a non-zero-padded dd/MM/yyyy date', () => {
    expect(parseRowDate('1/3/2024', 'dd/MM/yyyy')).toBe('2024-03-01');
  });

  it('returns null for an impossible date (31 February)', () => {
    expect(parseRowDate('31/02/2024', 'dd/MM/yyyy')).toBeNull();
  });

  it('parses a dot-separated dd.MM.yyyy date (common in Italian bank statements)', () => {
    expect(parseRowDate('01.06.2026', 'dd.MM.yyyy')).toBe('2026-06-01');
  });

  it('parses a yyyy-MM-dd date to ISO (identity)', () => {
    expect(parseRowDate('2024-03-15', 'yyyy-MM-dd')).toBe('2024-03-15');
  });

  it('returns null for an empty cell', () => {
    expect(parseRowDate('', 'dd/MM/yyyy')).toBeNull();
  });

  it('returns null for an unparsable cell', () => {
    expect(parseRowDate('non è una data', 'dd/MM/yyyy')).toBeNull();
  });
});

describe('parseRowAmount', () => {
  it('parses Italian-formatted amounts (dot thousands, comma decimal)', () => {
    expect(parseRowAmount('1.234,56')).toBe(1234.56);
  });

  it('parses English-formatted amounts (comma thousands, dot decimal)', () => {
    expect(parseRowAmount('1,234.56')).toBe(1234.56);
  });

  it('parses a negative amount with a leading minus sign', () => {
    expect(parseRowAmount('-50,00')).toBe(-50);
  });

  it('treats accounting-style parentheses as negative', () => {
    expect(parseRowAmount('(120,00)')).toBe(-120);
  });

  it('treats a trailing minus sign as negative', () => {
    expect(parseRowAmount('120,00-')).toBe(-120);
  });

  it('returns null for non-numeric text', () => {
    expect(parseRowAmount('abc')).toBeNull();
  });

  it('returns null for an empty cell', () => {
    expect(parseRowAmount('')).toBeNull();
  });
});

describe('mapRows', () => {
  const parsed: ParsedRows = {
    headers: ['Data', 'Importo', 'Descrizione'],
    rows: [
      ['15/03/2024', '100,00', 'Stipendio'],
      ['16/03/2024', '-50,00', 'Spesa supermercato'],
      ['17/03/2024', 'non un importo', 'Riga sporca'],
    ],
    columnLabels: ['Data', 'Importo', 'Descrizione'],
  };
  const mapping: FieldMapping = {
    dateColumn: 0,
    descriptionColumn: 2,
    dateFormat: 'dd/MM/yyyy',
    amountMode: 'signed',
    amountColumn: 1,
    debitColumn: null,
    creditColumn: null,
  };

  it('resolves date, amount, type (positive -> income) and description for a valid row', () => {
    const [row] = mapRows(parsed, mapping);
    expect(row).toMatchObject({
      rowIndex: 0,
      date: '2024-03-15',
      amount: 100,
      type: 'income',
      description: 'Stipendio',
    });
  });

  it('resolves a negative amount as an expense, with amount as an absolute value', () => {
    const row = mapRows(parsed, mapping)[1];
    expect(row).toMatchObject({
      date: '2024-03-16',
      amount: 50,
      type: 'expense',
      description: 'Spesa supermercato',
    });
  });

  it('leaves amount/type null when the amount cell cannot be interpreted', () => {
    const row = mapRows(parsed, mapping)[2];
    expect(row.amount).toBeNull();
    expect(row.type).toBeNull();
  });

  it('leaves description empty when descriptionColumn is null', () => {
    const [row] = mapRows(parsed, { ...mapping, descriptionColumn: null });
    expect(row.description).toBe('');
  });
});

describe('mapRows (debitCredit amount mode)', () => {
  const debitCreditMapping: FieldMapping = {
    dateColumn: 0,
    descriptionColumn: 3,
    dateFormat: 'dd/MM/yyyy',
    amountMode: 'debitCredit',
    amountColumn: null,
    debitColumn: 1,
    creditColumn: 2,
  };

  it('resolves a debit-only row as an expense', () => {
    const parsed: ParsedRows = {
      headers: null,
      rows: [['01/06/2024', '135,27', '', 'Addebito RID']],
      columnLabels: ['Data', 'Dare', 'Avere', 'Descrizione'],
    };
    const [row] = mapRows(parsed, debitCreditMapping);
    expect(row).toMatchObject({ amount: 135.27, type: 'expense' });
  });

  it('resolves a credit-only row as income', () => {
    const parsed: ParsedRows = {
      headers: null,
      rows: [['04/06/2024', '', '440,00', 'Disposizione H.B.']],
      columnLabels: ['Data', 'Dare', 'Avere', 'Descrizione'],
    };
    const [row] = mapRows(parsed, debitCreditMapping);
    expect(row).toMatchObject({ amount: 440, type: 'income' });
  });

  it('treats a row with both debit and credit populated as unusable (ambiguous)', () => {
    const parsed: ParsedRows = {
      headers: null,
      rows: [['01/06/2024', '10,00', '20,00', 'Riga ambigua']],
      columnLabels: ['Data', 'Dare', 'Avere', 'Descrizione'],
    };
    const [row] = mapRows(parsed, debitCreditMapping);
    expect(row.amount).toBeNull();
    expect(row.type).toBeNull();
  });

  it('treats a row with neither debit nor credit populated as unusable', () => {
    const parsed: ParsedRows = {
      headers: null,
      rows: [['01/06/2024', '', '', 'Riga senza importo']],
      columnLabels: ['Data', 'Dare', 'Avere', 'Descrizione'],
    };
    const [row] = mapRows(parsed, debitCreditMapping);
    expect(row.amount).toBeNull();
    expect(row.type).toBeNull();
  });
});
