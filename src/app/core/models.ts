export type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * categoryId fisso per i movimenti di tipo 'transfer' (spostamenti tra propri conti, es. corrente -> deposito):
 * non sono né entrate né uscite, quindi non hanno una vera categoria e non contano nel bilancio del mese.
 */
export const TRANSFER_CATEGORY_ID = '__transfer__';

/**
 * Etichetta opzionale per un movimento fuori dall'ordinario: 'unexpected' (imprevisto, non
 * pianificato) o 'planned' (spesa/entrata grossa ma prevista in anticipo, es. vacanza). Le due
 * si escludono a vicenda — servono a spiegare a colpo d'occhio un saldo del mese fuori norma.
 */
export type TransactionTag = 'unexpected' | 'planned';

export const TRANSACTION_TAG_LABEL: Record<TransactionTag, string> = {
  unexpected: 'Imprevisto',
  planned: 'Programmata',
};

export interface Transaction {
  id: string;
  /** ISO yyyy-MM-dd */
  date: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  subcategoryId: string | null;
  description: string;
  /** Regola ricorrente che ha generato questo movimento, null se inserito a mano. */
  recurringRuleId: string | null;
  tag: TransactionTag | null;
}

/**
 * Regola per generare automaticamente un movimento ogni mese (affitto, abbonamenti, rate...).
 * La generazione (client-side, in RecurringStore) guarda i movimenti già collegati a `id`
 * per capire da dove riprendere, quindi non serve un campo "ultima generazione" separato.
 */
export interface RecurringRule {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  subcategoryId: string | null;
  description: string;
  /** 1-28: giorno del mese in cui generare il movimento (28 per restare valido in ogni mese). */
  dayOfMonth: number;
  /** ISO yyyy-MM-dd: il giorno non conta, solo anno/mese di partenza. */
  startDate: string;
  /** In pausa: non genera più nuovi movimenti, ma i vecchi restano. */
  archived?: boolean;
  /**
   * Piano a rate: impostati insieme, la regola genera un numero finito di movimenti e poi
   * si mette in pausa da sola. `startOccurrence` è la rata da cui riparte questa regola —
   * utile se le rate precedenti sono già registrate a mano (es. un finanziamento a metà).
   */
  startOccurrence?: number;
  totalOccurrences?: number;
}

export interface Subcategory {
  id: string;
  name: string;
  archived?: boolean;
  /** Aggiunta dall'utente su una categoria predefinita/condivisa: privata, la vede solo lui (client-side, non persistita). */
  overlay?: boolean;
}

/**
 * Sottocategoria che un utente aggiunge a una categoria condivisa (`Category.shared`).
 * Vive in una tabella a parte, sempre privata (RLS owner-only): non tocca mai la riga
 * jsonb condivisa, così non interferisce con gli altri utenti.
 */
export interface SubcategoryOverlay {
  id: string;
  categoryId: string;
  name: string;
  archived?: boolean;
}

export interface Category {
  id: string;
  name: string;
  /** Categorie riservate alle entrate vengono proposte solo nel form entrata */
  kind: 'expense' | 'income';
  color: string;
  archived?: boolean;
  subcategories: Subcategory[];
  /**
   * Categoria di default, condivisa in lettura con tutti gli utenti (RLS lato db).
   * Sola lettura lato app: rinominarla/archiviarla/ricolorarla va fatto a mano nel
   * db (chi la possiede resta l'utente originale), altrimenti la scrittura verrebbe
   * scartata silenziosamente dalla policy RLS. Le categorie create da un utente
   * restano invece private a lui (`shared` assente/false).
   */
  shared?: boolean;
}

export type AssetCategory =
  | 'conto-corrente'
  | 'conto-deposito'
  | 'azioni-etf'
  | 'fondi'
  | 'crypto'
  | 'immobili'
  | 'altro';

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  'conto-corrente': 'Conto corrente',
  'conto-deposito': 'Conto deposito',
  'azioni-etf': 'Azioni / ETF',
  fondi: 'Fondi',
  crypto: 'Crypto',
  immobili: 'Immobili',
  altro: 'Altro',
};

export interface AssetSnapshot {
  /** ISO yyyy-MM-dd */
  date: string;
  value: number;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  archived?: boolean;
  /** Storico valori, ordinato per data crescente */
  snapshots: AssetSnapshot[];
}

export interface BudgetData {
  transactions: Transaction[];
  categories: Category[];
  assets: Asset[];
}

export function uid(): string {
  return crypto.randomUUID();
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
