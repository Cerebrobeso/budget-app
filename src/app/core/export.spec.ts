import { describe, expect, it } from 'vitest';
import { toCsv } from './export';

describe('toCsv', () => {
  it('joins fields with ";" and rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a;b\r\nc;d');
  });

  it('leaves plain fields unquoted', () => {
    expect(toCsv([['Spesa quotidiana', '42,00']])).toBe('Spesa quotidiana;42,00');
  });

  it('quotes a field containing the separator, doubling embedded quotes', () => {
    expect(toCsv([['a;b', 'say "hi"', 'line\nbreak']])).toBe('"a;b";"say ""hi""";"line\nbreak"');
  });

  it('prefixes a leading "=" with a single quote to defuse formula injection (CWE-1236); the embedded quotes still trigger normal CSV quoting/doubling on top', () => {
    expect(toCsv([['=HYPERLINK("http://evil.example")', 'x']])).toBe('"\'=HYPERLINK(""http://evil.example"")";x');
  });

  it.each([['+1234'], ['-1234'], ['@SUM(A1:A2)'], ['\tcmd']])(
    'prefixes a leading formula-trigger character (%s) with a single quote, with no CSV quoting needed',
    (value) => {
      expect(toCsv([[value]])).toBe(`'${value}`);
    },
  );

  it('prefixes a leading CR with a single quote, and still CSV-quotes the field since CR also requires it', () => {
    expect(toCsv([['\rcmd']])).toBe('"\'\rcmd"');
  });

  it('does not guard a "-" that is not in the leading position (plain negative-looking text mid-string)', () => {
    expect(toCsv([['saldo-2026']])).toBe('saldo-2026');
  });

  it('still quotes a guarded field that also needs CSV quoting (contains the separator)', () => {
    expect(toCsv([['=1+1;2']])).toBe('"\'=1+1;2"');
  });

  it('does not alter a field that merely contains "=" or "@" mid-string', () => {
    expect(toCsv([['a=b@c']])).toBe('a=b@c');
  });
});
