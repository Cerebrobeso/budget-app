# Registro — finanze personali

Web app Angular 22 per la gestione delle finanze personali: log entrate/uscite con inserimento rapido, categorie configurabili, grafici e sezione patrimonio/investimenti.

I dati di seed sono importati da `Budget_2026.numbers` (157 movimenti gen–lug 2026, entrate mensili e portafoglio investimenti), rimappati sulla nuova struttura a categorie + sottocategorie.

## Avvio

Richiede **Node ≥ 22.22.3** (oppure 24.15+ / 26+) — è il minimo imposto da Angular CLI 22.

```bash
npm install
npm start        # dev server su http://localhost:4200
npm run build    # build di produzione in dist/
```

Al primo avvio l'app si popola con i dati di seed; da lì in poi tutto vive in `localStorage` (chiavi `registro.*`). Per ripartire da zero: cancella le chiavi dal DevTools → Application → Local Storage.

## Uso rapido

- **Nuovo movimento**: FAB `+` su mobile, bottone "+ Nuovo" o tasto **N** su desktop. Il form riparte pronto per l'inserimento successivo.
- **Movimenti**: navigazione mese con ←/→, filtri categoria/sottocategoria, totali del periodo, modifica ✎ ed eliminazione 🗑 inline.
- **Grafici**: preset 3/6/12 mesi, anno corrente o intervallo personalizzato.
- **Categorie**: aggiungi/rinomina/archivia categorie e sottocategorie senza toccare il codice. L'archiviazione non tocca i movimenti storici.
- **Patrimonio**: posizioni manuali con snapshot periodici; rendimento % per posizione e aggregato nel range scelto.

## Stack e scelte

- **Angular 22** — standalone components, signals ovunque, `inject()`, `@if/@for`, routing lazy per le 4 sezioni, zoneless.
- **Spartan.ng** — `@spartan-ng/brain` per la logica accessibile (dialog, select, tabs); i componenti "helm" stilizzati sono vendorizzati in `src/app/ui/` come da approccio ufficiale spartan (stile shadcn).
- **Tailwind CSS 4** — token di design come CSS custom properties in `styles.css`, dark/light mode con `@custom-variant`.
- **ngx-echarts + ECharts 6** — scelta motivata: ngx-echarts 22 è versionato in lockstep con Angular 22, il binding `[options]` funziona nativamente con `computed()` (ogni cambio di signal ridisegna il grafico), ECharts copre bar/donut/line con ottima resa mobile e il core viene caricato lazy solo nelle pagine che lo usano (~300 kB transfer fuori dal bundle iniziale).
- **Persistenza** — interfaccia `BudgetRepository` (API async) con implementazione `LocalStorageBudgetRepository` dietro un `InjectionToken`: per passare a un backend reale basterà fornire un `HttpBudgetRepository` senza toccare gli store.

## Struttura

```
src/app/
  core/        modelli, repository, store a signals, seed, formattazione
  ui/          componenti helm (button, input, select, dialog, card…)
  features/
    log/         pagina movimenti + form inserimento rapido
    dashboard/   grafici
    categories/  gestione categorie
    portfolio/   patrimonio e investimenti
```

## Design

Concept "Registro": libretto contabile × sportwatch. Font Bricolage Grotesque (display), Instrument Sans (testo), Spline Sans Mono con cifre tabulari per gli importi. Il timbro del mese in testa al log mostra il saldo come uno split di gara (+/−).
