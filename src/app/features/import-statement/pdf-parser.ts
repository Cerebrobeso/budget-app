import { ParsedRows } from './import-types';
import { buildParsedRows, findHeaderRowIndex, looksLikeDate } from './row-utils';

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  page: number;
  /** Larghezza reale del testo (da pdf.js); se assente si stima dalla lunghezza (usato nei test). */
  width?: number;
}

interface Cell {
  text: string;
  x: number;
}

const ROW_Y_TOLERANCE = 3;
// Basso perché usiamo la larghezza reale del testo (non una stima): due colonne header adiacenti
// possono avere anche solo ~6pt di spazio tra loro (verificato su un estratto conto reale).
const COLUMN_GAP_THRESHOLD = 5;
const MAX_CONTINUATION_LINES = 6;

function groupItemsByRow(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rowGroups: PdfTextItem[][] = [];
  for (const item of sorted) {
    const last = rowGroups.at(-1);
    const sameRow = last && last[0].page === item.page && Math.abs(last[0].y - item.y) <= ROW_Y_TOLERANCE;
    if (sameRow) last!.push(item);
    else rowGroups.push([item]);
  }
  return rowGroups;
}

// Divide gli item di una riga in celle per gap orizzontale, preservando la x di inizio di ciascuna cella.
function splitIntoCells(rowItems: PdfTextItem[]): Cell[] {
  const sortedByX = [...rowItems].sort((a, b) => a.x - b.x);
  const cells: Cell[] = [];
  let current = '';
  let startX: number | null = null;
  let lastX: number | null = null;
  for (const item of sortedByX) {
    if (lastX !== null && item.x - lastX > COLUMN_GAP_THRESHOLD) {
      cells.push({ text: current.trim(), x: startX! });
      current = '';
      startX = null;
    }
    if (startX === null) startX = item.x;
    current += (current && !current.endsWith(' ') ? ' ' : '') + item.text;
    lastX = item.x + (item.width ?? item.text.length * 4);
  }
  if (current) cells.push({ text: current.trim(), x: startX! });
  return cells;
}

/**
 * Riassegna le celle di ogni riga alle colonne globali definite dalle posizioni x dell'header
 * (contenimento: una cella appartiene alla colonna con l'ancora più a destra che sia comunque <=
 * alla sua x). Necessario perché una colonna vuota in una riga (es. Dare o Avere quando l'altra è
 * valorizzata) non produce alcun testo estratto: senza questo, l'assenza di quella cella sfaserebbe
 * tutte le colonne successive — descrizione inclusa — rispetto all'header.
 */
function realignToColumnBounds(rows: Cell[][], bounds: number[]): string[][] {
  return rows.map((cells) => {
    const out = new Array<string>(bounds.length).fill('');
    for (const cell of cells) {
      let bucket = 0;
      for (let i = 0; i < bounds.length; i++) {
        if (bounds[i] <= cell.x) bucket = i;
      }
      out[bucket] = out[bucket] ? `${out[bucket]} ${cell.text}` : cell.text;
    }
    return out;
  });
}

// Raggruppa per vicinanza di y (stessa pagina), poi divide in colonne per gap di x. Se si trova un
// header tabellare, scarta tutto ciò che lo precede (intestazione/riepilogo, non parte della tabella)
// e riallinea ogni riga sulle sue colonne globali (vedi realignToColumnBounds); altrimenti resta lo
// split locale per riga, meno affidabile con colonne sparse (es. Dare/Avere).
export function groupTextItemsIntoRows(items: PdfTextItem[]): string[][] {
  const rowCells = groupItemsByRow(items).map(splitIntoCells);
  const asText = rowCells.map((cells) => cells.map((c) => c.text));

  const headerIndex = findHeaderRowIndex(asText);
  if (headerIndex === -1) return asText;

  const fromHeader = rowCells.slice(headerIndex);
  const bounds = fromHeader[0].map((c) => c.x);
  return realignToColumnBounds(fromHeader, bounds);
}

// Una riga senza alcuna cella che somiglia a una data è trattata come continuazione testuale del
// movimento precedente (tipico delle descrizioni multi-riga negli estratti conto PDF) e accodata
// alla sua ultima cella, invece di diventare una riga a sé scartata come "non interpretabile". Oltre
// MAX_CONTINUATION_LINES consecutive, il resto viene scartato (tipicamente piè di pagina/note legali
// di fine documento, non dettaglio del movimento).
export function mergeContinuationRows(rows: string[][]): string[][] {
  const merged: string[][] = [];
  let continuationStreak = 0;
  for (const row of rows) {
    const isContinuation = merged.length > 0 && !row.some((cell) => looksLikeDate(cell));
    if (isContinuation) {
      if (continuationStreak >= MAX_CONTINUATION_LINES) continue;
      const last = merged[merged.length - 1];
      const extra = row.filter((cell) => cell.trim()).join(' ');
      if (extra) {
        last[last.length - 1] = `${last[last.length - 1]} ${extra}`.trim();
        continuationStreak++;
      }
    } else {
      merged.push([...row]);
      continuationStreak = 0;
    }
  }
  return merged;
}

/** Solo ciò che serve da PDFPageProxy: permette di testare la lettura senza pdf.js reale. */
interface TextContentSource {
  streamTextContent(): ReadableStream<{ items: unknown[] }>;
}

// Safari non implementa ReadableStream[Symbol.asyncIterator], quindi getTextContent() di pdf.js
// (che usa `for await` sullo stream) lancia TypeError su iOS: leggiamo con getReader().
// https://github.com/mozilla/pdf.js/issues/20973
export async function readPageTextItems(page: TextContentSource, pageNum: number): Promise<PdfTextItem[]> {
  const reader = page.streamTextContent().getReader();
  const items: PdfTextItem[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const raw of value.items) {
        if (!isTextItem(raw) || !raw.str.trim()) continue;
        items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], page: pageNum, width: raw.width });
      }
    }
  } finally {
    reader.releaseLock();
  }
  return items;
}

// Gli item di marked content non hanno né str né transform.
function isTextItem(raw: unknown): raw is { str: string; transform: number[]; width: number } {
  return typeof raw === 'object' && raw !== null && 'str' in raw && typeof raw.str === 'string';
}

let workerConfigured = false;

// Import dinamico per non gonfiare il bundle di chi importa solo CSV. Nessun OCR: un PDF-scansione senza testo estraibile lancia un errore.
export async function parsePdf(file: File): Promise<ParsedRows> {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';
    workerConfigured = true;
  }

  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true,
  }).promise;

  const items: PdfTextItem[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    items.push(...(await readPageTextItems(page, pageNum)));
  }

  if (items.length === 0) {
    throw new Error("Impossibile leggere il testo dal PDF. Se è una scansione o un'immagine, prova con l'estratto conto in formato CSV.");
  }

  return buildParsedRows(mergeContinuationRows(groupTextItemsIntoRows(items)));
}
