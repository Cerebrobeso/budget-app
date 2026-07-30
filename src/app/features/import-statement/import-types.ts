export interface ParsedRows {
  headers: string[] | null;
  rows: string[][];
  columnLabels: string[];
  /** Righe che precedono l'header (intestazione banca, IBAN, periodo, saldi): non sono movimenti ma contengono i saldi. */
  preamble?: string[][];
}

export type DateFormatOption = 'dd/MM/yyyy' | 'dd.MM.yyyy' | 'dd-MM-yyyy' | 'dd/MM/yy' | 'yyyy-MM-dd';

export const DATE_FORMAT_OPTIONS: DateFormatOption[] = [
  'dd/MM/yyyy',
  'dd.MM.yyyy',
  'dd-MM-yyyy',
  'dd/MM/yy',
  'yyyy-MM-dd',
];

// 'signed': una colonna con segno (+/-). 'debitCredit': due colonne separate (es. Dare/Avere, Uscita/Entrata), mai firmate.
export type AmountMappingMode = 'signed' | 'debitCredit';

export interface FieldMapping {
  dateColumn: number | null;
  descriptionColumn: number | null;
  dateFormat: DateFormatOption;
  amountMode: AmountMappingMode;
  amountColumn: number | null;
  debitColumn: number | null;
  creditColumn: number | null;
}

export interface ParsedTransactionRow {
  rowIndex: number;
  date: string | null;
  amount: number | null;
  type: 'income' | 'expense' | null;
  description: string;
  raw: string[];
  isDuplicateOfExisting: boolean;
  isDuplicateInBatch: boolean;
  selected: boolean;
  categoryId: string | null;
  subcategoryId: string | null;
}
