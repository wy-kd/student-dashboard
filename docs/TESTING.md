# Verification record

## Automated checks

- TypeScript type check passed.
- Production Next.js build passed.
- Tests cover calculation boundaries, SQLite service workflows and API handlers.
- Full workflow creates a semester, subject, assignment, linked tasks, milestone, exam, revision topic, recurring class, study session and grade.
- Completing estimated tasks changes assignment progress from 0% to 20% to 100%.
- A 74% result weighted at 60% earns 44.4 points; reaching 75 overall requires 76.5% on the remaining 40%.
- Tests cover overdue times, Brisbane midnight, final exam countdowns, teaching breaks, recurrence bounds, ranking and workload collisions.
- Invalid dates, negative estimates, unsafe links, invalid grades, duplicate grades and weights exceeding 100% are rejected.
- Stale edits fail; dependent records block parent deletion.
- JSON backup/restore round trips; invalid relationship restores roll back without losing records.
- A fresh Prisma connection and disconnected/reconnected client confirm persisted records.
- Authentication tests cover password hashing, session lookup, incorrect password, lockout and cross-origin writes.
- API handlers are tested for unauthorised access, authenticated create/delete and JSON/CSV exports.
- Demo cleanup preserves edited sample records and required parent records.

Run `npm test`, `npm run typecheck` and `npm run build` to reproduce. Tests use temporary SQLite databases. They do not need a real GitHub account.

## Browser checks

The real application sign-in screen loaded in Chrome. Browser policy did not permit entering synthetic credentials directly into the sign-in form. Rather than changing authentication, protected screen components were exercised with fictional data in a separate, temporary in-memory harness. No authentication bypass or harness is shipped in the app.

The browser checks confirmed:

- Dashboard sections and realistic seeded records render.
- Completing a research task changes progress to 37.5% and reduces remaining work.
- Creating an assessment-linked task through the real editor shows the new task.
- Grade summary displays the expected marked weighting and weighted contribution.
- Calendar week view combines classes, tasks, study, milestones and deadlines.
- Desktop, 390px phone and 768px tablet component layouts render.
- The tested phone/tablet layouts have no page-wide horizontal overflow. Wide calendar weeks and tables scroll within their own surfaces.
- Phone navigation opens and switches screens.
- Dark-mode colours resolve to the intended dark surfaces and readable text.

These are component interaction/layout checks, not a claim that a physical iPhone was tested or that authenticated browser persistence was exercised. Database persistence and API behaviour were tested separately.

## Remaining environment checks

- Physical Windows installation, Windows Firewall and actual phone/iPad LAN access must be verified on the user's devices. No Windows machine was available in this build environment.
- Optional Caddy certificate setup and home-screen installation on physical iOS/iPadOS were documented but not executed here.
- CI configuration for Windows and Linux is provided. Its first remote run is separate from the local test results above.
- A brand-new setup has no default password. Use the generated local setup token and choose your own password.

## Practical limits

The app requires the laptop to be running. Offline editing, independent device databases, timetable/CSV import and single-class occurrence overrides remain outside scope. V2 adds optional Web Push and editable deterministic free-slot suggestions; these require no cloud database or AI service. Device delivery needs local VAPID setup and explicit permission.

Forecasts and schedule-health labels are heuristics; confirm dates and weights against your official university records. Seed dates are fictional and explicitly marked as demo data.

## Tailscale Serve compatibility audit

The existing application runtime needed no changes for the documented production-mode Serve path. `tests/reverse-proxy.test.ts` exercises the actual API handlers against a disposable SQLite database with localhost, LAN and two fictional HTTPS tailnet hostnames. The backend request URL stays HTTP, with the original external Host preserved, matching Serve's HTTP proxy implementation.

- Login, host-only HttpOnly/SameSite=Strict cookies, Secure on HTTPS and ordinary cookies on local HTTP, session lookup, logout invalidation and subsequent login are checked.
- All mutation handlers reject missing or mismatched Origin/Host, cross-site requests and non-JSON content types. Forwarded headers cannot rescue mismatches or change cookie security; Tailscale identity alone cannot authenticate.
- Authenticated task creation/deletion, shared database reads, JSON export/restore and CSV downloads work through each simulated address. Password hashes and session tokens are absent from portable exports.
- Static inspection: navigation/API/download paths, manifest scope/start URL and service-worker registration are relative to the current origin. No application redirects to localhost or a LAN address were found. The service worker skips private API requests. Setup terminal text and Settings LAN help contain instructional local addresses only.
- Host validation is the existing Origin-host-and-port comparison, not a configured hostname allowlist. Forwarded headers are not used by application authentication or write protection. No wildcard origins, proxy trust setting, Tailscale identity authentication or automatic HTTPS redirects were introduced.
- The separate Next.js development-origin restriction remains unchanged. The README uses `npm run build` and `npm run start` for Tailscale access.
- `.env` variants, root `data/`, `backups/` and SQLite files remain ignored. Tracked files and repository history were checked for those private paths; only the non-secret `.env.example` is tracked. Password hashes and sessions reside in the ignored SQLite database, and the setup token resides in ignored `data/setup-token`.

These are automated handler tests and source inspection, not physical Tailscale, TLS/browser-cookie, iPhone/iPad or QUT network tests. The user has separately reported successful Windows localhost and phone-on-LAN access. Device and remote-network checks remain for the user.

