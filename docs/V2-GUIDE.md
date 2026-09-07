# Student Dashboard V2

V2 keeps the local production architecture and focuses daily work on Today, recommendations and a study timer. No Tailscale, Task Scheduler, firewall or router changes are required.

## Everyday use

- **Dashboard:** five default widgets: recommendations, timer, Today, upcoming deadlines and alerts. Edit Dashboard offers hidden optional widgets, drag handles, width/height controls, Move up/down, Hide, Reset Layout, Cancel and Done. Done saves the layout. Desktop (12 columns), tablet (6) and phone (1) have separate preferences. Phone editing uses buttons rather than dragging. Widths on larger screens have a three-column minimum; height is a minimum, so content never gets clipped to fit a short widget.
- **Comfortable / Compact:** Settings → Display & notifications. Saved on the laptop and shared across your authenticated devices. Theme remains a per-device preference.
- **Study:** start 25, 50 or 90 minutes immediately. Session options expose custom focus/break durations, rounds, stopwatch mode and optional subject/assessment/task linking. Pause, Resume and Finish are available while active. After a countdown ends, choose a break, next round or Finish. Rounds never start themselves while you are away.
- **Focus Mode:** a full-page timer with linked work, task progress and the next unfinished linked task. Exit without stopping. The mini timer follows navigation outside Focus Mode.
- **Completion:** Finish opens a short review with actual minutes, an optional note and an optional linked-task completion checkbox. Save creates exactly one StudySession. Start again from the timer after saving. Timer hours do not also increment manual task/assignment hours. Do not manually log the same time again.
- **Quick Capture / Inbox:** the Add menu accepts a short thought with no required category or date. Organise it in Inbox into a normal task, with optional subject, assignment, deadline and priority. Quick Add remains available for structured creation.
- **Recurring tasks:** Tasks → Recurring tasks. Daily, weekly, fortnightly, selected weekdays or a custom day/week interval. One outstanding occurrence per series, up to fourteen days ahead. An overdue unfinished occurrence remains; a restart does not generate a backlog. Completed tasks retain their history. The normal task editor changes that occurrence. The series editor changes future occurrences and can pause generation; it does not rewrite existing tasks.
- **Today:** classes, study, due/overdue tasks, recommendations and available study capacity. Plan My Day produces editable proposals around existing classes and study, within daily capacity and 09:00–21:00. Review start times and durations before accepting. Ten-minute gaps separate proposals. Acceptance is transactional and retry-safe. Suggestions never move existing plans. You can deliberately move proposals or edit saved sessions afterwards.
- **Weekly Review:** completed tasks, actual study time, submitted assessments and uncompleted past study sessions, followed by next week's assessments and estimated workload. Plan Next Week opens the day planner for next Monday; choose each date you want to plan. V1 assessments have no historical submission timestamp, so they are not retrospectively counted as submitted this week.

## Timer persistence

One active timer per owner is enforced by a unique database key. Start requests have a client-generated unique ID. Pause/resume/finish use revision checks, and completion stores a unique StudySession link so network retries cannot record a session twice. Refresh, navigation and server restart recover the same timer. Devices project elapsed time from server timestamps; no per-second database writes occur. Visible pages use the existing 15-second synchronisation cycle. Temporary disconnection leaves a timestamp projection on screen; mutations require reconnection. Keep the Acer's system clock accurate. A stopwatch continues to measure elapsed time while the browser is closed; check actual minutes before saving (up to 24 hours per saved session).

## Reminder scheduling and retention

`instrumentation.ts` starts a bounded asynchronous scheduler in the existing Next.js Node process. It first checks about one second after startup, then schedules its next pass sixty seconds after the previous pass finishes. There is no extra Node process, Task Scheduler task or browser-only alarm loop. The Windows launcher remains unchanged, including its 60-second production readiness budget, migrations, singleton control and graceful stopping.

SQLite stores reminder rules, due times, read/dismiss/snooze state and notification delivery attempts. A pass reconciles live assignments, exams, tasks and study sessions, creates due notifications, and sends eligible push messages outside the database transaction. Ordinary record writes also reconcile reminders. Submitted assignments, completed exams/tasks/sessions and deleted records stop their pending reminders; edited deadlines get new schedules. On restart, missed offsets for the same record collapse into the most recent applicable reminder instead of a burst of all missed offsets. Snoozes survive restarts.

