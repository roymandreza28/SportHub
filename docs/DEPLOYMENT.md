# Deployment runbook

Target topology (per the original architecture plan): React/Vite on Vercel,
Laravel API + Reverb on Railway, Postgres on Railway. Custom domains on both
sides are **required**, not optional — Sanctum's SPA cookie auth cannot work
across two unrelated third-party domains like `*.vercel.app` and
`*.railway.app` (browsers treat them as fully cross-site, and cookies set
under one are never sent to the other regardless of CORS config).

This doc assumes the domain `sporthub.com` as an example; substitute your own.

## 0. Prerequisites

- A Railway account with billing enabled (Postgres + two always-on services
  exceed the free tier)
- A Vercel account
- A domain you control, with access to add DNS records
- `RAILWAY_TOKEN`: Railway dashboard → Project Settings → Tokens → create a
  project token, then add it as a GitHub Actions secret
  (`Settings → Secrets and variables → Actions → New repository secret`)

## 1. Railway: Postgres

1. New Project → Add a service → Database → PostgreSQL.
2. Note the plugin's reference name (default `Postgres`) — the other two
   services will read its connection details via Railway's reference
   variables (`${{Postgres.PGHOST}}` etc.) rather than copying literal values.

## 2. Railway: the `web` service (Laravel + nginx)

1. New service → GitHub Repo → select this repo.
2. Settings → Root Directory: `api`.
3. Settings → Config-as-code → Config File Path: `railway.web.json` (this
   repo's `api/railway.web.json` — Railway resolves it relative to Root
   Directory). This file sets the Dockerfile build, the `/up` healthcheck,
   and a `preDeployCommand` that runs `php artisan migrate --force` before
   every deploy — migrations always run exactly once per deploy, before the
   new version receives traffic.
4. Variables tab: copy every key from `api/.env.production.example`. For the
   `DB_*` keys, use Railway's reference variables instead of literal values:
   `DB_HOST=${{Postgres.PGHOST}}`, `DB_PORT=${{Postgres.PGPORT}}`,
   `DB_DATABASE=${{Postgres.PGDATABASE}}`, `DB_USERNAME=${{Postgres.PGUSER}}`,
   `DB_PASSWORD=${{Postgres.PGPASSWORD}}`.
5. Generate `APP_KEY` once, locally: `php artisan key:generate --show`. Paste
   the same value into both this service and the `reverb` service below —
   they must share it (it's what makes encrypted cookies/sessions valid
   across both).
6. Settings → Networking → Generate Domain (temporary `*.railway.app` URL for
   verifying the deploy), then add a Custom Domain (`api.sporthub.com`) once
   you're ready to go live, and create the CNAME record it gives you at your
   DNS provider.

## 3. Railway: the `reverb` service (WebSocket server)

1. New service → same GitHub repo again.
2. Settings → Root Directory: `api`.
3. Settings → Config-as-code → Config File Path: `railway.reverb.json`. This
   overrides the container's start command to
   `php artisan reverb:start --host=0.0.0.0 --port=$PORT` instead of the
   Dockerfile's default (nginx + php-fpm) — same image, different process.
   It intentionally has no `preDeployCommand`; only the `web` service should
   run migrations.
4. Variables tab: same as the `web` service (same `APP_KEY`, same `DB_*`,
   same `REVERB_*`). This service needs the DB connection too — matchmaking
   and channel authorization touch the database from within Reverb's own
   auth callbacks.
5. Custom Domain: `ws.sporthub.com`, TLS on (Railway terminates it at the
   edge — this is exactly what `trustProxies(at: '*')` in
   `bootstrap/app.php` accounts for).

## 4. First-time database setup

Run once, after the `web` service's first successful deploy (Railway
dashboard → service → the three-dot menu → "Run Command", or `railway run`
locally with the service linked):

```
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=SportsSeeder --force
```

**Do not run the plain `php artisan db:seed`** — `DatabaseSeeder` also creates
demo accounts for every role with a hardcoded password (`password`) and fake
sample venues/tournaments, meant only for local dev and the Playwright/Pest
suites. Create the real first admin account interactively instead:

```
php artisan tinker
>>> $u = App\Models\User::create(['name' => '...', 'email' => '...', 'password' => bcrypt('...')]);
>>> $u->assignRole('admin');
```

## 5. Vercel: the web app

1. Import the GitHub repo as a new Vercel project.
2. Root Directory: `web`. Vercel will pick up `web/vercel.json`
   (`framework: vite`, and a catch-all rewrite to `index.html` so
   client-side routes like `/player` or `/organizer` don't 404 on refresh).
3. Environment Variables (Production scope): copy every key from
   `web/.env.production.example`.
4. Settings → Domains → add `app.sporthub.com`, create the DNS record it
   gives you.
5. Vercel's own GitHub integration deploys automatically on push to `main`
   (preview deployments on PRs) — no custom GitHub Actions step needed for
   this side, unlike the API.

## 6. CI/CD wiring already in the repo

- `.github/workflows/ci.yml` — runs the Pest suite (against a Postgres
  service container) and the Vitest suite + a production build on every PR
  and on push to `main`.
- `.github/workflows/deploy-api.yml` — triggers only after a CI run on `main`
  *succeeds* (`workflow_run` + `conclusion == 'success'`), then deploys both
  Railway services via the CLI (`railway up -s web`, `railway up -s reverb`)
  using the `RAILWAY_TOKEN` secret. A failing test suite can never reach a
  deploy.
- Playwright E2E is intentionally **not** in this CI gate — it needs a real
  Reverb connection and was flaky enough in this project's own local runs
  (see Milestone 10) that running it against ephemeral, cold CI containers
  isn't worth the noise. Run it manually against the Vercel preview URL +
  staging Railway environment before a UAT sign-off instead:
  `VITE_API_URL=<staging api url> npx playwright test` from `web/`, pointed
  at a `playwright.config.ts` `baseURL` override for the preview deployment.

## 7. Note: no queue worker

The original plan called for a queue worker "if using `ShouldBroadcast`
(queued) rather than `ShouldBroadcastNow`". Every broadcast event in this
codebase (`MatchEventCreated`, `MatchmakingPairFound`, `BracketUpdated`,
etc.) implements `ShouldBroadcastNow`, which broadcasts synchronously inline
— there's no queued job here to work off, so `QUEUE_CONNECTION=sync` and no
third Railway service is needed. If a future feature adds a genuinely
queued job, add a `railway.worker.json` following the same pattern as
`railway.reverb.json`, with `startCommand: "php artisan queue:work"`.

## 8. UAT pilot

Once both sides are live on their custom domains:

1. Smoke-test the golden path per role manually against production
   (register → role-appropriate dashboard → one core action per role).
2. Create real accounts for the pilot organizers/facilitators (never reuse
   the seeded `*@sporthub.test` demo accounts — those exist for local/test
   only and should not exist in the production database at all).
3. Collect feedback against the module list in the original architecture
   plan; anything that comes back gets its own follow-up milestone rather
   than a rushed hotfix.
