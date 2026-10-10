/** Presentation only; timer persistence and synchronisation are unchanged. */
export function floatingTimerVisible(timer: { status: string } | null | undefined) {
  return timer?.status === 'running' || timer?.status === 'paused';
}
