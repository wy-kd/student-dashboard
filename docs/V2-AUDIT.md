# Version 2 audit and implementation plan

## Findings before implementation

- Dashboard repeats the nearest deadline, today's session count, task count and semester figures before the actionable lists. Remove the metric strip; keep one concise semester/date line.
- Dashboard and Today are the same component with a flag. Give Today a planning surface; keep Dashboard an editable overview.
- All twelve sidebar entries have equal emphasis. Group daily work, coursework and review; provide phone bottom navigation and a More menu.
- Assignment/exam cards show repeated state badges and dates. Keep deadline and progress primary; put secondary information behind disclosure.
- Task filters consume a wide row; use a labelled compact selector on smaller screens.
- Quick Add already uses a native dialog and More details, but its essential-field list includes estimates, status, priorities and three relation selectors. Narrow creation essentials; keep full editing available.
- Study begins with statistics rather than an action. Put the timer first; collapse historical summaries.
- Grades and Analytics belong in review, not the default Dashboard. Preserve existing calculations.
- Calendar has useful day/week/month views and reusable class expansion with breaks. Reuse these for planning rather than adding a second calendar model.
- Settings mixes everyday preferences and maintenance. Group notifications, appearance and data maintenance.
- Existing native dialogs, empty states, same-origin API helpers, revision checks, StudySession records, backup validation and deterministic priority/workload functions can be reused.

The local preview opened at first-time setup. No user credentials were entered and no authentication bypass was added. Signed-in audit initially uses source inspection; disposable test fixtures will cover the application UI and persistence.

## Direction

A quiet working surface: a clear date, a short ranked list and a focused timer, using the existing indigo palette with restrained borders. Responsive cards adapt to their container. Secondary analytics are optional, not computed for hidden widgets. Comfortable and Compact are the only density choices.

## Delivery order

1. Simplify shell, forms and Dashboard; persist separate desktop/tablet/mobile layouts with keyboard alternatives to drag/resize.
2. Add one owner-scoped timestamp timer, idempotent StudySession completion and Focus Mode.
3. Add relational reminder state, notifications and subscriptions; integrate a bounded scheduler with Next instrumentation. Optional standards-based Web Push uses local VAPID secrets.
4. Add Inbox, bounded recurring task generation, editable day-plan proposals and Weekly Review.
5. Review all layouts/states, test additive migration and existing behaviour, run production lifecycle gates and document the Acer update.

SQLite remains local. No build on boot, additional process, new hosting, Tailscale change or Task Scheduler change is planned.
