import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv-parser';

describe('parseCsv', () => {
  it('parses a semicolon-delimited CSV (auto-detected)', () => {
    const result = parseCsv('Data;Importo\n01/01/2024;100,00\n02/01/2024;50,00');
    expect(result.headers).toEqual(['Data', 'Importo']);
    expect(result.rows).toEqual([
      ['01/01/2024', '100,00'],
      ['02/01/2024', '50,00'],
    ]);
  });

  it('parses a comma-delimited CSV', () => {
    const result = parseCsv('Data,Importo\n01/01/2024,100\n02/01/2024,50');
    expect(result.headers).toEqual(['Data', 'Importo']);
    expect(result.rows).toEqual([
      ['01/01/2024', '100'],
      ['02/01/2024', '50'],
    ]);
  });

  it('handles quoted fields containing the delimiter itself', () => {
    const result = parseCsv('Data,Importo,Descrizione\n01/01/2024,100,"Bar, Ristorante"');
    expect(result.rows).toEqual([['01/01/2024', '100', 'Bar, Ristorante']]);
  });

  it('handles quoted fields containing a newline', () => {
    const result = parseCsv('Data,Descrizione\n01/01/2024,"riga uno\nriga due"');
    expect(result.rows).toEqual([['01/01/2024', 'riga uno\nriga due']]);
  });

  it('throws for an empty string', () => {
    expect(() => parseCsv('')).toThrow();
  });

  it('throws for a whitespace-only string', () => {
    expect(() => parseCsv('   ')).toThrow();
  });
});
