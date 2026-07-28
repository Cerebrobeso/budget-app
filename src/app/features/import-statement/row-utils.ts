import { ParsedRows } from './import-types';

const AMOUNT_PATTERN = /^[+\-(]?\s*[$€]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*[$€)]?$/;
// '.' incluso come separatore: molti estratti conto italiani usano gg.mm.aaaa, non solo gg/mm/aaaa.
const DATE_PATTERN = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;

export function looksLikeAmount(cell: string): boolean {
  const trimmed = cell.trim();
  return trimmed.length > 0 && AMOUNT_PATTERN.test(trimmed);
}

export function looksLikeDate(cell: string): boolean {
  return DATE_PATTERN.test(cell.trim());
}

// Header presente se una cella della prima riga non somiglia a importo/data mentre la stessa colonna, in righe successive, sì.
export function detectHeaderRow(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0];
  const sample = rows.slice(1, Math.min(rows.length, 6));
  return first.some((cell, colIndex) => {
    if (looksLikeAmount(cell) || looksLikeDate(cell)) return false;
    return sample.some((row) => {
      const value = row[colIndex];
      return value !== undefined && (looksLikeAmount(value) || looksLikeDate(value));
    });
  });
}

export function buildParsedRows(rows: string[][]): ParsedRows {
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });

  const hasHeader = detectHeaderRow(normalized);
  const headers = hasHeader ? normalized[0] : null;
  const dataRows = hasHeader ? normalized.slice(1) : normalized;
  const columnLabels = headers
    ? headers.map((h, i) => h.trim() || `Colonna ${i + 1}`)
    : Array.from({ length: maxCols }, (_, i) => `Colonna ${i + 1}`);

  return { headers, rows: dataRows, columnLabels };
}
