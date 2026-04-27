# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run Vitest unit/integration tests (pure logic, no DB)
npm run test:watch   # Vitest in watch mode

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
   - **Document history:** `SituationReview` stores `documentUrl` + `documentName` per SUBMITTED event. Signed URLs for each review document are generated server-side in the detail `page.tsx` (using `getFtmDocumentUrl`) and passed as `reviewDocumentUrls: Record<string, string>` to `SituationTimeline`. In correction mode (`MOE_CORRECTION`), the company **must** upload a new document before saving or submitting — the UI enforces this client-side and the server guards it in `updateSituationDraftAction`. Document fields are never wiped on save: `updateSituationDraftAction` uses a conditional spread and only updates `documentUrl`/`documentName` when a new file is explicitly provided.
3. **Prévisionnels / Forecasts:** Forward-looking monthly planning per enterprise per project.
4. **FTM Billing inside Situations:** Within a monthly situation, ENTREPRISE can bill a percentage of any MOA-accepted FTM on top of regular works.
   - **UI:** FTM picker with % input in `UpdateDraftForm`; per-line approve/refuse review in `MoeReviewForm` and `MoaValidateForm`.
   - **Cap:** Server enforces a 100% cumulative cap per FTM based on MOA-approved billings only (excludes current situation when editing).
   - **Refused lines** can be removed and re-submitted in the next situation.
   - **Net à payer** = periodNet − retenue − avance − penalties + sum(MOA_APPROVED ftmBillings). Frozen on `SituationTravaux.ftmBilledAmountCents` at MOA approval.
   - **Effective marché** = base marché + approved FTMs − active penalties, shown across situation and penalty pages.
5. **Pénalités (Penalties):** Contractual penalties per enterprise, proposed by MOE and validated by MOA.
   - **Lifecycle:** `DRAFT → SUBMITTED → MOA review (MOA_APPROVED/MOA_REFUSED) → (CONTESTED by ENTREPRISE) → (CANCELLED/MAINTAINED)`.
   - **Amount types:** `FIXED` (cents), `PCT_BASE_MARCHE` (% of base marché), `PCT_ACTUAL_MARCHE` (% of base marché + approved FTMs). Amount is frozen at submission and never recomputed.
   - **Application:** linked to a specific `SituationTravaux` (`applicationTarget: SITUATION`, deducted at MOA approval) or flagged for DGD (`applicationTarget: DGD`, included in DGD solde calculation).
   - **Multiple penalties** per company are allowed simultaneously.
   - **Contest:** ENTREPRISE can contest `MOA_APPROVED` penalties with mandatory justification (min 10 chars). MOE/MOA then cancels or maintains.
   - **MOA can cancel** at any lifecycle state. MOE can only cancel own `DRAFT`.
   - **Lifecycle:** `DRAFT → SUBMITTED → MOE review (MOE_APPROVED/MOE_CORRECTION/MOE_REFUSED) → MOA validation (MOA_APPROVED/MOA_REFUSED)`.
   - Supports multiple **indices** (versioned resubmissions) — unlike Situations which are strictly sequential by number.
   - MOA can waive the forecast requirement per enterprise via `CompanyContractSettings.forecastWaived`.
