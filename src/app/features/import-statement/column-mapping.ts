import { format, isValid, parse } from 'date-fns';
import { dateToIso } from '../../core/format';
import {
  DATE_FORMAT_OPTIONS,
  DateFormatOption,
  FieldMapping,
  ParsedRows,
  ParsedTransactionRow,
} from './import-types';

export type HeuristicMappingResult = Omit<FieldMapping, 'dateFormat'>;

const DATE_HINTS = ['data', 'date', 'valuta', 'giorno'];
const AMOUNT_HINTS = ['importo', 'amount', 'ammontare'];
const DEBIT_HINTS = ['dare', 'debit', 'uscita', 'uscite', 'addebito', 'addebiti', 'pagamenti'];
const CREDIT_HINTS = ['avere', 'credit', 'entrata', 'entrate', 'accredito', 'accrediti', 'incassi'];
// Niente 'operazione' né 'movimento': collidono con "Data Operazione" e "Movimenti Dare",
// che sono la colonna data e quella importo.
const DESCRIPTION_HINTS = ['descrizione', 'causale', 'description', 'dettaglio', 'dettagli', 'note'];

// Righe di riepilogo (saldi, totali, riporti di pagina) che non sono movimenti. Il pattern è stretto
// di proposito: 'saldo' da solo colpirebbe anche descrizioni legittime tipo "SALDO CARTA DI CREDITO".
const SUMMARY_ROW_PATTERN =
  /\b(saldo\s+(iniziale|finale|precedente|contabile|disponibile|di\s+apertura|di\s+chiusura)|totale\s+(movimenti|dare|avere|uscite|entrate|generale)|riporto|a\s+riportare)\b/i;

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function findColumn(columnLabels: string[], hints: string[]): number | null {
  const index = columnLabels.findIndex((label) => hints.some((hint) => normalizeLabel(label).includes(hint)));
  return index === -1 ? null : index;
}

// Null se headersPresent è false o nessun hint matcha con sicurezza — mai un'assegnazione incerta.
// amountMode è 'debitCredit' solo se si trovano ENTRAMBE le colonne dare/avere; altrimenti 'signed' di default.
export function guessFieldMapping(columnLabels: string[], headersPresent: boolean): HeuristicMappingResult {
  if (!headersPresent) {
    return { dateColumn: null, amountColumn: null, debitColumn: null, creditColumn: null, descriptionColumn: null, amountMode: 'signed' };
  }
  const debitColumn = findColumn(columnLabels, DEBIT_HINTS);
  const creditColumn = findColumn(columnLabels, CREDIT_HINTS);
  return {
    dateColumn: findColumn(columnLabels, DATE_HINTS),
    amountColumn: findColumn(columnLabels, AMOUNT_HINTS),
    debitColumn,
    creditColumn,
    descriptionColumn: findColumn(columnLabels, DESCRIPTION_HINTS),
    amountMode: debitColumn !== null && creditColumn !== null ? 'debitCredit' : 'signed',
  };
}

// Confronta ignorando lo zero-padding, così accetta sia "01/02/2024" sia "1/2/2024"; scarta le date impossibili (es. 31/02).
function sameDateIgnoringPadding(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .split(/[./-]/)
      .map((part) => part.padStart(2, '0'))
      .join('-');
  return normalize(a) === normalize(b);
}

export function parseRowDate(cell: string, dateFormat: DateFormatOption): string | null {
  const trimmed = cell.trim();
  if (!trimmed) return null;
  const parsed = parse(trimmed, dateFormat, new Date());
  if (!isValid(parsed) || !sameDateIgnoringPadding(format(parsed, dateFormat), trimmed)) return null;
  return dateToIso(parsed);
}

/**
 * Formato che interpreta più celle della colonna data. Senza questo il default resterebbe dd/MM/yyyy
 * e un file gg.mm.aaaa mostrerebbe ogni riga come "non interpretabile" finché l'utente non indovina
 * il select. A parità di risultato vince l'ordine di DATE_FORMAT_OPTIONS (dd/MM/yyyy per primo).
 */
