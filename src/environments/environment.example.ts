// Template di riferimento — copia questo file in `environment.ts`
// (e `environment.production.ts`) e inserisci i tuoi valori Supabase.
// Il file vero è ignorato da git: NON committare le chiavi.
//   Copy-Item src\environments\environment.example.ts src\environments\environment.ts
export const environment = {
  production: false,
  supabaseUrl: 'INCOLLA_IL_TUO_PROJECT_URL',   // es. https://xxxx.supabase.co
  supabaseAnonKey: 'INCOLLA_LA_TUA_CHIAVE_PUBBLICA', // publishable (sb_publishable_...) o anon (eyJ...)
};
