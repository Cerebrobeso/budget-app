import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { AuthService } from './core/auth.service';
import { CategoryStore, PortfolioStore, RecurringStore, ThemeService, TransactionStore } from './core/stores';

function fakeStore(ready: boolean) {
  return { ready: signal(ready) };
}

function fakeRouter(url = '/movimenti') {
  return {
    events: new Subject<unknown>(),
    url,
    navigateByUrl: vi.fn().mockResolvedValue(true),
  };
}

function fakeAuth(user: { id: string } | null = { id: 'u1' }, ready = true) {
  return { user: signal(user), ready: signal(ready) };
}

interface SetupOptions {
  categoryReady?: boolean;
  transactionReady?: boolean;
  portfolioReady?: boolean;
  recurringReady?: boolean;
  authUser?: { id: string } | null;
  authReady?: boolean;
  routerUrl?: string;
}

function setup(opts: SetupOptions = {}) {
  const router = fakeRouter(opts.routerUrl ?? '/movimenti');
  const auth = fakeAuth(opts.authUser === undefined ? { id: 'u1' } : opts.authUser, opts.authReady ?? true);
  const categoryStore = fakeStore(opts.categoryReady ?? true);
  const transactionStore = fakeStore(opts.transactionReady ?? true);
  const portfolioStore = fakeStore(opts.portfolioReady ?? true);
  const recurringStore = fakeStore(opts.recurringReady ?? true);
  const theme = { dark: signal(false), toggle: vi.fn() };

  TestBed.configureTestingModule({
    providers: [
      App,
      { provide: Router, useValue: router },
      { provide: AuthService, useValue: auth },
      { provide: CategoryStore, useValue: categoryStore },
      { provide: TransactionStore, useValue: transactionStore },
      { provide: PortfolioStore, useValue: portfolioStore },
      { provide: RecurringStore, useValue: recurringStore },
      { provide: ThemeService, useValue: theme },
    ],
  });

  const component = TestBed.inject(App);
  return { component, router, auth, categoryStore, transactionStore, portfolioStore, recurringStore, theme };
}