6. **DGD (Décompte Général Définitif):** Final contract settlement per enterprise, initiated after all situations are closed.
   - **Lifecycle:** `DRAFT → PENDING_MOE → PENDING_MOA → APPROVED → (DISPUTED by ENTREPRISE) → RESOLVED_AMICABLY | IN_LITIGATION → RESOLVED_BY_COURT`.
   - **Eligibility:** ENTREPRISE can only create a DGD once all their situations are in a terminal state (`MOA_APPROVED`, `MOE_REFUSED`, `MOA_REFUSED`) and at least one `MOA_APPROVED` situation exists. One DGD per org per project.
   - **Financial freeze:** Amounts are NOT stored at draft creation. They are frozen at submission (`submitDgdAction`) by calling `calculateDgdTotals()`. Formula: `soldeDgd = marcheActualisé − penalités(DGD) − retenueGarantie − acomptesVersés`.
     - `marcheActualisé` = base marché (lot totals) + accepted FTM quote totals.
     - `retenueGarantie` is zeroed if `CompanyContractSettings.cautionBancaireActive` is true (bank guarantee replaces holdback).
     - `acomptesVersés` = `acceptedCumulativeHtCents` from the last `MOA_APPROVED` situation.
   - **MOE analysis:** ACCEPT (forwards as-is) | MODIFY (adjusts the solde, stores `moeAdjustedSoldeHtCents`) | REJECT (returns to `DRAFT`, clears submission fields).
   - **MOA validation:** APPROVE (sets `APPROVED`, opens 30-day dispute window `disputeDeadline`) | REJECT (returns to `PENDING_MOE`, clears MOE review fields).
   - **Dispute flow:** ENTREPRISE can contest within 30 days of approval by uploading a *Mémoire en réclamation* → `DISPUTED`. MOA then either resolves amicably (`RESOLVED_AMICABLY`, stores `amicableAdjustedSoldeHtCents` + protocol document) or declares litigation (`IN_LITIGATION`). Litigation is closed by entering the court ruling (`RESOLVED_BY_COURT`, stores `courtSoldeHtCents` + judgment document).
   - **Effective solde priority:** `courtSoldeHtCents` > `amicableAdjustedSoldeHtCents` > `moeAdjustedSoldeHtCents` > `soldeDgdHtCents`. Computed by `getEffectiveSolde()` in `src/lib/dgd/calculations.ts`.
   - **Caution bancaire:** `CompanyContractSettings` stores bank guarantee fields (`cautionBancaireActive`, `cautionBancaireInsurer`, `cautionBancaireAmountCents`, document URL). When active, `retenueGarantie` is set to 0 in DGD calculations.
   - **Document storage:** DGD documents (mémoire, protocole, jugement) are stored in Supabase Storage under `dgd/{projectId}/{orgId}/`. Signed URLs via `getDgdDocumentSignedUrlAction()` (path must begin with `dgd/{projectId}/` for security).
   - **Terminal statuses:** `RESOLVED_AMICABLY`, `IN_LITIGATION`, `RESOLVED_BY_COURT` — no further edits possible.

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
  - Penalties: `CREATE_PENALTY` (MOE), `VALIDATE_PENALTY_MOA` (MOA), `CONTEST_PENALTY` (ENTREPRISE)
  - DGD: `SUBMIT_DGD` (ENTREPRISE), `REVIEW_DGD_MOE` (MOE), `VALIDATE_DGD_MOA` (MOA), `CONTEST_DGD` (ENTREPRISE)
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
- `situations/situation-actions.ts` — Draft creation, submission, MOE/MOA reviews, and FTM billing line CRUD (`upsertSituationFtmBillingAction`, `removeSituationFtmBillingAction`, `moeFtmBillingReviewAction`, `moaFtmBillingReviewAction`).
- `situations/situation-queries.ts` — Aggregation functions: `getOrgMarcheTotalCents()`, `getOrgApprovedFtmTotalCents()`, `getPastRefundedAmount()`, `getAcceptedFtmsForOrg()`, `getFtmApprovedBilledCents()`, `getOrgActivePenaltiesTotalCents()`.
- `situations/contract-settings-actions.ts` — `upsertCompanyContractSettingsAction()`: configure retenue, avance travaux, pénalités, forecast waiver per enterprise.
- `forecast/forecast-actions.ts` — `saveForecastEntriesAction()`, `submitForecastAction()`, `moeReviewForecastAction()`, `moaValidateForecastAction()`, `createNewForecastIndiceAction()`, `setForecastWaivedAction()`.
- `forecast/forecast-queries.ts` — `getProjectForecasts()`, `getForecast()`, `getForecastIndices()`, `getForecastsDashboardData()`.
- `penalties/penalty-actions.ts` — `createPenaltyAction()`, `updatePenaltyDraftAction()`, `submitPenaltyAction()`, `moaReviewPenaltyAction()`, `cancelPenaltyAction()`, `contestPenaltyAction()`, `maintainPenaltyAction()`.
- `penalties/penalty-queries.ts` — `getProjectPenalties()`, `getCompanyPenalties()`, `getPenaltiesForSituation()`, `getOwnPenalties()`, `getEligibleSituationsForPenalty()`, `getPenaltiesDashboardData()`.
- `dgd/dgd-actions.ts` — `createDgdDraftAction()`, `submitDgdAction()` (freezes amounts), `moeAnalyzeDgdAction()` (ACCEPT/MODIFY/REJECT), `moaValidateDgdAction()` (APPROVE/REJECT), `contestDgdAction()`, `resolveAmicablyAction()`, `declareInLitigationAction()`, `resolveByCourtAction()`, `uploadDgdDocumentAction()`, `getDgdDocumentSignedUrlAction()`.
- `dgd/dgd-queries.ts` — `getDgdForOrg()`, `getDgdDashboardData()` (5-query no-N+1 consolidated view), `getDgdFinancialRecapData()` (full situation/FTM/penalty recap), `getDgdEligibility()`.
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
- `SituationTravaux` — monthly billing cycle with raw submitted amounts and frozen deduction snapshots (set on MOA approval). Has `ftmBillings SituationFtmBilling[]` and frozen `ftmBilledAmountCents`.
- `SituationFtmBilling` — per-FTM billing line within a situation. Lifecycle: `PENDING → MOE_APPROVED/MOE_REFUSED → MOA_APPROVED/MOA_REFUSED`. Enforces server-side 100% cumulative cap (MOA-approved billings only). Amount frozen at submission. Unique on `(situationId, ftmRecordId)`.
- `Forecast` — forward-looking plan per org per project. Has `ForecastEntry[]` (period + planned amount) and `ForecastReview[]`.
- `ForecastEntry` — individual YYYY-MM period with planned amount.
- `ForecastReview` — audit trail for each MOE/MOA decision on a forecast.
- `Penalty` — contractual penalty per org per project. `amountType`: FIXED/PCT_BASE_MARCHE/PCT_ACTUAL_MARCHE. `inputValue`: cents or basis points. `frozenAmountCents`: frozen at submission. Optional FK to `SituationTravaux`. `applicationTarget`: SITUATION (deducted at situation MOA approval) or DGD (included in DGD solde calculation).
- `PenaltyReview` — audit trail per penalty action (SUBMITTED/MOA_APPROVED/MOA_REFUSED/CONTESTED/CANCELLED/MAINTAINED).
- `DgdRecord` — one per org per project (unique on `projectId_organizationId`). Stores frozen financial snapshot at submission, MOE/MOA review fields, and dispute/litigation/court resolution fields. All monetary columns are BigInt cents.
- `DgdReview` — append-only audit trail per DGD action (SUBMITTED/MOE_REVIEWED/MOA_VALIDATED/DISPUTED/RESOLVED_AMICABLY/IN_LITIGATION/RESOLVED_BY_COURT). Stores `decision`, `comment`, `adjustedSoldeCents`.
- `CompanyContractSettings` — extended with caution bancaire fields: `cautionBancaireActive` (Boolean), `cautionBancaireInsurer`, `cautionBancaireContractNumber`, `cautionBancaireAmountCents`, `cautionBancaireDocumentUrl/Name`.
- `AuditLog` — append-only action trail per project.

