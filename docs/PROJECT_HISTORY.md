# SportHub — Project History & Handoff Notes

This document exists so a different AI coding tool (or a human) picking up
this repo cold can continue work without re-deriving decisions already made,
re-breaking bugs already fixed, or duplicating features that already exist.
It's a snapshot as of **2026-08-20**. GitHub's `main` branch was squashed to
a single commit on explicit request (see §6) — this file is what replaces
that lost commit-message trail as far as *why* things are the way they are.

## 1. What this is

SportHub is a municipal sports platform (originally scoped for Morong,
Rizal, Philippines; the target municipality was changed to Binangonan,
Rizal on 2026-09-03 — every seeded venue, tournament, and team name was
updated to reference real Binangonan facilities and barangays) —
tournament management, live scoreboards, venue booking, matchmaking, and
social features across six sports: Basketball, Volleyball, Badminton,
Pickleball, Tennis, Table Tennis.

The venue directory itself (17 venues, seeded by `VenueSeeder`) is sourced
from a client-supplied research dataset, not invented — see
`VenueSeeder`'s class doc comment for the coverage caveats (most Binangonan
venues don't publish a rate card anywhere, so most `price_per_hour` /
`opens_at` / `closes_at` fields are deliberately left null rather than
guessed at zero or 24-hour). The three venues `ExtendedTournamentsSeeder`
actually schedules demo tournaments at are BRCC (basketball, volleyball,
table tennis, and its own badminton courts), JBTC Binangonan Badminton and
Pickleball Courts (badminton + the only confirmed Pickleball venue in
town), and Eastridge Athletic Park (dedicated tennis court) — the other 14
barangay/commercial venues are real but only appear in the general venue
directory, not in any seeded tournament.

**Stack**: Laravel 12 + PostgreSQL (`api/`), React 19 + TypeScript + Tailwind
v4 (`web/`), Laravel Reverb for WebSockets. Deployed: Render (API + Reverb +
Postgres, free tier) and Vercel (frontend).

There is no native mobile app — "mobile" means the same React site running
in a phone browser. Device-level notifications (the OS notification
tray/lock screen, not just the in-app bell) are delivered via **Web Push**
(added 2026-09-03): `NotificationService::send()` now fires both the
existing Reverb broadcast and a Web Push send (`WebPushService`, wrapping
`minishlink/web-push`) to every device the user has subscribed
(`push_subscriptions` table). Opt-in is user-initiated from
`AccountSettingsModal` (`web/src/lib/pushNotifications.ts`) — browsers block
permission prompts not triggered by a click, so this is never requested
automatically except a silent re-subscribe on login for someone who already
granted permission (`PushNotificationsBootstrap`). Needs `VAPID_PUBLIC_KEY`
/ `VAPID_PRIVATE_KEY` set (generate via
`Minishlink\WebPush\VAPID::createVapidKeys()`) — without them
`WebPushService::sendToUser()` silently no-ops. **iOS caveat**: Safari only
grants push permission to a site added to the Home Screen first (an Apple
platform restriction) — `web/public/manifest.webmanifest` and the
`apple-mobile-web-app-capable` meta tag in `index.html` exist to make that
installable; `needsHomeScreenInstallOnIOS()` shows the install instructions
inline when relevant. Also fixed in the same pass: `/api/notifications` was
gated to `role:player|coach` even though organizer/venue_facilitator/admin
all receive notifications too (see `NotificationService::send()` call
sites) — moved to the unrestricted `auth:sanctum` group.

**Roles**: admin, organizer, venue_organizer, livestream_organizer,
venue_facilitator, coach, player — via Spatie `laravel-permission`.

## 2. Architecture conventions a new tool should know before touching code

- **Auth is Bearer-token (Sanctum personal access tokens), not
  cookie/session.** Deliberately switched so frontend and API don't need a
  shared domain. `SANCTUM_STATEFUL_DOMAINS`/`SESSION_DOMAIN` must stay
  **unset** in production — setting either breaks login (419).
