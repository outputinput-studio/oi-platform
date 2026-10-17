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

## Design
`design/*.html` are Carl's Claude Design prototypes (see `design/README.md`); the admin follows `design/admin.html`
screen for screen. Tokens are in `src/app/globals.css`, mirrored from its `:root`, with Tailwind names (`bg-surface`,
`text-muted`, `border-line`, `rounded-card`…). Geist for words, Geist Mono for labels/addresses/numbers (`.label`).
Admin primitives live in `src/app/admin/ui.tsx`; every screen renders a `PageHeader`. Lists that reorder (sections, form
fields) use `src/app/admin/sortable.tsx` (on `@dnd-kit`, approved): a handle starts the drag, cards fold while it runs,
and the keyboard works (focus the handle, Space, arrows, Space).
Mistakes point at their field (Carl, Oct 2026): actions return `formError(err)` (`src/lib/form-error.ts`) — the message
plus `fields`, dotted Zod paths like `zones.0.rates.1.price`. Every control carries a `name` or `data-field` matching its
path; `Notice` (or `FieldErrors` beside an autosave status) outlines each field at fault and scrolls to the top one.
A refusal about one field throws `FieldError(field, message)`; a lone value is parsed with `named(field, schema, value)`.

## Layout
- `src/proxy.ts` — hostname → surface rewrite (admin.* → /admin, ops.* → /ops, else /site)
- `src/app/{admin,ops,site}` — the three surfaces. Never link to these paths directly.
- `src/db` — the ONLY place that touches the database driver. `withSite()` lives here.
- `src/lib` — shared pure code. `src/modules/<name>` — modules. `modules/auth` holds sign-in and the access
  helpers (`requireUser`, `requireSiteAccess`, `membershipFor`, `assertAccess`) that every admin page and action
  goes through. A module is `server.ts` (pure functions taking `actorId` + `siteId`, authorising first, testable
  without a browser) and `actions.ts` (thin server actions that read the form and call it).
- Roles (Carl, Oct 2026; `modules/auth/roles.ts`): Owner everything; Manager the shop and the site, refunds too, but
  not the team, payment keys, the domain, custom code or going live; Staff orders, the inbox and contacts.
  `assertAccess` defaults to Manager, so pass `"staff"` or `"owner"` on purpose. A Manager's screen calls
  `requireSiteAccess("manager")` (lower roles land on Home); the nav hides what `canOpen` says no to.
  The whole matrix is pinned in `tests/integration/roles.test.ts`: a new function gets a row there.
- Two-factor (Carl, Oct 2026; `modules/auth/two-factor.ts`, `totp.ts`): after the emailed code, a code from an
  authenticator app — required for Owners, a choice for the rest; ten one-time recovery codes; an Owner can reset
  it for someone whose every site they own. The key is sealed with OI_SECRETS_KEY in `two_factors` (a platform
  table); `sessions.two_factor_at` marks a session that got past the app, and `requireSignIn` checks it on every
  request. Better Auth's HTTP endpoints are closed but for get-session and sign-out (`api/auth/[...all]`).
  E2E: the "setup" project signs the owner in once (app code included) and the rest reuse that session.
- O/I support (Carl, Oct 2026; `modules/auth/support.ts`): the addresses in OI_SUPPORT_EMAILS (Vercel only, never the
  database) are an Owner on every site with no membership — always on, a client can't remove it. They always need the
  app, count only once OI_SECRETS_KEY is set, show as "output/input" in Activity, and list sites via `all_site_ids()`.
- Ops and plans (Carl, Oct 2026; `src/app/ops`, `modules/ops`, `modules/plans`): ops is O/I support's own surface —
  anyone else lands on "not ours" (`requireOps`). We set each site's plan there (`sites.plan`, `planSchema`; only
  `setPlan` by support, checked in the module); Owners see it and their usage in Settings · Plan. Visits are counted
  per site per day in `visits` (RLS) by `/api/visit`, launched sites only, bots skipped.
- Billing (Carl, Oct 2026; `modules/billing`): clients pay O/I for the plan through O/I's own Stripe
  (OI_BILLING_STRIPE_KEY — never a client's keys). An Owner sets up payment on Settings · Plan (Stripe Checkout,
  monthly subscription, `metadata.siteId`); `/api/billing/stripe` (OI_BILLING_WEBHOOK_SECRET) re-reads the
  subscription whole on every event (`syncSubscription`) into `billing` (RLS, one row per site). A price changed in
  ops applies from the next bill (no proration); the currency is fixed while they pay; a failed payment stops
  nothing. No key outside production → test billing (pretend card, nothing charged).
