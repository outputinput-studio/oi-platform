# oi-platform

The output/input platform. See `CLAUDE.md` for the rules and layout.

## Run it locally
1. Install Node 22+ and pnpm, then `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill in both connection strings from **your own** Neon dev branch
   (a branch of `oi-staging`). Never production. For `DATABASE_URL`, use user `app` and any password you like:
   `pnpm db:migrate` creates the role if needed and sets that password.
3. Set `BETTER_AUTH_SECRET` in `.env.local` to any 32+ random characters (`openssl rand -base64 32`).
4. `pnpm db:migrate && pnpm db:seed`
5. `pnpm dev`, then open http://admin.localhost:3000, http://ops.localhost:3000 and http://demo.localhost:3000.
   Chrome and Safari resolve `*.localhost` without any hosts-file change.
6. Sign in to the admin as `owner@example.com` (seeded). With no email provider configured, the code shows on
   the screen.

## Deploy
Vercel deploys from Git. `main` is production, `staging` is the staging environment, every pull request gets a
preview. The build migrates its own database first.
