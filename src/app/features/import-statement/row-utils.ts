import { ParsedRows } from './import-types';

// Parte intera \d+ e non \d{1,3}: i fogli XLS producono numeri già formattati come "12345.67", senza separatore migliaia.
const AMOUNT_PATTERN = /^[+\-(]?\s*[$€]?\s*\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*[$€]?\s*[-)]?$/;
// '.' incluso come separatore: molti estratti conto italiani usano gg.mm.aaaa, non solo gg/mm/aaaa.
const DATE_PATTERN = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/;
const HEADER_SEARCH_LIMIT = 20;

export function looksLikeAmount(cell: string): boolean {
  const trimmed = cell.trim();
  return trimmed.length > 0 && AMOUNT_PATTERN.test(trimmed);
}

export function looksLikeDate(cell: string): boolean {
  return DATE_PATTERN.test(cell.trim());
}

/**
 * Indice della riga con più celle valorizzate tra le prime HEADER_SEARCH_LIMIT che non contenga
 * valori simili a data/importo. L'header tabellare NON è affidabilmente la riga 0: PDF, XLS e CSV
 * bancari fanno precedere alla tabella blocchi di intestazione o riepilogo (banca, IBAN, periodo,
 * saldo iniziale). -1 se nessuna riga qualifica.
 */
export function findHeaderRowIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT);
  let bestIndex = -1;
  let bestCellCount = 1;
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    // Celle valorizzate e non row.length: dopo il padding tutte le righe hanno la stessa lunghezza.
    const filled = row.filter((cell) => cell.trim()).length;
    if (filled <= bestCellCount) continue;
    if (row.some((cell) => looksLikeAmount(cell) || looksLikeDate(cell))) continue;
    bestIndex = i;
    bestCellCount = filled;
  }
  return bestIndex;
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

  const headerIndex = findHeaderRowIndex(normalized);
  // Doppia conferma: la riga candidata è un header solo se sotto di sé ci sono davvero dati,
  // altrimenti un file di solo testo libero produrrebbe sempre un header fittizio.
  const hasHeader = headerIndex !== -1 && detectHeaderRow(normalized.slice(headerIndex));
  const headers = hasHeader ? normalized[headerIndex] : null;
  const preamble = hasHeader ? normalized.slice(0, headerIndex) : [];
  const dataRows = hasHeader ? normalized.slice(headerIndex + 1) : normalized;
  const columnLabels = headers
    ? headers.map((h, i) => h.trim() || `Colonna ${i + 1}`)
    : Array.from({ length: maxCols }, (_, i) => `Colonna ${i + 1}`);

  return { headers, rows: dataRows, columnLabels, preamble };
}
