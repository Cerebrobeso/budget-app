import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@spartan-ng/brain/sonner';
import { AuthService } from '../../core/auth.service';
import { Asset, Category, RecurringRule, SubcategoryOverlay, Transaction, todayIso } from '../../core/models';
import { CategoryStore, PortfolioStore, RecurringStore, ThemeService, TransactionStore } from '../../core/stores';
import { ProfilePage } from './profile-page';

// `downloadFile` (src/app/core/export.ts) is a free function, not a class method, and the
// Angular unit-test builder rejects `vi.mock(...)` for relative imports ("use TestBed for
// mocking dependencies" instead) — so instead of mocking the module we stub the browser APIs
// it drives underneath (Blob URL + anchor click) and capture the Blob it builds.
function captureDownload() {
  let capturedBlob: Blob | undefined;
  let capturedFilename = '';
  URL.createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob;
    return 'blob:fake-url';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    capturedFilename = this.download;
  });
  return {
    filename: () => capturedFilename,
    blob: () => capturedBlob,
  };
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: '2026-01-01',
    type: 'expense',
    amount: 10,
    categoryId: 'cat-1',
    subcategoryId: null,
    description: '',
    recurringRuleId: null,
    tag: null,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'cat-1', name: 'Categoria', kind: 'expense', color: '#111111', subcategories: [], ...overrides };
}

function makeOverlay(overrides: Partial<SubcategoryOverlay> = {}): SubcategoryOverlay {
  return { id: 'ov-1', categoryId: 'cat-1', name: 'Overlay', ...overrides };
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return { id: 'asset-1', name: 'Conto', category: 'conto-corrente', snapshots: [], ...overrides };
}

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    type: 'expense',
    amount: 20,
    categoryId: 'cat-1',
    subcategoryId: null,
    description: 'Abbonamento',
    dayOfMonth: 1,
    startDate: '2026-01-01',
    ...overrides,
  };
}

/** Fake esponendo solo i signals/metodi che ProfilePage legge realmente da AuthService. */
class FakeAuthService {
  readonly user = signal<{ email: string } | null>({ email: 'user@example.com' });
  reauthenticate = vi.fn();
  deleteAccount = vi.fn();
  signOut = vi.fn();
}

class FakeCategoryStore {
  readonly categories = signal<Category[]>([]);
  readonly subcategoryOverlays = signal<SubcategoryOverlay[]>([]);
}

class FakeTransactionStore {
  readonly transactions = signal<Transaction[]>([]);
}

class FakePortfolioStore {
  readonly assets = signal<Asset[]>([]);
}

class FakeRecurringStore {
  readonly rules = signal<RecurringRule[]>([]);
}