- Invitations (`modules/team/invitations.ts`, RLS table): the only way onto a team from the admin. 14 days; the
  link (`/join/[token]`, found through `resolve_invitation()`) adds the invited address as its role, then hands on
  to the emailed code. An expired link asks for a new one itself, sent to the invited address.
- `src/app/admin/(site)` — the signed-in admin: its layout calls `requireSiteAccess`; pages under it are for one site.
  Pages link with public paths (`/team`, never `/admin/team`). `src/app/admin/ui.tsx` holds the few primitives.
- `src/modules/pages/registry.ts` — the section registry: every block a page can hold, with its Zod schema. A new
  section type is an entry here + a renderer in `render.tsx` + an editor in the admin. Never a one-off for a client.
- `src/modules/media` — the image library. Bytes go through `src/lib/storage.ts` (one R2 bucket, every site under
  its own `<site_id>/` folder; local disk when R2 isn't configured outside production), rows in `media` (RLS).
  Sections reference an image by storage `key`, never by URL: the public address comes from `R2_PUBLIC_URL` at
  render time, so the bucket's domain can change without touching a page. The browser shrinks photos before upload.
- `src/modules/activity` — Activity (More → Activity): everything the team changed, and who. A module function that
  changes something calls `recordActivity(tx, siteId, actorId, { action: "moved order 1041 to {s}", subject, href, key })`
  inside the same transaction (`logActivity` when the change wasn't in one). `key` folds a run of edits to one thing by
  one person into one line (half an hour); `{n}` counts ("added {n} photos"). New changes get a line too.
- `src/modules/contacts` — contacts, plus Merge contacts (`duplicates.ts`: the same phone or full name; "different
  people" is remembered). A merged contact is soft deleted with `merged_into`, so its old link lands on the survivor.
- `src/modules/customers` — storefront customer accounts and Track my order (design/storefront-accounts.html). Its own
  small sign-in, not Better Auth: customers belong to one site (RLS), staff don't. Codes are HMAC'd, session tokens
  SHA-256'd, passwords scrypt'd (node:crypto only); guessing is slowed by `throttles` (5 misses → 2 min, doubling to an
  hour). Account functions take the customer the session cookie resolved to, never an id from the form.
- `src/app/site` — the storefront. The site comes from the hostname (`siteFromHost`: the client's own domain via the
  owner-defined `resolve_host(host)`, then the slug via `resolve_site(slug)` — the only ways to find a site before one
  is current); only published pages render. Storefront pages, their `<head>` and storefront actions get the site
  through `storefrontSite()` / `visibleSiteFromHost()` (`src/modules/sites/storefront.ts`): a site that hasn't launched
  is invisible to them, and `src/app/site/layout.tsx` shows the holding page (a signed `oi_pass` cookie lets the team in).
  The same layout adds, around a visible site's pages: Custom code (owners only, `modules/sites/custom-code*.ts`, ten
  versions kept), analytics from IDs only (`modules/sites/tracking.ts` writes Google's and Meta's snippets; never pasted
  code) once the site is live, and the cookie notice — with it on, analytics wait for Accept (`oi_consent` cookie).
- Addresses between surfaces come from `src/lib/hosts.ts` (`adminOriginFor`, `siteAddress`, `publicHost`) — never by
  rewriting the first label of a host, which breaks on a client's own domain. Domains go on Vercel through
  `src/lib/vercel.ts` (OI_VERCEL_*); sending domains through Resend (`src/lib/email.ts`).
- `tests/unit` (pure) · `tests/integration` (real Postgres) · `tests/e2e` (Playwright, Host header per surface)

## Non-negotiables
1. Every client-owned table has `site_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, a policy on
   `NULLIF(current_setting('app.site_id', true), '')::uuid`, and explicit GRANTs to the `app` role.
   Copy the statements from `src/db/migrations/0002_pages.sql`. The only tables without RLS are the
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
9. Tokens only in UI (the set in `src/app/globals.css`, mirrored from `design/admin.html`); no raw colours in components.
10. Adding a dependency, pattern or convention? Stop and ask first.

## Environments
local (your dev branch) → preview (per PR, shared `preview` branch in oi-staging) →
staging (branch `staging`, oi-staging, *.outputinput.io) → production (branch `main`, oi-prod, *.outputinput.co).
Staging and previews only ever hold fake data.
