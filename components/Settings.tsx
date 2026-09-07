'use client';
import { useState } from 'react';
import { NotificationSettings } from './Notifications';
import { Download, Plus, ShieldCheck } from 'lucide-react';
import { useApp } from './context';
import { Heading, SimpleRows } from './Records';
import { Section } from './ui';
import { entities, labels } from '@/lib/model';
export function Settings() {
  const { allData: d, reload, notify, open } = useApp();
  const [form, setForm] = useState({ ...d.setting });
  const [busy, setBusy] = useState(false);
  async function action(url: string, body: any, message: string) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const r = await res.json();
      if (!res.ok) throw Error(r.error);
      await reload();
      notify(
        r.retained
          ? `${message} ${r.retained} demo records retained because your records link to them.`
          : message,
      );
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading title="Settings" sub="Your semester, preferences and data." />
      <Section title="Preferences">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action(
              '/api/data',
              {
                entity: 'setting',
                data: {
                  name: form.name,
                  timezone: form.timezone,
                  dailyHours: Number(form.dailyHours),
                  activeSemesterId: form.activeSemesterId || null,
                },
              },
              'Preferences saved.',
            );
          }}
        >
          <div className="form-grid">
            <label className="field">
              Your name
              <input
                value={form.name}
                maxLength={80}
                required
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="field">
              Timezone
              <input
                value={form.timezone}
                required
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
              <small>
                Dates are local wall times in this timezone. Default: Australia/Brisbane. Changing
                this does not shift stored dates.
              </small>
            </label>
            <label className="field">
              Daily study capacity (hours)
              <input
                type="number"
                min={0.25}
                max={16}
                step={0.25}
                value={form.dailyHours}
                onChange={(e) => setForm({ ...form, dailyHours: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Default semester
              <select
                value={form.activeSemesterId ?? ''}
                onChange={(e) => setForm({ ...form, activeSemesterId: e.target.value })}
              >
                <option value="">All semesters</option>
                {d.semester.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="button primary" disabled={busy}>
            Save preferences
          </button>
        </form>
      </Section>
      <NotificationSettings />
      <details className="more-fields">
        <summary>Semesters & data maintenance</summary>
        <Section
          title="Semesters"
          action={
            <button className="text-button" onClick={() => open({ entity: 'semester' })}>
              <Plus size={17} />
              Add semester
            </button>
          }
        >
          <SimpleRows entity="semester" rows={d.semester} />
          <p className="muted">
            Teaching weeks count from your first teaching date. Add a Break in Calendar covering a
            whole teaching week to skip it. Use Important Dates for census dates and holidays. Demo
            dates are illustrative.
          </p>
        </Section>
        <Section
          title="Backups & data export"
          sub="Backups include academic records and preferences. Passwords and login sessions are excluded."
        >
          <div className="action-grid">
            <div>
              <h3>Download a portable backup</h3>
              <p>
                Keep a copy somewhere separate from your laptop. Anyone with this file can read its
                academic data.
              </p>
              <a className="button secondary" href="/api/backup" download>
                <Download size={17} />
                Export JSON backup
              </a>
            </div>
            <div>
              <h3>Save a backup on this laptop</h3>
              <p>Creates a dated JSON file in the project’s backups folder.</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  action(
                    '/api/backup',
                    { action: 'backup' },
                    'Backup saved in the laptop’s backups folder.',
                  )
                }
              >
                Create local backup
              </button>
            </div>
            <div>
              <h3>Restore a backup</h3>
              <p>
                Replaces academic and productivity records. The current data is backed up
                automatically before restoring.
              </p>
              <label className="button secondary file-button">
                Choose JSON backup
                <input
                  aria-label="Choose JSON backup to restore"
                  type="file"
                  accept="application/json,.json"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    if (file.size > 5_000_000) {
                      notify('Maximum backup size is 5 MB.');
                      return;
                    }
                    if (
                      !confirm(
                        'Replace all academic data with this backup? A copy of current data will be saved first.',
                      )
                    )
                      return;
                    try {
                      await action(
                        '/api/backup',
                        JSON.parse(await file.text()),
                        'Backup restored. Refresh any other open devices.',
                      );
                    } catch {
                      notify('The selected file is not valid JSON.');
                    }
                  }}
                />
              </label>
            </div>
          </div>
          <details className="more-fields">
            <summary>Export individual tables as CSV</summary>
            <div className="export-links">
              {entities.map((e) => (
                <a className="button secondary" key={e} href={'/api/backup?csv=' + e} download>
                  {labels[e]}
                </a>
              ))}
            </div>
          </details>
        </Section>
        <Section
          title="Demo data"
          sub="Explore with fictional university records before entering your own."
        >
          <div className="inline">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                action(
                  '/api/demo',
                  { action: 'seed' },
                  'Demo data added. Select Semester 2 · Demo in the top bar.',
                )
              }
            >
              Add demo data
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    'Remove untouched demo records? Edited records and demo parents linked to your records will be kept. A backup is created first.',
                  )
                )
                  action('/api/demo', { action: 'clear' }, 'Demo data removed.');
              }}
            >
              Remove demo data
            </button>
          </div>
          <p className="muted">
            Editing a demo record makes it yours. Removing demo data preserves edited records and
            any parents they need.
          </p>
        </Section>
      </details>
      <Section title="Access from your devices">
        <p>
          Your laptop runs the app and stores the database. Keep it awake, then open{' '}
          <code>http://YOUR-LAPTOP-IP:3000</code> on another device connected to the same Wi-Fi.
        </p>
        <p>
          Full PWA installation and offline features require HTTPS on your phone or iPad. Plain HTTP
          over Wi-Fi supports the app itself. Use your private Tailscale HTTPS address for remote
          access. The README includes setup instructions.
        </p>
        <p className="muted">
          Sign-in uses a single password. If you forget it, stop the server and run{' '}
          <code>npm run password:reset -- --confirm</code> on your laptop. This preserves your
          academic data.
        </p>
      </Section>
    </>
  );
}
