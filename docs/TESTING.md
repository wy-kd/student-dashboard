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

The app requires the laptop to be running. Offline editing, independent device databases, push notifications, timetable import, CSV import, single-class occurrence overrides and automatic free-slot scheduling are not implemented. None is presented as a working button. Alerts, local priority ranking and dated study planning work without external services.

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
