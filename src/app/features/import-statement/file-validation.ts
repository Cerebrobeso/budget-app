export type AcceptedFileKind = 'csv' | 'pdf';

export interface FileValidationResult {
  ok: boolean;
  kind?: AcceptedFileKind;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const PDF_MAGIC_BYTES = '%PDF-';

// Estensione+MIME coerenti, dimensione, contenuto plausibile (magic bytes PDF / testo senza byte nulli per CSV).
export async function validateStatementFile(file: File): Promise<FileValidationResult> {
  if (file.size === 0) return { ok: false, error: 'Il file è vuoto.' };
  if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, error: 'Il file supera la dimensione massima di 8MB.' };

  const name = file.name.toLowerCase();
  const isCsvExtension = name.endsWith('.csv') || name.endsWith('.txt');
  const isPdfExtension = name.endsWith('.pdf');
  const isCsvMime = file.type === '' || file.type === 'text/csv' || file.type === 'text/plain';
  const isPdfMime = file.type === '' || file.type === 'application/pdf';

  if (isPdfExtension && isPdfMime) {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== PDF_MAGIC_BYTES) {
      return { ok: false, error: 'Il file non sembra un PDF valido.' };
    }
    return { ok: true, kind: 'pdf' };
  }

  if (isCsvExtension && isCsvMime) {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    if (head.includes(0)) return { ok: false, error: 'Il file non sembra un CSV di testo valido.' };
    return { ok: true, kind: 'csv' };
  }

  return { ok: false, error: 'Formato non supportato: carica un file CSV o PDF.' };
}

// UTF-8 con fallback Latin-1.
export function decodeTextFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer);
  }
}
