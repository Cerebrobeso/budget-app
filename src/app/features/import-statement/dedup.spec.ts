import { describe, expect, it } from 'vitest';
import { Transaction } from '../../core/models';
import { markDuplicates } from './dedup';
import { ParsedTransactionRow } from './import-types';

function row(overrides: Partial<ParsedTransactionRow> = {}): ParsedTransactionRow {
  return {
    rowIndex: 0,
    date: '2024-03-15',
    amount: 100,
    type: 'expense',
    description: 'Spesa',
    raw: [],
    isDuplicateOfExisting: false,
    isDuplicateInBatch: false,
    selected: false,
    categoryId: null,
    subcategoryId: null,
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2024-03-15',
    type: 'expense',
    amount: 100,
    categoryId: 'cat1',
    subcategoryId: null,
    description: 'Spesa esistente',
    recurringRuleId: null,
    tag: null,
    ...overrides,
  };
}

describe('markDuplicates', () => {
  it('marks a row as a duplicate of an existing transaction (same date, absolute amount, type) as unselected', () => {
    const [result] = markDuplicates([row()], [tx()]);
    expect(result.isDuplicateOfExisting).toBe(true);
    expect(result.selected).toBe(false);
  });

  it('does not match against an existing "transfer" transaction', () => {
    const [result] = markDuplicates([row()], [tx({ type: 'transfer' as Transaction['type'] })]);
    expect(result.isDuplicateOfExisting).toBe(false);
  });

  it('flags only the second of two identical rows within the same batch, leaving the first selected', () => {
    const [first, second] = markDuplicates([row(), row()], []);
    expect(first.isDuplicateInBatch).toBe(false);
    expect(first.selected).toBe(true);
    expect(second.isDuplicateInBatch).toBe(true);
    expect(second.selected).toBe(false);
  });

  it('selects a non-duplicate row by default', () => {
    const [result] = markDuplicates([row({ amount: 999 })], [tx()]);
    expect(result.isDuplicateOfExisting).toBe(false);
    expect(result.isDuplicateInBatch).toBe(false);
    expect(result.selected).toBe(true);
  });

  it('does not flag two same-day, same-amount rows with different descriptions as in-batch duplicates', () => {
    const rows = markDuplicates([row({ description: 'Caffè bar Centrale' }), row({ description: 'Caffè bar Roma' })], []);
    expect(rows.every((r) => !r.isDuplicateInBatch)).toBe(true);
    expect(rows.every((r) => r.selected)).toBe(true);
  });

  it('matches existing transactions by count: one saved, two in the file -> only one is a duplicate', () => {
    const rows = markDuplicates([row({ description: 'Prima' }), row({ description: 'Seconda' })], [tx()]);
    expect(rows[0].isDuplicateOfExisting).toBe(true);
    expect(rows[1].isDuplicateOfExisting).toBe(false);
    expect(rows[1].selected).toBe(true);
  });

  it('flags both rows when the same movement is already saved twice', () => {
    const rows = markDuplicates([row({ description: 'Prima' }), row({ description: 'Seconda' })], [tx(), tx({ id: 't2' })]);
    expect(rows.every((r) => r.isDuplicateOfExisting)).toBe(true);
  });

  it('never selects a row with a null date/amount/type, even though it is not flagged as a duplicate', () => {
    const [result] = markDuplicates([row({ date: null, amount: null, type: null })], [tx()]);
    expect(result.isDuplicateOfExisting).toBe(false);
    expect(result.isDuplicateInBatch).toBe(false);
    expect(result.selected).toBe(false);
  });
});
