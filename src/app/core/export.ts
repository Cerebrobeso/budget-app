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

/** Un campo per riga CSV: tra virgolette (con "" raddoppiate) se contiene `;`, virgolette o newline. */
function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV con `;` come separatore (convenzione Excel it-IT). */
export function toCsv(rows: string[][]): string {
  return rows.map((cols) => cols.map(csvField).join(';')).join('\r\n');
}
