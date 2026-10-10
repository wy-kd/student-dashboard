export class TaskWorkflowError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
export async function postTaskWorkflow(payload: Record<string, unknown>) {
  const response = await fetch('/api/task-workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok)
    throw new TaskWorkflowError(body.error || 'Could not save tasks.', response.status);
  return body;
}
