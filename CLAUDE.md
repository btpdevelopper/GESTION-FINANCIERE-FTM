# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint

# Database (Prisma)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:push      # Push schema changes to DB (dev, no migration file)
npm run db:migrate   # Create and apply a migration (production-safe)
npm run db:studio    # Open Prisma Studio GUI
npm run db:seed      # Seed demo data (prisma/seed.ts via tsx)
```

Always run `npm run db:generate` after editing `prisma/schema.prisma`.

## Architecture Overview

**Stack:** Next.js 16 App Router · Prisma 6 · Supabase (Auth + Storage + PostgreSQL) · Inngest (events) · Resend (email) · Tailwind

This is a **multi-tenant construction project financial tracking** app centered on three main workflows:
1. **FTM (Fiche Technique de Marché):** Document lifecycle (`ETUDES → QUOTING → ANALYSIS → MOA_FINAL`).
   - ENTREPRISE submits an `FtmDemand` first; MOE approves it before an `FtmRecord` is created (`FtmRecord.fromDemandId`).
   - Demand lifecycle: `DRAFT → PENDING_MOE → APPROVED/REJECTED`.
2. **Situations de Travaux (Billing):** Monthly financial progress tracking and invoicing.
   - **Lifecycle:** `DRAFT → SUBMITTED → MOE review (APPROVED/CORRECTION/REFUSED) → MOA review (APPROVED/REFUSED)`.
   - **Constraint:** Strictly sequential. A new situation cannot be created if a previous one is pending. The previous month *must* be `MOA_APPROVED`.
   - **Financials:** Mathematical snapshots (Retenue de garantie, Avance travaux, Pénalités) are computed dynamically but are strictly **frozen/saved** to the database only upon `MOA_APPROVED` to preserve historical accuracy.
3. **Prévisionnels / Forecasts:** Forward-looking monthly planning per enterprise per project.
   - **Lifecycle:** `DRAFT → SUBMITTED → MOE review (MOE_APPROVED/MOE_CORRECTION/MOE_REFUSED) → MOA validation (MOA_APPROVED/MOA_REFUSED)`.
   - Supports multiple **indices** (versioned resubmissions) — unlike Situations which are strictly sequential by number.
   - MOA can waive the forecast requirement per enterprise via `CompanyContractSettings.forecastWaived`.

### Auth & Middleware

- Supabase Auth handles sessions; all server-side operations use `createClient()` from `src/lib/supabase/server.ts`.
- `src/lib/supabase/middleware.ts` + `src/middleware.ts` enforce a **deny-by-default** rule: unauthenticated requests redirect to `/login?callbackUrl=...`.
- Public routes: `/login`, `/auth/*`, `/api/inngest`, `/invite`.
- Use `getAuthUser()` from `src/lib/auth` inside server actions to get the current user; it throws if unauthenticated.
- `src/lib/supabase/admin.ts` uses the service-role key — only for privileged server-side ops (invites, admin tasks).

### RBAC / Permissions

- Three project roles: **MOA** (owner), **MOE** (technical lead), **ENTREPRISE** (contractor).
- Capabilities resolved in `src/lib/permissions/resolve.ts`. Key capabilities:
  - FTM: `CREATE_FTM`, `VIEW_GLOBAL_FINANCE`
  - Situations: `SUBMIT_SITUATION`, `REVIEW_SITUATION_MOE`, `VALIDATE_SITUATION_MOA`
  - Forecasts: `SUBMIT_FORECAST`, `REVIEW_FORECAST_MOE`, `VALIDATE_FORECAST_MOA`
  - Admin: `CONFIGURE_CONTRACT_SETTINGS`
- **Deny-wins**: individual `ProjectMemberCapabilityOverride` denies beat group defaults.
- Always call `resolveCapabilities(userId, projectId)` before performing sensitive mutations in server actions.
- `src/server/ftm/access.ts` — `userCanViewFtm()` checks FTM access: MOA/MOE always; ENTREPRISE only if in a concerned org.
- `src/server/membership.ts` — `getProjectMember()`, `requireProjectMember()`, `listProjectsForUser()`.

### Server Actions (`src/server/`)

All files use `"use server"`. Key modules:
- `ftm/ftm-actions.ts` — FTM creation, phase transitions, quote handling, reviews.
- `ftm/guest-actions.ts` — Actions for ENTREPRISE participants (quote submission, situation travaux).
- `projects/wizard-actions.ts` — Project creation/onboarding flow.
- `projects/admin-config-actions.ts` — Project metadata, lot management, enterprise-lot market amount assignment, base contract recalculation.
- `rbac/admin-actions.ts` — Member invite, role/capability management.
- `auth/reset-password-action.ts` — Password reset via Supabase.
- `situations/situation-actions.ts` — Draft creation, submission, and MOE/MOA reviews for billing.
- `situations/situation-queries.ts` — Aggregation functions: `getMarcheTotalCents()`, `getApprovedFtmTotalCents()`, `getPastRefunds()`.
- `situations/contract-settings-actions.ts` — `upsertCompanyContractSettingsAction()`: configure retenue, avance travaux, pénalités, forecast waiver per enterprise.
- `forecast/forecast-actions.ts` — `saveForecastEntriesAction()`, `submitForecastAction()`, `moeReviewForecastAction()`, `moaValidateForecastAction()`, `createNewForecastIndiceAction()`, `setForecastWaivedAction()`.
- `forecast/forecast-queries.ts` — `getProjectForecasts()`, `getForecast()`, `getForecastIndices()`, `getForecastsDashboardData()`.
- `notifications/pending-counts.ts` — `getProjectPendingCounts()`: role-aware badge counts for FTM, situations, and forecasts.
- `lib/situations/calculations.ts` — Pure functions for deduction math (retenue, avances, penalties).

### Database Schema (Prisma)

Key models and relations:
- `Project` → has many `ProjectMember` (with role + capability overrides), `FtmRecord`, `SituationTravaux`, `ProjectLot`.
- `ProjectLot` — lots within a project (e.g. structural, electrical). Has many `ProjectLotOrganization` (enterprise + `montantMarcheHtCents`). Project `baseContract` is auto-recalculated from lot totals.
- `FtmRecord` → belongs to `Project` + `lot`; has `FtmQuoteSubmission[]`, `FtmReview[]`, `SituationTravaux[]`.
- `FtmDemand` → precedes `FtmRecord` creation; initiated by ENTREPRISE, reviewed by MOE.
- `Organization` — companies/contractors; ENTREPRISE members belong to one. Has `CompanyContractSettings`.
- `CompanyContractSettings` — per-company-per-project billing parameters: retenue de garantie %, avance de travaux (amount, start month, refund %, installments), pénalités (NONE/FREE_AMOUNT/DAILY_RATE), `forecastWaived` flag.
- `SituationTravaux` — monthly billing cycle with raw submitted amounts and frozen deduction snapshots (set on MOA approval).
- `Forecast` — forward-looking plan per org per project. Has `ForecastEntry[]` (period + planned amount) and `ForecastReview[]`.
- `ForecastEntry` — individual YYYY-MM period with planned amount.
- `ForecastReview` — audit trail for each MOE/MOA decision on a forecast.
- `AuditLog` — append-only action trail per project.

### Event-Driven Notifications (Inngest)

- Client + typed event schema: `src/inngest/client.ts`.
- Functions in `src/inngest/functions/notifications.ts` handle all lifecycle events:
  - **Invitations:** `app/member.invited`
  - **FTM Demands:** `ftm/demand.submitted`, `ftm/demand.rejected`
  - **FTM Études:** `ftm/etudes.submitted`, `ftm/etudes.decided`
  - **FTM Quoting:** `ftm/quoting.opened`, `ftm/quote.submitted`, `ftm/quote.reviewed`, `ftm/quote.moa-final`
  - **FTM Lifecycle:** `ftm/cancelled`, `ftm/accepted`
  - **Auth:** `auth/password-reset`
- `src/inngest/functions/remind-quotes.ts` — scheduled quote reminders.
- Inngest webhook registered at `POST /api/inngest`.
- Fire events with `inngest.send({ name: "ftm/...", data: {...} })` from server actions.

### Document Storage

- Supabase Storage bucket: `ftm-documents`. Utility: `src/lib/storage.ts`.
- Path conventions:
  - FTMs: `{ftmId}/{timestamp}-{sanitized-filename}`
  - Situations: `situations/{projectId}/{organizationId}/{timestamp}-{sanitized-filename}`
- File validation uses magic number checks (not just MIME type) — `src/lib/validations/magic.ts`.
- `GET /api/ftm-doc?path=...` is a **zero-trust proxy**: for ENTREPRISE users it checks that the document's `organizationId` matches the requester's org before returning a signed URL (1-hour expiry).

### Email

- Resend SDK wrapper at `src/lib/email.ts`; always returns `{ ok, error? }` (non-throwing).
- React Email templates in `src/emails/` with shared layout at `src/emails/_components/base-layout.tsx`:
  - Auth: `member-invite.tsx`, `password-reset.tsx`
  - FTM Demands: `demand-submitted.tsx`, `demand-rejected.tsx`
  - FTM Études/Quoting: `etudes-submitted.tsx`, `etudes-decision.tsx`, `quoting-opened.tsx`, `quote-received.tsx`, `quote-review.tsx`
  - FTM Lifecycle: `ftm-cancelled.tsx`, `ftm-accepted.tsx`

### Admin Configuration (Tabbed UI)

Project admin at `/projects/[projectId]/admin/` is split into four focused tabs:
- `tab-general.tsx` — Project name, code, base contract display.
- `tab-finance.tsx` — Lot management (add/edit/delete lots, assign enterprises with market amounts via `assign-companies-drawer.tsx`).
- `tab-contrats.tsx` — Per-enterprise contract settings (holdback %, advance, penalties, forecast waiver).
- `tab-rbac.tsx` — Members, permission groups, capability overrides.

### Dashboard & Pending Counts

- Project home (`/projects/[projectId]/`) shows four module cards with pending task counts from `getProjectPendingCounts()`.
- Counts are role-specific: MOA sees MOE-approved items awaiting final validation; MOE sees submitted items awaiting review; ENTREPRISE sees items needing correction.
- Forecast dashboard at `/projects/[projectId]/forecasts/` shows all enterprises with latest forecast status and comparison charts.
- Situation dashboard at `/projects/[projectId]/situations/` shows period-by-period financial comparison tables.

### UI Component Library (`src/components/ui/`)

Reusable base components for the B2B SaaS interface. Barrel-exported via `index.ts`:
- `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `empty-state.tsx`, `input.tsx`, `modal.tsx`, `tab-nav.tsx`

### Validation

- Zod action schemas in `src/lib/validations/actions.ts`.
- Magic number file validation in `src/lib/validations/magic.ts`.

### Path Alias

`@/*` maps to `src/*`.

## Validation

Always use **Zod** to validate user-supplied data at server action boundaries before any database write or business logic. Define schemas with `z.object(...)` and always call `.safeParse()` — never `.parse()` — on `FormData`-derived values. Never trust raw form input downstream.

## Environment Variables

Required in `.env`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
RESEND_API_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
CRON_SECRET
EMAIL_FROM
```

## UI & Styling Guidelines (Tailwind CSS)
This application is built for construction professionals and requires a highly information-dense, sober, and strictly professional Enterprise B2B SaaS interface. Avoid consumer-facing, "flashy" design patterns.

When generating or refactoring UI components, strictly adhere to the following directives:

Density & Spacing: Maximize screen real estate. Use tighter paddings and margins (e.g., p-3, p-4, gap-2). Avoid excessive whitespace and oversized containers.

Typography: Default to smaller text sizes (e.g., text-sm for standard data and tables). Keep headings appropriately scaled so they structure the page without dominating the data.

Shapes: Use sharp, serious corners. Replace large border radiuses (rounded-xl, rounded-2xl, rounded-full) with rounded-sm or rounded.

Colors: Default to a muted, neutral palette (e.g., Tailwind's slate or zinc). Reserve bright, semantic colors only for critical actions or status indicators (e.g., a green badge for 'Approved', a red button for 'Refused').

DRY Architecture (Don't Repeat Yourself): Do not repeat long strings of Tailwind classes across multiple files. Continually identify repeated UI patterns (Action Buttons, Status Badges, Data Cards, Form Inputs) and extract them into clean, reusable React components within a src/components/ui/ directory. Ensure these base components are flexible and accept standard props (like className and children).

## Demo Accounts (after `db:seed`)

| Email | Password | Role |
|---|---|---|
| moa@demo.local | password123 | MOA |
| moe@demo.local | password123 | MOE |
| ent1@demo.local | password123 | Entreprise A |
| ent2@demo.local | password123 | Entreprise B |
