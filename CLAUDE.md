# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Registro" — an Italian-language Angular 22 personal finance app (transaction log, categories, dashboards/charts, portfolio/assets tracking, recurring rules). UI strings, comments, and commit-adjacent docs (CHANGELOG) are in Italian; code identifiers are in English.

## Commands

```bash
npm install
npm start                # dev server at http://localhost:4200 (uses environment.development.ts)
npm run build            # production build to dist/budget-app
npx tsc --noEmit -p tsconfig.app.json   # type check only (what CI runs)
npx ng build             # what CI runs to verify the build
npm test                 # unit tests (Vitest via @angular/build:unit-test, --no-watch); what CI and the deploy workflow both run
```

There is no configured lint target. `@playwright/test` is a devDependency but no Playwright config or spec files exist yet — don't assume an e2e runner is wired up.

## Testing

Unit tests run on Vitest through Angular's `@angular/build:unit-test` builder (`angular.json`'s `test` architect target), not Karma/Jasmine. Spec files are colocated next to the source they test (`format.spec.ts` next to `format.ts`, etc.) and picked up by the builder's default `**/*.spec.ts` glob. `tsconfig.spec.json` covers them.

The test target's `buildTarget` is pinned to the `production` configuration (not the builder's own default, `development`) specifically so tests never need `environment.development.ts` — that file is gitignored and neither `ci.yml` nor `deploy.yml` generate it, only `environment.ts`/`environment.production.ts`.

`src/app/core/stores.spec.ts`'s `CategoryStore` suite is the reference pattern for testing a store: provide a hand-written fake implementing `BudgetRepository` and a fake `AuthService`-shaped object (`{ user: signal(...), ready: signal(true) }`) via `TestBed.configureTestingModule({ providers: [...] })`, then `TestBed.flushEffects()` (this app is zoneless — effects don't run on their own without a trigger) before asserting on store state. Prefer fakes over `vi.mock`/spies for the repository and auth boundary, matching the optimistic-update-then-rollback shape stores already follow — this makes rollback-on-failure trivial to test by having the fake reject.

## Environment setup

Supabase credentials live in `src/environments/environment.ts` (and `environment.development.ts`), which are gitignored — only `environment.example.ts` is committed. Copy the example and fill in real values to run locally:

```bash
Copy-Item src\environments\environment.example.ts src\environments\environment.ts
```

CI (`.github/workflows/ci.yml`) generates a placeholder environment file just so the build compiles; it never touches a real Supabase project. Deploy (`.github/workflows/deploy.yml`) injects real values from GitHub Secrets at build time and publishes `dist/budget-app/browser` to GitHub Pages, copying `index.html` to `404.html` for SPA client-side routing.

`src/app/core/seed-data.ts` (personal financial data used as local seed) is gitignored and won't exist in a fresh checkout — don't expect it to be present.

## Architecture

**Standalone, zoneless Angular 22**: no `NgModule`s, no Zone.js polyfill (see `angular.json` — `"polyfills": []`). Change detection relies entirely on signals; components use `ChangeDetectionStrategy.OnPush` and native `@if`/`@for` control flow. `provideBrowserGlobalErrorListeners()` replaces Zone's error handling.

**Data flow — repository behind an injection token**: `BudgetRepository` (`src/app/core/repository.ts`) defines a granular async CRUD contract (add/update/remove per entity, never whole-array upserts — important because the real backend is remote). `BUDGET_REPOSITORY` is an `InjectionToken` defaulting to `LocalStorageBudgetRepository`, but `app.config.ts` overrides it with `SupabaseBudgetRepository` (`src/app/core/supabase-repository.ts`), which maps between camelCase domain models and snake_case Supabase rows. To point the app at a different backend, provide a new `BudgetRepository` implementation for that token — no store code changes needed.

**Stores (`src/app/core/stores.ts`)** — one `@Injectable({providedIn: 'root'})` class per domain (`CategoryStore`, `TransactionStore`, `RecurringStore`, `PortfolioStore`, plus `ThemeService`): hold signals, expose computed derived state, and perform **optimistic writes** — mutate the local signal immediately, fire the repository call, and roll back + toast an error via `reportWriteFailure()` if the remote write fails. Each store reloads its data in an `effect()` keyed on `AuthService.ready()`/`.user()`, so data is scoped to the signed-in user and clears on logout.

**Auth**: `AuthService` wraps Supabase auth, exposing `user`/`ready` signals. `authGuard` (`src/app/core/auth.guard.ts`) blocks routes until the initial session check resolves, then revalidates in the background at most once per `REVALIDATE_INTERVAL_MS`. `app.ts` also has an `effect()` that force-navigates to `/login` if the session drops while already inside the app (the guard alone only runs on navigation).

**Recurring rules**: `RecurringStore.generateDue()` derives which transactions are missing by looking at the latest transaction already linked to each rule via `recurringRuleId` — there's no separate "last generated" field. It runs once client-side whenever both rules and transactions finish loading (via `untracked()` so it doesn't re-fire on every new transaction). Rules can be open-ended or fixed-length installment plans (`startOccurrence`/`totalOccurrences`), which self-archive once complete.

**Categories vs. subcategory overlays**: some categories are `shared` (read-only, seeded/shared across users via DB RLS). Users can't edit a shared category directly, but can add private subcategories to it — these live in a separate `subcategory_overlays` table/signal (`SubcategoryOverlay`, never merged into the shared category's jsonb) and are unioned with the category's own subcategories via `CategoryStore.allSubs()`.

**Routing**: all feature routes are lazy-loaded standalone components (`loadComponent`) behind `authGuard`, defined in `src/app/app.routes.ts`. Route paths are Italian (`/movimenti`, `/dashboard`, `/categorie`, `/patrimonio`, `/ricorrenti`).

**UI components — vendored, not npm-installed**: this project uses spartan.ng's "helm" components in the shadcn style — copied into `libs/ui/<component>/src/` (see `components.json`, `importAlias: "@spartan-ng/helm"`) rather than consumed from `node_modules`. Each is mapped in `tsconfig.json`'s `paths` (e.g. `@spartan-ng/helm/button` → `./libs/ui/button/src/index.ts`). To add a new spartan component, use its CLI (`@spartan-ng/cli`) rather than hand-writing the path mapping. `@spartan-ng/brain` supplies the underlying accessible/headless logic these wrap.

**Styling**: Tailwind CSS 4, design tokens as CSS custom properties in `src/styles.css`, dark/light mode via `@custom-variant` and a `dark` class toggled by `ThemeService` (persisted to `localStorage`).

**Charts**: `ngx-echarts` with `provideEchartsCore({ echarts: () => import('echarts') })` — ECharts is lazy-loaded only on pages that render a chart, kept out of the initial bundle.

**Money/date formatting**: centralized in `src/app/core/format.ts` (e.g. `eur`, `eurSigned`, `MONTHS_LONG`/`MONTHS_SHORT`, Italian date parsing/formatting for the date picker) — use these rather than formatting inline. Dates throughout the domain model are plain ISO `yyyy-MM-dd` strings, not `Date` objects.

## Conventions observed in this codebase

- Comments (in Italian) are used sparingly, to explain *why* — a non-obvious constraint, a workaround, or a subtlety that would surprise a reader — not to restate what the code does. Match this style rather than adding narrative comments.
- Every store mutation follows the same optimistic-update-then-rollback-on-failure shape; new mutations should follow it too rather than awaiting the repository call before updating local state.
- `user_id` is never included in write payloads sent to Supabase — it's populated server-side (default/trigger on `auth.uid()`) and enforced by RLS.

## Behaviour

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
