import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { routes } from './app.routes';
import { BUDGET_REPOSITORY } from './core/repository';
import { SupabaseBudgetRepository } from './core/supabase-repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideEchartsCore({ echarts: () => import('echarts') }),
    { provide: BUDGET_REPOSITORY, useClass: SupabaseBudgetRepository },
  ],
};
