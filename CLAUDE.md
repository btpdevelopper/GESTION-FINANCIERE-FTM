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

This is a **multi-tenant construction project financial tracking** app centered on the *FTM* (Fiche Technique de Marché) workflow — a document lifecycle that moves through phases: `ETUDES → QUOTING → ANALYSIS → MOA_FINAL`.

### Auth & Middleware

- Supabase Auth handles sessions; all server-side operations use `createClient()` from `src/lib/supabase/server.ts`.
- `src/lib/supabase/middleware.ts` + `src/middleware.ts` enforce a **deny-by-default** rule: unauthenticated requests redirect to `/login?callbackUrl=...`.
- Public routes: `/login`, `/auth/*`, `/api/inngest`, `/invite`.
- Use `getAuthUser()` from `src/lib/auth` inside server actions to get the current user; it throws if unauthenticated.
- `src/lib/supabase/admin.ts` uses the service-role key — only for privileged server-side ops (invites, admin tasks).

### RBAC / Permissions

- Three project roles: **MOA** (owner), **MOE** (technical lead), **ENTREPRISE** (contractor).
- Capabilities (e.g. `VIEW_GLOBAL_FINANCE`, `CREATE_FTM`, `APPROVE_FTM_CREATION_MOE`) are resolved in `src/lib/permissions/resolve.ts`.
- **Deny-wins**: individual `ProjectMemberCapabilityOverride` denies beat group defaults.
- Always call `resolveCapabilities(userId, projectId)` before performing sensitive mutations in server actions.

### Server Actions (`src/server/`)

All files use `"use server"`. Key modules:
- `ftm/ftm-actions.ts` — FTM creation, phase transitions, quote handling, reviews.
- `ftm/guest-actions.ts` — Actions for ENTREPRISE participants (quote submission, situation travaux).
- `projects/wizard-actions.ts` — Project creation/onboarding flow.
- `rbac/admin-actions.ts` — Member invite, role/capability management.
- `auth/reset-password-action.ts` — Password reset via Supabase.

### Database Schema (Prisma)

Key models and relations:
- `Project` → has many `ProjectMember` (with role + capability overrides) and `FtmRecord`.
- `FtmRecord` → belongs to a `Project` + `lot`; has `FtmQuoteSubmission[]`, `FtmReview[]`, `SituationTravaux[]`.
- `FtmDemand` → precedes FtmRecord creation; initiated by ENTREPRISE.
- `Organization` — companies/contractors; ENTREPRISE members belong to one.
- `AuditLog` — append-only action trail per project.

### Event-Driven Notifications (Inngest)

- Client + typed event schema: `src/inngest/client.ts`.
- Functions in `src/inngest/functions/notifications.ts` handle ~12 events (invitation, études decision, quote submitted, FTM cancelled, etc.).
- `src/inngest/functions/remind-quotes.ts` runs scheduled reminders.
- Inngest webhook registered at `POST /api/inngest`.
- Fire events with `inngest.send({ name: "ftm/...", data: {...} })` from server actions.

### Document Storage

- Supabase Storage bucket: `ftm-documents`. Utility: `src/lib/storage.ts`.
- Path convention: `{ftmId}/{timestamp}-{sanitized-filename}`.
- `GET /api/ftm-doc?path=...` is a **zero-trust proxy**: for ENTREPRISE users it checks that the document's `organizationId` matches the requester's org before returning a signed URL (1-hour expiry).
- File validation uses magic number checks (not just MIME type) — see `ftm-actions.ts`.

### Email

- Resend SDK wrapper at `src/lib/email.ts`; always returns `{ ok, error? }` (non-throwing).
- React Email templates in `src/emails/` — `member-invite.tsx`, `password-reset.tsx`.

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

## Demo Accounts (after `db:seed`)

| Email | Password | Role |
|---|---|---|
| moa@demo.local | password123 | MOA |
| moe@demo.local | password123 | MOE |
| ent1@demo.local | password123 | Entreprise A |
| ent2@demo.local | password123 | Entreprise B |
