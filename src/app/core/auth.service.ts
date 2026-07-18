import { Injectable, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase.client';

export interface AuthResult {
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);

  constructor() {
    supabase.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
      this.ready.set(true);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      this.ready.set(true);
    });
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }
}
