import { describe, expect, it } from 'vitest';
import { groupTextItemsIntoRows, mergeContinuationRows, PdfTextItem, readPageTextItems } from './pdf-parser';

// parsePdf() richiede pdf.js reale (parsing binario) — fuori scope per unit test, si testano le funzioni sottostanti.

describe('readPageTextItems', () => {
  // Lo stream finto espone SOLO getReader(), senza Symbol.asyncIterator: è così che si comporta
  // ReadableStream su Safari. Serve a far fallire il test se si torna a getTextContent()/for-await
  // (il ReadableStream di Node è async-iterabile, quindi da solo non intercetterebbe la regressione).
  function fakePage(chunks: { items: unknown[] }[]) {
    let i = 0;
    return {
      streamTextContent: () => ({
        getReader: () => ({
          read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }),
          releaseLock: () => {},
        }),
      }),
    } as never;
  }

  it('reads every chunk of the stream and skips items without text', async () => {
    const page = fakePage([
      {
        items: [
          { str: '01/03/2024', transform: [1, 0, 0, 1, 50, 700], width: 48 },
          { type: 'beginMarkedContent' },
          { str: '   ', transform: [1, 0, 0, 1, 90, 700], width: 8 },
        ],
      },
      { items: [{ str: 'Spesa', transform: [1, 0, 0, 1, 150, 700], width: 26 }] },
    ]);

    expect(await readPageTextItems(page, 3)).toEqual([
      { text: '01/03/2024', x: 50, y: 700, page: 3, width: 48 },
      { text: 'Spesa', x: 150, y: 700, page: 3, width: 26 },
    ]);
  });
});

describe('groupTextItemsIntoRows', () => {
  it('returns an empty array for an empty input', () => {
    expect(groupTextItemsIntoRows([])).toEqual([]);
  });

  it('groups items into rows by y-proximity and orders cells left-to-right by x within a row', () => {
    const items: PdfTextItem[] = [
      { text: '01/03/2024', x: 50, y: 700, page: 1 },
      { text: 'Spesa', x: 150, y: 700, page: 1 },
      { text: '50,00', x: 300, y: 700, page: 1 },
      { text: '02/03/2024', x: 50, y: 680, page: 1 },
      { text: 'Stipendio', x: 150, y: 680, page: 1 },
      { text: '1.200,00', x: 300, y: 680, page: 1 },
    ];

    const result = groupTextItemsIntoRows(items);

    expect(result).toEqual([
      ['01/03/2024', 'Spesa', '50,00'],
      ['02/03/2024', 'Stipendio', '1.200,00'],
    ]);
  });

  it('keeps items on different pages in separate rows even when their y coordinate coincides', () => {
    const items: PdfTextItem[] = [
      { text: '01/03/2024', x: 50, y: 700, page: 1 },
      { text: 'Spesa', x: 150, y: 700, page: 1 },
      { text: '01/03/2024', x: 50, y: 700, page: 2 },
      { text: 'Altro', x: 150, y: 700, page: 2 },
    ];

    const result = groupTextItemsIntoRows(items);

    expect(result).toEqual([
      ['01/03/2024', 'Spesa'],
      ['01/03/2024', 'Altro'],
    ]);
  });

  it('uses the real text width (not a length-based approximation) to split adjacent header cells with a small gap', () => {
    // Riprodotto da un vero estratto conto: "MOVIMENTI AVERE" e "DESCRIZIONE" hanno solo ~6pt di distanza reale.
    const items: PdfTextItem[] = [
      { text: 'MOVIMENTI AVERE', x: 235.4, y: 484.1, page: 1, width: 56.3 },
      { text: 'DESCRIZIONE', x: 297.4, y: 484.1, page: 1, width: 41.0 },
    ];
    expect(groupTextItemsIntoRows(items)).toEqual([['MOVIMENTI AVERE', 'DESCRIZIONE']]);
  });

  it('falls back to a length-based width estimate when width is not provided (may merge adjacent cells)', () => {
    const items: PdfTextItem[] = [
      { text: 'MOVIMENTI AVERE', x: 235.4, y: 484.1, page: 1 },
      { text: 'DESCRIZIONE', x: 297.4, y: 484.1, page: 1 },
    ];
    expect(groupTextItemsIntoRows(items)).toEqual([['MOVIMENTI AVERE DESCRIZIONE']]);
  });

  it('skips leading single-cell letterhead lines and realigns sparse columns (e.g. Dare/Avere) to the real header found further down', () => {
    const items: PdfTextItem[] = [
      { text: 'Banca Esempio SpA', x: 50, y: 900, page: 1, width: 90 },
      { text: 'Via Roma 1', x: 50, y: 890, page: 1, width: 60 },
      // header: Data | Dare | Avere | Descrizione
      { text: 'Data', x: 50, y: 700, page: 1, width: 30 },
      { text: 'Dare', x: 100, y: 700, page: 1, width: 25 },
      { text: 'Avere', x: 150, y: 700, page: 1, width: 25 },
      { text: 'Descrizione', x: 200, y: 700, page: 1, width: 50 },
      // riga con solo Dare valorizzato
      { text: '01/03/2024', x: 50, y: 690, page: 1, width: 35 },
      { text: '50,00', x: 100, y: 690, page: 1, width: 20 },
      { text: 'Spesa', x: 200, y: 690, page: 1, width: 40 },
      // riga con solo Avere valorizzato
      { text: '02/03/2024', x: 50, y: 680, page: 1, width: 35 },
      { text: '80,00', x: 150, y: 680, page: 1, width: 20 },
      { text: 'Stipendio', x: 200, y: 680, page: 1, width: 50 },
    ];

    const result = groupTextItemsIntoRows(items);

    expect(result).toEqual([
      ['Data', 'Dare', 'Avere', 'Descrizione'],
      ['01/03/2024', '50,00', '', 'Spesa'],
      ['02/03/2024', '', '80,00', 'Stipendio'],
    ]);
  });
});

