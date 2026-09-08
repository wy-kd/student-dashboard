'use client';
import { useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useProductivity } from './productivity';
import { DateTimeInput } from './DateTimeInput';
import { formatDate } from '@/lib/format';
import type { TodoRow } from '@/lib/todos';
import { todoRequestId } from '@/lib/todo-request-id';

export function TodoList({ compact = false }: { compact?: boolean }) {
  const { state, act, reload, go } = useProductivity();
  const rows: TodoRow[] = state?.todos ?? [];
  const pending = rows.filter((row) => !row.completed);
  const visible = compact ? pending.slice(0, 5) : rows;
  const [name, setName] = useState(''),
    [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [editing, setEditing] = useState<{ old: TodoRow; name: string; dueDate: string } | null>(
    null,
  );
  const request = useRef<{ key: string; id: string } | null>(null);
  async function run(action: string, values: Record<string, unknown>, success?: () => void) {
    setBusy(true);
    setError('');
    try {
      await act(action, values);
      success?.();
    } catch (e: any) {
      setError(e.message);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={'todo-list' + (compact ? ' todo-preview' : '')}>
      <form
        className="todo-add"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !name.trim()) return;
          const todo = { name: name.trim(), dueDate: dueDate || null },
            key = JSON.stringify(todo);
          if (request.current?.key !== key) request.current = { key, id: todoRequestId() };
          void run('todo.create', { requestId: request.current.id, todo }, () => {
            setName('');
            setDueDate('');
            request.current = null;
          });
        }}
      >
        <div className="todo-add-line">
          <input
            aria-label="New to-do"
            autoComplete="off"
            placeholder="Add a quick to-do…"
            required
            maxLength={500}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="button secondary" disabled={busy || !name.trim()}>
            Add
          </button>
        </div>
        {!compact && (
          <details className="todo-options">
            <summary>Due date (optional)</summary>
            <label className="field">
              Due date
              <DateTimeInput
                type="date"
                value={dueDate}
                disabled={busy}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </details>
        )}
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted todo-count">
        {pending.length} pending{!compact && ` · ${rows.length - pending.length} completed`}
      </p>
      {!visible.length && (
        <p className="muted">
          {rows.length ? 'All caught up.' : 'No to-dos yet. Add your first quick reminder.'}
        </p>
      )}
      <ul className="todo-items">
        {visible.map((row) => (
          <li key={row.id} className={row.completed ? 'is-complete' : ''}>
            {editing?.old.id === row.id ? (
              <form
                className="todo-edit"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy)
                    void run(
                      'todo.save',
                      {
                        id: row.id,
                        revision: editing.old.revision,
                        todo: { name: editing.name, dueDate: editing.dueDate || null },
                      },
                      () => setEditing(null),
                    );
                }}
              >
                <label className="field">
                  To-do text
                  <input
                    autoComplete="off"
                    required
                    maxLength={500}
                    value={editing.name}
                    disabled={busy}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Due date (optional)
                  <DateTimeInput
                    type="date"
                    value={editing.dueDate}
                    disabled={busy}
                    onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })}
                  />
                </label>
                <div className="todo-actions">
                  <button className="button primary" disabled={busy}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancel edit
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="todo-item-main">
                  <label className="todo-check">
                    <input
                      type="checkbox"
                      checked={row.completed}
                      disabled={busy}
                      onChange={(e) =>
                        void run('todo.complete', {
                          id: row.id,
                          revision: row.revision,
                          completed: e.target.checked,
                        })
                      }
                    />
                    <span>{row.name}</span>
                  </label>
                  {row.dueDate && <small>Due {formatDate(row.dueDate)}</small>}
                </div>
                {!compact && (
                  <div className="todo-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      aria-label={'Edit to-do ' + row.name}
                      onClick={() => {
                        setError('');
                        setEditing({ old: row, name: row.name, dueDate: row.dueDate ?? '' });
                      }}
                    >
                      Edit
                    </button>
                    <div className="todo-order" role="group" aria-label={'Order ' + row.name}>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={'Move ' + row.name + ' up'}
                        disabled={busy || rows[0]?.id === row.id}
                        onClick={() =>
                          void run('todo.move', { id: row.id, revision: row.revision, delta: -1 })
                        }
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={'Move ' + row.name + ' down'}
                        disabled={busy || rows.at(-1)?.id === row.id}
                        onClick={() =>
                          void run('todo.move', { id: row.id, revision: row.revision, delta: 1 })
                        }
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="text-button danger-text todo-delete"
                      disabled={busy}
                      aria-label={'Delete to-do ' + row.name}
                      onClick={() => {
                        if (confirm(`Delete to-do “${row.name}”?`))
                          void run('todo.delete', { id: row.id, revision: row.revision });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {compact && (
        <button
          type="button"
          className="text-button todo-view-all"
          onClick={() => go('/tasks#todo-list')}
        >
          View all to-dos →
        </button>
      )}
    </div>
  );
}