Assignment defaults are 7/3/1 days; exams 14/7/3/1 days; tasks at due time; study 15 minutes before and at start. Settings allows category switches and custom comma-separated lead times in minutes. These are category-wide defaults, not a per-record recurrence language. Daily summary and workload warnings default off. A daily summary catches up once on the current civil date; it does not replay every missed day.

Quiet hours defer push but preserve in-app state. Once quiet hours finish, unread notifications created in the last 24 hours become eligible. Older notices stay in the centre for review but do not cause stale lock-screen alerts. The centre retains at most 100 notifications for up to 30 days. Reminder tombstones remain while their records are active, preventing cleanup from resurrecting delivered messages. Dismissed/read notices are not pushed.

## Optional Web Push

The only added runtime dependency is `web-push`, for standard Web Push encryption and VAPID signing. `@types/web-push` is a development-only type package. There is no Firebase project, hosted application notification service or AI API.

Browser vendors' push relays are still required by the Web Push standard: Apple, Mozilla, Google and supported Microsoft endpoints. The Acer makes outbound HTTPS requests to these services; no inbound public access is needed. Payloads are encrypted. Tailscale protects access to the app, and password authentication still applies when a notification opens it. Push delivery itself is handled by the browser vendor and does not require the phone to contact the Acer until you open the app.

First-time local setup (optional, after installation/update):

```bat
cd /d "C:\Projects\student-dashboard"
npm run push:setup -- YOUR-EMAIL@example.com
```

Use your email address as the VAPID contact. This generates keys once into `data/vapid.json`, refuses to overwrite existing keys and never prints them. The file is read by the running server; refresh Settings after creating it. No hostname is hardcoded. `data/`, `.env`, backups, logs, databases, sessions and setup tokens remain excluded from Git. No secrets are checked into `.env.example`.

Back up `data/vapid.json` privately with a **stopped** copy of the whole `data/` directory and `.env`. Portable JSON exports omit push subscriptions, keys, passwords and login sessions. Regenerating keys invalidates the application-server identity associated with existing device subscriptions: disable/stop the app, make a private backup, deliberately move the old `data/vapid.json` out of the way, run `push:setup` again, restart, remove old registered devices in Settings, and unsubscribe/re-enable on each device. Prefer restoring the original keys.

On each device:

1. Open your private HTTPS `.ts.net` address with Tailscale connected. Sign in normally.
2. On iPhone/iPad, use Add to Home Screen, then open that installed app. Supported iOS/iPadOS versions start at 16.4. Check current browser/OS support if the option is unavailable.
3. Settings → Notifications on this device explains the purpose before you select **Enable notifications on this device**. The app never requests permission on first load. Choose a recognisable device name and accept the browser permission prompt.
4. Keep the default **Private** lock-screen setting unless you want record titles and due times displayed. Neither mode sends grades or notes.
5. To stop, use **Unsubscribe this device**. Registered devices can also be removed remotely. If a device was removed remotely, unsubscribe locally before enabling it again. Expired subscriptions returning HTTP 404/410 are removed automatically. Unknown vendor endpoints fall back to in-app reminders.

Failed delivery retries with a persisted five-minute lease, at most five attempts. Each pass handles at most ten deliveries; vendor response timing can extend the interval. Per-device unique records prevent ordinary duplicates, and notification tags collapse retried displays. A crash after the vendor accepts a message but before SQLite records success can still cause a retry: Web Push cannot guarantee exactly-once delivery. Browser/OS permissions, Focus settings, battery restrictions and vendor availability control actual delivery. Messages expire at the push relay after one hour.

No physical iPhone/iPad notification or Acer reboot test is claimed. See the local acceptance checklist below.

## Apply V2 safely on the Acer

Run each command separately in Command Prompt. Stop if a command fails. First export a JSON backup from Settings while the current app is running.

```bat
cd /d "C:\Projects\student-dashboard"
schtasks /Change /TN "Student Dashboard" /Disable
node scripts/windows/dashboard.mjs stop
node scripts/windows/dashboard.mjs status
```