- **No queue worker, no cron scheduler runs in production.** Every broadcast
  event uses `ShouldBroadcastNow` (synchronous), so `QUEUE_CONNECTION=sync`
  is correct, not a bug. Anything that "should" run on a schedule instead
  runs **opportunistically on read** — e.g. `BracketService::autoStartExpired()`
  fires from `TournamentController::index()`/`bracket()`, not a cron tick.
  Keep following this pattern for anything new that seems to want a
  scheduled job.
- **Team vs. individual matches are two parallel column sets on one table**:
  `GameMatch.participant_a_id`/`participant_b_id` (individual) vs.
  `participant_a_team_id`/`participant_b_team_id` (team) — exactly one pair
  is populated per match, `Team` category (`Sport.category === 'team'`) sports
  (Basketball, Volleyball) are always team-populated, racquet sports depend
  on singles vs. doubles registration.
- **Flexible-JSON-blob pattern for anything sport-specific**: rather than a
  rigid column per stat, sport-specific data lives in a `json` column plus a
  small static PHP config class mapping sport → field list. Three instances
  of this pattern now exist — follow it for a fourth rather than inventing a
  new shape:
  - `MatchStatSheet.data` + `api/app/Support/StatSheetFieldSets.php` (coach-filled box scores)
  - `MatchPlayerStat.stats` + `api/app/Support/PlayerStatFieldSets.php` (venue-organizer live scoreboard stats)
- **Frontend**: Tailwind v4 is CSS-first (`@theme` in `web/src/index.css`) —
  there is **no** `tailwind.config.js`. Shared style constants live in
  `web/src/lib/formStyles.ts` (`buttonPrimary`, `input`, `chip(active)`,
  etc.) — reuse these, don't invent ad hoc class strings.
- **Fullscreen API pattern**, identical across all 7 scoreboards and the
  stat-sheet modal: `containerRef` + a `fullscreenchange` listener comparing
  `document.fullscreenElement === containerRef.current`. Any nested
  modal/picker **must** be a DOM descendant of `containerRef`, not a
  sibling/portal — the Fullscreen API only renders the fullscreen element
  and its descendants.
- **`backdrop-filter` creates a new CSS containing block** for
  `position: fixed` descendants. Any fixed-position modal rendered inside a
  `backdrop-blur` ancestor (the app header) must `createPortal(...,
  document.body)` or it renders squeezed into the header's own box. Hit and
  fixed twice (`NewConversationModal.tsx`, `AccountSettingsModal.tsx`)
  before this became a known pattern.
- **`npx tsc --noEmit` from the repo root is not a reliable check.** The root
  `web/tsconfig.json` is references-only (points at `tsconfig.app.json`/
  `tsconfig.node.json`) and checks almost nothing on its own — real type
  errors (WebRTC type casts, unused vars, null-safety) sat undetected for
  most of this project's history because every verification pass used
  `--noEmit` instead of the actual build command. **Always verify with
  `npm run build` (`tsc -b && vite build`)**, the same command Vercel/CI run,
  not just `--noEmit`.

## 3. Feature build order (roughly chronological)

1. Team-aware tournament brackets — all 5 bracket formats (single/double
   elimination, round robin, group stage, swiss) support team mode;
   Basketball/Volleyball became team-tournament-only via `Sport.category`.
