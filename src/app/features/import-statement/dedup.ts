import { Transaction } from '../../core/models';
import { ParsedTransactionRow } from './import-types';

function dedupKey(date: string, type: 'income' | 'expense', amount: number): string {
  return `${date}|${type}|${amount.toFixed(2)}`;
}

// La descrizione entra solo nel confronto interno al file: due movimenti dello stesso giorno e
// importo ma con descrizione diversa (due caffè da 1,50 in negozi diversi) non sono duplicati.
// Contro le transazioni già salvate resta fuori, perché una riga inserita a mano ha quasi sempre
// una descrizione diversa da quella della banca e va comunque segnalata.
function batchKey(row: ParsedTransactionRow, date: string, type: 'income' | 'expense', amount: number): string {
  return `${dedupKey(date, type, amount)}|${row.description.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 40)}`;
}

// Chiave: data ISO + importo assoluto + tipo (le 'transfer' esistenti non entrano nel confronto).
// Il confronto con l'esistente è a conteggio: se il DB ha una sola occorrenza e il file ne porta due,
// solo una è duplicata. selected di default true per righe non duplicate con date/amount validi.
export function markDuplicates(rows: ParsedTransactionRow[], existing: Transaction[]): ParsedTransactionRow[] {
  const remaining = new Map<string, number>();
  for (const tx of existing) {
    if (tx.type === 'transfer') continue;
    const key = dedupKey(tx.date, tx.type as 'income' | 'expense', tx.amount);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const seenInBatch = new Set<string>();

  return rows.map((row) => {
    if (row.date === null || row.amount === null || row.type === null) {
      return { ...row, isDuplicateOfExisting: false, isDuplicateInBatch: false, selected: false };
    }

    const key = dedupKey(row.date, row.type, row.amount);
    const available = remaining.get(key) ?? 0;
    const isDuplicateOfExisting = available > 0;
    if (isDuplicateOfExisting) remaining.set(key, available - 1);

    const inBatch = batchKey(row, row.date, row.type, row.amount);
    const isDuplicateInBatch = seenInBatch.has(inBatch);
    seenInBatch.add(inBatch);

    return { ...row, isDuplicateOfExisting, isDuplicateInBatch, selected: !(isDuplicateOfExisting || isDuplicateInBatch) };
  });
}
