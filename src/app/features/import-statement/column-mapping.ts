import { format, isValid, parse } from 'date-fns';
import { dateToIso } from '../../core/format';
import { DateFormatOption, FieldMapping, ParsedRows, ParsedTransactionRow } from './import-types';

export type HeuristicMappingResult = Omit<FieldMapping, 'dateFormat'>;

const DATE_HINTS = ['data', 'date', 'valuta'];
const AMOUNT_HINTS = ['importo', 'amount'];
const DEBIT_HINTS = ['dare', 'debit', 'uscita', 'addebito'];
const CREDIT_HINTS = ['avere', 'credit', 'entrata', 'accredito'];
const DESCRIPTION_HINTS = ['descrizione', 'causale', 'description', 'dettaglio'];

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

// Importo con segno: parentesi contabili o '-' ovunque = negativo; separatore decimale euristico (virgola sola = it-IT).
export function parseRowAmount(cell: string): number | null {
  let trimmed = cell.trim();
  if (!trimmed) return null;

  const isParenNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  if (isParenNegative) trimmed = trimmed.slice(1, -1);

  let stripped = trimmed.replace(/[^0-9.,+-]/g, '');
  if (!stripped) return null;

  const negative = isParenNegative || stripped.includes('-');
  stripped = stripped.replace(/[+-]/g, '');
  if (!stripped) return null;

  const hasDot = stripped.includes('.');
  const hasComma = stripped.includes(',');
  let normalized: string;
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

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// Modalità 'signed': segno del valore determina entrata/uscita. 'debitCredit': solo una delle due colonne
// deve avere un valore non nullo/zero per riga — entrambe valorizzate (o nessuna) è ambiguo, riga non interpretabile.
function resolveAmount(raw: string[], mapping: FieldMapping): { amount: number | null; type: 'income' | 'expense' | null } {
  if (mapping.amountMode === 'signed') {
    const cell = mapping.amountColumn !== null ? (raw[mapping.amountColumn] ?? '') : '';
    const signed = mapping.amountColumn !== null ? parseRowAmount(cell) : null;
    if (signed === null || signed === 0) return { amount: null, type: null };
    return { amount: Math.abs(signed), type: signed > 0 ? 'income' : 'expense' };
  }

  const debitCell = mapping.debitColumn !== null ? (raw[mapping.debitColumn] ?? '').trim() : '';
  const creditCell = mapping.creditColumn !== null ? (raw[mapping.creditColumn] ?? '').trim() : '';
  const debit = debitCell ? parseRowAmount(debitCell) : null;
  const credit = creditCell ? parseRowAmount(creditCell) : null;
  const hasDebit = debit !== null && debit !== 0;
  const hasCredit = credit !== null && credit !== 0;

  if (hasDebit && !hasCredit) return { amount: Math.abs(debit!), type: 'expense' };
  if (hasCredit && !hasDebit) return { amount: Math.abs(credit!), type: 'income' };
  return { amount: null, type: null };
}

export function mapRows(parsed: ParsedRows, mapping: FieldMapping): ParsedTransactionRow[] {
  return parsed.rows.map((raw, rowIndex) => {
    const dateCell = mapping.dateColumn !== null ? (raw[mapping.dateColumn] ?? '') : '';
    const descriptionCell = mapping.descriptionColumn !== null ? (raw[mapping.descriptionColumn] ?? '') : '';

    const date = mapping.dateColumn !== null ? parseRowDate(dateCell, mapping.dateFormat) : null;
    const { amount, type } = resolveAmount(raw, mapping);

    return {
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
    };
  });
}
