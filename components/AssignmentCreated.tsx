'use client';
import { useEffect, useRef } from 'react';
import type { RecordRow } from '@/lib/model';
export function AssignmentCreated({
  assignment,
  close,
  breakdown,
}: {
  assignment: RecordRow;
  close(): void;
  breakdown(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editor assignment-dialog assignment-created-dialog"
      aria-labelledby="assignment-created-title"
      onCancel={close}
    >
      <header className="assignment-dialog-header">
        <h2 id="assignment-created-title">Assignment created</h2>
      </header>
      <div className="assignment-dialog-body">
        <p className="assignment-dialog-name">
          Assignment: <strong>{assignment.name}</strong>
        </p>
        <p>Would you like to break this assignment into smaller tasks?</p>
        <p className="muted">Your assignment has been saved. You can also do this later.</p>
      </div>
      <footer className="assignment-dialog-footer">
        <button type="button" className="button secondary" onClick={close}>
          Maybe later
        </button>
        <button type="button" className="button primary" onClick={breakdown}>
          Break into tasks
        </button>
      </footer>
    </dialog>
  );
}
