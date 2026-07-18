import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'movimenti' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
    title: 'Accedi — Registro',
  },
  {
    path: 'movimenti',
    canActivate: [authGuard],
    loadComponent: () => import('./features/log/log-page').then((m) => m.LogPage),
    title: 'Movimenti — Registro',
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
    title: 'Grafici — Registro',
  },
  {
    path: 'categorie',
    canActivate: [authGuard],
    loadComponent: () => import('./features/categories/categories-page').then((m) => m.CategoriesPage),
    title: 'Categorie — Registro',
  },
  {
    path: 'patrimonio',
    canActivate: [authGuard],
    loadComponent: () => import('./features/portfolio/portfolio-page').then((m) => m.PortfolioPage),
    title: 'Patrimonio — Registro',
  },
  { path: '**', redirectTo: 'movimenti' },
];
