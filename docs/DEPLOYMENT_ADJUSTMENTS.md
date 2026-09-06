# DEPLOYMENT.md — adjustments needed after the 2026-09-06 redeploy

This is a review of `docs/DEPLOYMENT.md` against what's actually deployed right
now, following: deleting every old Vercel project (`web`, `sport-hub`,
`sport-hub-qvw6`) and Render resource (`sporthub-api`, `sporthub-reverb`,
`sporthub-db`), and recreating everything under the `sporthub-binangonan` name.
This file only lists what to change — no edits have been made to
`DEPLOYMENT.md` itself yet.

## 1. Section 9 header and "Current live services" line — outdated names/URLs

**Says:** `sporthub-api`, `sporthub-reverb`, `sporthub-db`, with
`sporthub-api-g6rq.onrender.com` as the worked example of the random-suffix
gotcha.

**Actually deployed now:**
| Resource | Name | URL |
|---|---|---|
| Render web service (Laravel) | `sporthub-binangonan` | `https://sporthub-binangonan.onrender.com` |
| Render web service (Reverb) | `sporthub-binangonan-reverb` | `https://sporthub-binangonan-reverb.onrender.com` |
| Render Postgres | `sporthub-binangonan-db` | internal only, database name auto-suffixed to `sporthub_qulj` |
| Vercel project | `sporthub-binangonan` | `https://sporthub-binangonan.vercel.app` |

**Adjustment:** replace every occurrence of the old names/URLs with the above.
Also note: this time *neither* service hit the random-suffix gotcha — both got
their clean requested name. Keep the gotcha paragraph (it's still a real risk
next time), but swap the stale worked example for a note that it didn't
recur this round, so the next person doesn't assume it always happens.

## 2. Section 9 — provisioning method was API calls, not the CLI

**Says:** "Provisioned via the Render CLI (`render services create`, `render
postgres create`)".

**Actually happened:** no CLI was used at all (none was installed in the
agent environment) — everything was done with direct `curl` calls to
`api.render.com/v1/...` and `api.vercel.com/...` using each platform's
personal API token as a Bearer token. This is worth documenting as a fully
alternative, CLI-free path since it's what actually got used:

- Vercel project: `POST /v11/projects` with a `gitRepository: {type: github,
  repo: "owner/SportHub"}` block — this links the project to the GitHub repo
  the same way the dashboard's "Import" flow does.
- Vercel env vars: `POST /v10/projects/{id}/env` (accepts an array, so all
  vars can be created in one call).
- Vercel deploy: `POST /v13/deployments` with a `gitSource: {type: github,
  org, repo, ref: "main"}` block — this builds directly from the GitHub repo
  server-side; no local `vercel deploy` build-and-upload needed at all.
- Render Postgres: `POST /v1/postgres` — **note it now requires an explicit
  `"version"` field** ("16" was used); omitting it 400s with `"version is
  required"`, which section 1/9 doesn't currently mention.
- Render services: `POST /v1/services` with `type: web_service`,
  `serviceDetails.env: docker`, and the same `dockerfilePath`/`dockerContext`/
  `dockerCommand`/`preDeployCommand` fields `render.yaml` already documents.
- Render env var fixes after creation: `PUT
  /v1/services/{id}/env-vars/{key}` — already documented in section 9,
  confirmed still correct.

## 3. New gotcha: `fromDatabase` env var linking doesn't work via the REST API

`render.yaml`'s Blueprint syntax lets an env var read
`fromDatabase: {name, property}` instead of a literal value. Tried the same
shape in a direct `POST /v1/services` payload — Render's API rejected it with
`"missing environment variable value"`. **This is a Blueprint-only YAML
feature; the plain REST API always requires a literal `value` for every env
var**, including `DB_HOST`/`DB_PORT`/`DB_DATABASE`/`DB_USERNAME`/
`DB_PASSWORD`. Worth adding as an explicit warning next to the CLI/API
provisioning notes above, since it's not obvious from `render.yaml`'s own
comments that this only works through a Blueprint apply.

