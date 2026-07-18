export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  /** ISO yyyy-MM-dd */
  date: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  subcategoryId: string | null;
  description: string;
}

export interface Subcategory {
  id: string;
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
