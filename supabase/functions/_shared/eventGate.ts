export function createEventGate() {
  const seen = new Set<string>()
  return function accept(event: { eventId: string; shotIndex?: number }, currentShotIndex: number): boolean {
    if (!event.eventId || seen.has(event.eventId)) return false
    seen.add(event.eventId)
    if (typeof event.shotIndex === 'number' && event.shotIndex < currentShotIndex) return false
    return true
  }
}
