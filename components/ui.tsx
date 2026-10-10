'use client';
import { formatDate, formatTime } from '@/lib/format';
import { Pencil, Trash2, Plus, ArrowUpRight, Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { useProductivity } from './productivity';
import { todoRequestId } from '@/lib/todo-request-id';
import { useApp, subjectName } from './context';
import { fields, type Entity, type RecordRow } from '@/lib/model';
import { assignmentProgress, examProgress, countdown } from '@/lib/calculations';
export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress-wrap">
      <div className="progress-label">
        <span>{label ?? 'Progress'}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className={'badge ' + String(children).toLowerCase().replaceAll(' ', '-')}>
      {children}
    </span>
  );
}
export function Empty({
  title = 'Nothing here yet',
  text = 'Add your first record to get started.',
  action,
}: {
  title?: string;
  text?: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Check size={24} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button secondary" onClick={action}>
          <Plus size={16} />
          Add new
        </button>
      )}
    </div>
  );
}
export function Section({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function RecordActions({ entity, row }: { entity: Entity; row: RecordRow }) {
  const { open, remove, notify } = useApp();
  return (
    <div className="record-actions">
      <button
        className="icon-button"
        aria-label={'Edit ' + (row.name ?? 'grade')}
        onClick={() => open({ entity, row })}
      >
        <Pencil size={16} />
      </button>
      <button
        className="icon-button danger"
        aria-label={'Delete ' + (row.name ?? 'grade')}
        onClick={() => {
          if (confirm(`Delete ${row.name ?? 'this grade'}? Linked records must be removed first.`))
            remove(entity, row).catch((e) => notify(e.message));
        }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
export function SubjectTag({ id }: { id?: string }) {
  const { allData } = useApp();
  return (
    <span
      className="subject-tag"
      style={
        {
          '--subject': allData.subject.find((s) => s.id === id)?.color ?? '#748098',
        } as React.CSSProperties
      }
    >
      <i />
      {subjectName(allData, id)}
    </span>
  );
}
export function Due({ at, exam = false }: { at: string; exam?: boolean }) {
  const { now } = useApp();
  return <span className={at < now ? 'due overdue' : 'due'}>{countdown(at, now, exam)}</span>;
}
export function TaskRow({ row }: { row: RecordRow }) {
  const { save, notify, allData, go, act } = useProductivity();
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const completed = row.status === 'Completed';
  return (
    <div className={'task-row ' + (completed ? 'is-done' : '')}>
      <input
        autoComplete="off"
        aria-label={'Complete ' + row.name}
        type="checkbox"
        checked={completed}
        onChange={() =>
          save('task', { ...row, status: completed ? 'Not Started' : 'Completed' }, row).catch(
            (e) => notify(e.message),
          )
        }
      />
      <div className="grow">
        <strong>{row.name}</strong>
        <div className="metadata">
          <SubjectTag id={row.subjectId} />
          {completed ? <Badge>Completed</Badge> : row.dueAt && <Due at={row.dueAt} />}
          <span>{row.estimatedHours ? `${row.estimatedHours}h estimated` : 'No estimate'}</span>
          {row.dueAt && (
            <span>
              {formatDate(row.dueAt)} · {formatTime(row.dueAt)}
            </span>
          )}
          {row.assignmentId && (
            <button
              className="text-button task-parent"
              onClick={() => go('/assignments/' + row.assignmentId)}
              aria-label={
                'Open assignment ' + allData.assignment.find((a) => a.id === row.assignmentId)?.name
              }
            >
              {allData.assignment.find((a) => a.id === row.assignmentId)?.name}
            </button>
          )}
        </div>
      </div>
      <Badge>{row.priority}</Badge>
      {!completed && (
        <button
          className="button secondary task-focus"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            requestId.current ??= todoRequestId();
            try {
              await act('timer.start', {
                timer: {
                  requestId: requestId.current,
                  name: row.name,
                  taskId: row.id,
                  mode: 'countdown',
                  focusMinutes: 50,
                  breakMinutes: 10,
                  rounds: 1,
                },
              });
              requestId.current = null;
              go('/focus');
            } catch (e: any) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Focus
        </button>
      )}
      <RecordActions entity="task" row={row} />
    </div>
  );
}
export function AssessmentCard({ row, exam = false }: { row: RecordRow; exam?: boolean }) {
  const { allData, go } = useApp();
  const value = exam ? examProgress(row, allData) : assignmentProgress(row, allData);
  return (
    <article className="assessment-card">
      <div className="spread">
        <SubjectTag id={row.subjectId} />
        <RecordActions entity={exam ? 'exam' : 'assignment'} row={row} />
      </div>
      <button
        className="title-link"
        onClick={() => go(`/${exam ? 'exams' : 'assignments'}/${row.id}`)}
      >
        {row.name}
        <ArrowUpRight size={18} />
      </button>
      <div className="metadata">
        {(exam ? row.completed : row.status === 'Submitted') ? (
          <Badge>{exam ? 'Completed' : 'Submitted'}</Badge>
        ) : (
          <Due at={row.dueAt} exam={exam} />
        )}
        <span>{row.weighting}% weighting</span>
      </div>
      <Progress value={value} label={exam ? 'Revision' : 'Completion'} />
      <details className="more-fields">
        <summary>Details & status</summary>
        <p className="muted">
          {formatDate(row.dueAt)} · {formatTime(row.dueAt)}
          {exam ? ' · ' + row.location : ''}
        </p>
        <div className="card-bottom">
          <Badge>
            {exam
              ? row.completed
                ? 'Completed'
                : 'Confidence ' + row.confidence + '/5'
              : row.status}
          </Badge>
          {!exam && <Badge>{row.priority}</Badge>}
        </div>
      </details>
    </article>
  );
}
