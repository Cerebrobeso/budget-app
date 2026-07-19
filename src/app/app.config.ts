import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { provideHlmDatePickerConfig } from '@spartan-ng/helm/date-picker';
import { routes } from './app.routes';
import { formatDateItalian, parseDateItalian } from './core/format';
import { BUDGET_REPOSITORY } from './core/repository';
import { SupabaseBudgetRepository } from './core/supabase-repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideEchartsCore({ echarts: () => import('echarts') }),
    { provide: BUDGET_REPOSITORY, useClass: SupabaseBudgetRepository },
    provideHlmDatePickerConfig<Date>({
      formatDate: formatDateItalian,
      formatInputDate: formatDateItalian,
      parseDate: parseDateItalian,
      autoCloseOnSelect: true,
    }),
  ],
};
