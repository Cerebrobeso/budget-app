import { describe, expect, it } from 'vitest';
import { BANK_PROFILES, matchBankProfile } from './bank-profiles';

describe('matchBankProfile', () => {
  it('matches a profile whose signature labels all appear in the headers', () => {
    const profile = matchBankProfile(['Data Operazione', 'Movimenti Dare', 'Movimenti Avere', 'Descrizione']);
    expect(profile?.id).toBe('dare-avere');
    expect(profile?.mapping).toEqual({ amountMode: 'debitCredit' });
  });

  it('matches case-insensitively and ignoring extra spacing', () => {
    expect(matchBankProfile(['DATA   OPERAZIONE', 'movimenti dare', 'MOVIMENTI AVERE'])?.id).toBe('dare-avere');
  });

  it('returns null when only part of the signature is present', () => {
    expect(matchBankProfile(['Data Operazione', 'Importo', 'Descrizione'])).toBeNull();
  });

  it('returns null for headers that match no profile', () => {
    expect(matchBankProfile(['Colonna 1', 'Colonna 2'])).toBeNull();
  });

  it('gives every profile a unique id', () => {
    expect(new Set(BANK_PROFILES.map((p) => p.id)).size).toBe(BANK_PROFILES.length);
  });
});
