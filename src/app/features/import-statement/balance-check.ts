import { parseRowAmount } from './column-mapping';
import { ParsedTransactionRow } from './import-types';
import { looksLikeAmount } from './row-utils';

export interface StatementBalances {
  initial: number;
  final: number;
}

export interface BalanceCheckResult {
  ok: boolean;
  /** Saldo finale dichiarato dal file. */
  expected: number;
  /** Saldo iniziale + somma dei movimenti interpretati. */
  actual: number;
  /** actual - expected: positivo se abbiamo importato più di quanto dichiarato. */
  diff: number;
}

const INITIAL_PATTERN = /saldo\s+(iniziale|precedente|di\s+apertura|contabile\s+iniziale|inizio)/i;
const FINAL_PATTERN = /saldo\s+(finale|contabile|disponibile|di\s+chiusura|fine)/i;

function amountInRow(raw: string[]): number | null {
  // L'ultima cella numerica della riga: l'etichetta ("SALDO INIZIALE AL 01/06/2024") può contenere
  // una data e le colonne intermedie essere vuote.
  for (let i = raw.length - 1; i >= 0; i--) {
    if (looksLikeAmount(raw[i])) return parseRowAmount(raw[i]);
  }
  return null;
}

/**
 * Cerca saldo iniziale e finale nelle righe che non sono movimenti (preambolo prima dell'header e
 * righe di riepilogo in coda alla tabella). Generico di proposito: funziona su qualunque banca che
 * li dichiari, senza codice dedicato. Null se il file non li riporta entrambi — nessun avviso.
 */
export function extractBalances(preamble: string[][], rows: string[][]): StatementBalances | null {
  let initial: number | null = null;
  let final: number | null = null;

  for (const raw of [...preamble, ...rows]) {
    const text = raw.join(' ');
    if (initial === null && INITIAL_PATTERN.test(text)) initial = amountInRow(raw);
    else if (FINAL_PATTERN.test(text)) {
      const value = amountInRow(raw);
      // L'ultimo saldo finale vince: alcuni estratti lo ripetono a fine di ogni pagina.
      if (value !== null) final = value;
    }
  }

  return initial !== null && final !== null ? { initial, final } : null;
}

/**
 * Verifica saldo_iniziale + somma(movimenti) == saldo_finale. La tolleranza cresce col numero di
 * righe perché ogni movimento porta il suo arrotondamento al centesimo.
 */
export function checkBalance(balances: StatementBalances, rows: ParsedTransactionRow[]): BalanceCheckResult {
  const sum = rows.reduce((total, row) => {
    if (row.amount === null || row.type === null) return total;
    return total + (row.type === 'income' ? row.amount : -row.amount);
  }, 0);

  const actual = balances.initial + sum;
  const diff = actual - balances.final;
  const tolerance = Math.max(0.01, 0.01 * rows.length);

  return { ok: Math.abs(diff) <= tolerance, expected: balances.final, actual, diff };
}