export function guessDateFormat(cells: string[]): DateFormatOption {
  let best: DateFormatOption = DATE_FORMAT_OPTIONS[0];
  let bestCount = 0;
  for (const option of DATE_FORMAT_OPTIONS) {
    const count = cells.filter((cell) => parseRowDate(cell, option) !== null).length;
    if (count > bestCount) {
      best = option;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Separatore decimale dedotto dall'intera colonna, non dalla singola cella: "1.234" isolato è ambiguo
 * (1234 o 1,234?), ma se in colonna compare anche "1.234,56" il punto è certamente separatore di
 * migliaia. Null quando la colonna non dà indizi: si ricade sull'euristica per cella.
 */
export function guessDecimalSeparator(cells: string[]): ',' | '.' | null {
  let commaDecimal = 0;
  let dotDecimal = 0;
  let commaThousands = 0;
  let dotThousands = 0;

  for (const cell of cells) {
    const stripped = cell.replace(/[^0-9.,]/g, '');
    const lastDot = stripped.lastIndexOf('.');
    const lastComma = stripped.lastIndexOf(',');

    if (lastDot >= 0 && lastComma >= 0) {
      // Entrambi presenti: il più a destra è il decimale, nessuna ambiguità.
      if (lastComma > lastDot) commaDecimal++;
      else dotDecimal++;
      continue;
    }

    const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (!separator) continue;
    const index = separator === '.' ? lastDot : lastComma;
    const trailingDigits = stripped.length - index - 1;
    // Un separatore seguito da 3 cifre raggruppa migliaia; da 1 o 2 cifre è decimale.
    if (trailingDigits === 3) {
      if (separator === ',') commaThousands++;
      else dotThousands++;
    } else if (trailingDigits === 1 || trailingDigits === 2) {
      if (separator === ',') commaDecimal++;
      else dotDecimal++;
    }
  }

  if (commaDecimal !== dotDecimal) return commaDecimal > dotDecimal ? ',' : '.';
  if (dotThousands > 0 && commaThousands === 0) return ',';
  if (commaThousands > 0 && dotThousands === 0) return '.';
  return null;
}

// Importo con segno: parentesi contabili o '-' in testa/coda = negativo. Il separatore decimale è
// quello dedotto dalla colonna se noto (vedi guessDecimalSeparator), altrimenti euristica per cella.
export function parseRowAmount(cell: string, decimalSeparator?: ',' | '.' | null): number | null {
  let trimmed = cell.trim();
  if (!trimmed) return null;

  const isParenNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  if (isParenNegative) trimmed = trimmed.slice(1, -1).trim();

  // Solo in testa o in coda: un '-' interno appartiene al testo (es. un codice "COD-123"), non al segno.
  const negative = isParenNegative || /^-/.test(trimmed) || /-$/.test(trimmed);

  let stripped = trimmed.replace(/[^0-9.,]/g, '');
  if (!stripped) return null;

  let normalized: string;
  if (decimalSeparator) {
    const thousands = decimalSeparator === ',' ? '.' : ',';
    normalized = stripped.split(thousands).join('').replace(decimalSeparator, '.');
  } else {
    const hasDot = stripped.includes('.');
    const hasComma = stripped.includes(',');
    if (hasDot && hasComma) {
      const decimalIndex = Math.max(stripped.lastIndexOf('.'), stripped.lastIndexOf(','));
      const integerPart = stripped.slice(0, decimalIndex).replace(/[.,]/g, '');
      const decimalPart = stripped.slice(decimalIndex + 1);
      normalized = `${integerPart}.${decimalPart}`;
    } else if (hasComma) {
      const parts = stripped.split(',');
      normalized = parts.length > 1 ? `${parts.slice(0, -1).join('')}.${parts.at(-1)}` : stripped;
    } else {
      normalized = stripped;
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// Modalità 'signed': segno del valore determina entrata/uscita. 'debitCredit': solo una delle due colonne
// deve avere un valore non nullo/zero per riga — entrambe valorizzate (o nessuna) è ambiguo, riga non interpretabile.
function resolveAmount(
  raw: string[],
  mapping: FieldMapping,
  separators: ColumnSeparators,
): { amount: number | null; type: 'income' | 'expense' | null } {
  if (mapping.amountMode === 'signed') {
    const cell = mapping.amountColumn !== null ? (raw[mapping.amountColumn] ?? '') : '';
    const signed = mapping.amountColumn !== null ? parseRowAmount(cell, separators.amount) : null;
    if (signed === null || signed === 0) return { amount: null, type: null };
    return { amount: Math.abs(signed), type: signed > 0 ? 'income' : 'expense' };
  }

  const debitCell = mapping.debitColumn !== null ? (raw[mapping.debitColumn] ?? '').trim() : '';
  const creditCell = mapping.creditColumn !== null ? (raw[mapping.creditColumn] ?? '').trim() : '';
  const debit = debitCell ? parseRowAmount(debitCell, separators.debit) : null;
  const credit = creditCell ? parseRowAmount(creditCell, separators.credit) : null;
  const hasDebit = debit !== null && debit !== 0;
  const hasCredit = credit !== null && credit !== 0;

  if (hasDebit && !hasCredit) return { amount: Math.abs(debit!), type: 'expense' };
  if (hasCredit && !hasDebit) return { amount: Math.abs(credit!), type: 'income' };
  return { amount: null, type: null };
}

interface ColumnSeparators {
  amount: ',' | '.' | null;
  debit: ',' | '.' | null;
  credit: ',' | '.' | null;
}

function columnCells(rows: string[][], column: number | null): string[] {
  return column === null ? [] : rows.map((row) => row[column] ?? '');
}

export function isSummaryRow(raw: string[]): boolean {
  return SUMMARY_ROW_PATTERN.test(raw.join(' '));
}

export function mapRows(parsed: ParsedRows, mapping: FieldMapping): ParsedTransactionRow[] {
  const separators: ColumnSeparators = {
    amount: guessDecimalSeparator(columnCells(parsed.rows, mapping.amountColumn)),
    debit: guessDecimalSeparator(columnCells(parsed.rows, mapping.debitColumn)),
    credit: guessDecimalSeparator(columnCells(parsed.rows, mapping.creditColumn)),
  };

  return parsed.rows.flatMap((raw, rowIndex) => {
    // Le righe di riepilogo non sono movimenti: importarle raddoppierebbe i totali del mese.
    if (isSummaryRow(raw)) return [];

    const dateCell = mapping.dateColumn !== null ? (raw[mapping.dateColumn] ?? '') : '';
    const descriptionCell = mapping.descriptionColumn !== null ? (raw[mapping.descriptionColumn] ?? '') : '';

    const date = mapping.dateColumn !== null ? parseRowDate(dateCell, mapping.dateFormat) : null;
    const { amount, type } = resolveAmount(raw, mapping, separators);

    return [
      {
        rowIndex,
        date,
        amount,
        type,
        description: descriptionCell.trim(),
        raw,
        isDuplicateOfExisting: false,
        isDuplicateInBatch: false,
        selected: false,
        categoryId: null,
        subcategoryId: null,
      },
    ];
  });
}
