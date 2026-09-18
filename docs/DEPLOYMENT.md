# Deployment runbook

Target topology (per the original architecture plan): React/Vite on Vercel,
Laravel API + Reverb on Railway, Postgres on Railway. Sections 1-5 below
describe that Railway path and originally required custom domains on both
sides for Sanctum's cookie-based SPA auth to work cross-domain.

**That auth constraint no longer applies.** Auth was switched to Bearer
tokens (Sanctum personal access tokens) specifically so a custom domain
isn't required — see `api/.env.production.example` and
`AuthController::login()`/`register()`/`logout()`. The frontend stores the
token from login and sends it as an `Authorization` header on every request
(including WebSocket channel auth, via `routes/channels.php` forcing
`Broadcast::routes()` onto the `auth:sanctum` guard), so it works identically
whether the frontend and API share a domain or not. `SANCTUM_STATEFUL_DOMAINS`
and `SESSION_DOMAIN` should stay **unset** in production — setting either one
switches Laravel back to expecting cookie/CSRF handling the frontend no
longer does, which breaks login (419), not helps it.

**Section 9 below documents the actual deployed path**: Render (free,
no-card-required tier) instead of Railway, since Railway's free trial
expires after $5 of usage. Sections 1-8 are kept for the Railway path this
repo is also pre-configured for (`api/railway.web.json`,
`api/railway.reverb.json`) in case cost stops being a constraint later.

This doc assumes the domain `sporthub.com` as an example in sections 1-8;
substitute your own. Section 9 uses Render's default `*.onrender.com` URLs
directly since no domain is required for the token-auth setup.

**Process note:** `npx tsc --noEmit` is not sufficient to confirm a frontend
change is deploy-safe — `npm run build`'s real `tsc -b` step catches strictly
more (different narrowing-into-closures behavior, a different effective
tsconfig for test files) and has caught production-only build failures
`tsc --noEmit` missed at least twice in this project's history. Always run
the real `npm run build` (or at least `npx tsc -b`) before considering
frontend work deploy-safe.

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

On Railway, run once after the `web` service's first successful deploy
(Railway dashboard → service → the three-dot menu → "Run Command", or
`railway run` locally with the service linked):

```
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=SportsSeeder --force
```

**On Render's free plan there is no equivalent one-off command runner** —
`render jobs create` explicitly returns "new paid services not allowed" on
the free tier. The supported mechanism instead, already built into
`api/docker/entrypoint.sh`, is a set of opt-in boot flags read at container
startup — set one via `PUT /v1/services/{id}/env-vars/{key}` (which triggers
a new deploy, same as any other env var change), let it run once, then unset
it again so ordinary restarts don't repeat it:

- `SEED_ON_BOOT=true` → runs `php artisan db:seed --force` (the full
  `DatabaseSeeder`: roles, the 7 demo accounts, sports, venues, sample
  tournaments, and newsfeed posts).
- `SEED_ROLES_ON_BOOT=true` → runs just `RolesAndPermissionsSeeder` +
  `SportsSeeder` — the Render equivalent of the two Railway commands above,
  for a real (non-demo) launch.
- `RESET_ON_BOOT=true` → runs `php artisan system:reset-keep-accounts
  --force` (wipes everything except accounts/roles/sports back to fresh).
- `RESET_TOURNAMENTS_ON_BOOT=true` → runs `php artisan
  system:reset-tournaments-and-newsfeed --force` (narrower reset — leaves
  venues/accounts/sports/sport_formats intact).

**Do not use `SEED_ON_BOOT`/the plain `php artisan db:seed` for a real
launch** — `DatabaseSeeder` also creates demo accounts for every role with a
hardcoded password (`password`) and fake sample venues/tournaments, meant
only for local dev, the Playwright/Pest suites, or a deliberate temporary
demo deployment (see the dated entries at the end of this doc). Create the
real first admin account interactively instead, either via `railway run`/an
SSH-capable shell, or as its own one-shot boot-flag-triggered artisan
command:

```
php artisan tinker
>>> $u = App\Models\User::create(['name' => '...', 'email' => '...', 'password' => bcrypt('...')]);
>>> $u->assignRole('admin');
```

## 4a. Database backup and recovery

Neither Railway's nor Render's **free** Postgres plan includes managed
backups or point-in-time recovery — Render's free database is deleted
outright 90 days after creation unless upgraded or recreated, with no
snapshot to restore from. Back up manually with `pg_dump` on a schedule you
control (e.g. a monthly reminder, or before any risky migration/reset-flag
deploy):

