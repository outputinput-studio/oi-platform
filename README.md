# oi-platform

The output/input platform. See `CLAUDE.md` for the rules and layout.

## Run it locally
1. Install Node 22+ and pnpm, then `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill in both connection strings from **your own** Neon dev branch
   (a branch of `oi-staging`). Never production.
3. `pnpm db:migrate && pnpm db:seed`
4. `pnpm dev`, then open http://admin.localhost:3000, http://ops.localhost:3000 and http://demo.localhost:3000.
   Chrome and Safari resolve `*.localhost` without any hosts-file change.

## Deploy
Vercel deploys from Git. `main` is production, `staging` is the staging environment, every pull request gets a
preview. The build migrates its own database first.
