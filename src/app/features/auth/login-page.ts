import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCard } from '@spartan-ng/helm/card';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, HlmButton, HlmCard, HlmInput, HlmLabel, HlmSpinner],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal('');
  readonly loading = signal(false);

  async submit(): Promise<void> {
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      this.error.set('Inserisci email e password.');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    const { error } = await this.auth.signIn(email, password);
    this.loading.set(false);
    if (error) {
      this.error.set('Credenziali non valide.');
      return;
    }
    void this.router.navigateByUrl('/movimenti');
  }
}
