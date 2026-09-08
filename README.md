# Student Dashboard

Updating from V1? Read the [safe V2 update guide](docs/V2-GUIDE.md#apply-v2-safely-on-the-acer) before pulling and installing.

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

## Automatic Startup on Windows

Use Windows Task Scheduler to run the already-built **production** app. The launcher does not build, install packages, seed data or reset SQLite. It requires an existing `.env`, non-empty `data/student.db` and `.next/BUILD_ID`, checks port 3000 before running the existing `prisma migrate deploy` startup step, then starts the same production entry point as `next start` on `0.0.0.0:3000`.

Keep the repository on a local drive available before sign-in, not a network drive or an online-only cloud-sync folder. Use your existing Windows account and Node.js installation. No Windows service, PM2, NSSM, Docker, router change or Public-network firewall rule is needed.

### 1. Prepare and manually test

First download a JSON backup through Settings if you have records to preserve. Stop the old manually launched app using `Ctrl+C` in its original terminal. In **Command Prompt**, open your existing repository folder (replace the example path):

```bat
cd /d "C:\Projects\student-dashboard"
git pull --ff-only
npm install
npm test
npm run typecheck
npm run build
node scripts/windows/dashboard.mjs start
```

Run each command separately and stop if one fails. The start command stays in the foreground for the lifetime of the server. Wait for **Ready: production HTTP and database check passed**. Cold boot can take longer than a manual start: the launcher allows **60 seconds from invoking Next.js production startup**, after migrations finish. It checks `/api/auth` immediately, allows up to **5 seconds per HTTP request** (including reading the response), then pauses **1 second after a failed check** before retrying. Each request/pause is capped by the remaining overall budget. Next.js initialisation and the endpoint's SQLite query must both succeed; an open port alone is not readiness.

Logs report each failed attempt and the final cause: connection refused, HTTP timeout, non-success HTTP status or an invalid database/application health response. HTTP 500 from this endpoint can indicate a failed database query. Response bodies and exception text are never logged. If Next.js exits before becoming ready, the launcher exits immediately and records its exit code. Next.js runs inside the launcher process, so there is no separate application child to wait for. A rejected startup promise also fails immediately. A genuine 60-second readiness failure still uses Next.js's graceful shutdown handler; it does not force-kill the server.

In a second terminal in the repository:

```bat
node scripts/windows/dashboard.mjs status
node scripts/windows/dashboard.mjs logs
```

Open `http://localhost:3000`, sign in and check your existing records. Check your existing LAN URL and private Tailscale HTTPS URL too. Trying `start` again should refuse a duplicate without rerunning migrations. To stop safely from the second terminal:

```bat
node scripts/windows/dashboard.mjs stop
node scripts/windows/dashboard.mjs status
```

Wait for **Stopped. Port 3000 is free; maintenance can proceed.** Status returns exit code `0` only when a managed instance is ready and its HTTP/database check passes; stopped/not-ready returns `1`. Stop returns `0` when safely stopped, including when it was already stopped. If it times out, it does **not** force-kill the process: wait, check status and retry. Do not update or copy the database until stopped.

A Windows PowerShell wrapper is also included, with the same four actions and an optional explicit Node path:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows\dashboard.ps1" -Action start -NodePath "C:\Program Files\nodejs\node.exe"
```

Replace `start` with `stop`, `status` or `logs` as needed and use your actual Node path. This execution-policy option applies only to that PowerShell process. Both entry points locate the repository from their own script path, so they work when called by absolute path from another directory. The scheduled task below calls Node directly, avoiding PowerShell execution-policy and npm/PATH dependencies.

### 2. Find the exact task paths

In your repository's Command Prompt, run:

```bat
node -p "process.execPath"
node -p "require('node:path').resolve('scripts/windows/dashboard.mjs')"
cd
whoami
```

Keep these four results: the Node executable, runner script, repository directory and Windows account. Use the actual executable reported, not `npm.cmd`, a shell alias or a version-manager command. If you move the repository, change Node's installation path or change your Windows account password later, update the task accordingly.

### 3. Create the Task Scheduler task

Open **Task Scheduler → Task Scheduler Library → Create Task** (not Create Basic Task). If Windows requires administrator permission to register an at-startup task, open Task Scheduler as administrator, but select **your own existing Windows account** as the task's run-as account.

| Tab / field                  | Exact setting                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General: Name                | `Student Dashboard`                                                                                                                                                                                                                                    |
| General: User                | Your existing Windows account from `whoami`, with access to this repository, Node, `.env`, `data/` and `logs/`. Do not use SYSTEM.                                                                                                                     |
| General: Security            | **Run whether user is logged on or not**. Leave **Do not store password** unchecked. Windows will ask for this account's password when saving, not your Windows Hello PIN or dashboard password. Enter it only into Windows; do not put it in scripts. |
| General: Highest privileges  | **Unchecked**. The application does not need administrator privileges.                                                                                                                                                                                 |
| General: Configure for       | Windows 10 (also the available compatibility choice on Windows 11).                                                                                                                                                                                    |
| Triggers: New                | **At startup**, delay **1 minute**, Enabled. No repetition and no separate logon trigger.                                                                                                                                                              |
| Actions: New                 | **Start a program**.                                                                                                                                                                                                                                   |
| Actions: Program/script      | The full `node.exe` path from step 2, e.g. `C:\Program Files\nodejs\node.exe`. Use Browse or enter it in this separate executable field.                                                                                                               |
| Actions: Add arguments       | The runner's full path **in double quotes**, followed by `start`: `"C:\Projects\student-dashboard\scripts\windows\dashboard.mjs" start`                                                                                                                |
| Actions: Start in            | The repository directory from step 2, e.g. `C:\Projects\student-dashboard`, **without quotes**. The launcher also sets its own working directory.                                                                                                      |
| Conditions: Idle             | Uncheck **Start the task only if the computer is idle**.                                                                                                                                                                                               |
| Conditions: Power            | Uncheck **Start the task only if the computer is on AC power** and **Stop if the computer switches to battery power**. Keep the laptop plugged in for everyday hosting.                                                                                |
| Conditions: Network          | Do not require a particular network connection. The local app can start before Tailscale connects.                                                                                                                                                     |
| Settings: On demand          | Check **Allow task to be run on demand**.                                                                                                                                                                                                              |
| Settings: Missed start       | Check **Run task as soon as possible after a scheduled start is missed**.                                                                                                                                                                              |
| Settings: Restart on failure | Leave **unchecked**. Diagnose failures before retrying; a deliberate Next.js shutdown returns `143`, so automatic failure retries could undo a manual stop.                                                                                            |
| Settings: Time limit         | Uncheck **Stop the task if it runs longer than** (the default limit is unsuitable for a persistent server).                                                                                                                                            |
| Settings: Forced stop        | Uncheck **If the running task does not end when requested, force it to stop**. Use the dashboard stop command for maintenance.                                                                                                                         |
| Settings: Existing instance  | **Do not start a new instance**. The launcher's OS-owned control channel also blocks duplicate managed starts across Windows logon sessions.                                                                                                           |

**Why At startup?** It starts before you sign in, which is required for remote access after a full restart. A one-minute delay gives Windows time to initialise, and the explicit executable and working directory remove dependence on an interactive terminal profile. **At log on** with “Run only when user is logged on” is a simpler fallback if your account cannot run a background task, but remote access then waits for you to sign in. It does not meet fully unattended boot operation. Account/batch-logon policy restrictions must be resolved in Windows, not by running the app as SYSTEM.

### 4. Run, inspect and stop the task

After the manual test has stopped, right-click **Student Dashboard → Run**. It should remain **Running** while the app is up. `0x41301` means the task is currently running; it is not proof that the HTTP/database check passed. Use the status command and browser as well.

From Command Prompt, the equivalent task command is:

```bat
schtasks /Run /TN "Student Dashboard"
```

From your repository:

```bat
node scripts/windows/dashboard.mjs status
node scripts/windows/dashboard.mjs logs
node scripts/windows/dashboard.mjs stop
```

Do **not** use Task Scheduler **End**, Task Manager, `taskkill` or `Stop-Process` for normal maintenance. The stop command authenticates to the local control channel and invokes Next.js's own graceful shutdown handler inside the process. It waits for in-flight requests; it never kills whichever process happens to own port 3000. Next.js reports graceful SIGTERM exit code **143 (`0x8F`)** in Last Run Result. That result after a requested stop is expected. Start it again using **Run** when ready.

The launcher writes only timestamps, lifecycle stages, public error codes and process IDs to **`logs/startup.log`**. `logs` shows the last 80 lines; open the file in Notepad to review more. At the next start, a log over 1 MB rotates to `startup.log.1`. Raw application/framework/migration output, passwords, hashes, setup tokens, sessions and control credentials are not saved. `logs/` is ignored by Git. The temporary `data/startup-control.json` is also ignored and is not a file to share.

If the task fails before the launcher runs, use Task Scheduler's **History** tab (enable All Tasks History if needed) and **Last Run Result**. Check the executable, quoted script argument, account password and folder permissions. If startup reports a missing build, rebuild while stopped. If migration fails, preserve the database and use `node node_modules/prisma/build/index.js migrate status` from the repository for diagnostics; do not use `migrate reset`, `db push --force-reset` or delete SQLite. A port-conflict message means an existing process must be identified and stopped through its own normal controls. An ordinary `npm run start` instance is not controlled by these scripts.

### 5. The three unattended components

| Component                            | Responsibility after reboot                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Student Dashboard scheduled task** | Starts the built production app and local SQLite-backed API on port 3000.                                                          |
| **Tailscale Run unattended**         | Keeps the Windows host connected to your tailnet before you sign in. Enable this in the Tailscale tray menu under Preferences.     |
| **`tailscale serve --bg 3000`**      | Keeps the private HTTPS proxy configuration and resumes serving when Tailscale is running. It does not start the dashboard itself. |

All three are needed. Keep the laptop powered on, awake and connected to the internet. Background startup does not prevent sleep, make a closed/sleeping laptop reachable or bypass network restrictions. Remote devices still need Tailscale connected to the same tailnet. No Funnel, Caddy or new Public-network firewall rule is involved. Localhost, permitted LAN HTTP and private Tailscale HTTPS all use the same `data/student.db` and existing password authentication.

### 6. Full reboot test

1. Confirm **Student Dashboard** is enabled, Tailscale **Run unattended** is enabled and `tailscale serve status` shows the existing private proxy to `http://127.0.0.1:3000`.
2. Restart Windows using **Restart**, leave it at the sign-in screen and wait about three minutes (the task delay and migrations run before the readiness window).
3. On your phone, turn Wi-Fi off, keep Tailscale connected and open your existing HTTPS `.ts.net` URL. Sign in and verify existing records. This checks startup before Windows sign-in.
4. Sign in to Windows. In the repository, run `node scripts/windows/dashboard.mjs status` and `node scripts/windows/dashboard.mjs logs`. Confirm the startup timestamp and ready message, then check `http://localhost:3000` and the LAN URL.
5. Create a small test task, restart again and verify it remains. Check that attempting another managed start refuses a duplicate.

The user has already confirmed physical Tailscale access from a phone on mobile data. **Task Scheduler registration, pre-sign-in Windows startup and a real Acer reboot have not been physically tested by this repository update.** Automated tests exercise the lifecycle and production server separately.

### 7. Disable, re-enable or remove automatic startup

For maintenance, disable future triggers **first**, then stop gracefully:

```bat
schtasks /Change /TN "Student Dashboard" /Disable
node scripts/windows/dashboard.mjs stop
node scripts/windows/dashboard.mjs status
```

Disabling a task does not stop its current process. Do not continue maintenance if stop failed or status still shows an active/occupied port. Task-management commands may require an administrator terminal depending on how the task was registered; the dashboard itself still runs without highest privileges.

Re-enable and start after maintenance:

```bat
schtasks /Change /TN "Student Dashboard" /Enable
schtasks /Run /TN "Student Dashboard"
node scripts/windows/dashboard.mjs status
```

Wait for startup before checking status. To remove automatic startup permanently, disable the task, stop the dashboard, then run:

```bat
schtasks /Delete /TN "Student Dashboard"
```

Confirm the Windows prompt. This removes only the scheduled task. It does not uninstall the app, remove Tailscale or delete any data/backups. The GUI equivalents are right-click **Disable**, **Enable**, **Run** and **Delete**.

References: [Microsoft task security](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks), [task settings](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings), [Next.js graceful shutdown](https://nextjs.org/docs/app/guides/self-hosting#after) and [Tailscale Run unattended](https://tailscale.com/docs/how-to/run-unattended).

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

   Keep this terminal running, or use the **Automatic Startup on Windows** scheduled task above instead of the manual server. Use production mode for the Tailscale path: `npm run dev` has a separate Next.js development-origin restriction and the arbitrary `.ts.net` hostname is intentionally not wildcard-allowed. Production mode still supports `http://localhost:3000` and `http://<LAN-IP>:3000` alongside Tailscale. No hostname or `.env` change is needed.

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

The user has confirmed successful private Tailscale HTTPS access from a phone on mobile data outside the home LAN. iPad, home-screen installation and QUT access should still be checked separately. Automated request tests simulate Serve's headers; they do not establish those additional device/network results. If you see “Request blocked”, check the exact Serve URL and root proxy mapping; do not disable origin protection or add arbitrary allowed origins.

References: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve), [Serve CLI commands](https://tailscale.com/docs/reference/tailscale-cli/serve), and [Serve's HTTP proxy implementation](https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go).

## PWA / Add to Home Screen

Included: web manifest, standalone display, 192px and 512px icons, Apple touch icon and a minimal service worker. Browser support varies.

- On the laptop, `http://localhost:3000` is treated as a secure local development origin by browsers. Supported desktop browsers can offer installation.
- On an iPhone or iPad, `http://192.168.x.x:3000` is **not** a secure context. Basic app access works; full PWA/service-worker support requires trusted HTTPS. Safari may offer a home-screen bookmark, but that is not proof of full PWA support.
- With trusted HTTPS, open the app in Safari, use **Share → Add to Home Screen** and open the new icon. Sign in again if the installed app uses a separate cookie store.
- The service worker provides an honest offline/laptop-unavailable screen. It does **not** cache private academic responses, queue offline edits or synchronise independently stored device databases.
- Push is optional and explicitly enabled in Settings. Permission is never requested automatically; in-app reminders work without it. See the V2 guide for local key setup and device requirements.

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

For an installation using automatic startup, use this order. Run each command separately; **stop if any step fails**.

1. While the app is still running, download a JSON backup through **Settings → Backups & data export**, then copy it somewhere separate from the laptop if possible.
2. In your repository's Command Prompt, disable automatic startup and stop safely:

   ```bat
   schtasks /Change /TN "Student Dashboard" /Disable
   node scripts/windows/dashboard.mjs stop
   node scripts/windows/dashboard.mjs status
   ```

   Wait for the explicit stopped/free-port confirmation. For an old manually launched server, use its original terminal's `Ctrl+C` instead. If no scheduled task exists yet, skip the `schtasks` commands.

3. With the application stopped, make a full copy of `data/` and `.env` to a safe location. The full database includes password hashes and sessions, unlike portable JSON. Preserve any SQLite journal/sidecar files along with it. Do not copy a live SQLite file as your only backup.
4. Update and validate:

   ```bat
   git pull --ff-only
   npm install
   npm test
   npm run typecheck
   npm run build
   ```

   `npm install` runs the existing install hook, including checked-in migrations, so take the backup **before** installing. Do not delete `data/`, `.env` or `backups/`, run destructive Prisma commands, force Git updates or use `git clean -fdx`. Private files are ignored by Git and are not replaced by a normal pull. If a check fails, leave the task disabled and fix the failure; do not start against a partly built update.

5. Before re-enabling the task, start the updated build manually:

   ```bat
   node scripts/windows/dashboard.mjs start
   ```

   In a second terminal, run `node scripts/windows/dashboard.mjs status`, then verify localhost login/records and the private Tailscale URL. Check LAN access if used. When satisfied, stop this manual instance and return control to the task:

   ```bat
   node scripts/windows/dashboard.mjs stop
   schtasks /Change /TN "Student Dashboard" /Enable
   schtasks /Run /TN "Student Dashboard"
   ```

   Wait for readiness and check status once more. Only one start method should own the server. Tailscale can remain running throughout maintenance; its URL will be temporarily unavailable while the app is stopped.

A code rollback does not automatically reverse database migrations. Keep the pre-update backup and do not reset or downgrade SQLite blindly. If moving to another laptop, export JSON and restore it in a fresh installation, or follow the full SQLite backup procedure while both servers are stopped.

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

## Version 2 — calmer daily study

V2 adds an editable responsive Dashboard, Comfortable/Compact density, a persistent countdown/stopwatch timer and Focus Mode, configurable reminders and Notification Centre, optional Web Push, Quick Capture/Inbox, recurring tasks, editable daily plans and Weekly Review. Existing authentication, local SQLite, academic calculations, PWA, LAN/Tailscale access and the Windows cold-boot launcher remain in place.

**Before updating your Acer, follow the exact [V2 update and setup guide](docs/V2-GUIDE.md#apply-v2-safely-on-the-acer).** It includes backup/stop/update/test/build/start commands, optional local VAPID setup, per-device notification permission steps and the physical reboot/device checklist. Do not build or install while the scheduled app is running.

The scheduler lives inside Next.js and recovers persisted reminders after restart; see [notification architecture and limitations](docs/V2-GUIDE.md#reminder-scheduling-and-retention). No second process, cloud database, public hosting or Tailscale/Task Scheduler configuration change is needed. Portable backups now use version 2 and include V2 academic/productivity state; version 1 imports still work. Passwords, sessions and push secrets stay out of portable JSON exports.


## V2.1 usability polish

V2.1 adds a saved collapsible navigation rail, a responsive timer dock and prompt cross-device timer updates. V2.1.1 removes the application fullscreen control, rebuilds the timer and recurring-task layouts and guards against stale production CSS. Recurring series have a separate editor and confirmed deletion that preserves completed history. Automatic Plan My Day/Plan Next Week proposals are removed; manual study sessions, Today and Weekly Review remain.

No migration, new dependency, secret or Windows/Tailscale configuration change is required. See [V2.1 behaviour, safe Acer update commands and device checks](docs/V2.1-GUIDE.md).

## V2.1.1 UI corrections

Use the [V2.1.1 Acer update and verification guide](docs/V2.1.1-GUIDE.md). This release keeps one saved sidebar controller, removes application fullscreen while retaining Study Focus Mode and PWA standalone access, gives the timer a separate activity/status/clock hierarchy and separates recurring-series management from ordinary task filtering.

An incremental production build reproduced stale CSS after source edits. Production builds now disable the persistent Turbopack build cache, and `npm run build` checks the emitted CSS before succeeding. This affects installation/update builds only; Windows startup still starts the existing production build without rebuilding. No database migration, new dependency or Windows/Tailscale change is included.

## V2.1.2 usability and semester management

**Back up your real university data before updating.** Follow the [V2.1.2 backup, verification, Acer update and exact recovery guide](docs/V2.1.2-GUIDE.md). It includes a dated full `data`/`.env` copy outside the repository, JSON verification, Settings/CLI JSON restore and full database/environment recovery.

This release adds consistent Australian date/time display, readable Dashboard edit controls, native-input format hints, ordinary-field autocomplete suppression, teaching-week states, Semester Break management using existing records and a compact floating timer with End → review. No database migration, seed/reset, new dependency or Windows/Tailscale/authentication/timer-sync architecture change is required.

## V2.1.3 cleanup and personal checklist

**Back up your real university data before pulling.** Follow the [V2.1.3 backup, verification, Acer update and exact recovery guide](docs/V2.1.3-GUIDE.md), including JSON export, a stopped full `data`/`.env` copy outside the repository and recovery commands.

This release removes duplicate native-input date hints, fixes timetable date-header sizing, combines semester identity/week into one bold summary and adds confirmed Cancel to the floating timer. Cancel discards unsaved time; End retains the existing review/save flow.

Tasks now includes a separate lightweight To-do list, with optional due dates, completion, inline editing and manual order. Enable its five-item preview under Dashboard → Edit Dashboard → Add Widget → To-do list. Existing dashboard layouts are retained and the new widget starts hidden.

The only schema change is additive migration `202609080001_todos`, creating `TodoItem` and its index. Existing startup/install migration behaviour applies it; no existing table or academic record is replaced. JSON backup/restore includes To-dos and still accepts older backups. Authentication, timer sync, reminders, Web Push, Windows startup and Tailscale are unchanged. No dependency or Spotify integration is added.
