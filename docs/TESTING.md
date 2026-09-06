# Verification record

## Automated checks

- TypeScript type check passed.
- Production Next.js build passed.
- 16 tests cover calculation boundaries, SQLite service workflows and API handlers.
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
