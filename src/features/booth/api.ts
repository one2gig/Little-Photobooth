import { estimateClockOffset } from '@shared/clock.ts'
import { captureDelayMs } from '../../lib/config.ts'
import { isSupabaseConfigured } from '../../lib/supabase.ts'
import type { BoothEvent, ParticipantSlot, PublicSnapshot, SignalRecord } from '../../types/booth.ts'
import type { Command, CommandResult } from '@shared/types.ts'
import { createLocalApi, type EventBus, type KeyValueStore } from './localApi.ts'
import { createRemoteApi } from './remoteApi.ts'

export { BoothRequestError } from './errors.ts'

export interface AuthResult {
  sessionId: string
  roomCode: string
  participantToken: string
  slot: ParticipantSlot
  snapshot: PublicSnapshot
  serverNow: number
}

export interface SyncResult {
  snapshot: PublicSnapshot
  signals: SignalRecord[]
  serverNow: number
}

export interface BoothApi {
  createBooth(input: { name: string; themeId: string }): Promise<AuthResult>
  joinBooth(roomCode: string): Promise<AuthResult>
  sync(sessionId: string, token: string): Promise<SyncResult>
  setReady(sessionId: string, token: string, isReady: boolean, cameraReady: boolean): Promise<SyncResult>
  startShot(sessionId: string, token: string): Promise<SyncResult>
  reportCapture(sessionId: string, token: string, shotIndex: number, status: 'captured' | 'failed'): Promise<SyncResult>
  resolveShot(sessionId: string, token: string, shotIndex: number, vote: 'keep' | 'retake'): Promise<SyncResult>
  setTheme(sessionId: string, token: string, themeId: string): Promise<SyncResult>
  leave(sessionId: string, token: string, endSession: boolean, keepalive?: boolean): Promise<SyncResult>
  postSignal(sessionId: string, token: string, signal: SignalRecord): Promise<void>
  subscribe(sessionId: string, listener: (event: BoothEvent) => void): () => void
}

export function createBoothApi(): BoothApi {
  if (isSupabaseConfigured()) return createRemoteApi()
  if (import.meta.env.DEV) {
    return createLocalApi({
      delayMs: captureDelayMs(),
      relay: postDevCommand,
      eventsUrl: '/api/booth/events',
    })
  }
  return createLocalApi({ delayMs: captureDelayMs() })
}

async function postDevCommand(command: Command): Promise<CommandResult> {
  const response = await fetch('/api/booth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  return response.json() as Promise<CommandResult>
}

export function createTestApi(store: KeyValueStore, bus: EventBus, now?: () => number): BoothApi {
  return createLocalApi({ store, bus, now, delayMs: 4000 })
}

export function measureOffset(t0: number, serverNow: number): number {
  return estimateClockOffset(t0, serverNow, Date.now())
}
