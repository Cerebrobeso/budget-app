import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(toObservable(auth.ready).pipe(filter((ready) => ready)));

  return auth.user() ? true : router.parseUrl('/login');
};
