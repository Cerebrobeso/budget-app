import { toast } from '@spartan-ng/brain/sonner';

/** Annulla l'update ottimistico e avvisa l'utente se la scrittura remota fallisce. */
export function reportWriteFailure(err: unknown, rollback: () => void): void {
  console.error(err);
  rollback();
  toast.error('Salvataggio non riuscito. Controlla la connessione e riprova.');
}
