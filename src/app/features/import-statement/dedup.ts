import { Transaction } from '../../core/models';
import { ParsedTransactionRow } from './import-types';

function dedupKey(date: string, type: 'income' | 'expense', amount: number): string {
  return `${date}|${type}|${amount.toFixed(2)}`;
}

// Chiave: data ISO + importo assoluto + tipo (le 'transfer' esistenti non entrano nel confronto).
// selected di default true per righe non duplicate con date/amount validi, false altrimenti.
export function markDuplicates(rows: ParsedTransactionRow[], existing: Transaction[]): ParsedTransactionRow[] {
  const existingKeys = new Set(
    existing.filter((t) => t.type !== 'transfer').map((t) => dedupKey(t.date, t.type as 'income' | 'expense', t.amount)),
  );
  const seenInBatch = new Map<string, number>();

  return rows.map((row) => {
    if (row.date === null || row.amount === null || row.type === null) {
      return { ...row, isDuplicateOfExisting: false, isDuplicateInBatch: false, selected: false };
    }

    const key = dedupKey(row.date, row.type, row.amount);
    const isDuplicateOfExisting = existingKeys.has(key);
    const occurrences = seenInBatch.get(key) ?? 0;
    seenInBatch.set(key, occurrences + 1);
    const isDuplicateInBatch = occurrences > 0;

    return { ...row, isDuplicateOfExisting, isDuplicateInBatch, selected: !(isDuplicateOfExisting || isDuplicateInBatch) };
  });
}
