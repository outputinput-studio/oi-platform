# oi-platform

The output/input platform: one Next.js app serving three surfaces, one Postgres
database holding every client site, locked by row-level security.

## Stack (pinned — do not substitute)
TypeScript strict · Next.js 16 App Router · React 19 · Tailwind 4 · Drizzle ORM ·
node-postgres (`pg`) against Neon · Zod · Vitest · Playwright · pnpm · Node 22+.

## Commands
- `pnpm dev` — local, against your own Neon dev branch (see .env.example)
- `pnpm lint` · `pnpm typecheck` · `pnpm test:unit` · `pnpm test:integration` · `pnpm test:e2e`
- `pnpm db:generate` — new migration from schema changes · `pnpm db:migrate` · `pnpm db:seed`
- Vercel builds run `pnpm db:migrate && next build`: a failed migration is a failed deploy.
- `db:migrate` also sets the `app` role's password to match `DATABASE_URL`, so the two never drift.

## Layout
- `src/proxy.ts` — hostname → surface rewrite (admin.* → /admin, ops.* → /ops, else /site)
- `src/app/{admin,ops,site}` — the three surfaces. Never link to these paths directly.
- `src/db` — the ONLY place that touches the database driver. `withSite()` lives here.
- `src/lib` — shared pure code. `src/modules/<name>` — modules. `modules/auth` holds sign-in and the access
  helpers (`requireUser`, `requireSiteAccess`, `membershipFor`) that every admin page and action goes through.
- `tests/unit` (pure) · `tests/integration` (real Postgres) · `tests/e2e` (Playwright, Host header per surface)

## Non-negotiables
1. Every client-owned table has `site_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, a policy on
   `NULLIF(current_setting('app.site_id', true), '')::uuid`, and explicit GRANTs to the `app` role.
   Copy the four statements from `src/db/migrations/0000_sites.sql`. The only tables without RLS are the
   platform tables (users, sessions, accounts, verifications, memberships): shared, no client data. Their list
   is pinned in `tests/integration/tenancy.test.ts`; adding to it is a design decision, not a shortcut.
2. Touch data only through `withSite()`. Only `src/db` imports `pg` or creates a Drizzle instance (lint enforces).
3. Routing is not security. Authorise inside module functions, never only in `proxy.ts`.
   `proxy.ts` reads `x-forwarded-host` before `host`: a server-action `redirect()` makes Next fetch the target
   page from itself with `Host: localhost`, and only `x-forwarded-host` still names the site that asked.
4. Migrations only add. Never rename or drop in the same release as the code that stops using something.
   Never edit an applied migration. Vercel rollback does not touch the database.
5. No site names, ids or slugs in code. Client differences are settings, modules, content, themes, flags.
6. Never connect to the production database from a laptop or a test. CI uses a throwaway Postgres.
7. Validate every input at the edge with Zod. One env schema in `src/lib/env.ts`.
   Sign-in is a six-digit emailed code, invite-only: an unknown email gets the same screen and no code, so the
   form can't be used to find out who works where. Outside production with no email provider, the code is
   shown on screen — that is how staging, previews and CI sign in. Production never shows it.
8. Small pull requests, tests before code, nothing merges red.
9. Tokens only in UI (`--bg`, `--fg`, `--muted`, `--border`, `--accent`); no raw colours in components.
10. Adding a dependency, pattern or convention? Stop and ask first.

## Environments
local (your dev branch) → preview (per PR, shared `preview` branch in oi-staging) →
staging (branch `staging`, oi-staging, *.outputinput.io) → production (branch `main`, oi-prod, *.outputinput.co).
Staging and previews only ever hold fake data.
