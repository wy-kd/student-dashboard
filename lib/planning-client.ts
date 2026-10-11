export async function requestPlanning(action: string, data: any) {
  const response = await fetch('/api/planning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = Object.assign(Error(body.error ?? 'Planning request failed.'), {
      status: response.status,
    });
    throw error;
  }
  return body.result;
}
