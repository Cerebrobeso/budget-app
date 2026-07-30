export type AcceptedFileKind = 'csv' | 'pdf' | 'xls';

export interface FileValidationResult {
  ok: boolean;
  kind?: AcceptedFileKind;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const PDF_MAGIC_BYTES = '%PDF-';
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04]; // xlsx (contenitore zip)
const OLE2_MAGIC_BYTES = [0xd0, 0xcf, 0x11, 0xe0]; // xls binario legacy (BIFF)

function startsWith(head: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, i) => head[i] === byte);
}

/**
 * L'estensione decide il tipo, il MIME è solo una conferma opzionale e non può mai fare da veto:
 * su Windows con Excel installato Chrome assegna ai .csv il MIME application/vnd.ms-excel, e su
 * quel MIME l'utente si vedeva rifiutare un CSV perfettamente valido.
 */
export async function validateStatementFile(file: File): Promise<FileValidationResult> {
  if (file.size === 0) return { ok: false, error: 'Il file è vuoto.' };
  if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, error: 'Il file supera la dimensione massima di 8MB.' };

  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== PDF_MAGIC_BYTES) {
      return { ok: false, error: 'Il file non sembra un PDF valido.' };
    }
    return { ok: true, kind: 'pdf' };
  }

  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    // Oltre ai due formati binari si accetta il testo: molte banche esportano come .xls una tabella
    // HTML o un CSV travestito, che SheetJS legge comunque.
    const isBinaryWorkbook = startsWith(head, ZIP_MAGIC_BYTES) || startsWith(head, OLE2_MAGIC_BYTES);
    if (!isBinaryWorkbook && head.includes(0)) {
      return { ok: false, error: 'Il file non sembra un foglio di calcolo valido.' };
    }
    return { ok: true, kind: 'xls' };
  }

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (head.includes(0)) return { ok: false, error: 'Il file non sembra un CSV di testo valido.' };
    return { ok: true, kind: 'csv' };
  }

  return { ok: false, error: 'Formato non supportato: carica un file CSV, XLS o PDF.' };
}

// UTF-8 con fallback Latin-1. Il BOM va tolto: resterebbe incollato alla prima etichetta di header
// e romperebbe il riconoscimento della colonna e delle firme di banca.
export function decodeTextFile(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('iso-8859-1').decode(buffer);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