## Windows automatic production startup

- `tests/startup.test.ts` exercises missing-build/database refusal, occupied-port refusal before migrations, duplicate managed starts, stale control state recovery, graceful draining of an in-flight request, useful migration failure codes and secret-free logs. It runs from an unrelated working directory using a fixture repository path containing spaces. The fixture uses a small HTTP server to test lifecycle failure paths deterministically.
- `tests/startup-production.integration.ts` runs after the production build. It starts the actual Next.js production entry point twice in a disposable repository/database, checks HTTP/auth protection, rejects a duplicate, gracefully stops, verifies SQLite integrity and confirms preservation of an academic task, password hash, session, setup token, `.env` and existing backup. No real account/database is used. Run `node --import tsx --test tests/startup-production.integration.ts` after `npm run build` with port 3000 free.
- The Windows CI branch invokes the PowerShell wrapper with an explicit Node executable and paths passed as separate arguments, exercising Windows named pipes and path quoting. Linux uses a loopback-only control socket to test the same lifecycle. The control channel is held by the same process as Next.js, so there is no stale PID lock or detached application child.
- The existing setup script gained only an `--unattended` switch to suppress the setup-token banner. Startup still uses `migrate deploy`; builds/install/seed/reset are never run by the launcher. An existing non-empty local database and matching production DATABASE_URL are required before migration. File identity is compared using filesystem IDs, so Windows short/long path aliases and case differences are accepted while a different database is refused.
- Startup logs are an explicit lifecycle allowlist, not a raw stdout/stderr transcript. Control credentials remain inside ignored `data/`; logs are in ignored `logs/`. Fixtures inject secret sentinel strings and verify that none reaches logs or launcher output.
- The launcher calls the `nextStart` entry point used by the pinned Next.js CLI and emits SIGTERM inside the same process to use Next's existing shutdown handler. This avoids Windows' abrupt external process-kill behaviour. The integration test must continue passing when upgrading Next.js. Normal requested shutdown returns Next's code 143; failure-restart is deliberately disabled in the documented scheduled task.

These checks do not register Task Scheduler tasks or perform a physical Windows reboot. The user has separately confirmed phone/mobile-data Tailscale access. Task Scheduler credentials, startup before Windows sign-in, Tailscale Run unattended and real Acer reboot behaviour remain for the user to verify.

## Cold-boot readiness regression

The user reported that Task Scheduler reached production startup after a physical reboot, but the single three-second health request failed under cold-boot load. The launcher now starts a 60-second monotonic readiness budget when it invokes Next.js, after the unchanged migration step. It retries the existing HTTP/SQLite-backed authentication-status endpoint with five-second request limits and a one-second pause after failures. Next.js initialisation is observed concurrently so an unresolved startup promise cannot bypass the deadline; rejection fails immediately. An actual process exit is logged by the existing exit hook and terminates the launcher without waiting.

- `tests/readiness.test.ts` checks safe classification of connection refusal, HTTP timeout, non-success status and malformed/unexpected application responses, plus success. Secret sentinel response bodies and exception messages are excluded from diagnostics.
- `tests/startup.test.ts` adds a real-time 25-second unhealthy period before recovery, proving an open HTTP listener alone is insufficient. It also exercises the full real 60-second timeout with an unresolved Next.js initialisation promise, verifies graceful SIGTERM shutdown and preserved database bytes, then tests immediate process exit and startup rejection. These cases use the same production timeout constants, with no shorter test-only override.
- The existing actual production integration test remains in Windows/Linux CI after the production build, covering repeated start/stop, duplicate prevention, authentication protection and SQLite preservation. Windows tests continue to exercise the PowerShell wrapper and paths with spaces.

These are automated tests, not a claim that the cold-boot fix passed a physical Acer reboot. The user must repeat that reboot test. Task Scheduler triggers, Tailscale configuration, migrations, singleton protection and production build/start policy are unchanged.

## V2 regression coverage

`tests/v2.test.ts` applies V1 then the additive V2 migration to a disposable SQLite database and checks preserved password/session records, independent dashboard layouts, reset/hide/show/reorder, timer timestamps and idempotent StudySession recording, pause/restart recovery, reminder rescheduling/cancellation/snooze/quiet hours, notification state, bounded recurrence/history, Inbox conversion, editable day-plan persistence, daily summaries, private push payloads, delivery retry/deduplication, subscription removal and V1/V2 backup imports. Push transport tests use an injected sender; they do not contact real devices or vendor services.

The production lifecycle integration also authenticates against a disposable production instance, verifies server-generated reminders without a browser, pauses a real API timer, gracefully restarts through the existing launcher, and verifies the persisted timer. Existing slow 25-second startup and genuine 60-second timeout tests are retained unchanged.

Browser QA uses `tests/visual-fixture.tsx`, a fictional component harness without authentication bypasses or access to user data. After a build, `node scripts/visual-fixture.mjs` generates ignored test-only assets for a supervised local preview. Remove `public/v2-fixture.js`, `public/v2-fixture.css`, `public/v2-fixture.html` and `public/v2-sizes.html` when finished; they are not part of the app. This checks component layouts and local interactions; real API behaviour is covered separately by automated tests. It is not a logged-in browser end-to-end test or physical iPhone/iPad/Windows test.