### Event-Driven Notifications (Inngest)

- Client + typed event schema: `src/inngest/client.ts` — defines `FtmEvents`, `DgdEvents`, `PenaltyEvents`, `SituationEvents`, `ForecastEvents`.
- Functions in `src/inngest/functions/notifications.ts` handle all FTM lifecycle events:
  - **Invitations:** `app/member.invited`
  - **FTM Demands:** `ftm/demand.submitted`, `ftm/demand.rejected`
  - **FTM Études:** `ftm/etudes.submitted`, `ftm/etudes.decided`
  - **FTM Quoting:** `ftm/quoting.opened`, `ftm/quote.submitted`, `ftm/quote.reviewed`, `ftm/quote.moa-final`
  - **FTM Lifecycle:** `ftm/cancelled`, `ftm/accepted`
  - **Auth:** `auth/password-reset`
- `src/inngest/functions/remind-quotes.ts` — scheduled quote reminders.
- `src/inngest/functions/dgd-notifications.ts` — DGD lifecycle email notifications:
  - `dgd/submitted` → MOE members
  - `dgd/moe-reviewed` → MOA (ACCEPT/MODIFY) or ENTREPRISE (REJECT)
  - `dgd/approved` → ENTREPRISE (with 30-day dispute deadline)
  - `dgd/moa-rejected` → MOE for re-analysis
  - `dgd/disputed` → MOE + MOA
  - `dgd/resolved-amicably` → all parties
  - `dgd/in-litigation` → MOE + ENTREPRISE
  - `dgd/resolved-by-court` → all parties
- `src/inngest/functions/situation-notifications.ts` — Situation Travaux lifecycle email notifications:
  - `situation/submitted` → MOE team
  - `situation/moe-reviewed` → APPROVED: MOA · CORRECTION_NEEDED/REFUSED: ENTREPRISE
  - `situation/moa-validated` → APPROVED/CORRECTION_NEEDED: ENTREPRISE + MOE · REFUSED: ENTREPRISE
