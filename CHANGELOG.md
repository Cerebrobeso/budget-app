# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
