# Student Dashboard

A personal university workspace for subjects, assessment tasks, exams, classes, study planning and grades. Next.js, React, TypeScript, Tailwind CSS, Prisma and a local SQLite database. No cloud account, AI API, subscription or hosted database is needed to use it.

**The laptop is the server.** All devices connect to the same database on that laptop. Keep it awake and running. This is local self-hosting, not offline multi-device replication.

## Start on Windows

1. Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/en/download) and [Git for Windows](https://git-scm.com/downloads/win). Restart your terminal after installing.
2. Open **Command Prompt** and go to the folder where you keep projects, for example `C:\Projects`.
3. Clone and start the app:

   ```bat
   git clone https://github.com/wy-kd/student-dashboard.git
   cd student-dashboard
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).
5. Copy the **first-time setup token** printed in your terminal into the setup screen. Create a password of at least 10 characters. This token prevents another device on the LAN from claiming the initial setup.
6. Create your semester and subjects. Alternatively, open **Settings → Add demo data** to explore fictional university records first.

`npm install` generates Prisma's client, creates `.env` and applies the checked-in SQL migration. No manual database provisioning is necessary. Your records are stored in `data/student.db` and survive a restart. Start commands also apply any new migrations.

Use `Ctrl+C` to stop. Run `npm run dev` again to resume. You do not need to reinstall every time.

### Source repository

Source and development history: [wy-kd/student-dashboard](https://github.com/wy-kd/student-dashboard).

The repository contains application source and fictional demo data only. The local SQLite database, setup token, passwords, sessions and backups are excluded from Git. Never force-add `data/`, `backups/` or `.env`.

## Daily use and production mode

Development mode works, but production mode compiles everything ahead of time and is the better daily option:

```bat
npm run build
npm run start
```

Build again after changing or updating source. Both `dev` and `start` listen on `0.0.0.0:3000` by default. Only run one server on port 3000 at a time. Do not run multiple app processes against the same database.

To use another port:

```bat
npm run dev -- --port 3001
```

Or:

```bat
npm run start -- --port 3001
```

The setup message shows the default port; use the actual port in the Next.js startup output if you change it.

## Phone and iPad access over Wi-Fi

1. Connect your laptop, phone and iPad to the **same trusted Wi-Fi**. Guest networks may deliberately block device-to-device connections.
2. On Windows, run:

   ```bat
   ipconfig
   ```

3. Under your active **Wireless LAN adapter Wi-Fi**, find **IPv4 Address**, for example `192.168.1.42`. Do not use a VPN, virtual adapter, default gateway or `169.254.x.x` address.
4. Start the app on the laptop.
5. On the phone or iPad, open `http://192.168.1.42:3000`, replacing the example with your laptop's address. Sign in with the password you created.
6. Keep the laptop awake, plugged in and connected. Windows sleep and closing the lid can stop access. If your router changes the laptop's IP, use the new address. A DHCP reservation on your router can keep it stable.

`0.0.0.0` is the server's listening address; it is not an address to type into Safari.

### Windows Firewall

When Windows asks, allow Node.js on **Private networks** for your trusted home Wi-Fi. Do not enable public network access just to make this work. You do not need router port forwarding.

If no prompt appears, open **Windows Defender Firewall with Advanced Security → Inbound Rules → New Rule → Port**. Select TCP, specific local port `3000`, Allow the connection, **Private only**, and name it `Student Dashboard LAN`. In the rule's Scope tab, restrict remote addresses to **Local subnet**.

Equivalent optional PowerShell command, run as Administrator after confirming the Wi-Fi is trusted and marked Private:

```powershell
New-NetFirewallRule -DisplayName "Student Dashboard LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

HTTP on a LAN is unencrypted. Use it only on a trusted network; the optional local HTTPS configuration below encrypts the connection. Do not port-forward the app or make it internet-accessible.

## Private Remote Access with Tailscale

Use **Tailscale Serve** for private HTTPS access away from home, including from QUT. Install Tailscale separately on the Windows laptop and each remote phone, iPad or computer, then sign them into the **same tailnet**. Tailnet access rules must permit the remote device to reach the laptop's HTTPS service. Tailscale is not an npm dependency and the app does not install or configure it.

The connection is: remote device → private tailnet → HTTPS `.ts.net` URL → Tailscale Serve on Windows → `http://127.0.0.1:3000` → Student Dashboard → local `data/student.db`.

**Serve is private to your tailnet. Do not use Tailscale Funnel**, which exposes services publicly. No router port forwarding is necessary. Do not create a Windows **Public-network** rule for Node.js or port 3000. Keep any existing LAN rule restricted to **Private / Local subnet**; Serve reaches the app through loopback. Do not mark campus/public Wi-Fi Private to make the dashboard accessible.

### Start the app and private HTTPS proxy

1. Stop the existing app with `Ctrl+C`. In the repository folder, update and start production mode:

   ```bat
   git pull --ff-only
   npm install
   npm run build
   npm run start
   ```

   Keep this terminal running. Use production mode for the Tailscale path: `npm run dev` has a separate Next.js development-origin restriction and the arbitrary `.ts.net` hostname is intentionally not wildcard-allowed. Production mode still supports `http://localhost:3000` and `http://<LAN-IP>:3000` alongside Tailscale. No hostname or `.env` change is needed.

2. After installing and signing into Tailscale, open a **second terminal on the laptop**:

   ```bat
   tailscale status
   tailscale serve 3000
   ```

   If prompted, follow Tailscale's link to enable the HTTPS/Serve prerequisites for your tailnet. Do not enable public Funnel access. Serve provisions HTTPS for your device's `.ts.net` address and terminates TLS itself; its backend remains plain HTTP on `127.0.0.1:3000`. **Caddy is unnecessary for this path.**

3. Copy the exact HTTPS URL printed by Serve. It should say **Available within your tailnet** and show `/` proxying to `http://127.0.0.1:3000`. Open that URL on a device connected to the same tailnet and sign in using your **existing Student Dashboard password**. Use the printed URL without adding `:3000`; do not use `https://<LAN-IP>:3000`. Each hostname has its own login cookie, but all access the same records.

4. In another terminal, inspect the configuration:

   ```bat
   tailscale serve status
   ```

5. The initial Serve command runs in the foreground. Once you have tested it, press `Ctrl+C` in **that** terminal, then enable persistent background serving:

   ```bat
   tailscale serve --bg 3000
   tailscale serve status
   ```

   Background Serve can resume after a reboot, but it does **not** start Node.js or Student Dashboard. The host laptop must remain powered on, awake, connected to the internet and connected to Tailscale, and the dashboard server must still be running. Remote devices must also have Tailscale connected. Access at QUT depends on that network permitting the Tailscale connection.

### Stop or reset Serve

For the default HTTPS listener configured above:

```bat
tailscale serve off
```

If your CLI asks for matching flags after background setup, use `tailscale serve --bg off`. Check `tailscale serve status` afterwards. To remove **all Serve configuration on this laptop**, including any other services you configured:

```bat
tailscale serve reset
```

These commands do not stop Student Dashboard or delete its data. Localhost and permitted LAN access remain available while the app is running.

### Application behaviour and device checks

Serve preserves the browser's original `Host`. The existing write protection compares the request Origin's host and port with that Host, rejects missing/mismatched origins and cross-site browser requests, and requires JSON. The app does not use `Forwarded`, `X-Forwarded-Host` or `X-Forwarded-Proto` to bypass those checks, and it never authenticates from Tailscale identity headers. Password authentication, session expiry and login throttling remain in effect. HTTPS logins set host-only, HttpOnly, SameSite=Strict, **Secure** cookies based on the checked browser Origin; local HTTP logins continue to work on their separate hostnames.

All application navigation, API calls, downloads and PWA asset URLs use the current site. The `.ts.net` HTTPS URL provides a secure context for the existing service worker and home-screen installation. Offline edits are not supported: the service worker does not cache private API data. SQLite stays at `data/student.db` on the laptop, and JSON backup/restore and CSV export use the same authenticated API through every address. There is no database migration or cloud storage change for Tailscale.

On your own devices, check login, a test task saved and visible through localhost, JSON/CSV downloads, logout and home-screen launch. Test away from home using mobile data and then QUT. Automated request tests simulate Serve's headers; **physical Tailscale, iPhone/iPad and QUT testing has not been performed by this repository update**. If you see “Request blocked”, check the exact Serve URL and root proxy mapping; do not disable origin protection or add arbitrary allowed origins.

References: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [Serve CLI commands](https://tailscale.com/docs/reference/tailscale-cli/serve), and [Serve's HTTP proxy implementation](https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go).

## PWA / Add to Home Screen

Included: web manifest, standalone display, 192px and 512px icons, Apple touch icon and a minimal service worker. Browser support varies.

- On the laptop, `http://localhost:3000` is treated as a secure local development origin by browsers. Supported desktop browsers can offer installation.
- On an iPhone or iPad, `http://192.168.x.x:3000` is **not** a secure context. Basic app access works; full PWA/service-worker support requires trusted HTTPS. Safari may offer a home-screen bookmark, but that is not proof of full PWA support.
- With trusted HTTPS, open the app in Safari, use **Share → Add to Home Screen** and open the new icon. Sign in again if the installed app uses a separate cookie store.
- The service worker provides an honest offline/laptop-unavailable screen. It does **not** cache private academic responses, queue offline edits or synchronise independently stored device databases.
- No push notification permission is requested. Alerts are in-app only.

See [MDN's installability guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

### Optional LAN-only HTTPS with Caddy

This is an optional method for HTTPS over the local LAN. It is not required for Tailscale Serve and must not be placed between Serve and Next.js. For private remote access, use the Tailscale section above. This LAN method needs no public domain or cloud hosting.

1. Download [Caddy for Windows](https://caddyserver.com/download). Keep it in a folder where you can run `caddy.exe`.
2. Copy `docs/Caddyfile.example` to a file named `Caddyfile`, replacing the example IP with your laptop's current private IP.
3. Start the production app on port 3000. In another terminal, run:

   ```bat
   caddy run --config Caddyfile
   ```

4. Allow TCP port **3443** through the Windows Firewall on **Private / Local subnet only**, following the same process as above. The configuration binds HTTPS to the specified private IP and disables automatic HTTP redirects.
5. Caddy issues certificates using its local certificate authority. Trust **your own Caddy root certificate** on each device. Use `caddy environ` to locate `caddy.AppDataDir`; the certificate is under `pki\authorities\local\root.crt`. Transfer only `root.crt`, **never** `root.key` or any private key.
6. On iOS/iPadOS, install that certificate profile, then enable full trust in **Settings → General → About → Certificate Trust Settings**. The exact profile-installation path can vary by OS. Do not install certificates from unknown sources.
7. Open `https://YOUR-LAPTOP-IP:3443`. It must load without a certificate warning before PWA installation can work reliably. Do not bypass a warning as a substitute for proper trust.

Caddy preserves the original request host when proxying HTTP, which the app uses for its same-origin check. The secure browser origin causes the session cookie to be marked Secure. Use HTTPS consistently after signing in through HTTPS; clear the site's cookies if you deliberately switch back to HTTP and can no longer sign in.

See [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https) and [its `tls internal` setting](https://caddyserver.com/docs/caddyfile/directives/tls). This optional certificate setup and physical iPhone installation were not tested in this build environment.

## What is included

| Area                 | Working features                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard / Today    | Date, semester progress, teaching week, nearest deadline, today’s classes/tasks/study, overdue work, ranked next steps, alerts                                     |
| Subjects / semesters | Add/edit/delete, lecturers, tutors, colours, notes, links, exam period, weekly content, subject detail pages                                                       |
| Assignments          | Complete details, statuses, estimates, manual or task-driven progress, milestone timeline, schedule health, notes/links                                            |
| Tasks                | Standalone or linked to subject/assignment/exam; due dates, estimates, actual time, status, priority; today/tomorrow/week/upcoming/overdue/completed/grouped views |
| Exams                | Countdown, date/time, duration, room, weighting, confidence, topic stages, mock/practice exams and revision tasks                                                  |
| Calendar / timetable | Month/week/day calendar, day/week timetable, recurring weekly classes, study sessions, milestones, releases and important dates                                    |
| Study                | Planned/actual hours, completion and day/week/month totals by subject                                                                                              |
| Grades               | Scores, marked weighting, earned weighted contribution, current average, remaining weighting and target calculator                                                 |
| Planning / analytics | Transparent priorities, 7/14/30-day forecast, workload collisions, weekly productivity and assessment/revision progress                                            |
| Usability            | Quick Add, search including notes across all semesters, light/dark themes, responsive screens, keyboard-accessible dialogs, loading/empty/error states             |
| Data                 | Local SQLite, relational constraints, migrations, validated writes, stale-edit protection, JSON export/restore, CSV exports and demo removal                       |
| Access               | Single-user password, hashed sessions, failed-login limit, same-origin write checks, LAN access and PWA assets                                                     |

An assessment's tasks, topics, milestones and sessions are managed from its detail page. Clicking a calendar event opens its editor. Editing a recurring class changes the whole series; single-occurrence exceptions use a holiday/break record or a separate class series.

## Calculations and behaviour

- **Timezone:** defaults to `Australia/Brisbane`. All due dates and times are stored as local wall-time strings in the configured timezone. All devices compute the same current date in that timezone. Changing the timezone reinterprets existing times; it does not shift them. The timezone has no per-subject override.
- **Countdowns:** calendar-day differences, with overdue determined by the due time. A deadline earlier today is “Overdue today”. Submitted/completed work is not ranked as overdue.
- **Assignment progress:** with linked tasks, completed estimated hours / all estimated hours × 100. A zero-estimate task has weight 1. Without tasks, manual progress applies. Submitted assignments show 100%.
- **Revision progress:** Not Started = 0, Learning = 33, Revising = 67, Confident = 100; average across topics. With no topics, manual revision progress applies. Completed exams show 100%.
- **Remaining work:** maximum of assessment estimate × incomplete progress and remaining estimates on its incomplete tasks. Actual session time is a separate measurement, not automatic proof of completion. Update task/topic status as you finish work.
- **Logged assessment time:** assignment manual hours plus linked study-session actual hours. Do not enter the same hours both ways. Task actual hours are tracked separately and are not added again to that total.
- **Schedule health:** overdue assessments or missed milestones are Behind. Work exceeding available daily capacity or far below elapsed progress is At Risk. Progress ahead of elapsed time, or an early completed milestone while on pace, is Ahead. Otherwise On Track. This is a planning heuristic, not a grade prediction.
- **Priority:** urgency + 0.2 × weighting + 0.1 × incomplete percentage + capped daily work pressure + difficulty + overdue-task penalty. Exams use confidence to estimate difficulty. The Analytics page shows each contribution. Manual priority is an additional personal label and does not secretly change this formula.
- **Forecast:** distributes remaining work for deadlines inside the selected horizon across days up to each deadline. Includes overdue work on day one and standalone dated tasks, avoids double-counting linked task hours. It does not allocate preparation for exams beyond the forecast horizon or optimise class/study-session free slots. Three assessments in a seven-day block or work beyond configured capacity triggers a collision warning.
- **Grades:** contribution = score / maximum × weighting. Current grade = earned contribution / marked weighting × 100. Required average on remaining work = (target − earned contribution) / (100 − marked weighting) × 100. Values over 100 are “Not achievable”. No rounding occurs before the final display calculation. Subject assessment weightings cannot exceed 100%; missing weighting is clearly flagged.
- **Semester:** elapsed percentage is bounded to 0–100%. Teaching weeks start on the configured teaching-start date and skip Break records covering a weekly boundary. Use full Monday–Sunday breaks with a Monday teaching-start date. Arbitrary partial-week holidays suppress classes but do not decrement the teaching-week counter.
- **Multi-device:** each visible page refreshes every 15 seconds and on focus. Editing a record with an older revision returns a refresh error instead of overwriting another device’s changes. The app is designed for one user; settings edits use last-write-wins.
- **Deletion:** related records use restrictive foreign keys. Remove/unlink child tasks, milestones, grades and sessions before deleting their parent. Every UI delete asks for confirmation.

## Back up and restore

### Recommended: portable JSON

In **Settings → Backups & data export**, download a JSON backup. Copy it to another drive or a location you control. It includes academic tables and preferences, but **not** your password or sessions. It is unencrypted, so protect it like your academic records.

**Create local backup** saves a dated JSON file in `backups/`. This helps recover accidental edits but will not protect against losing the laptop unless you copy the file elsewhere.

To restore, choose a JSON backup in Settings and confirm replacement. Validation checks dates, relationships, duplicates, grades and assessment weights. The restore uses a database transaction. Invalid restores roll back. Existing data is automatically backed up first. The current app password is preserved.

Backup limits: 5 MB through the UI and 20,000 academic records. For larger files, use the command below; the CLI still enforces the record limit.

### Command line

```bat
npm run db:backup
```

Restore, ideally while the app is stopped:

```bat
npm run db:backup -- "C:\Backups\student-dashboard-backup.json" --confirm
```

### Full SQLite copy

Stop the server with `Ctrl+C` before copying `data/student.db`. A full database copy includes password hashes and sessions. Keep the entire `data` folder if SQLite journal/sidecar files exist. Never copy a live SQLite file as your only backup.

To restore a full SQLite copy: stop the server, keep a separate copy of the current `data` folder, replace it with your backup and start the server again. Start-up applies newer migrations. A JSON restore is more portable across schema changes supported by future app versions.

### CSV exports

Each academic table can be exported from Settings. These are useful for spreadsheets and analysis. CSV import is not implemented; use JSON for round-trip backup/restore. CSV cells starting with spreadsheet formula prefixes are escaped.

## Demo data

Use **Settings → Add demo data**, or run `npm run db:seed`. Demo dates are relative to the day it is seeded, not official QUT dates. Re-running the seed is idempotent while its demo semester exists.

**Remove demo data** removes untouched sample records after saving a backup. Editing a sample makes it yours. Sample parents referenced by your own records are retained to prevent data loss. Delete or unlink those personal records manually if you also want to remove the retained parents.

## Updating

First back up. Stop the app. In your cloned repository:

```bat
git pull --ff-only
npm install
npm run build
npm run start
```

Database migrations apply automatically. Your database, passwords, setup token and backups are ignored by Git. Do not delete the `data` folder during an update. If moving to another laptop, export a JSON backup and restore it in a fresh installation.

## Troubleshooting

| Problem                                             | What to do                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm` is not recognised                             | Install Node 24 LTS, close the terminal and open it again.                                                                           |
| PowerShell says `npm.ps1` cannot run                | Use Command Prompt or `npm.cmd`; do not weaken the system-wide execution policy.                                                     |
| `EADDRINUSE` / port 3000 in use                     | Stop the other app or choose another port and update the phone URL/firewall rule.                                                    |
| Phone cannot connect                                | Check Wi-Fi, laptop awake, current IPv4 address, server running, Private firewall rule and guest/client isolation.                   |
| “Request blocked”                                   | Open the app directly. If using a proxy, preserve the original Host header.                                                          |
| “Changed on another device”                         | Close the editor, refresh and reopen the record before editing.                                                                      |
| Forgotten password                                  | Stop the server, run `npm run password:reset -- --confirm`, restart, and use the newly printed setup token. Academic records remain. |
| Prisma client/engine missing                        | Run `npm install` again with internet access. If installs were run with `--ignore-scripts`, run `node scripts/setup.mjs --install`.  |
| Database locked                                     | Use one app process; keep the live database out of cloud-sync/network folders. Stop other writers and retry.                         |
| No tasks in Today                                   | Check the shared timezone, due date and selected semester. Completed tasks appear in Completed.                                      |
| Demo remains after removal                          | Your edited records need that parent. See the retained-record message.                                                               |
| iPhone PWA does not install                         | Use trusted local HTTPS. Plain LAN HTTP is not a secure context.                                                                     |
| App installed but laptop offline                    | Reconnect and wake the laptop. Offline editing is not supported.                                                                     |
| Secure-cookie trouble after switching HTTPS to HTTP | Return to HTTPS or clear the site's cookies and sign in again.                                                                       |

## Development and tests

```bat
npm test
npm run typecheck
npm run build
```

Tests use disposable SQLite databases in the OS temporary folder. They cover end-to-end service workflows and API handlers, calculation boundaries, validation, authentication, revision conflicts, backup rollback, demo retention and persistence across a new database connection. They can create safety backups of synthetic test data in `backups/`; these are safe to delete when the server is stopped.

See [docs/TESTING.md](docs/TESTING.md) for verification details and limits. [docs/requirements.md](docs/requirements.md) preserves the requested scope. The original preference for SQLite and local execution takes precedence over hosted site scaffolds; this is a normal Next.js server, not a Cloudflare-hosted app.

Project structure:

- `app/`: pages and authenticated API routes
- `components/`: responsive screens and record editors
- `lib/`: relational service, validation, calculations, authentication, demo and backups
- `prisma/`: relational schema and SQL migration
- `scripts/`: setup, development, backup and password reset helpers
- `tests/`: deterministic calculation, service and API workflow tests
- `public/`: PWA manifest, icons, service worker and offline page

Core operation performs no external data/API calls. Package installation requires internet access. The development launcher disables Next.js telemetry; to disable it for build/start too, run `npx next telemetry disable` once locally.
