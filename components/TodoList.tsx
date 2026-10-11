'use client';
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useProductivity } from './productivity';
import { TodoConversion } from './TodoConversion';
import { DateTimeInput } from './DateTimeInput';
import { RowMenu } from './RowMenu';
import { useQuickEdit } from './QuickEditScope';
import { formatDate } from '@/lib/format';
import type { TodoRow } from '@/lib/todos';
import { todoRequestId } from '@/lib/todo-request-id';
import { cancelQuickEditKey, listPageSize } from '@/lib/task-workspace';
export function TodoList({
  compact = false,
  workspace = false,
}: {
  compact?: boolean;
  workspace?: boolean;
}) {
  const { state, act, reload, go } = useProductivity(),
    editor = useQuickEdit();
  const rows: TodoRow[] = state?.todos ?? [],
    pending = rows.filter((row) => !row.completed),
    completed = rows.filter((row) => row.completed);
  const [limit, setLimit] = useState(listPageSize),
    [completedLimit, setCompletedLimit] = useState(listPageSize),
    [completedOpen, setCompletedOpen] = useState(false);
  const [name, setName] = useState(''),
    [dueDate, setDueDate] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [editing, setEditing] = useState<{ old: TodoRow; name: string; dueDate: string } | null>(
      null,
    ),
    [converting, setConverting] = useState<TodoRow | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null),
    editButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const disabled = busy || editor.busy;
  function finish() {
    const id = editing?.old.id;
    editor.close();
    setEditing(null);
    if (id) pendingFocus.current = id;
  }
  useEffect(() => {
    if (pendingFocus.current && !disabled) {
      editButtons.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  }, [disabled, editing]);
  async function run(action: string, values: Record<string, unknown>, success?: () => void) {
    if (busy || !editor.startSaving()) return;
    setBusy(true);
    setError('');
    try {
      await act(action, values);
      editor.saving(false);
      success?.();
    } catch (e: any) {
      setError(e.message);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
      editor.saving(false);
    }
  }
  function renderRows(items: TodoRow[]) {
    return (
      <ul className="todo-items">
        {items.map((row) => {
          const isEditing =
            !compact && editor.active === `todo:${row.id}` && editing?.old.id === row.id;
          return (
            <li key={row.id} className={row.completed ? 'is-complete' : ''}>
              <div className="todo-item-main">
                <label className="todo-check">
                  <input
                    type="checkbox"
                    checked={row.completed}
                    disabled={disabled}
                    aria-label={(row.completed ? 'Reopen ' : 'Complete ') + row.name}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      void run(
                        'todo.complete',
                        { id: row.id, revision: row.revision, completed: checked },
                        () => {
                          // Only rebase our own acknowledged checkbox change, never another device's revision.
                          if (isEditing && editing && editing.old.revision === row.revision)
                            setEditing({
                              ...editing,
                              old: {
                                ...editing.old,
                                completed: checked,
                                revision: row.revision + 1,
                              },
                            });
                          if (checked && isEditing) setCompletedOpen(true);
                        },
                      );
                    }}
                  />
                  <span>{row.name}</span>
                </label>
                {row.dueDate && <small>Due {formatDate(row.dueDate)}</small>}
              </div>
              {!compact && (
                <div className="workspace-row-actions">
                  <button
                    type="button"
                    className="icon-button quick-edit-trigger"
                    ref={(node) => {
                      if (node) editButtons.current.set(row.id, node);
                      else editButtons.current.delete(row.id);
                    }}
                    disabled={disabled}
                    aria-label={'Edit to-do ' + row.name}
                    aria-expanded={isEditing}
                    onClick={() => {
                      if (isEditing) finish();
                      else if (editor.begin(`todo:${row.id}`)) {
                        setError('');
                        setEditing({ old: row, name: row.name, dueDate: row.dueDate ?? '' });
                      }
                    }}
                  >
                    <Pencil size={17} />
                  </button>
                  <RowMenu
                    name={row.name}
                    disabled={disabled}
                    actions={[
                      {
                        label: 'Convert to Task',
                        run: () => {
                          if (editor.leave()) {
                            setEditing(null);
                            setConverting(row);
                          }
                        },
                      },
                      {
                        label: 'Move up',
                        disabled: rows[0]?.id === row.id,
                        run: () => {
                          if (editor.leave()) {
                            setEditing(null);
                            void run('todo.move', {
                              id: row.id,
                              revision: row.revision,
                              delta: -1,
                            });
                          }
                        },
                      },
                      {
                        label: 'Move down',
                        disabled: rows.at(-1)?.id === row.id,
                        run: () => {
                          if (editor.leave()) {
                            setEditing(null);
                            void run('todo.move', { id: row.id, revision: row.revision, delta: 1 });
                          }
                        },
                      },
                      {
                        label: 'Delete to-do',
                        destructive: true,
                        run: () => {
                          if (confirm(`Delete to-do “${row.name}”?`))
                            void run('todo.delete', { id: row.id, revision: row.revision }, () => {
                              if (isEditing) finish();
                            });
                        },
                      },
                    ]}
                  />
                </div>
              )}
              {isEditing && editing && (
                <form
                  className="todo-edit quick-editor"
                  aria-label={'Quick edit to-do ' + row.name}
                  autoComplete="off"
                  onKeyDown={(e) => cancelQuickEditKey(e, disabled, finish)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!disabled && editing.name.trim())
                      void run(
                        'todo.save',
                        {
                          id: row.id,
                          revision: editing.old.revision,
                          todo: { name: editing.name.trim(), dueDate: editing.dueDate || null },
                        },
                        finish,
                      );
                  }}
                >
                  <label className="field">
                    To-do title
                    <input
                      autoFocus
                      required
                      maxLength={500}
                      value={editing.name}
                      disabled={disabled}
                      onChange={(e) => {
                        editor.changed();
                        setEditing({ ...editing, name: e.target.value });
                      }}
                    />
                  </label>
                  <label className="field">
                    Due date (optional)
                    <DateTimeInput
                      type="date"
                      value={editing.dueDate}
                      disabled={disabled}
                      onChange={(e) => {
                        editor.changed();
                        setEditing({ ...editing, dueDate: e.target.value });
                      }}
                    />
                  </label>
                  <div className="quick-editor-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={disabled}
                      onClick={finish}
                    >
                      Cancel
                    </button>
                    <button className="button primary" disabled={disabled || !editing.name.trim()}>
                      Save
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  const controls = (count: number, size: number, set: (n: number) => void, label: string) => (
    <div className="workspace-list-controls">
      {count > size && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => set(size + listPageSize)}
        >
          Show more {label}
        </button>
      )}
      {size > listPageSize && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            if (editor.leave()) {
              setEditing(null);
              set(listPageSize);
            }
          }}
        >
          Show less {label}
        </button>
      )}
    </div>
  );
  return (
    <div className={'todo-list' + (compact ? ' todo-preview' : '')}>
      <form
        className="todo-add"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled || !name.trim()) return;
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
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="button secondary" disabled={disabled || !name.trim()}>
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
                disabled={disabled}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </details>
        )}
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
          {editing &&
            ' Your unsaved input is retained. For a conflict, cancel and reopen to load the latest record.'}
        </p>
      )}
      {!workspace && (
        <p className="muted todo-count">
          {pending.length} pending{!compact && ` · ${completed.length} completed`}
        </p>
      )}
      {!pending.length && (
        <p className="workspace-empty muted">
          {rows.length ? 'All caught up.' : 'No to-dos yet. Add a quick reminder.'}
        </p>
      )}
      {renderRows(pending.slice(0, compact ? 5 : limit))}
      {!compact && (
        <>
          {controls(pending.length, limit, setLimit, 'to-dos')}
          <details
            className="workspace-completed"
            open={completedOpen}
            onToggle={(e) => setCompletedOpen(e.currentTarget.open)}
          >
            <summary
              onClick={(e) => {
                if (
                  completedOpen &&
                  editing &&
                  completed.some((t) => t.id === editing.old.id) &&
                  editor.active === `todo:${editing.old.id}`
                ) {
                  if (!editor.leave()) e.preventDefault();
                  else setEditing(null);
                }
              }}
            >
              Completed ({completed.length})
            </summary>
            {completedOpen && (
              <>
                {renderRows(completed.slice(0, completedLimit))}
                {!completed.length && <p className="muted">No completed to-dos yet.</p>}
                {controls(completed.length, completedLimit, setCompletedLimit, 'completed to-dos')}
              </>
            )}
          </details>
        </>
      )}
      {converting && <TodoConversion todo={converting} close={() => setConverting(null)} />}
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