describe('ProfilePage', () => {
  let auth: FakeAuthService;
  let categoryStore: FakeCategoryStore;
  let transactionStore: FakeTransactionStore;
  let portfolioStore: FakePortfolioStore;
  let recurringStore: FakeRecurringStore;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let page: ProfilePage;

  beforeEach(() => {
    auth = new FakeAuthService();
    categoryStore = new FakeCategoryStore();
    transactionStore = new FakeTransactionStore();
    portfolioStore = new FakePortfolioStore();
    recurringStore = new FakeRecurringStore();
    router = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ProfilePage,
        { provide: AuthService, useValue: auth },
        { provide: CategoryStore, useValue: categoryStore },
        { provide: TransactionStore, useValue: transactionStore },
        { provide: PortfolioStore, useValue: portfolioStore },
        { provide: RecurringStore, useValue: recurringStore },
        { provide: ThemeService, useValue: { dark: signal(false) } },
        { provide: Router, useValue: router },
      ],
    });
    page = TestBed.inject(ProfilePage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('email', () => {
    it('reflects auth.user()?.email when a user is signed in', () => {
      auth.user.set({ email: 'stefano@example.com' });
      expect((page as any).email()).toBe('stefano@example.com');
    });

    it('is an empty string when user() is null', () => {
      auth.user.set(null);
      expect((page as any).email()).toBe('');
    });
  });

  describe('exportBackup', () => {
    it('serializes all four stores plus exportedAt into the JSON payload, and includes todayIso() in the filename', async () => {
      const tx = makeTx({ id: 'tx-1' });
      const cat = makeCategory({ id: 'cat-1' });
      const overlay = makeOverlay({ id: 'ov-1' });
      const asset = makeAsset({ id: 'asset-1' });
      const rule = makeRule({ id: 'rule-1' });
      transactionStore.transactions.set([tx]);
      categoryStore.categories.set([cat]);
      categoryStore.subcategoryOverlays.set([overlay]);
      portfolioStore.assets.set([asset]);
      recurringStore.rules.set([rule]);
      const download = captureDownload();

      page.exportBackup();

      const blob = download.blob();
      expect(blob).toBeDefined();
      const content = await blob!.text();
      const parsed = JSON.parse(content);

      expect(Object.keys(parsed).sort()).toEqual(
        ['assets', 'categories', 'exportedAt', 'recurringRules', 'subcategoryOverlays', 'transactions'].sort(),
      );
      expect(parsed.transactions).toEqual([tx]);
      expect(parsed.categories).toEqual([cat]);
      expect(parsed.subcategoryOverlays).toEqual([overlay]);
      expect(parsed.assets).toEqual([asset]);
      expect(parsed.recurringRules).toEqual([rule]);
      expect(typeof parsed.exportedAt).toBe('string');
      expect(blob!.type).toBe('application/json');
      expect(download.filename()).toBe(`registro-backup-${todayIso()}.json`);
    });
  });

  describe('resetDeleteFlow', () => {
    it('resets confirmText, password, deleteError and deleting to their default values', () => {
      page.confirmText.set('ELIMINA');
      page.password.set('secret');
      page.deleteError.set('qualche errore');
      page.deleting.set(true);

      page.resetDeleteFlow();

      expect(page.confirmText()).toBe('');
      expect(page.password()).toBe('');
      expect(page.deleteError()).toBeNull();
      expect(page.deleting()).toBe(false);
    });
  });

  describe('proceedToPassword', () => {
    it('does nothing when confirmText does not match ELIMINA', () => {
      page.confirmText.set('cancella');

      page.proceedToPassword();

      // Neither dialog viewChild is touched: reaching it would throw before the view is
      // initialized, so simply not throwing here already proves the guard short-circuited.
      expect(page.confirmText()).toBe('cancella');
    });

    it('proceeds (closes confirmDialog, opens passwordDialog) when confirmText trims/uppercases to exactly ELIMINA', () => {
      const confirmDialogFake = { close: vi.fn(), open: vi.fn() };
      const passwordDialogFake = { close: vi.fn(), open: vi.fn() };
      (page as any).confirmDialog = () => confirmDialogFake;
      (page as any).passwordDialog = () => passwordDialogFake;
      // Trailing space + lowercase: still matches once trimmed and uppercased.
      page.confirmText.set('elimina ');

      page.proceedToPassword();

      expect(confirmDialogFake.close).toHaveBeenCalledWith({});
      expect(passwordDialogFake.open).toHaveBeenCalled();
    });
  });

  describe('confirmDeleteAccount', () => {
    it('is a no-op when password is empty', async () => {
      page.password.set('');

      await page.confirmDeleteAccount();

      expect(auth.reauthenticate).not.toHaveBeenCalled();
      expect(page.deleting()).toBe(false);
    });

    it('is a no-op when deleting is already true (re-entrancy guard)', async () => {
      page.password.set('secret');
      page.deleting.set(true);

      await page.confirmDeleteAccount();

      expect(auth.reauthenticate).not.toHaveBeenCalled();
    });

    it('sets deleteError and resets deleting when reauthenticate fails, without calling deleteAccount', async () => {
      page.password.set('wrong-password');
      auth.reauthenticate.mockResolvedValue({ error: 'invalid' });

      await page.confirmDeleteAccount();

      expect(page.deleteError()).toBe('Password errata. Riprova.');
      expect(page.deleting()).toBe(false);
      expect(auth.deleteAccount).not.toHaveBeenCalled();
    });

    it('sets deleteError when reauthenticate succeeds but deleteAccount fails', async () => {
      page.password.set('secret');
      auth.reauthenticate.mockResolvedValue({ error: null });
      auth.deleteAccount.mockResolvedValue({ error: 'boom' });

      await page.confirmDeleteAccount();

      expect(page.deleteError()).toBe('Eliminazione non riuscita. Riprova più tardi.');
      expect(page.deleting()).toBe(false);
      expect(auth.signOut).not.toHaveBeenCalled();
    });

    it('signs out and navigates to /login on full success', async () => {
      const passwordDialogFake = { close: vi.fn(), open: vi.fn() };
      (page as any).passwordDialog = () => passwordDialogFake;
      const toastSuccessSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-id' as never);
      page.password.set('secret');
      auth.reauthenticate.mockResolvedValue({ error: null });
      auth.deleteAccount.mockResolvedValue({ error: null });

      await page.confirmDeleteAccount();

      expect(auth.signOut).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
      expect(passwordDialogFake.close).toHaveBeenCalledWith({});
      expect(toastSuccessSpy).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('signs out then navigates to /login', async () => {
      await page.logout();

      expect(auth.signOut).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    });
  });
});
