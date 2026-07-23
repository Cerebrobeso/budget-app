import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let auth: { signIn: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let page: LoginPage;

  beforeEach(() => {
    auth = { signIn: vi.fn() };
    router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        LoginPage,
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    page = TestBed.inject(LoginPage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an empty email without calling signIn', async () => {
    page.email.set('');
    page.password.set('secret');

    await page.submit();

    expect(page.error()).toBe('Inserisci email e password.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('rejects an empty password without calling signIn', async () => {
    page.email.set('a@b.com');
    page.password.set('');

    await page.submit();

    expect(page.error()).toBe('Inserisci email e password.');
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('trims the email before validating and passing it to signIn', async () => {
    auth.signIn.mockResolvedValue({ error: null });
    page.email.set('  a@b.com  ');
    page.password.set('secret');

    await page.submit();

    expect(auth.signIn).toHaveBeenCalledWith('a@b.com', 'secret');
  });

  it('is not loading before submit, and is loading again false after a successful submit', async () => {
    auth.signIn.mockResolvedValue({ error: null });
    page.email.set('a@b.com');
    page.password.set('secret');

    expect(page.loading()).toBe(false);
    const pending = page.submit();
    expect(page.loading()).toBe(true);
    await pending;
    expect(page.loading()).toBe(false);
  });

  it('is loading false again after a failed submit', async () => {
    auth.signIn.mockResolvedValue({ error: 'invalid credentials' });
    page.email.set('a@b.com');
    page.password.set('secret');

    expect(page.loading()).toBe(false);
    const pending = page.submit();
    expect(page.loading()).toBe(true);
    await pending;
    expect(page.loading()).toBe(false);
  });

  it('clears the error and navigates to /movimenti on successful sign-in', async () => {
    auth.signIn.mockResolvedValue({ error: null });
    page.email.set('a@b.com');
    page.password.set('secret');
    page.error.set('stale error');

    await page.submit();

    expect(page.error()).toBe('');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/movimenti');
  });

  it('shows a fixed invalid-credentials message (not the auth service message) and does not navigate on failure', async () => {
    auth.signIn.mockResolvedValue({ error: 'Invalid login credentials' });
    page.email.set('a@b.com');
    page.password.set('secret');

    await page.submit();

    expect(page.error()).toBe('Credenziali non valide.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
