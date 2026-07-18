import { ChangeDetectionStrategy, Component, HostListener, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BrnDialog, BrnDialogContent } from '@spartan-ng/brain/dialog';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/stores';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogContent, HlmDialogOverlay, HlmDialogTitle } from '@spartan-ng/helm/dialog';
import { TransactionForm } from './features/log/transaction-form';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    HlmButton,
    TransactionForm,
    BrnDialog,
    BrnDialogContent,
    HlmDialogOverlay,
    HlmDialogContent,
    HlmDialogTitle,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly quickAdd = viewChild.required<BrnDialog>('quickAdd');

  protected readonly links = [
    { path: '/movimenti', label: 'Movimenti', icon: '☰' },
    { path: '/dashboard', label: 'Grafici', icon: '◔' },
    { path: '/patrimonio', label: 'Patrimonio', icon: '◆' },
    { path: '/categorie', label: 'Categorie', icon: '⊞' },
  ];

  openQuickAdd(): void {
    this.quickAdd().open();
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
