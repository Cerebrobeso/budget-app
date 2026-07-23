/** Avvia il download di un file generato lato client, senza dipendenze esterne. */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Un campo per riga CSV: tra virgolette (con "" raddoppiate) se contiene `;`, virgolette o newline.
 * Se inizia con `=`, `+`, `-`, `@`, tab o CR viene anteposto un apice: senza, un foglio di calcolo
 * (Excel/Sheets/LibreOffice) interpreterebbe il valore come una formula da eseguire all'apertura
 * del file (CSV/formula injection — CWE-1236), e qui i campi derivano da testo libero dell'utente
 * (descrizione, nome categoria/sottocategoria).
 */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV con `;` come separatore (convenzione Excel it-IT). */
export function toCsv(rows: string[][]): string {
  return rows.map((cols) => cols.map(csvField).join(';')).join('\r\n');
}
