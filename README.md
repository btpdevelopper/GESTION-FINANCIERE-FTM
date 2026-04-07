# Gestion financière FTM

Application Next.js (App Router) + PostgreSQL + Prisma pour le suivi des marchés et FTM sur chantiers (France).

## Prérequis

- Node.js 20+
- Docker (optionnel, pour PostgreSQL)

## Configuration

1. Copier `.env.example` vers `.env` et définir `AUTH_SECRET` (ex. `openssl rand -base64 32`).
2. Démarrer la base : `docker compose up -d` (ou utiliser un PostgreSQL existant).
3. Installer les dépendances : `npm install`
4. Pousser le schéma : `npx prisma db push`
5. Seed démo : `npm run db:seed`
6. Lancer : `npm run dev`

## Comptes démo (après seed)

| Email            | Mot de passe  | Rôle        |
|------------------|---------------|-------------|
| moa@demo.local   | password123   | MOA         |
| moe@demo.local   | password123   | MOE         |
| ent1@demo.local  | password123   | Entreprise A (override deny sur CREATE_FTM) |
| ent2@demo.local  | password123   | Entreprise B |

Projet démo : **Chantier démo** (`/projects/00000000-0000-0000-0000-000000000001`).

## Fonctionnalités MVP

- Phases FTM : création (garde MOE si demande entreprise), études, devis, analyse MOE, validation MOA finale.
- Groupes de permissions + overrides (deny prioritaire).
- Chat par FTM, invitations études (lien 72h), devis avec indice.

## Scripts

- `npm run db:seed` — données de démonstration
- `npm run db:studio` — Prisma Studio
