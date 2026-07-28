import Papa from 'papaparse';
import { ParsedRows } from './import-types';
import { buildParsedRows } from './row-utils';

export function parseCsv(text: string): ParsedRows {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (result.data.length === 0) throw new Error('Il file CSV non contiene righe.');
  if (result.errors.some((e) => e.type !== 'FieldMismatch')) {
    throw new Error('Impossibile leggere il file CSV: formato non riconosciuto.');
  }
  return buildParsedRows(result.data);
}
