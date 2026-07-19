import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** L'URL fornito può includere il suffisso /rest/v1/: createClient vuole l'URL base del progetto. */
const projectUrl = environment.supabaseUrl.replace(/\/rest\/v1\/?$/, '');

export const supabase = createClient(projectUrl, environment.supabaseAnonKey, {
  auth: {
    // Sessione (incluso il refresh token) persistita in localStorage: l'utente
    // resta loggato tra un riavvio del browser/PWA e l'altro. Il refresh
    // dell'access token avviene in automatico in background — il client
    // mette in pausa/riprende da solo il timer quando la tab passa
    // in background/foreground (via `visibilitychange`), senza bisogno
    // di gestirlo a mano come su React Native.
    persistSession: true,
    autoRefreshToken: true,
  },
});
