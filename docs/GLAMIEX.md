# GLAMIEX — Sales, Finance & Analytics module

Open it from the sidebar (**GLAMIEX Business**) or at `/glamiex`. It shares the app's database, backup, trash, global search (`Ctrl K`), sync and design system.

## Sections
Overview · Products · Sales & Orders · Customers & People · Deposits & Payments · Advertising Revenue · Advertising Expenses · Business Expenses · Profit & Loss · Sales Analytics · Weekly / Monthly / Yearly Reports · Pictures & Videos · Transactions · Reports & Exports · Overall Sheets · Settings.

Shortcuts (not while typing): `Shift S` new sale · `Shift P` new product · `Shift D` payment · `Shift E` expense · `Shift O` overview.

## Data & calculations
- **Money** is stored as integer **paisa** (Rs 1 = 100) — no floating-point drift. Display uses `en-PK` grouping (`Rs 1,250`).
- **Time**: instants stored in UTC; dates, weekdays and hours are derived in the GLAMIEX time zone (Settings).
- **One calculation engine** (`src/features/glamiex/engine.ts`) aggregates per day; every KPI, chart, report and sheet is built from it, so numbers always agree.
- Full accounting rules: GLAMIEX → Settings → *Accounting assumptions* (and the header of `engine.ts`).

### Integrity safeguards
| Risk | Safeguard |
|---|---|
| Double-click / retry posts a sale twice | Each form has a client submission id = record id; re-submits return the existing record. Unique indexes on order no., payment no. and SKU (locally and in Postgres). |
| Stock deducted twice | Stock is an append-only ledger with deterministic ids (`sale:<order>:<product>`), written in the same transaction as the sale. |
| Price change rewrites history | Each sale stores a snapshot of unit price **and** unit cost. |
| Editing posted money | Sales are corrected by **cancel** or **refund** records; payments by **void**. Nothing is silently rewritten. Every change is in the audit trail (Settings → Audit trail). |
| Deposits/financing inflating revenue | Customer deposits = customer credit; owner contributions/loans = financing; drawings ≠ expenses. Only sales (− discounts − refunds) are revenue. |
| Ad spend counted twice | Each campaign's spend is spread across its own dates once; overlapping report ranges never double-count. |

## Design presets
Neon 3D · Glass Finance · Executive Pro · Aurora Analytics · Minimal Business, plus accent color, density, chart style and sidebar mode (Settings). Presets are scoped CSS only — they never touch data.

## Exports
Every list and report exports **CSV**, **Excel (.xlsx)** (dependency-free writer, numbers kept numeric) and **PDF/Print** (browser print dialog). Exports include period, currency and generation time.

## Cloud (optional)
`supabase/migrations/20261021000001_glamiex.sql` creates the `gx_*` tables with Row Level Security (owner-only), per-user unique order/payment/SKU numbers, no client hard-delete on financial tables, and an append-only `gx_audit_events` table. Attachments sync to the private `media` bucket.

## Known limitations
- Attachments are stored on the device (and in the private bucket when sync is on); they are not encrypted at rest locally.
- Multi-user roles (e.g. cashier vs. owner permissions) are not implemented — GLAMIEX is single-owner.
- Tax handling is a simple per-sale amount (optional default %); it is not a tax-filing system.
- “PDF” uses the browser's print-to-PDF.
