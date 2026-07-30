import { describe, expect, it } from 'vitest';
import { decodeTextFile, validateStatementFile } from './file-validation';

const PDF_HEADER = '%PDF-1.4\n%âãÏÓ\n';

describe('validateStatementFile', () => {
  it('rejects an empty file', async () => {
    const file = new File([], 'estratto.csv', { type: 'text/csv' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: false, error: 'Il file è vuoto.' });
  });

  it('rejects a file over the 8MB size limit', async () => {
    const bigContent = new Uint8Array(8 * 1024 * 1024 + 1);
    const file = new File([bigContent], 'estratto.csv', { type: 'text/csv' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: false, error: 'Il file supera la dimensione massima di 8MB.' });
  });

  it('rejects a file with an unsupported extension', async () => {
    const file = new File(['contenuto'], 'estratto.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: false, error: 'Formato non supportato: carica un file CSV, XLS o PDF.' });
  });

  it('accepts a .csv whose MIME Windows reports as Excel (extension wins over MIME)', async () => {
    const file = new File(['Data,Importo\n01/01/2024,100,00'], 'estratto.csv', {
      type: 'application/vnd.ms-excel',
    });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: true, kind: 'csv' });
  });

  it('accepts an .xlsx by its zip magic bytes', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])], 'estratto.xlsx', { type: '' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: true, kind: 'xls' });
  });

  it('accepts an .xls that is really an HTML table (common in Italian bank exports)', async () => {
    const file = new File(['<html><table><tr><td>Data</td></tr></table></html>'], 'estratto.xls', { type: '' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: true, kind: 'xls' });
  });

  it('rejects a CSV-named file whose content contains a null byte', async () => {
    const bytes = new Uint8Array([...'Data,Importo\n'].map((c) => c.charCodeAt(0)));
    const withNull = new Uint8Array([...bytes, 0, ...bytes]);
    const file = new File([withNull], 'estratto.csv', { type: 'text/csv' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: false, error: 'Il file non sembra un CSV di testo valido.' });
  });

  it('rejects a PDF-named file missing the %PDF- magic bytes', async () => {
    const file = new File(['questo non è un vero pdf'], 'estratto.pdf', { type: 'application/pdf' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: false, error: 'Il file non sembra un PDF valido.' });
  });

  it('accepts a valid CSV file', async () => {
    const file = new File(['Data,Importo\n01/01/2024,100,00'], 'estratto.csv', { type: 'text/csv' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: true, kind: 'csv' });
  });

  it('accepts a CSV file with empty MIME type and a .txt extension', async () => {
    const file = new File(['Data,Importo\n01/01/2024,100,00'], 'estratto.txt', { type: '' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: true, kind: 'csv' });
  });

  it('accepts a valid PDF file with correct magic bytes', async () => {
    const file = new File([PDF_HEADER], 'estratto.pdf', { type: 'application/pdf' });
    const result = await validateStatementFile(file);
    expect(result).toEqual({ ok: true, kind: 'pdf' });
  });
});

describe('decodeTextFile', () => {
  it('decodes a valid UTF-8 buffer, including accented/multibyte characters', () => {
    const text = 'Spesa supermercato è così: caffè €5,00';
    const buffer = new TextEncoder().encode(text).buffer;
    expect(decodeTextFile(buffer)).toBe(text);
  });
});
