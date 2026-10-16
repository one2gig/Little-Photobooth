import type { Credentials } from '../../types/booth.ts'

const KEY = 'little-booth.credentials.v1'

export function saveCredentials(value: Credentials): void {
  const json = JSON.stringify(value)
  sessionStorage.setItem(KEY, json)
  localStorage.setItem(KEY, json)
}

export function loadCredentials(): Credentials | null {
  const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Credentials>
    if (!parsed.sessionId || !parsed.token || (parsed.slot !== 'host' && parsed.slot !== 'guest') || !parsed.roomCode) {
      return null
    }
    const credentials: Credentials = {
      sessionId: parsed.sessionId,
      token: parsed.token,
      slot: parsed.slot,
      roomCode: parsed.roomCode,
    }
    sessionStorage.setItem(KEY, JSON.stringify(credentials))
    return credentials
  } catch {
    return null
  }
}

export function clearCredentials(): void {
  sessionStorage.removeItem(KEY)
  localStorage.removeItem(KEY)
}
