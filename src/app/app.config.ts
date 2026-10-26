import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideEchartsCore } from 'ngx-echarts';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
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
    provideBrnCalendarI18n({ firstDayOfWeek: () => 1 }),
    provideHlmDatePickerConfig<Date>({
      formatDate: formatDateItalian,
      formatInputDate: formatDateItalian,
      parseDate: parseDateItalian,
      autoCloseOnSelect: true,
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
