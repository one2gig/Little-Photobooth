import { CAPTURE_DELAY_MS, isThemeId } from './constants.ts'
import { generateRoomCode, generateToken, normalizeRoomCode, sha256Hex } from './codes.ts'
import { applyCommand, emptyDatabase } from './stateMachine.ts'
import type { ApplyResult, BoothError, Command, Database, ParticipantSlot, SessionRecord, SignalKind } from './types.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
}

export type Action =
  | 'create'
  | 'join'
  | 'sync'
  | 'set-ready'
  | 'start-shot'
  | 'report-capture'
  | 'resolve-shot'
  | 'set-theme'
  | 'leave'
  | 'post-signal'
  | 'expire'

interface Secrets {
  roomCode?: string
  participantToken?: string
  slot?: ParticipantSlot
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-participant-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function handleRequest(request: Request, action: Action): Promise<Response> {
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: corsHeaders }))
  if (request.method !== 'POST') return Promise.resolve(json({ ok: false, error: 'invalid', snapshot: null, serverNow: Date.now() }, 405))
  return run(request, action)
}

async function run(request: Request, action: Action): Promise<Response> {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid', snapshot: null, serverNow: Date.now() }, 400)
  const record = body as Record<string, unknown>
  const ip = clientIp(request)

  if (action === 'expire') {
    await rpc('expire_booths', {})
    return json({ ok: true, snapshot: null, signals: [], serverNow: Date.now() }, 200)
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const prepared = await prepare(action, record, ip)
      if ('response' in prepared) return prepared.response
      const applied = applyCommand(prepared.db, prepared.command)
      if (!applied.committed) return json(bodyOf(applied, prepared.secrets), statusFor(applied))
      const saved = await persist(prepared.db, applied)
      if (!saved) continue
      await broadcast(applied)
      return json(bodyOf(applied, prepared.secrets), 200)
    } catch {
      if (attempt === 2) return json({ ok: false, error: 'conflict', snapshot: null, serverNow: Date.now() }, 409)
    }
  }

  return json({ ok: false, error: 'conflict', snapshot: null, serverNow: Date.now() }, 409)
}

async function prepare(
  action: Action,
  body: Record<string, unknown>,
  ip: string,
): Promise<{ db: Database; command: Command; secrets?: Secrets } | { response: Response }> {
  const now = Date.now()
  const db = emptyDatabase()

  if (action === 'create') {
    const themeId = text(body, 'themeId')
    if (!isThemeId(themeId)) return { response: invalid(now) }
    db.rateLimits = await loadRates([`create:${ip}`])
    const roomCode = generateRoomCode()
    const participantToken = generateToken()
    return {
      db,
      secrets: { roomCode, participantToken, slot: 'host' },
      command: {
        type: 'create',
        sessionId: crypto.randomUUID(),
        roomCodeHash: await sha256Hex(roomCode),
        hostId: crypto.randomUUID(),
        hostTokenHash: await sha256Hex(participantToken),
        name: text(body, 'name'),
        themeId,
        now,
        eventId: crypto.randomUUID(),
        rateKey: `create:${ip}`,
      },
    }
  }

  if (action === 'join') {
    const roomCode = normalizeRoomCode(text(body, 'roomCode'))
    if (roomCode.length !== 6) return { response: invalid(now) }
    const roomCodeHash = await sha256Hex(roomCode)
    const existing = await loadSession(`room_code_hash=eq.${roomCodeHash}`)
    if (existing) db.sessions = [existing]
    db.rateLimits = await loadRates([`join:${ip}`, `fail:${ip}`])
    const participantToken = generateToken()
    return {
      db,
      secrets: { roomCode, participantToken, slot: 'guest' },
      command: {
        type: 'join',
        roomCodeHash,
        guestId: crypto.randomUUID(),
        guestTokenHash: await sha256Hex(participantToken),
        now,
        eventId: crypto.randomUUID(),
        rateKey: `join:${ip}`,
        failKey: `fail:${ip}`,
      },
    }
  }

  const sessionId = text(body, 'sessionId')
  const participantToken = text(body, 'participantToken')
  if (!isUuid(sessionId) || participantToken.length < 20) return { response: invalid(now) }
  const existing = await loadSession(`id=eq.${sessionId}`)
  if (existing) db.sessions = [existing]
  const tokenHash = await sha256Hex(participantToken)
  const eventId = crypto.randomUUID()

  if (action === 'sync') {
    return { db, command: { type: 'sync', sessionId, tokenHash, now } }
  }

  if (action === 'set-ready') {
    return {
      db,
      command: {
        type: 'set-ready',
        sessionId,
        tokenHash,
        isReady: body.isReady === true,
        cameraReady: body.cameraReady === true,
        now,
        eventId,
      },
    }
  }

  if (action === 'start-shot') {
    return {
      db,
      command: {
        type: 'start-shot',
        sessionId,
        tokenHash,
        now,
        eventId,
        captureAt: now + CAPTURE_DELAY_MS,
      },
    }
  }

  if (action === 'report-capture') {
    const status = text(body, 'status')
    const shotIndex = body.shotIndex
    if ((status !== 'captured' && status !== 'failed') || typeof shotIndex !== 'number') return { response: invalid(now) }
    return { db, command: { type: 'report-capture', sessionId, tokenHash, shotIndex, status, now, eventId } }
  }

  if (action === 'resolve-shot') {
    const vote = text(body, 'vote')
    const shotIndex = body.shotIndex
    if ((vote !== 'keep' && vote !== 'retake') || typeof shotIndex !== 'number') return { response: invalid(now) }
    return { db, command: { type: 'resolve-shot', sessionId, tokenHash, shotIndex, vote, now, eventId } }
  }

  if (action === 'set-theme') {
    return { db, command: { type: 'set-theme', sessionId, tokenHash, themeId: text(body, 'themeId'), now, eventId } }
  }

  if (action === 'leave') {
    return { db, command: { type: 'leave', sessionId, tokenHash, endSession: body.endSession === true, now, eventId } }
  }

  if (action === 'post-signal') {
    const signal = body.signal
    if (!signal || typeof signal !== 'object') return { response: invalid(now) }
    const record = signal as Record<string, unknown>
    const fromSlot = record.fromSlot
    const toSlot = record.toSlot
    const kind = record.kind
    const payload = record.payload
    if (!isSlot(fromSlot) || !isSlot(toSlot) || !isKind(kind) || typeof payload !== 'string') return { response: invalid(now) }
    return {
      db,
      command: {
        type: 'post-signal',
        sessionId,
        tokenHash,
        now,
        signal: { id: crypto.randomUUID(), fromSlot, toSlot, kind, payload, createdAt: now },
      },
    }
  }

  return { response: invalid(now) }
}