1. Get a connection string: Render dashboard → the Postgres instance →
   "Connect" tab. Use the **External Database URL** for a backup run from
   your own machine (the Internal URL, used by the web/reverb services
   themselves, only resolves inside Render's network — see the "external
   connection blocked by default" gotcha in section 9). Render's free
   Postgres has no IP allow-list restriction on the external URL by default,
   unlike some paid-tier setups.
2. Dump the database:
   ```
   pg_dump "<External Database URL>" --format=custom --file=sporthub-backup-$(date +%Y%m%d).dump
   ```
   `--format=custom` (not plain SQL) so the dump can be restored selectively
   and is compressed automatically. Store the file somewhere durable outside
   Render itself (it's the whole point of a backup) — a private cloud bucket
   or encrypted local storage, not another file on the same free-tier host.
3. Restore into a fresh/empty database with `pg_restore`:
   ```
   pg_restore --clean --if-exists --no-owner --dbname="<target Database URL>" sporthub-backup-20260101.dump
   ```
   `--no-owner` matters when restoring into a different Render Postgres
   instance than the one the dump came from — the role names won't match,
   and `--no-owner` skips the `ALTER OWNER` statements that would otherwise
   fail.
4. Sanity-check a restore before trusting it: `php artisan migrate:status`
   should show every migration as `Ran`, and `php artisan tinker` →
   `App\Models\User::count()` should match the expected row count.

For a quicker, lower-fidelity safety net between real backups, `php artisan
db:seed` (or the `SEED_ON_BOOT`/`RESET_ON_BOOT` flags above) can always
regenerate a fully working *demo* database from scratch in seconds — that's
not a substitute for backing up real user data, but it does mean a broken
demo/staging environment is never more than one redeploy away from a clean
slate.

## 5. Vercel: the web app

1. Import the GitHub repo as a new Vercel project.
2. Root Directory: `web`. Vercel will pick up `web/vercel.json`
   (`framework: vite`, and a catch-all rewrite to `index.html` so
   client-side routes like `/player` or `/organizer` don't 404 on refresh).
3. Environment Variables (Production scope): copy every key from
   `web/.env.production.example`.
4. Settings → Domains → add `app.sporthub.com`, create the DNS record it
   gives you.
5. If the Vercel account is a **team** (not a personal account) — check the
   URL bar for `vercel.com/<team-slug>/...` — every API call needs
   `?teamId=team_...` appended and every dashboard import needs the right
   team selected first. Forgetting `teamId` on an API call is a silent
   "works for personal projects, 404s for team ones" trap.
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

## 9. What's actually deployed: Render + Vercel (no custom domain)

Chosen over Railway specifically because Railway's free trial is $5 of
one-time credit, not an ongoing free tier — Render's free web services and
free Postgres don't require a card. The tradeoff, accepted for this
deployment: free web services sleep after 15 minutes idle (~1 min cold
start on the next request, which also drops any open Reverb/WebSocket
connections), and the free Postgres database is deleted 90 days after
creation unless upgraded or recreated.

As of this writing, the Render CLI only supports `render blueprints
validate`, not actually deploying a Blueprint — so every resource below was
provisioned with direct `curl` calls to the REST API
(`api.render.com/v1/...`) and Vercel's API (`api.vercel.com/...`), each
using that platform's personal API token as a Bearer token, rather than the
CLI or a dashboard click-through:

- Vercel project: `POST /v11/projects` with a `gitRepository: {type: github,
  repo: "owner/SportHub"}` block — links the project to the GitHub repo the
  same way the dashboard's "Import" flow does.
- Vercel env vars: `POST /v10/projects/{id}/env` (accepts an array, so every
  var can be created in one call).
- Vercel deploy: `POST /v13/deployments` with a `gitSource: {type: github,
  org, repo, ref: "main"}` block — builds directly from the GitHub repo
  server-side; no local `vercel deploy` build-and-upload needed.
- Render Postgres: `POST /v1/postgres` — **requires an explicit `"version"`
  field** ("16" was used); omitting it 400s with `"version is required"`.
- Render services: `POST /v1/services` with `type: web_service`,
  `serviceDetails.env: docker`, and the same `dockerfilePath`/
  `dockerContext`/`dockerCommand`/`preDeployCommand` fields `render.yaml`
  already documents.
- `dockerCommand` (the Reverb service's override of the image's default
  CMD) specifically needs `PATCH /v1/services/{id}` with
  `{"serviceDetails":{"envSpecificDetails":{"dockerCommand":"..."}}}` — the
  CLI's `render services update --start-command` explicitly rejects
  Docker-runtime services ("only supported for native runtimes").
- Individual env var fixes after creation (e.g. `APP_URL`, `REVERB_HOST`,
  once each service's real Render-assigned URL was known) — `PUT
  /v1/services/{id}/env-vars/{key}` with `{"value":"..."}`.

**Gotcha: `fromDatabase` env var linking doesn't work via the REST API.**
`render.yaml`'s Blueprint syntax lets an env var read
`fromDatabase: {name, property}` instead of a literal value — the same shape
in a direct `POST /v1/services` payload gets rejected with `"missing
environment variable value"`. This is a Blueprint-only YAML feature; the
plain REST API always requires a literal `value` for every env var,
including `DB_HOST`/`DB_PORT`/`DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD`.

**Gotcha: a freshly created database doesn't accept external connections by
default.** Its Networking allow list starts empty — separate from any web
service's own allow list. Rather than opening it to `0.0.0.0/0`, use the
**Internal Database URL** instead (works with no allow-list changes at all
for anything running inside Render's own network, which covers the web/
reverb services themselves); reach for the External Database URL only for
something genuinely external, like the manual `pg_dump` backup procedure in
section 4a.

**Gotcha hit during setup**: Render auto-assigns each service's public URL
as `<name>.onrender.com`, *unless* that exact name is already taken/reserved
elsewhere on Render, in which case it silently appends a random suffix. This
isn't knowable ahead of creation — check each service's actual assigned URL
after creating it, not before, and fix any env var that referenced the
predicted-but-wrong URL (`APP_URL`, `REVERB_HOST`) via the `env-vars/{key}`
PUT above.

**Also hit**: running the CLI from Git Bash on Windows — any argument
starting with `/` (like `--health-check-path /up`) gets silently mangled
into a Windows path by MSYS's automatic path conversion. Prefix the command
with `MSYS_NO_PATHCONV=1` when passing path-like arguments.

**The big one**: Render's free plan doesn't run `preDeployCommand` at all —
the build log shows `Predeploy command not run. Commands can only run on
paid instance types` and deploys anyway, so this fails silently rather than
blocking the deploy. Migrations never ran on the first live deploy, so every
DB-touching request 500'd against an unmigrated schema. Fixed by moving
`php artisan migrate --force` into `docker/entrypoint.sh`, gated to only the
web service's own default CMD (`if [ "$1" = "supervisord" ]`) so the reverb
service sharing the same image never races it. `preDeployCommand` is still
set in the service config/`render.yaml` too — harmless no-op on free, and
becomes the cleaner pre-traffic-switch path automatically on a paid plan.

Two unrelated pre-existing bugs surfaced by actually curling the live
deploy, fixed in the same pass: `docker/nginx.conf.template`'s `/up` health
check served raw unexecuted PHP source instead of running it (`try_files`'s
first candidate was a literal `/index.php` path, which — since it exists as
a real file — nginx serves as-is via the current location's config instead
of falling through to the fastcgi-handling location block; fixed to check
`$uri` first like the main `/` block does, which correctly falls through
since `/up` never exists as a file); and the Dockerfile's `apk del
libzip-dev` after installing the `zip` PHP extension also removed the
runtime `libzip.so.5` the compiled extension needs, throwing a PHP startup
warning on every request. Removed `zip`/`libzip-dev` entirely — nothing in
the app uses `ZipArchive`.

Current live services, as of the 2026-09-06 redeploy (everything was deleted
and recreated under a new name that round — see the dated entry below for
why):

| Resource | Name | URL |
|---|---|---|
| Render web service (Laravel) | `sporthub-binangonan` | `https://sporthub-binangonan.onrender.com` |
| Render web service (Reverb) | `sporthub-binangonan-reverb` | `https://sporthub-binangonan-reverb.onrender.com` |
| Render Postgres | `sporthub-binangonan-db` | internal only, database name auto-suffixed to `sporthub_qulj` |
| Vercel project | `sporthub-binangonan` | `https://sporthub-binangonan.vercel.app` |

Neither service hit the random-suffix gotcha this round — both got their
clean requested name. It's still a real risk next time (see the gotcha
above), it just didn't recur here.

`render.yaml` at the repo root documents the intended shape as
infrastructure-as-code, though — per the CLI gap above — the actual services
were provisioned imperatively rather than via a Blueprint apply.

**2026-09-06 — full recreate under `sporthub-binangonan`.** Every prior
Vercel project (`web`, `sport-hub`, `sport-hub-qvw6`) and Render resource
(`sporthub-api`, `sporthub-reverb`, `sporthub-db`) was deleted and recreated
from scratch under the `sporthub-binangonan` name (see the table above).
Demo/seed accounts (`DatabaseSeeder`, all `*@sporthub.test` / `password`)
were deliberately re-seeded into this deployment on explicit request
("seed the users account like in the local deployment"), via the
`SEED_ON_BOOT` boot flag described in section 4. This is the same deviation
from §8's "never reuse demo accounts in production" guidance as the entry
below, made knowingly for a second time — revisit before treating this as a
real public launch.

**Earlier deployment.** Demo/seed accounts were also deliberately included
in the original deployment on explicit request, as a temporary/demo setup
rather than a real public launch — the first instance of the same
knowing deviation from §8's guidance.
