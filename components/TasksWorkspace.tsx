'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from './context';
import { TaskRow } from './ui';
import { TodoList } from './TodoList';
import { RecurringTasks } from './RecurringTasks';
import { QuickEditScope, useQuickEdit } from './QuickEditScope';
import {
  filterTaskRows,
  initialTaskView,
  listPageSize,
  taskLists,
  taskViews,
} from '@/lib/task-workspace';
import type { RecordRow } from '@/lib/model';
export function TasksWorkspace() {
  return (
    <QuickEditScope>
      <WorkspaceLists />
    </QuickEditScope>
  );
}
function WorkspaceLists() {
  const { data: d, now, open, allData } = useApp(),
    editor = useQuickEdit();
  const [filter, setFilter] = useState<string>(initialTaskView),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(listPageSize),
    [completedLimit, setCompletedLimit] = useState(listPageSize),
    [completedOpen, setCompletedOpen] = useState(false),
    [recurringOpen, setRecurringOpen] = useState(false);
  const tasks = filterTaskRows(d.task, filter, query, now),
    lists = taskLists(tasks, filter);
  function renderTasks(rows: RecordRow[]) {
    const groups: Record<string, RecordRow[]> = {};
    for (const t of rows) {
      const key =
        filter === 'By Subject'
          ? (d.subject.find((s) => s.id === t.subjectId)?.code ?? 'Personal')
          : filter === 'By Assignment'
            ? (d.assignment.find((a) => a.id === t.assignmentId)?.name ?? 'Standalone / exam tasks')
            : '';
      (groups[key] ??= []).push(t);
    }
    return Object.entries(groups).map(([key, rows]) => (
      <div className="workspace-task-group" key={key}>
        {key && <h3>{key}</h3>}
        {rows.map((t) => (
          <TaskRow key={t.id} row={t} quick />
        ))}
      </div>
    ));
  }
  const moreControls = (total: number, size: number, set: (n: number) => void, label: string) => (
    <div className="workspace-list-controls">
      {total > size && (
        <button
          type="button"
          className="text-button"
          disabled={editor.busy}
          onClick={() => set(size + listPageSize)}
        >
          Show more {label}
        </button>
      )}
      {size > listPageSize && (
        <button
          type="button"
          className="text-button"
          disabled={editor.busy}
          onClick={() => {
            if (editor.leave()) set(listPageSize);
          }}
        >
          Show less {label}
        </button>
      )}
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Tasks</h1>
          <p>Your academic work and everyday checklist, together.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            if (editor.leave()) open({ entity: 'task' });
          }}
        >
          <Plus size={18} />
          Add task
        </button>
      </div>
      <div className="tasks-workspace-container">
        <div className="tasks-workspace-grid">
          <section
            className="workspace-panel academic-tasks"
            aria-labelledby="academic-tasks-heading"
          >
            <header className="workspace-panel-heading">
              <h2 id="academic-tasks-heading">Academic Tasks</h2>
              <p className="muted">{d.task.filter((t) => t.status !== 'Completed').length} open</p>
            </header>
            <div className="workspace-task-filters">
              <label className="field">
                Show
                <select
                  aria-label="Task view"
                  value={filter}
                  disabled={editor.busy}
                  onChange={(e) => {
                    if (editor.leave()) {
                      setFilter(e.target.value);
                      setLimit(listPageSize);
                    }
                  }}
                >
                  {taskViews.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Search tasks
                <input
                  autoComplete="off"
                  aria-label="Filter tasks"
                  placeholder="Search tasks…"
                  value={query}
                  disabled={editor.busy}
                  onChange={(e) => {
                    if (editor.leave()) {
                      setQuery(e.target.value);
                      setLimit(listPageSize);
                    }
                  }}
                />
              </label>
            </div>
            {renderTasks(lists.primary.slice(0, limit))}
            {!lists.primary.length && (
              <p className="workspace-empty muted">
                {filter === 'Completed'
                  ? 'No completed tasks match this view.'
                  : 'No outstanding tasks match this view. Change the filter or add a task.'}
              </p>
            )}
            {moreControls(lists.primary.length, limit, setLimit, 'tasks')}
            {filter === 'All' && (
              <details
                className="workspace-completed"
                open={completedOpen}
                onToggle={(e) => setCompletedOpen(e.currentTarget.open)}
              >
                <summary
                  onClick={(e) => {
                    if (
                      completedOpen &&
                      lists.completed.some((t) => editor.active === `task:${t.id}`) &&
                      !editor.leave()
                    )
                      e.preventDefault();
                  }}
                >
                  Completed ({lists.completed.length})
                </summary>
                {completedOpen && (
                  <>
                    {renderTasks(lists.completed.slice(0, completedLimit))}
                    {!lists.completed.length && <p className="muted">No completed tasks yet.</p>}
                    {moreControls(
                      lists.completed.length,
                      completedLimit,
                      setCompletedLimit,
                      'completed tasks',
                    )}
                  </>
                )}
              </details>
            )}
          </section>
          <section
            id="todo-list"
            className="workspace-panel quick-todos"
            aria-labelledby="quick-todos-heading"
          >
            <header className="workspace-panel-heading">
              <h2 id="quick-todos-heading">Quick To-dos</h2>
              <p className="muted">
                {(allData.productivity?.todos ?? []).filter((t: any) => !t.completed).length}{' '}
                pending
              </p>
            </header>
            <TodoList workspace />
          </section>
        </div>
      </div>
      <details
        className="workspace-recurring"
        open={recurringOpen}
        onToggle={(e) => setRecurringOpen(e.currentTarget.open)}
      >
        <summary>
          <span>Recurring Tasks</span>
          <span className="muted">
            {(allData.productivity?.recurrences ?? []).filter((r: any) => r.enabled).length} active
          </span>
        </summary>
        {recurringOpen && <RecurringTasks />}
      </details>
    </>
  );
}
