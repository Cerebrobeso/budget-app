import { Injectable, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase.client';

export interface AuthResult {
  error: string | null;
}

/** Sotto questa soglia una navigazione riusa lo stato già verificato invece di richiamare Supabase. */
const REVALIDATE_INTERVAL_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);

  private lastVerifiedAt = 0;

  constructor() {
    supabase.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
      this.ready.set(true);
      this.lastVerifiedAt = Date.now();
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      // Al rientro in tab supabase-js rivalida la sessione e spara un TOKEN_REFRESHED
      // con un oggetto `user` nuovo ma stesso id: aggiorniamo il signal solo se l'utente
      // è davvero cambiato (login/logout), altrimenti gli store che osservano `user()`
      // (stores.ts) ripartirebbero con un reload completo dei dati a ogni cambio tab.
      if (nextUser?.id !== this.user()?.id) {
        this.user.set(nextUser);
      }
      this.ready.set(true);
      this.lastVerifiedAt = Date.now();
    });
  }

  /**
   * Richiamata a ogni navigazione da `authGuard`: se l'ultima verifica è più vecchia
   * di `REVALIDATE_INTERVAL_MS` ricontrolla la sessione con Supabase in background,
   * senza far attendere la navigazione in corso.
   */
  refreshIfStale(): void {
    if (Date.now() - this.lastVerifiedAt < REVALIDATE_INTERVAL_MS) return;
    this.lastVerifiedAt = Date.now();
    void supabase.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
    });
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Impostiamo lo user subito dal risultato, senza aspettare l'evento onAuthStateChange:
    // altrimenti la navigazione verso /movimenti che segue può arrivare al guard prima
    // che il listener asincrono abbia aggiornato `user`, facendolo rimbalzare su /login.
    if (data.user) {
      this.user.set(data.user);
      this.lastVerifiedAt = Date.now();
    }
    return { error: error?.message ?? null };
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  /** Ri-verifica la password corrente senza toccare la sessione già attiva (serve prima di operazioni distruttive). */
  async reauthenticate(password: string): Promise<AuthResult> {
    const email = this.user()?.email;
    if (!email) return { error: 'Utente non disponibile' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  /** Invoca la Edge Function `delete-account`, che cancella tutte le righe dell'utente e l'utente stesso da Supabase Auth. */
  async deleteAccount(): Promise<AuthResult> {
    const { error } = await supabase.functions.invoke('delete-account');
    return { error: error?.message ?? null };
  }
}