describe('mergeContinuationRows', () => {
  it('appends a row with no date-like cell to the last cell of the previous row', () => {
    const rows = [
      ['01.06.2024', '135,27', 'ADDEBITO DISPOSIZIONE RID/SDD'],
      ['CRED. REGIONE LOMBARDIA SDD 2024 R 0648554 SCAD. 01/06/2024'],
      ['IMP. E 134,77 COMM. E 0,50'],
      ['02.06.2024', '50,00', 'Altro movimento'],
    ];

    expect(mergeContinuationRows(rows)).toEqual([
      [
        '01.06.2024',
        '135,27',
        'ADDEBITO DISPOSIZIONE RID/SDD CRED. REGIONE LOMBARDIA SDD 2024 R 0648554 SCAD. 01/06/2024 IMP. E 134,77 COMM. E 0,50',
      ],
      ['02.06.2024', '50,00', 'Altro movimento'],
    ]);
  });

  it('leaves rows untouched when every row has a date-like cell', () => {
    const rows = [
      ['01.06.2024', '135,27', 'Riga uno'],
      ['02.06.2024', '50,00', 'Riga due'],
    ];
    expect(mergeContinuationRows(rows)).toEqual(rows);
  });

  it('keeps a leading row with no date as its own row (nothing to merge it into)', () => {
    const rows = [['Intestazione senza data'], ['01.06.2024', '10,00', 'Movimento']];
    expect(mergeContinuationRows(rows)).toEqual(rows);
  });

  it('returns an empty array for empty input', () => {
    expect(mergeContinuationRows([])).toEqual([]);
  });

  it('drops continuation lines beyond the cap (typically footer/legal-notice noise at the end of a page)', () => {
    const rows = [
      ['01.06.2024', '10,00', 'Movimento'],
      ['continua 1'],
      ['continua 2'],
      ['continua 3'],
      ['continua 4'],
      ['continua 5'],
      ['continua 6'],
      ['rumore scartato 1'],
      ['rumore scartato 2'],
      ['02.06.2024', '20,00', 'Altro movimento'],
    ];

    expect(mergeContinuationRows(rows)).toEqual([
      ['01.06.2024', '10,00', 'Movimento continua 1 continua 2 continua 3 continua 4 continua 5 continua 6'],
      ['02.06.2024', '20,00', 'Altro movimento'],
    ]);
  });
});