The stopped status command intentionally exits nonzero. Continue only after the stop command confirms shutdown and port 3000 is free. Do not use Task Scheduler End or kill Node. Once stopped, copy the entire `data/` directory and `.env` to a private location outside the repository. Preserve any database sidecar files as part of that directory copy. This snapshot includes your password, sessions and installation secrets; protect it accordingly.

```bat
npm run db:backup
git pull --ff-only
npm install
npm test
npm run typecheck
npm run build
node --import tsx --test tests/startup-production.integration.ts
```

`npm install` uses the existing install hook: Prisma client generation and checked-in `migrate deploy`. The V2 migration adds tables and the nullable Assignment.submittedAt column; it never drops/recreates an existing table or seeds demo data. The tests use disposable databases and the startup tests deliberately take roughly two minutes. Production lifecycle testing requires port 3000 to be free. Do not run these maintenance commands while the scheduled application is still running.

Optionally run `npm run push:setup -- YOUR-EMAIL@example.com` now. Then manually test production:

```bat
node scripts/windows/dashboard.mjs start
```

Leave that terminal running. In a second Command Prompt:

```bat
cd /d "C:\Projects\student-dashboard"
node scripts/windows/dashboard.mjs status
node scripts/windows/dashboard.mjs logs
```

Verify localhost and the Tailscale HTTPS address, then stop the manual instance before re-enabling the task:

```bat
node scripts/windows/dashboard.mjs stop
schtasks /Change /TN "Student Dashboard" /Enable
schtasks /Run /TN "Student Dashboard"
```

Task Scheduler keeps its existing **At startup** configuration and exact Node executable path. Tailscale **Run unattended** and `tailscale serve --bg 3000` remain unchanged. No automatic build on boot, Public-network firewall rule, Funnel or port forwarding is required.

For future maintenance: disable the scheduled task, gracefully stop the dashboard, back up, update/test/build, manually validate, stop the manual instance, re-enable and run the task. Disabling a task does not stop its current process.

## Local acceptance checklist

- Verify existing records, password and sessions; export JSON and CSV. Restore testing should use a disposable installation or a protected backup.
- Change the desktop Dashboard, reload, and verify it saved. On phone/tablet check their separate layouts, show/hide/reorder and Compact/Comfortable. Check light/dark mode, keyboard focus and touch targets.
- Start a short timer, pause/resume from another authenticated device, refresh, close/reopen the PWA, then finish/save. Confirm exactly one StudySession and no duplicate manual time entry. Check Focus Mode and the mini timer.
- Create a disposable task with a near deadline and a custom reminder offset. Test reminder rescheduling, completion cancellation, snooze, quiet hours, read/unread and dismissal.
- Enable push explicitly per device. Test delivery with the PWA closed, private lock-screen text, notification opening, OS Focus/notification settings, unsubscribe and expired device removal. Keep Tailscale connected to open the application.
- Restart the Acer after saving other work. Leave it at the Windows sign-in screen for about three minutes. Verify remote access from mobile data, then inspect launcher status/logs. Verify the active timer and pending reminders survived. The laptop must be powered on, awake and online, Next.js running, and Tailscale unattended/Serve active.

## Validation boundaries

Automated tests use temporary SQLite databases and cover additive migration, original workflows, V2 persistence, CSRF/auth checks and production startup. Browser review uses isolated fictional component fixtures to inspect desktop, phone and tablet layouts without using your credentials. It is not a physical device test or a logged-in browser end-to-end test. `tests/visual-fixture.tsx` and its generator are test tooling only; generated fixture assets must be removed from `public/` before shipping.

## Technical references

The integration follows [Next.js instrumentation](https://nextjs.org/docs/app/guides/instrumentation), the [web-push library](https://github.com/web-push-libs/web-push), and [WebKit’s Home Screen Web Push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). The app feature-detects support and leaves in-app reminders available when push cannot be enabled.

Restoring a V1 portable backup replaces academic data and clears V2 productivity state (layouts, timer history/state, Inbox, recurrence rules and notifications) because V1 has no such records. Passwords, login sessions, local VAPID keys and installation subscriptions remain. Prefer a V2 export or a stopped full data-directory backup once you begin using V2. Restoring either format is an explicit replacement operation, separate from the additive update migration.
