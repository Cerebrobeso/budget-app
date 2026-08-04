import { Injectable, effect, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly key = 'registro.theme';
  readonly dark = signal<boolean>(this.initial());

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle('dark', this.dark());
      localStorage.setItem(this.key, this.dark() ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.dark.update((d) => !d);
  }

  private initial(): boolean {
    const stored = localStorage.getItem(this.key);
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
