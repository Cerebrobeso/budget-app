import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { HlmDialog } from '@spartan-ng/helm/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChartPie,
  lucideDownload,
  lucideList,
  lucideLogOut,
  lucideMoon,
  lucidePlus,
  lucideRepeat,
  lucideSun,
  lucideTag,
  lucideWallet,
} from '@ng-icons/lucide';
import { AuthService } from './core/auth.service';
import { downloadFile } from './core/export';
import { todayIso } from './core/models';
import { CategoryStore, PortfolioStore, RecurringStore, ThemeService, TransactionStore } from './core/stores';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { TransactionForm } from './features/log/transaction-form';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    HlmButton,
    HlmSpinner,
    NgIcon,
    TransactionForm,
    ...HlmDialogImports,
    ...HlmToasterImports,
  ],
  providers: [
    provideIcons({
      lucideChartPie,
      lucideDownload,
      lucideList,
      lucideLogOut,
      lucideMoon,
      lucidePlus,
      lucideRepeat,
      lucideSun,
      lucideTag,
      lucideWallet,
    }),
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly categoryStore = inject(CategoryStore);
  private readonly transactionStore = inject(TransactionStore);
  private readonly portfolioStore = inject(PortfolioStore);
  private readonly recurringStore = inject(RecurringStore);
  private readonly router = inject(Router);
  private readonly quickAdd = viewChild.required<HlmDialog>('quickAdd');

  /** Vero quando tutti gli store dati hanno completato il caricamento iniziale dal repository. */
  protected readonly dataReady = computed(
    () =>
      this.categoryStore.ready() &&
      this.transactionStore.ready() &&
      this.portfolioStore.ready() &&
      this.recurringStore.ready(),
  );

  /** Vero mentre il router sta risolvendo una navigazione (utile per lo chunk lazy-loaded). */
  protected readonly navigating = signal(false);

  /** Alterna tra due classi identiche per far ripartire l'animazione di fade a ogni cambio pagina. */
  protected readonly routeAnimToggle = signal(false);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) this.navigating.set(true);
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.navigating.set(false);
      }
    });

    // Se la sessione scade (o non esiste più) mentre siamo già dentro l'app, il guard
    // non viene rieseguito finché non parte una nuova navigazione: ci pensa questo effect.
    effect(() => {
      if (this.auth.ready() && !this.auth.user() && !this.router.url.startsWith('/login')) {
        void this.router.navigateByUrl('/login');
      }
    });
  }

  onRouteActivate(): void {
    this.routeAnimToggle.update((v) => !v);
  }

  protected readonly links = [
    { path: '/movimenti', label: 'Movimenti', icon: 'lucideList' },
    { path: '/dashboard', label: 'Grafici', icon: 'lucideChartPie' },
    { path: '/patrimonio', label: 'Patrimonio', icon: 'lucideWallet' },
    { path: '/ricorrenti', label: 'Ricorrenti', icon: 'lucideRepeat' },
    { path: '/categorie', label: 'Categorie', icon: 'lucideTag' },
  ];

  openQuickAdd(): void {
    this.quickAdd().open();
  }

  /** Backup completo (tutti i dati dell'utente) in JSON, scaricato lato client. */
  exportBackup(): void {
    const data = {
      exportedAt: new Date().toISOString(),
      transactions: this.transactionStore.transactions(),
      categories: this.categoryStore.categories(),
      assets: this.portfolioStore.assets(),
      recurringRules: this.recurringStore.rules(),
    };
    downloadFile(JSON.stringify(data, null, 2), `registro-backup-${todayIso()}.json`, 'application/json');
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.auth.user()) return;
    const target = ev.target as HTMLElement | null;
    const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!typing && (ev.key === 'n' || ev.key === 'N') && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      this.openQuickAdd();
    }
  }
}
