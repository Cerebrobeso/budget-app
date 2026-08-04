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
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { HlmDialog } from '@spartan-ng/helm/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChartPie,
  lucideList,
  lucidePlus,
  lucideRepeat,
  lucideUser,
  lucideWallet,
} from '@ng-icons/lucide';
import { AuthService } from './core/auth.service';
import { environment } from '../environments/environment';
import { CategoryStore, PortfolioStore, RecurringStore, ThemeService, TransactionStore } from './core/stores';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmToasterImports } from '@spartan-ng/helm/sonner';
import { toast } from '@spartan-ng/brain/sonner';
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
      lucideList,
      lucidePlus,
      lucideRepeat,
      lucideUser,
      lucideWallet,
    }),
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly appVersion = environment.appVersion;
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  protected readonly categoryStore = inject(CategoryStore);
  private readonly transactionStore = inject(TransactionStore);
  private readonly portfolioStore = inject(PortfolioStore);
  private readonly recurringStore = inject(RecurringStore);
  private readonly router = inject(Router);
  private readonly swUpdate = inject(SwUpdate);
  private readonly quickAdd = viewChild.required<HlmDialog>('quickAdd');

  /** Vero finché non arriva l'evento 'offline': aggiornato dagli HostListener sotto. */
  protected readonly online = signal(navigator.onLine);

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

    this.swUpdate.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const version = (event.latestVersion.appData as { version?: string } | undefined)?.version;
        toast.info(version ? `Nuova versione disponibile (v${version})` : 'Nuova versione disponibile', {
          duration: Infinity,
          action: {
            label: 'Aggiorna',
            onClick: () => void this.swUpdate.activateUpdate().then(() => location.reload()),
          },
        });
      });
  }

  @HostListener('window:online')
  onOnline(): void {
    this.online.set(true);
  }

  @HostListener('window:offline')
  onOffline(): void {
    this.online.set(false);
  }

  onRouteActivate(): void {
    this.routeAnimToggle.update((v) => !v);
  }

  /** L'utente amministratore delle categorie vede solo "Profilo" (contiene "Categorie" e il logout). */
  protected readonly links = computed(() =>
    this.categoryStore.isAdmin()
      ? [{ path: '/profilo', label: 'Profilo', icon: 'lucideUser' }]
      : [
          { path: '/movimenti', label: 'Movimenti', icon: 'lucideList' },
          { path: '/dashboard', label: 'Grafici', icon: 'lucideChartPie' },
          { path: '/patrimonio', label: 'Patrimonio', icon: 'lucideWallet' },
          { path: '/ricorrenti', label: 'Ricorrenti', icon: 'lucideRepeat' },
          { path: '/profilo', label: 'Profilo', icon: 'lucideUser' },
        ],
  );

  openQuickAdd(): void {
    this.quickAdd().open();
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.auth.user() || this.categoryStore.isAdmin()) return;
    const target = ev.target as HTMLElement | null;
    const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (!typing && (ev.key === 'n' || ev.key === 'N') && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      this.openQuickAdd();
    }
  }
}
