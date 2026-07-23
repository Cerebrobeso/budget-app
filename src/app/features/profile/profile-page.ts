import {ChangeDetectionStrategy, Component, computed, inject, signal, viewChild} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {lucideChevronRight, lucideCircleUserRound, lucideDownload, lucideLogOut, lucideUserRoundX} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { AuthService } from '../../core/auth.service';
import {CategoryStore, PortfolioStore, RecurringStore, ThemeService, TransactionStore} from '../../core/stores';
import {
  HlmDialog,
  HlmDialogClose,
  HlmDialogContent,
  HlmDialogDescription,
  HlmDialogFooter, HlmDialogHeader, HlmDialogTitle
} from '@spartan-ng/helm/dialog';
import {downloadFile} from '../../core/export';
import {todayIso} from '../../core/models';
import {toast} from '@spartan-ng/brain/sonner';
import {FormsModule} from '@angular/forms';
import {HlmInput} from '@spartan-ng/helm/input';

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmButton, HlmCard, NgIcon, ...HlmSwitchImports, FormsModule, HlmDialog, HlmDialogClose, HlmDialogContent, HlmDialogDescription, HlmDialogFooter, HlmDialogHeader, HlmDialogTitle, HlmInput],
  providers: [provideIcons({ lucideChevronRight, lucideLogOut, lucideDownload, lucideUserRoundX, lucideCircleUserRound })],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePage {
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  private readonly router = inject(Router);
  private readonly categoryStore = inject(CategoryStore);
  private readonly transactionStore = inject(TransactionStore);
  private readonly portfolioStore = inject(PortfolioStore);
  private readonly recurringStore = inject(RecurringStore);

  private readonly confirmDialog = viewChild.required<HlmDialog>('confirmDialog');
  private readonly passwordDialog = viewChild.required<HlmDialog>('passwordDialog');

  readonly confirmText = signal('');
  readonly password = signal('');
  readonly deleteError = signal<string | null>(null);
  readonly deleting = signal(false);

  /** Backup completo (tutti i dati dell'utente) in JSON, scaricato lato client. */
  exportBackup(): void {
    const data = {
      exportedAt: new Date().toISOString(),
      transactions: this.transactionStore.transactions(),
      categories: this.categoryStore.categories(),
      subcategoryOverlays: this.categoryStore.subcategoryOverlays(),
      assets: this.portfolioStore.assets(),
      recurringRules: this.recurringStore.rules(),
    };
    downloadFile(JSON.stringify(data, null, 2), `registro-backup-${todayIso()}.json`, 'application/json');
  }

  askDeleteAccount(): void {
    this.resetDeleteFlow();
    this.confirmDialog().open();
  }

  proceedToPassword(): void {
    if (this.confirmText().trim().toUpperCase() !== 'ELIMINA') return;
    this.confirmDialog().close({});
    this.passwordDialog().open();
  }

  resetDeleteFlow(): void {
    this.confirmText.set('');
    this.password.set('');
    this.deleteError.set(null);
    this.deleting.set(false);
  }

  async confirmDeleteAccount(): Promise<void> {
    const password = this.password();
    if (!password || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set(null);

    const reauth = await this.auth.reauthenticate(password);
    if (reauth.error) {
      this.deleteError.set('Password errata. Riprova.');
      this.deleting.set(false);
      return;
    }

    const result = await this.auth.deleteAccount();
    if (result.error) {
      this.deleteError.set('Eliminazione non riuscita. Riprova più tardi.');
      this.deleting.set(false);
      return;
    }

    this.passwordDialog().close({});
    toast.success('Account eliminato.');
    await this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }
  async logout(): Promise<void> {
    await this.auth.signOut();
    void this.router.navigateByUrl('/login');
  }
}
