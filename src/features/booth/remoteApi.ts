import type { BoothEvent, SignalRecord } from '@shared/types.ts'
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase.ts'
import type { BoothError, ParticipantSlot, PublicSnapshot } from '../../types/booth.ts'
import type { AuthResult, BoothApi, SyncResult } from './api.ts'
import { BoothRequestError } from './errors.ts'

interface RemotePayload {
  ok: boolean
  error?: BoothError
  snapshot: PublicSnapshot | null
  signals?: SignalRecord[]
  serverNow: number
  roomCode?: string
  participantToken?: string
  slot?: ParticipantSlot
}

export function createRemoteApi(): BoothApi {
  async function call(name: string, body: unknown, keepalive = false): Promise<RemotePayload> {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new BoothRequestError('invalid', null)
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      keepalive,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as RemotePayload
    if (!payload.ok || !payload.snapshot) throw new BoothRequestError(payload.error ?? 'invalid', payload.snapshot)
    return payload
  }

  function asSync(payload: RemotePayload): SyncResult {
    return { snapshot: payload.snapshot as PublicSnapshot, signals: payload.signals ?? [], serverNow: payload.serverNow }
  }

  function asAuth(payload: RemotePayload): AuthResult {
    if (!payload.roomCode || !payload.participantToken || !payload.slot || !payload.snapshot) {
      throw new BoothRequestError('invalid', payload.snapshot)
    }
    return {
      sessionId: payload.snapshot.sessionId,
      roomCode: payload.roomCode,
      participantToken: payload.participantToken,
      slot: payload.slot,
      snapshot: payload.snapshot,
      serverNow: payload.serverNow,
    }
  }

  return {
    createBooth: (input) => call('create-booth', input).then(asAuth),
    joinBooth: (roomCode) => call('join-booth', { roomCode }).then(asAuth),
    sync: (sessionId, token) => call('sync-booth', { sessionId, participantToken: token }).then(asSync),
    setReady: (sessionId, token, isReady, cameraReady) =>
      call('set-ready', { sessionId, participantToken: token, isReady, cameraReady }).then(asSync),
    startShot: (sessionId, token) => call('start-shot', { sessionId, participantToken: token }).then(asSync),
    reportCapture: (sessionId, token, shotIndex, status) =>
      call('report-capture', { sessionId, participantToken: token, shotIndex, status }).then(asSync),
    resolveShot: (sessionId, token, shotIndex, vote) =>
      call('resolve-shot', { sessionId, participantToken: token, shotIndex, vote }).then(asSync),
    setTheme: (sessionId, token, themeId) => call('set-theme', { sessionId, participantToken: token, themeId }).then(asSync),
    leave: (sessionId, token, endSession, keepalive) =>
      call('leave-booth', { sessionId, participantToken: token, endSession }, keepalive).then(asSync),
    async postSignal(sessionId, token, signal) {
      await call('post-signal', { sessionId, participantToken: token, signal })
    },
    subscribe(sessionId, listener) {
      if (!isSupabaseConfigured()) return () => undefined
      const supabase = getSupabase()
      if (!supabase) return () => undefined
      const channel = supabase.channel(`booth:${sessionId}`)
      channel.on('broadcast', { event: 'booth_event' }, ({ payload }) => listener(payload as BoothEvent))
      void channel.subscribe()
      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