- `src/inngest/functions/forecast-notifications.ts` — Prévisionnel lifecycle email notifications:
  - `forecast/submitted` → MOE team
  - `forecast/moe-reviewed` → APPROVED: MOA · CORRECTION_NEEDED/REFUSED: ENTREPRISE
  - `forecast/moa-validated` → APPROVED/CORRECTION_NEEDED: ENTREPRISE + MOE · REFUSED: ENTREPRISE
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
  - DGD: `dgd-notification.tsx` (single generic template used for all DGD events, parameterised with `title`, `intro`, `details[]`, `ctaLabel`, `ctaUrl`)
  - Situations: `situation-notification.tsx` (same structure as DGD, teal accent `#0d9488`)
  - Prévisionnels: `forecast-notification.tsx` (same structure as DGD, indigo accent `#4f46e5`)

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
- **Penalties dashboard** at `/projects/[projectId]/penalties/` — global overview (MOE/MOA only): per-company table with counts (draft/submitted/approved/contested) and total active penalty amounts.
- **Per-company penalties** at `/projects/[projectId]/penalties/[orgId]` — full management with `CreatePenaltyForm` (MOE), `PenaltyCard` with inline MOA review/contest/maintain actions.
- **ENTREPRISE contest flow**: approved penalties linked to a situation appear on the `SituationTravaux` detail page with a "Contester" link to `/penalties/[orgId]`. Contest itself lives in the penalty module, not inline in the situation.
- **Penalty calculation library**: `src/lib/penalties/calculations.ts` — pure functions `computePenaltyFrozenAmount()`, `sumActivePenalties()`, `isPenaltyContestable()`, `canCancelPenalty()`, `canMaintainPenalty()`. Tested in `src/__tests__/lib/penalties/`.
- **DGD dashboard** at `/projects/[projectId]/dgd/` — consolidated per-company table (MOE/MOA view) showing marché base, FTM validés, marché actualisé, pénalités, retenue de garantie, acomptes versés, solde DGD, and current status. Powered by `getDgdDashboardData()` (5 parallel queries, no N+1).
- **DGD detail** at `/projects/[projectId]/dgd/[orgId]` — full lifecycle management. ENTREPRISE sees their own data with action buttons per status. MOE/MOA see financial recap (`dgd-financial-recap.tsx`: situation table + FTM summary + DGD-flagged penalties) and review/validation forms. Document upload/download for dispute/resolution documents.
- **DGD calculation library**: `src/lib/dgd/calculations.ts` — `calculateDgdTotals()` (async, full DB query), `computeRetenueGarantie()`, `computeSoldeDgd()`, `checkDgdEligibility()`, `getEffectiveSolde()`, `DGD_TERMINAL_STATUSES`.

### FTM Table View (`/projects/[projectId]/ftms?tab=tableau`)

A sortable financial summary table alongside the Kanban view, targeting directors and project managers who need at-a-glance totals.

- **Component:** `src/app/projects/[projectId]/ftms/ftm-table-view.tsx` — `"use client"`, uses `@tanstack/react-table` v8.
- **Props:** `{ projectId: string; ftms: FtmItem[]; isCompany?: boolean }` — no new server queries; all data comes from the existing `FtmItem` shape.
- **`DerivedRow`** = `FtmItem & { submittedCount, approvedCount, pendingAmt: number|null, validatedAmt: number|null }`. Computed by `deriveRow()` which groups `quoteSubmissions` by `organizationId`, takes max `indice` per org.
  - `pendingAmt`: sum of latest quote per org when `phase ∈ {QUOTING, ANALYSIS, MOA_FINAL}`; `null` otherwise (shows `—`).
  - `validatedAmt`: same sum when `phase === ACCEPTED`; `null` otherwise.
- **MOE/MOA view** (8 columns): `#`, `Titre`, `Entreprises` (first 2 badges + `+N`), `Phase`, `Devis soumis`, `Devis approuvés`, `Montant soumis`, `Montant validé`. Includes a totals footer row.
- **ENTREPRISE view** (5 columns): `#`, `Titre`, `Phase`, `Statut devis`, `Montant` (own latest quote).
- Quote status badge for ENTREPRISE: `—` (no submission) · `En attente` · `Accepté` · `Correction` · `Refusé`.
- Cancelled rows render with `opacity-60` and strikethrough title.
- Sorting: all columns except `Entreprises` are sortable; `Phase` uses a custom `PHASE_ORDER` sort fn. Initial sort: `number` ascending.
- Row click: `useRouter()` navigates to `/projects/${projectId}/ftms/${row.original.id}`.
- Amount formatting: `toLocaleString("fr-FR", { style: "currency", currency: "EUR" })`.

### UI Component Library (`src/components/ui/`)

Reusable base components for the B2B SaaS interface. Barrel-exported via `index.ts`:
- `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `empty-state.tsx`, `input.tsx`, `modal.tsx`, `tab-nav.tsx`
- `table.tsx` — shadcn-style semantic HTML table primitives: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`. Used by the FTM Table View.

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
NEXT_PUBLIC_APP_URL
RESEND_API_KEY
EMAIL_FROM
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY  # Cloudflare Turnstile site key (login captcha)
TURNSTILE_SECRET_KEY            # Cloudflare Turnstile secret (login captcha)
```
Note: `NEXT_PUBLIC_APP_URL` was missing from this list but is used in email/Inngest payloads.
All scheduled jobs run through Inngest — there are no raw Vercel cron endpoints in this project.

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

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