2. A long tail of UI polish: mobile nav reworked to `position: sticky` (
   **never** `fixed` — corrected once, don't reintroduce), header search
   collapses to icon-only on mobile, matchmaking history as click-to-expand,
   Player/Coach "Venues & Bookings" tabs merged with a custom pin+calendar
   icon, `UpcomingEventsStrip.tsx` generalized to serve both Player and Coach.
3. **Coach basketball stat sheet**: auto-popup modal ~10 minutes before a
   coach's team's scheduled match (client-side polling — no server push
   exists), fillable while the match is live, permanently locked once the
   venue organizer completes the match. Then **generalized to every sport**:
   Volleyball (roster mode, per-player rows), Badminton/Pickleball/Tennis/
   Table Tennis (summary mode, one aggregate row per participant — singles
   authorized via `TournamentRegistration.registered_by`, doubles via team
   captaincy). See `api/app/Support/StatSheetFieldSets.php` for the exact
   per-sport field lists.
4. **Demo seed data**: `ExtendedTournamentsSeeder` (8-team, 8-coach flagship
   basketball championship — deliberately pushed through the semifinals so
   it sits at the final; plus one tournament per lifecycle status) and
   `NewsfeedSeeder` (photo-backed news posts fetched live from LoremFlickr,
   tagged Filipino-themed, stored through the real `NewsMedia` pipeline).
5. **Player career-stats pentagon**: discovered the venue-organizer
   scoreboards' per-player stats (points, fouls, etc.) had only ever lived in
   `localStorage`, never reaching the backend. Built `match_player_stats` +
   `PlayerStatFieldSets.php` (5 axes per sport), extended all 7 scoreboards
   to track and sync those 5 stats per tap, added
   `ProfileController::statSummary()` (sums per sport, completed matches
   only), and a hand-rolled SVG radar chart (`PlayerStatsPentagon.tsx` — no
   charting library in this codebase, intentionally).
6. Deployment pass (see §5) and a GitHub history squash (see §6).

## 4. Known bugs already fixed — don't reintroduce these

| Bug | Root cause | Fix |
|---|---|---|
| Modal squeezed into header instead of centered | `backdrop-filter` on an ancestor creates a containing block for `position: fixed` | `createPortal(..., document.body)` |
| Bracket crash on empty `structure` | `TournamentWizard.tsx` allowed generating a bracket with 0 registrants | Guard + wrapped generation in `DB::transaction()` |
| News/uploaded files 404 in production | `storage:link` never ran anywhere in the Docker/Render pipeline | Added to `docker/entrypoint.sh`, gated to the web service's boot |
| Same files still 404 after the above | nginx workers dropped to Alpine's default `nginx` user, but every file is created by root (php-fpm/artisan, no `USER` directive in the Dockerfile) — permission mismatch | `user root;` added to `docker/nginx.conf.template` |
| Production build silently broken | `tsc --noEmit` (used for every verification this whole project) doesn't check anything meaningful against a references-only root config | Real errors only surface via `npm run build`; 4 WebRTC type casts + 2 unused-var/null-safety issues fixed once actually caught |
| Render's `preDeployCommand: php artisan migrate --force` never runs | Free plan silently no-ops predeploy commands | Migration also runs in `docker/entrypoint.sh`, gated to the web service |
| Render Jobs API rejects one-off commands | `"new paid services not allowed"` — Jobs API is paid-tier only | `SEED_ON_BOOT` env-var-gated hook in `entrypoint.sh` — set the var + redeploy to reseed, then unset it |

## 5. Deployment reference

- **Render** (free tier, region `oregon`): `sporthub-api`
  (`srv-da18j0m1egvs73a7gap0`), `sporthub-reverb`
  (`srv-da18jfdbedkc73capjjg`), `sporthub-db`
  (`dpg-da18ide7bikc738jltlg-a`). Both web services share one Docker image
  (`api/Dockerfile`) — `sporthub-reverb` overrides the start command to
  `php artisan reverb:start`.
  - Live URLs: `https://sporthub-api-g6rq.onrender.com`,
    `https://sporthub-reverb.onrender.com`.
  - Free-tier caveats: services sleep after 15 min idle (~1 min cold start,
    drops WebSocket connections); free Postgres is deleted 90 days after
    creation unless upgraded; **no persistent disk** — anything written to
    local storage (news photos, avatars) is lost on the next redeploy or
    sleep cycle, since each gets a fresh ephemeral container.
  - To resume if suspended: `POST /v1/services/{id}/resume` and
    `POST /v1/postgres/{id}/resume` via the Render REST API
    (`Authorization: Bearer <RENDER_API_KEY>`), then trigger an explicit
    `POST /v1/services/{id}/deploys` — a bare `/resume` does **not**
    reliably pick up env var changes; only a real deploy does.
  - To reseed demo data remotely: `PUT
    /v1/services/{id}/env-vars/SEED_ON_BOOT` `{"value":"true"}`, trigger a
    deploy, wait for it to go `live`, then set it back to `"false"` (leaving
    it true reseeds — and re-fetches every news photo — on every future
    boot, which is slow and pointless once done).
- **Vercel**: project `prj_PA8POhBXN7jdKAfQhOvIQ9xnLPaE`, team
  `team_lCZ14jHCzhCVbWA9nbAuJ9H7`, live at
  `https://web-psi-red-58.vercel.app`. **Not connected via Vercel's GitHub
  integration** (checked directly — no `link` in the project config) despite
  `docs/DEPLOYMENT.md` describing that as the intended setup — pushes to
  `main` do **not** auto-deploy. Deploy manually from `web/`:
  `npx vercel deploy --prod --token <VERCEL_TOKEN>` (no global install
  needed). Root cause of the frontend being ~35 commits stale was exactly
  this — nobody had re-run that command in a long time.
- **Demo accounts**: every seeded account uses password `password`. Full
  current list exportable via `GET /api/admin/users` (admin-only, paginated
  20/page) — already pulled into `SportHub_Accounts.xlsx` once, regenerate
  if the seed changes.
- Full step-by-step (including the original Railway-path option) is in
  `docs/DEPLOYMENT.md` §9 — that file's "what's actually deployed" section
  and this document should be read together, not as duplicates.

## 6. Git history note

On explicit request, `origin/main` on GitHub was squashed from ~58 commits
down to a single commit (twice now — once after the pentagon feature, again
after the frontend build fix). **Local `main` still has the full,
un-squashed history** (58+ commits with real messages), plus an annotated
tag `pre-squash-backup-20260820` pointing at the pre-squash tip, as a safety
net. Because of this, local `main` and `origin/main` have **unrelated
histories** — a plain `git push` will fail; pushing anything new to GitHub
now requires either repeating the orphan-branch-squash dance or accepting
`--force` with the real history restored. If a future AI tool tries a normal
`git push` and it fails with "unrelated histories," this is why — check with
the user before force-pushing either direction.

## 7. Deferred / explicitly not built yet

- **Volleyball and racquet-sport *image-based* stat sheets.** The user's
  original ask mentioned sending reference images for volleyball and a
  racquet sport "later" — what got built instead (and *is* live) is a fully
  generalized *text/table* stat sheet covering all 6 sports
  (`StatSheetFieldSets.php`). If the user sends those images, they likely
  want a visually different presentation for those specific sports, not new
  functionality — check whether that's still wanted before assuming the
  existing generalized version already satisfies it.
- **Persistent file storage.** Local disk only; doesn't survive Render
  redeploys (see §5 caveats). Would need Cloudflare R2/S3-compatible storage
  (Laravel's `Storage` facade already abstracts this — swapping the `public`
  disk driver is the shape of the fix) if photo/avatar persistence across
  deploys becomes a real requirement rather than a demo-acceptable gap.
- **Ladder Challenge** (volleyball ranking system) — noted in earlier
  project memory as deliberately deferred, needs its own data model. Not
  started.
- Frontend bundle size warning (`dist/assets/index-*.js` ~1.2 MB) flagged by
  Vite at build time, not yet addressed — candidate for code-splitting via
  dynamic `import()` if load performance ever becomes a complaint.

## 8. Where else to look

- `docs/DEPLOYMENT.md` — the deployment runbook (read alongside §5-6 above).
- `render.yaml` — documents the intended Render topology as
  infrastructure-as-code; the actual services were provisioned imperatively
  (see that file's own header comment for why).
- `api/app/Support/*.php` — the sport-specific config classes
  (`StatSheetFieldSets`, `PlayerStatFieldSets`) are the single source of
  truth for per-sport fields; frontend components consume them from the API
  response rather than hardcoding a parallel copy. Follow this pattern for
  any new per-sport data.
