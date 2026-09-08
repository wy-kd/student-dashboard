'use client';
import { useState } from 'react';
import { useApp } from './context';
import { defaults, type RecordRow } from '@/lib/model';
import { formatDate } from '@/lib/format';
import { DateTimeInput } from './DateTimeInput';
export function SemesterBreaks({ semester }: { semester: RecordRow }) {
  const { allData, save, remove, notify } = useApp();
  const [editing, setEditing] = useState<{
    old?: RecordRow;
    name: string;
    start: string;
    end: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const breaks = allData.importantDate
    .filter((b) => b.kind === 'Break' && b.semesterId === semester.id)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const begin = (old?: RecordRow) => {
    setError('');
    setEditing({
      old,
      name: old?.name ?? '',
      start: old?.dueAt.slice(0, 10) ?? semester.teachingStart,
      end: old?.endDate ?? old?.dueAt.slice(0, 10) ?? semester.teachingStart,
    });
  };
  return (
    <section className="semester-breaks" aria-label={'Semester breaks for ' + semester.name}>
      <header>
        <div>
          <h3>Semester breaks</h3>
          <p>Recurring classes pause. Your deadlines and manual study sessions stay.</p>
        </div>
        <button type="button" className="button secondary" disabled={busy} onClick={() => begin()}>
          Add semester break
        </button>
      </header>
      {!breaks.length && <p className="muted">No semester breaks added.</p>}
      <div className="semester-break-list">
        {breaks.map((b) => (
          <article key={b.id}>
            <div>
              <strong>{b.name}</strong>
              <p>
                {formatDate(b.dueAt)} – {formatDate(b.endDate ?? b.dueAt)}
              </p>
            </div>
            <div className="break-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => begin(b)}
                aria-label={'Edit break ' + b.name}
              >
                Edit
              </button>
              <button
                type="button"
                className="button secondary danger-text"
                disabled={busy}
                aria-label={'Delete break ' + b.name}
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete semester break “${b.name}”? Recurring classes will appear on these dates again. No class series or deadlines are deleted.`,
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await remove('importantDate', b);
                    if (editing?.old?.id === b.id) setEditing(null);
                  } catch (e: any) {
                    notify(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <form
          className="semester-break-editor"
          autoComplete="off"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await save(
                'importantDate',
                {
                  ...defaults('importantDate'),
                  ...editing.old,
                  name: editing.name,
                  dueAt: editing.start + 'T00:00',
                  endDate: editing.end,
                  kind: 'Break',
                  semesterId: semester.id,
                },
                editing.old,
              );
              setEditing(null);
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h4>{editing.old ? 'Edit semester break' : 'Add semester break'}</h4>
          <label className="field">
            Name
            <input
              autoComplete="off"
              required
              maxLength={500}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <div className="break-dates">
            <label className="field">
              Start date
              <DateTimeInput
                type="date"
                required
                value={editing.start}
                onChange={(e) => setEditing({ ...editing, start: e.target.value })}
              />
            </label>
            <label className="field">
              End date
              <DateTimeInput
                type="date"
                required
                min={editing.start}
                value={editing.end}
                onChange={(e) => setEditing({ ...editing, end: e.target.value })}
              />
            </label>
          </div>
          <small>
            Both dates are included. A whole teaching week on break is skipped in the week count.
          </small>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <footer>
            <button className="button primary" disabled={busy}>
              Save break
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
