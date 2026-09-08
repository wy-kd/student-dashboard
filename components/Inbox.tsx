'use client';
import { DateTimeInput } from './DateTimeInput';
import { useState } from 'react';
import { useProductivity } from './productivity';
import { Section, Empty } from './ui';
export function QuickCapture() {
  const { act, notify } = useProductivity(),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="quick-capture"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await act('capture', { name });
          setName('');
          notify('Captured in Inbox.');
        } catch (e: any) {
          notify(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Quick Capture
        <input
          autoComplete="off"
          placeholder="What do you need to remember?"
          maxLength={500}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button className="button primary" disabled={busy || !name.trim()}>
        Capture
      </button>
    </form>
  );
}
export function Inbox() {
  const { state, act, notify, allData: d } = useProductivity(),
    [selected, setSelected] = useState<string | null>(null),
    [task, setTask] = useState<any>({}),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inbox</h1>
          <p>Capture now. Organise when you have a moment.</p>
        </div>
      </div>
      <QuickCapture />
      <Section title="To organise">
        {(state?.inbox ?? []).map((item: any) => (
          <div className="inbox-item" key={item.id}>
            {selected === item.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await act('inbox.organise', { id: item.id, task });
                    setSelected(null);
                  } catch (e: any) {
                    notify(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="form-grid">
                  <label className="field">
                    Task
                    <input
                      autoComplete="off"
                      value={task.name}
                      required
                      maxLength={500}
                      onChange={(e) => setTask({ ...task, name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Subject
                    <select
                      value={task.subjectId ?? ''}
                      onChange={(e) => setTask({ ...task, subjectId: e.target.value })}
                    >
                      <option value="">Personal</option>
                      {d.subject.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Assignment
                    <select
                      value={task.assignmentId ?? ''}
                      onChange={(e) =>
                        setTask({
                          ...task,
                          assignmentId: e.target.value,
                          subjectId:
                            d.assignment.find((a) => a.id === e.target.value)?.subjectId ??
                            task.subjectId,
                        })
                      }
                    >
                      <option value="">None</option>
                      {d.assignment.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Due date
                    <DateTimeInput
                      autoComplete="off"
                      type="datetime-local"
                      value={task.dueAt ?? ''}
                      onChange={(e) => setTask({ ...task, dueAt: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Priority
                    <select
                      value={task.priority ?? 'Medium'}
                      onChange={(e) => setTask({ ...task, priority: e.target.value })}
                    >
                      {['Low', 'Medium', 'High', 'Critical'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="button primary" disabled={busy}>
                  Create task & leave Inbox
                </button>
                <button type="button" className="text-button" onClick={() => setSelected(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <div className="spread">
                <strong>{item.name}</strong>
                <div className="inline">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSelected(item.id);
                      setTask({ name: item.name, priority: 'Medium' });
                    }}
                  >
                    Organise
                  </button>
                  <button
                    className="text-button muted"
                    onClick={() => {
                      if (confirm('Delete this capture?'))
                        act('inbox.delete', { id: item.id }).catch((e: any) => notify(e.message));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!state?.inbox?.length && (
          <Empty
            title="Nothing waiting"
            text="Capture a thought above; it does not need a subject or date yet."
          />
        )}
      </Section>
    </>
  );
}
