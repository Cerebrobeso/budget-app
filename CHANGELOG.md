# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 1.3.1 (2026-07-22)
## [1.3.0] - 2026-07-21

### Fixed
- Quick-add and other dialogs on mobile: a dead gap between the title and the form, caused by the dialog's full-height grid stretching every row instead of just the last one.
- Log page's empty-state message breaking into disjointed lines on mobile, and its "Premi N" keyboard-shortcut hint (meaningless with no physical keyboard) replaced with "Tocca il tasto" on mobile.
- Tooltips on icon-only buttons getting stuck open after a tap on mobile, with no hover to dismiss them; now desktop-only.
- Dialog titles with long interpolated names (delete-category/asset confirmations) running under the close button; long titles now wrap instead of overlapping.

## [1.2.0] - 2026-07-20

### Added
- Tooltips on desktop for icon-only buttons throughout the app.
- Visible state label (Imprevisto/Programmata/Normale) on the transaction tag-cycle button, alongside a matching icon for each state.

### Changed
- Mobile transaction log: filter controls now wrap into a 2-column grid instead of an uneven line wrap, and per-transaction action buttons (tag/edit/delete) move to their own row instead of crowding the description text.

### Fixed
- Bottom navigation bar not staying pinned to the viewport on some Android phones, caused by unwrapped filter controls overflowing the screen width.

## [1.1.0] - 2026-07-19

### Added
- Transfer transactions between own accounts (e.g. checking -> savings), excluded from the month's income/expense/balance.
- Unexpected/planned tag on transactions, replacing the "important" flag: quick-toggle button and highlight in the log, dedicated filters, and counts in the dashboard's monthly chart tooltips.
- Delete button and stale-snapshot warning (no update in over a month) for portfolio positions.

## [1.0.0] - 2026-07-19

### Added
- Transaction log with quick entry, categories/subcategories, dashboard charts, and portfolio/assets tracking.
- Recurring and installment transactions, with write failures surfaced to the user.
- Search and CSV export in the transaction log.
- Custom category color picker, full-screen mobile dialogs, per-user categories.
- Category deletion with reassignment of existing transactions.
- Drill-down from the expense donut chart into subcategories.
- Masked amount/date inputs and Lucide icon set.
- PWA support (web app manifest, iOS home screen install).
- CI workflow to type-check and build on push/PR.

### Changed
- Supabase auth session persistence made explicit.
- Route transitions and session revalidation.

### Fixed
- PWA manifest `start_url`/`scope` for the GitHub Pages subpath.