function keydown(
  key: string,
  opts: { target?: EventTarget; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
  });
  if (opts.target) Object.defineProperty(ev, 'target', { value: opts.target, configurable: true });
  return ev;
}

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dataReady', () => {
    it('is true when all four stores have finished loading', () => {
      const { component } = setup();
      expect(component['dataReady']()).toBe(true);
    });

    it('is false when only categoryStore is not ready', () => {
      const { component } = setup({ categoryReady: false });
      expect(component['dataReady']()).toBe(false);
    });

    it('is false when only transactionStore is not ready', () => {
      const { component } = setup({ transactionReady: false });
      expect(component['dataReady']()).toBe(false);
    });

    it('is false when only portfolioStore is not ready', () => {
      const { component } = setup({ portfolioReady: false });
      expect(component['dataReady']()).toBe(false);
    });

    it('is false when only recurringStore is not ready', () => {
      const { component } = setup({ recurringReady: false });
      expect(component['dataReady']()).toBe(false);
    });
  });

  describe('navigating signal (router.events subscription)', () => {
    it('becomes true on NavigationStart', () => {
      const { component, router } = setup();
      expect(component['navigating']()).toBe(false);

      router.events.next(new NavigationStart(1, '/dashboard'));

      expect(component['navigating']()).toBe(true);
    });

    it('becomes false again on NavigationEnd', () => {
      const { component, router } = setup();
      router.events.next(new NavigationStart(1, '/dashboard'));

      router.events.next(new NavigationEnd(1, '/dashboard', '/dashboard'));

      expect(component['navigating']()).toBe(false);
    });

    it('becomes false again on NavigationCancel', () => {
      const { component, router } = setup();
      router.events.next(new NavigationStart(1, '/dashboard'));

      router.events.next(new NavigationCancel(1, '/dashboard', 'cancelled'));

      expect(component['navigating']()).toBe(false);
    });

    it('becomes false again on NavigationError', () => {
      const { component, router } = setup();
      router.events.next(new NavigationStart(1, '/dashboard'));

      router.events.next(new NavigationError(1, '/dashboard', new Error('boom')));

      expect(component['navigating']()).toBe(false);
    });
  });

  describe('auth-loss redirect effect', () => {
    it('navigates to /login when auth is ready, there is no user, and not already on /login', () => {
      const { router } = setup({ authUser: null, authReady: true, routerUrl: '/movimenti' });

      TestBed.flushEffects();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('does not navigate when already on a /login url', () => {
      const { router } = setup({ authUser: null, authReady: true, routerUrl: '/login' });

      TestBed.flushEffects();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('does not navigate while a user is present', () => {
      const { router } = setup({ authUser: { id: 'u1' }, authReady: true, routerUrl: '/movimenti' });

      TestBed.flushEffects();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('does not navigate while auth is not ready yet, but does once it becomes ready with no user', () => {
      const { router, auth } = setup({ authUser: null, authReady: false, routerUrl: '/movimenti' });
      TestBed.flushEffects();
      expect(router.navigateByUrl).not.toHaveBeenCalled();

      auth.ready.set(true);
      TestBed.flushEffects();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });
  });

  describe('onKeydown', () => {
    it('is a no-op when there is no signed-in user', () => {
      const { component } = setup({ authUser: null });
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});
      const ev = keydown('n');
      const preventDefault = vi.spyOn(ev, 'preventDefault');

      component.onKeydown(ev);

      expect(component.openQuickAdd).not.toHaveBeenCalled();
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('is a no-op when the event target is an INPUT element', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});

      component.onKeydown(keydown('n', { target: document.createElement('input') }));

      expect(component.openQuickAdd).not.toHaveBeenCalled();
    });

    it('is a no-op when the event target is a TEXTAREA element', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});

      component.onKeydown(keydown('n', { target: document.createElement('textarea') }));

      expect(component.openQuickAdd).not.toHaveBeenCalled();
    });

    it('is a no-op when the event target is a SELECT element', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});

      component.onKeydown(keydown('n', { target: document.createElement('select') }));

      expect(component.openQuickAdd).not.toHaveBeenCalled();
    });

    it('is a no-op when metaKey is held', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});

      component.onKeydown(keydown('n', { metaKey: true }));

      expect(component.openQuickAdd).not.toHaveBeenCalled();
    });

    it('is a no-op when ctrlKey is held', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});

      component.onKeydown(keydown('n', { ctrlKey: true }));

      expect(component.openQuickAdd).not.toHaveBeenCalled();
    });

    it('is a no-op when altKey is held', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});

      component.onKeydown(keydown('n', { altKey: true }));

      expect(component.openQuickAdd).not.toHaveBeenCalled();
    });

    it('prevents default and opens quick-add for a plain lowercase "n" when signed in and not typing', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});
      const ev = keydown('n');
      const preventDefault = vi.spyOn(ev, 'preventDefault');

      component.onKeydown(ev);

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(component.openQuickAdd).toHaveBeenCalledOnce();
    });

    it('prevents default and opens quick-add for uppercase "N" too', () => {
      const { component } = setup();
      vi.spyOn(component, 'openQuickAdd').mockImplementation(() => {});
      const ev = keydown('N');
      const preventDefault = vi.spyOn(ev, 'preventDefault');

      component.onKeydown(ev);

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(component.openQuickAdd).toHaveBeenCalledOnce();
    });
  });

  describe('onRouteActivate', () => {
    it('toggles routeAnimToggle from its previous value', () => {
      const { component } = setup();
      const before = component['routeAnimToggle']();

      component.onRouteActivate();
      expect(component['routeAnimToggle']()).toBe(!before);

      component.onRouteActivate();
      expect(component['routeAnimToggle']()).toBe(before);
    });
  });
});
