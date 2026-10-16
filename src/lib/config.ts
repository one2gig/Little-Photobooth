import { CAPTURE_DELAY_MS } from '@shared/constants.ts'

export function captureDelayMs(): number {
  const raw = import.meta.env.VITE_CAPTURE_DELAY_MS
  const parsed = raw ? Number(raw) : CAPTURE_DELAY_MS
  if (!Number.isFinite(parsed)) return CAPTURE_DELAY_MS
  return Math.min(10_000, Math.max(1000, Math.round(parsed)))
}

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
  const turnUrl = import.meta.env.VITE_TURN_URL
  if (!turnUrl) return servers
  servers.push({
    urls: turnUrl,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  })
  return servers
}
