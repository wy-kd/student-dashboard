'use client';
import { useEffect, useState } from 'react';
import { useProductivity } from './productivity';
import { Section, Empty } from './ui';
export function NotificationCentre() {
  const { state, act, notify, go, open, allData: d } = useProductivity(),
    [busy, setBusy] = useState(false);
  const run = async (action: string, values: any = {}) => {
    setBusy(true);
    try {
      await act(action, values);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  function visit(n: any) {
    const r = n.reminder;
    if (r) {
      for (const [kind, path] of [
        ['assignment', 'assignments'],
        ['exam', 'exams'],
        ['task', 'tasks'],
        ['studySession', 'study'],
      ] as const) {
        const id = r[kind + 'Id'];
        if (!id) continue;
        const row = d[kind].find((x) => x.id === id);
        if (!row) {
          notify('Related record is no longer available.');
          return;
        }
        if (kind === 'assignment' || kind === 'exam') go('/' + path + '/' + id);
        else open({ entity: kind, row });
        break;
      }
    } else go(n.category === 'Workload' ? '/analytics' : '/today');
    run('notification.read', { id: n.id });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>{state?.notifications?.filter((n: any) => !n.readAt).length ?? 0} unread</p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => run('notification.allRead')}
        >
          Mark all read
        </button>
      </div>
      <Section title="Needs your attention">
        {(state?.notifications ?? []).map((n: any) => (
          <article key={n.id} className={'notification ' + (!n.readAt ? 'unread' : '')}>
            <p className="eyebrow">
              {n.category} ·{' '}
              {new Date(n.createdAt).toLocaleString('en-AU', { timeZone: d.setting.timezone })}
            </p>
            <h3>{n.title}</h3>
            <p>{n.message}</p>
            <div className="inline">
              <button className="button secondary" disabled={busy} onClick={() => visit(n)}>
                Open
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run(n.readAt ? 'notification.unread' : 'notification.read', { id: n.id })
                }
              >
                {n.readAt ? 'Mark unread' : 'Mark read'}
              </button>
              <details className="notification-options">
                <summary>More actions</summary>
                {n.reminder &&
                  [15, 60, 1440].map((minutes) => (
                    <button
                      className="text-button"
                      disabled={busy}
                      key={minutes}
                      onClick={() => run('notification.snooze', { id: n.id, minutes })}
                    >
                      {minutes === 1440
                        ? 'Remind tomorrow'
                        : minutes === 60
                          ? 'Snooze 1 hour'
                          : 'Snooze 15 minutes'}
                    </button>
                  ))}
                {n.reminder?.taskId && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Mark the linked task complete?'))
                        run('notification.complete', { id: n.id });
                    }}
                  >
                    Mark task complete
                  </button>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => run('notification.dismiss', { id: n.id })}
                >
                  Dismiss
                </button>
              </details>
            </div>
          </article>
        ))}
        {!state?.notifications?.length && (
          <Empty
            title="All clear"
            text="Reminders will appear here when they need your attention."
          />
        )}
      </Section>
    </>
  );
}
export function NotificationSettings() {
  const { state, act, notify } = useProductivity(),
    [form, setForm] = useState<any>(null),
    [rules, setRules] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [supported, setSupported] = useState(false),
    [deviceName, setDeviceName] = useState('My device'),
    [subscribed, setSubscribed] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (state?.preference && !form) {
      const { userId, layout, revision, ...p } = state.preference;
      setForm(p);
      setRevision(state.preference.revision);
      setRules(
        Object.fromEntries(
          ['assignment', 'exam', 'task', 'studySession'].map((kind) => [
            kind,
            (state.rules ?? [])
              .filter((r: any) => r.kind === kind)
              .map((r: any) => r.leadMinutes)
              .join(', '),
          ]),
        ),
      );
    }
  }, [state?.preference, form]);
  useEffect(() => {
    setSupported(
      window.isSecureContext &&
        location.protocol === 'https:' &&
        'PushManager' in window &&
        'Notification' in window &&
        'serviceWorker' in navigator,
    );
    if ('serviceWorker' in navigator)
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.pushManager?.getSubscription())
        .then((s) => setSubscribed(!!s))
        .catch(() => {});
  }, []);
  async function run(action: string, values: any) {
    setBusy(true);
    try {
      await act(action, values);
      notify('Saved.');
      return true;
    } catch (e: any) {
      notify(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function subscribe() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        notify('Permission was not granted. In-app reminders remain available.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: state.pushPublicKey,
        }));
      await act('push.subscribe', { subscription: sub.toJSON(), name: deviceName });
      setSubscribed(true);
      notify('Notifications enabled on this device.');
    } catch {
      notify('Could not enable notifications. Check browser support and the laptop’s push setup.');
    } finally {
      setBusy(false);
    }
  }
  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready,
        sub = await reg.pushManager.getSubscription();
      if (sub) {
        await act('push.unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      notify('This device is unsubscribed.');
    } catch {
      notify('Could not unsubscribe. Try again while connected.');
    } finally {
      setBusy(false);
    }
  }
  if (!form) return <p>Loading preferences…</p>;
  return (
    <>
      <Section title="Display & notifications">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run('preferences', { preference: form, revision })) setForm(null);
          }}
        >
          <label className="field">
            Display density
            <select
              value={form.density}
              onChange={(e) => setForm({ ...form, density: e.target.value })}
            >
              <option>Comfortable</option>
              <option>Compact</option>
            </select>
          </label>
          <div className="notification-toggles">
            {Object.entries({
              assignmentReminders: 'Assignment reminders',
              examReminders: 'Exam reminders',
              taskReminders: 'Task reminders',
              studyReminders: 'Study reminders',
              workloadWarnings: 'Workload warnings',
              dailySummary: 'Daily summary',
            }).map(([key, label]) => (
              <label className="check-label" key={key}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <details className="more-fields">
            <summary>Delivery times & privacy</summary>
            <div className="form-grid">
              <label className="field">
                Quiet hours start
                <input
                  type="time"
                  value={form.quietStart}
                  onChange={(e) => setForm({ ...form, quietStart: e.target.value })}
                />
              </label>
              <label className="field">
                Quiet hours end
                <input
                  type="time"
                  value={form.quietEnd}
                  onChange={(e) => setForm({ ...form, quietEnd: e.target.value })}
                />
              </label>
              <label className="field">
                Daily summary time
                <input
                  type="time"
                  value={form.summaryTime}
                  onChange={(e) => setForm({ ...form, summaryTime: e.target.value })}
                />
              </label>
              <label className="field">
                Lock-screen privacy
                <select
                  value={form.privatePush ? 'Private' : 'Detailed'}
                  onChange={(e) => setForm({ ...form, privatePush: e.target.value === 'Private' })}
                >
                  <option>Private</option>
                  <option>Detailed</option>
                </select>
              </label>
            </div>
            <p className="muted">
              Quiet hours defer push; reminders stay in the app. Equal start/end disables quiet
              hours. Times use your workspace timezone. Private notifications hide record names;
              neither option includes grades or notes.
            </p>
          </details>
          <button className="button primary" disabled={busy}>
            Save preferences
          </button>
        </form>
      </Section>
      <Section title="Reminder defaults">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const list = Object.entries(rules).flatMap(([kind, text]) =>
                text.trim()
                  ? text.split(',').map((v) => ({ kind, leadMinutes: Number(v.trim()) }))
                  : [],
              );
              await run('rules', { rules: list });
            } catch (e: any) {
              notify(e.message);
            }
          }}
        >
          <p>
            Minutes before the deadline or session. Use comma-separated values; 0 means at the due
            time. Leave empty for no reminders.
          </p>
          <details className="more-fields">
            <summary>Change reminder times</summary>
            <div className="form-grid">
              {Object.entries({
                assignment: 'Assignments · 7, 3, 1 days',
                exam: 'Exams · 14, 7, 3, 1 days',
                task: 'Tasks · at due time',
                studySession: 'Study · 15 minutes before and at start',
              }).map(([kind, label]) => (
                <label key={kind} className="field">
                  {label}
                  <input
                    value={rules[kind] ?? ''}
                    onChange={(e) => setRules({ ...rules, [kind]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <p className="muted">
              1 day = 1440 minutes · 3 days = 4320 · 7 days = 10080 · 14 days = 20160. Editing a
              deadline reschedules its reminders.
            </p>
            <button className="button secondary" disabled={busy}>
              Save reminder times
            </button>
          </details>
        </form>
      </Section>
      <Section title="Notifications on this device">
        <p>
          Receive reminders when the app is closed. Your laptop must be awake and running. Browser
          push services carry encrypted messages; opening the dashboard still requires Tailscale and
          your password.
        </p>
        {!supported ? (
          <p className="notice">
            Push needs your HTTPS address and a supported browser. On iPhone/iPad, add the app to
            the Home Screen and open it there. In-app reminders work here.
          </p>
        ) : !state.pushPublicKey ? (
          <p className="notice">
            Set up local push keys on your laptop using the README, then refresh this page.
          </p>
        ) : (
          <>
            <label className="field">
              Device name
              <input
                maxLength={80}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={busy || !deviceName.trim()}
              onClick={subscribed ? unsubscribe : subscribe}
            >
              {subscribed ? 'Unsubscribe this device' : 'Enable notifications on this device'}
            </button>
          </>
        )}
        <details className="more-fields">
          <summary>Registered devices ({state?.subscriptions?.length ?? 0})</summary>
          {state?.subscriptions?.map((s: any) => (
            <div className="spread" key={s.id}>
              <span>{s.name}</span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (confirm('Stop sending notifications to this device?'))
                    run('push.remove', { id: s.id });
                }}
              >
                Remove device
              </button>
            </div>
          ))}
        </details>
      </Section>
    </>
  );
}
