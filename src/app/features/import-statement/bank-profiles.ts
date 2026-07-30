import { HeuristicMappingResult } from './column-mapping';
import { DateFormatOption } from './import-types';

/**
 * Un profilo è solo un suggerimento migliore dell'euristica generica: se matcha, precompila lo step
 * di mapping, che resta comunque visibile e modificabile dall'utente. Aggiungere una banca significa
 * aggiungere un literal a BANK_PROFILES — nessun parser dedicato, nessuna sottoclasse.
 */
export interface BankProfile {
  id: string;
  /** Mostrato in preview: "Rilevato: ...". */
  label: string;
  /** Etichette che devono comparire TUTTE fra le colonne (confronto normalizzato, per sottostringa). */
  signature: string[];
  /** Override sull'euristica, da usare solo dove le intestazioni sono ambigue. */
  mapping?: Partial<HeuristicMappingResult>;
  /** Solo se il formato non è deducibile dai dati (vedi guessDateFormat). */
  dateFormat?: DateFormatOption;
}

function normalize(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// I tracciati record delle singole banche vanno aggiunti qui man mano che si hanno i file di esempio.
export const BANK_PROFILES: BankProfile[] = [
  {
    id: 'dare-avere',
    label: 'Estratto conto Dare/Avere',
    signature: ['data operazione', 'movimenti dare', 'movimenti avere'],
    mapping: { amountMode: 'debitCredit' },
  },
];

/** Primo profilo la cui firma è interamente contenuta nelle intestazioni; null se nessuno matcha. */
export function matchBankProfile(columnLabels: string[]): BankProfile | null {
  const normalized = columnLabels.map(normalize);
  return (
    BANK_PROFILES.find((profile) =>
      profile.signature.every((hint) => normalized.some((label) => label.includes(normalize(hint)))),
    ) ?? null
  );
}
