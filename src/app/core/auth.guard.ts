import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { CATEGORY_ADMIN_UID } from './models';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Solo alla primissima navigazione (prima che la sessione iniziale sia risolta)
  // aspettiamo davvero: da quel momento `ready()` resta true e leggerlo è sincrono,
  // così il passaggio da una pagina all'altra non aspetta mai una chiamata di rete.
  if (!auth.ready()) {
    await firstValueFrom(toObservable(auth.ready).pipe(filter((ready) => ready)));
  }

  // Rinfresca la sessione in background se è passato troppo tempo dall'ultima verifica,
  // senza bloccare la navigazione corrente sul risultato.
  auth.refreshIfStale();

  const user = auth.user();
  if (!user) return router.parseUrl('/login');

  // L'utente amministratore delle categorie ha accesso solo alla sezione Profilo
  // (che contiene "Categorie" e il logout), mai al resto dell'app.
  if (user.id === CATEGORY_ADMIN_UID && !state.url.startsWith('/profilo')) {
    return router.parseUrl('/profilo/categorie');
  }

  return true;
};
