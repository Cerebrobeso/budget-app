import { dateToIso } from '../../core/format';
import { ParsedRows } from './import-types';
import { buildParsedRows } from './row-utils';

/**
 * Converte una cella del foglio in stringa mantenendo la pipeline a valle invariata.
 * Si parte dai valori grezzi (`raw: true`) e non dal testo formattato perché il formato di cella
 * cambia da banca a banca: le date arrivano come Date (i seriali Excel sono già risolti da
 * cellDates) e diventano ISO, i numeri diventano "1234.56" — entrambi senza ambiguità di locale.
 */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return dateToIso(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return '';
  return String(value).trim();
}

/** Il foglio con più celle: alcuni export mettono una cover o una legenda come primo foglio. */
export function pickLargestSheetName(sheetNames: string[], sizeOf: (name: string) => number): string | null {
  let best: string | null = null;
  let bestSize = -1;
  for (const name of sheetNames) {
    const size = sizeOf(name);
    if (size > bestSize) {
      best = name;
      bestSize = size;
    }
  }
  return best;
}

// Import dinamico per non gonfiare il bundle di chi importa solo CSV o PDF.
export async function parseXls(file: File): Promise<ParsedRows> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });

  const sheetName = pickLargestSheetName(
    workbook.SheetNames,
    (name) => Object.keys(workbook.Sheets[name] ?? {}).length,
  );
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) throw new Error('Il foglio di calcolo non contiene dati.');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  const asText = rows.map((row) => row.map(cellToString)).filter((row) => row.some((cell) => cell !== ''));
  if (asText.length === 0) throw new Error('Il foglio di calcolo non contiene righe.');

  return buildParsedRows(asText);
}
