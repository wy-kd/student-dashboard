export async function requestPlanning(action: string, data: any) {
  const response = await fetch('/api/planning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error ?? 'Planning request failed.');
  return body.result;
}