async function persist(previous: Database, applied: ApplyResult): Promise<boolean> {
  const session = applied.db.sessions[0]
  if (!session) {
    if (applied.db.rateLimits.length > 0) await rpc('save_rate_limits', { p_rates: applied.db.rateLimits })
    return true
  }
  const loaded = previous.sessions.find((item) => item.id === session.id)
  return rpc<boolean>('save_booth_bundle', {
    p_expected_version: loaded ? loaded.version : 0,
    p_state: session,
    p_rates: applied.db.rateLimits,
  })
}

async function broadcast(applied: ApplyResult): Promise<void> {
  if (applied.events.length === 0) return
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  const messages = new Map<string, ApplyResult['events']>()
  for (const event of applied.events) {
    const group = messages.get(event.sessionId) ?? []
    group.push(event)
    messages.set(event.sessionId, group)
  }
  await Promise.all(
    [...messages.entries()].map(([sessionId, events]) =>
      fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          messages: events.map((event) => ({
            topic: `booth:${sessionId}`,
            event: 'booth_event',
            payload: event,
          })),
        }),
      }).catch(() => undefined),
    ),
  )
}

async function loadRates(keys: string[]) {
  const buckets = []
  for (const key of keys) {
    const rows = await rest<Array<{ key: string; window_start: string; count: number }>>(
      `rate_limits?key=eq.${encodeURIComponent(key)}&select=key,window_start,count`,
    )
    for (const row of rows ?? []) {
      buckets.push({ key: row.key, windowStart: Date.parse(row.window_start), count: row.count })
    }
  }
  return buckets
}

async function loadSession(filter: string): Promise<SessionRecord | null> {
  const rows = await rest<Array<{ state: SessionRecord }>>(`booth_sessions?${filter}&select=state&limit=1`)
  return rows?.[0]?.state ?? null
}

async function rest<T>(path: string): Promise<T> {
  const response = await serviceFetch(`/rest/v1/${path}`)
  if (!response.ok) throw new Error(`Database read failed (${response.status})`)
  return response.json() as Promise<T>
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await serviceFetch(`/rest/v1/rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(args),
  })
  if (!response.ok) throw new Error(`RPC ${fn} failed (${response.status})`)
  return response.json() as Promise<T>
}

function serviceFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service credentials are missing')
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

function bodyOf(applied: ApplyResult, secrets?: Secrets) {
  if (!applied.result.ok || !secrets) return applied.result
  return { ...applied.result, ...secrets }
}

function statusFor(applied: ApplyResult): number {
  if (applied.result.ok) return 200
  const error: BoothError = applied.result.error
  if (error === 'not_found') return 404
  if (error === 'forbidden') return 403
  if (error === 'rate_limited') return 429
  if (error === 'conflict') return 409
  return 400
}

function invalid(now: number): Response {
  return json({ ok: false, error: 'invalid', snapshot: null, serverNow: now }, 400)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function text(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key] : ''
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isSlot(value: unknown): value is ParticipantSlot {
  return value === 'host' || value === 'guest'
}

function isKind(value: unknown): value is SignalKind {
  return value === 'offer' || value === 'answer' || value === 'ice'
}
