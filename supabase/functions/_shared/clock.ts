export function estimateClockOffset(t0: number, serverNow: number, t1: number): number {
  return serverNow - (t0 + t1) / 2
}

export function remainingUntil(captureAt: number, now: number, offsetMs: number): number {
  return captureAt - (now + offsetMs)
}

/** Show 3, 2, 1. Time beyond three seconds stays on 3 so the sync buffer is invisible. */
export function countdownDisplay(remainingMs: number): number {
  if (remainingMs <= 0) return 0
  return Math.min(3, Math.ceil(remainingMs / 1000))
}
