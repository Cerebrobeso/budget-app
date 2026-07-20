# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