## 4. New gotcha: the database's own external connection is blocked by default

A freshly created Render Postgres instance doesn't accept external
connections until an IP is added to its own Networking allow list — separate
from any web service's IP allow list. Rather than opening it to
`0.0.0.0/0` (which an automated agent should not do unilaterally — this one
correctly refused to), the **Internal Database URL** was used instead, which
works with no allow-list changes at all as long as whatever is connecting
lives inside Render's own network. This is exactly the case for the web
services themselves, so this was a non-issue for the actual deployment — it
only mattered because the agent doing this work also needed to determine
that the fastest path forward was creating the web service first (using the
internal URL) rather than trying to reach the database directly from outside
Render.

## 5. Section 4 ("First-time database setup") is out of date — describes a
mechanism this deployment doesn't have

**Says:** run seeders manually via "Railway dashboard → service → the
three-dot menu → 'Run Command'" (or `railway run` locally).

**Reality on Render's free plan:** there is no equivalent one-off command
runner — `render jobs create` explicitly returns "new paid services not
allowed" on the free tier (this is already noted as a comment in
`api/docker/entrypoint.sh`, just not reflected in this doc). The actual
supported mechanism, already built into `entrypoint.sh`, is two opt-in boot
flags read at container startup:

- `SEED_ON_BOOT=true` → runs `php artisan db:seed --force` (the full
  `DatabaseSeeder`: roles, the 7 demo accounts, sports, venues, sample
  tournaments, and newsfeed posts) once, then should be unset again so
  ordinary restarts don't re-seed.
- `RESET_ON_BOOT=true` → runs `php artisan system:reset-keep-accounts
  --force` (wipes everything except accounts/roles/sports back to fresh),
  same one-shot-then-unset pattern.

Both are set via `PUT /v1/services/{id}/env-vars/{key}`, which triggers a new
deploy the same as any other env var change; no dashboard "Run Command" step
exists to reach for. **Section 4 should be rewritten around this**, not the
Railway-era manual-run instructions.

## 6. Section 9's closing note needs a refreshed, dated entry

The existing closing paragraph ("Demo/seed accounts... were deliberately
included in this deployment on explicit request...") describes the *previous*
deployment. This redeploy did the same thing again, explicitly requested
("seed the users account like in the local deployment"), via `SEED_ON_BOOT`
as described above — worth its own dated entry rather than editing the old
one, so the doc keeps an honest history of each time this deviation from
§8's "never reuse demo accounts in production" guidance was made.

## 7. New, unrelated bug this redeploy caught: `tsc -b` vs. `tsc --noEmit`

Not a deployment-process issue, but surfaced *by* doing a real deploy:
`web/src/pages/LandingPage.tsx` had `icon: () => JSX.Element` using the bare
global `JSX` namespace. `tsc --noEmit` (what this project's own contributors
had been running all along to "typecheck") never flagged it, but `npm run
build`'s actual `tsc -b` step failed on it in Vercel's build log. Fixed by
switching to the already-imported `ReactNode` instead. This is the *second*
time this exact category of bug has hit this project (see the git history
entry "Fix production build failures caught by tsc -b, not tsc --noEmit").

**Adjustment, not to DEPLOYMENT.md but as a process note worth adding
somewhere central (e.g. `CLAUDE.md` or the top of `DEPLOYMENT.md` itself):**
`npx tsc --noEmit` is not sufficient to confirm a frontend change is
deploy-safe — always also run the real `npm run build` (or at least
`npx tsc -b`) before considering frontend work verified, since the two can
disagree.

## 8. Section 5 (Vercel) could mention the team/org detail

The Vercel account here is a **team** (`sports-hub-system`), not a personal
account — every API call needs `?teamId=team_...` and every dashboard import
needs the right team selected. Worth a one-line callout, since forgetting
`teamId` on an API call is a silent "works for personal projects, 404s for
team ones" trap.
