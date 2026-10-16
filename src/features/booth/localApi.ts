import { CAPTURE_DELAY_MS } from '@shared/constants.ts'
import { generateRoomCode, generateToken, normalizeRoomCode, sha256Hex } from '@shared/codes.ts'
import { applyCommand, emptyDatabase } from '@shared/stateMachine.ts'
import type { BoothEvent, Command, CommandResult, Database } from '@shared/types.ts'
import type { BoothApi, SyncResult } from './api.ts'
import { BoothRequestError } from './errors.ts'

const DB_KEY = 'little-booth.db.v1'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface EventBus {
  publish(event: BoothEvent): void
  subscribe(listener: (event: BoothEvent) => void): () => void
}

export function memoryStore(): KeyValueStore {
  let value: string | null = null
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next
    },
  }
}

export function memoryBus(): EventBus {
  const listeners = new Set<(event: BoothEvent) => void>()
  return {
    publish(event) {
      for (const listener of listeners) listener(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

let fallbackLock: Promise<void> = Promise.resolve()

function defaultLock<T>(fn: () => Promise<T> | T): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('little-booth-db', () => fn()) as Promise<T>
  }
  const run = fallbackLock.then(fn, fn)
  fallbackLock = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function browserStore(): KeyValueStore {
  return localStorage
}

function browserBus(): EventBus {
  if (typeof BroadcastChannel === 'undefined') return memoryBus()
  const channel = new BroadcastChannel('little-booth-events')
  return {
    publish: (event) => channel.postMessage(event),
    subscribe: (listener) => {
      const onMessage = (message: MessageEvent<BoothEvent>) => listener(message.data)
      channel.addEventListener('message', onMessage)
      return () => channel.removeEventListener('message', onMessage)
    },
  }
}

export function createLocalApi(options?: {
  store?: KeyValueStore
  bus?: EventBus
  now?: () => number
  delayMs?: number
  lock?: <T>(fn: () => Promise<T> | T) => Promise<T>
  relay?: (command: Command) => Promise<CommandResult>
  eventsUrl?: string
}): BoothApi {
  const store = options?.store ?? browserStore()
  const bus = options?.bus ?? browserBus()
  const now = options?.now ?? (() => Date.now())
  const delayMs = options?.delayMs ?? CAPTURE_DELAY_MS
  const lock = options?.lock ?? defaultLock
  const relay = options?.relay

  function read(): Database {
    const raw = store.getItem(DB_KEY)
    if (!raw) return emptyDatabase()
    try {
      const parsed = JSON.parse(raw) as Database
      if (!parsed.sessions || !parsed.rateLimits) return emptyDatabase()
      return parsed
    } catch {
      return emptyDatabase()
    }
  }

  function write(db: Database) {
    store.setItem(DB_KEY, JSON.stringify(db))
  }

  async function transact(build: (at: number) => Promise<Command> | Command): Promise<SyncResult> {
    if (relay) {
      const command = await build(now())
      const result = await relay(command)
      if (!result.ok || !result.snapshot) throw new BoothRequestError(result.ok ? 'invalid' : result.error, result.snapshot)
      return { snapshot: result.snapshot, signals: result.signals, serverNow: result.serverNow }
    }
    return lock(async () => {
      const at = now()
      const command = await build(at)
      const db = read()
      const applied = applyCommand(db, command)
      if (applied.committed) write(applied.db)
      for (const event of applied.events) bus.publish(event)
      if (!applied.result.ok || !applied.result.snapshot) {
        throw new BoothRequestError(applied.result.ok ? 'invalid' : applied.result.error, applied.result.snapshot)
      }
      return { snapshot: applied.result.snapshot, signals: applied.result.signals, serverNow: applied.result.serverNow }
    })
  }

  return {
    async createBooth(input) {
      const roomCode = generateRoomCode()
      const participantToken = generateToken()
      const sessionId = crypto.randomUUID()
      const synced = await transact(async (at) => ({
        type: 'create',
        sessionId,
        roomCodeHash: await sha256Hex(roomCode),
        hostId: crypto.randomUUID(),
        hostTokenHash: await sha256Hex(participantToken),
        name: input.name,
        themeId: input.themeId,
        now: at,
        eventId: crypto.randomUUID(),
        rateKey: 'create:local',
      }))
      return {
        ...synced,
        sessionId,
        roomCode,
        participantToken,
        slot: 'host',
      }
    },
    async joinBooth(roomCode) {
      const code = normalizeRoomCode(roomCode)
      const participantToken = generateToken()
      const synced = await transact(async (at) => ({
        type: 'join',
        roomCodeHash: await sha256Hex(code),
        guestId: crypto.randomUUID(),
        guestTokenHash: await sha256Hex(participantToken),
        now: at,
        eventId: crypto.randomUUID(),
        rateKey: 'join:local',
        failKey: 'fail:local',
      }))
      return {
        ...synced,
        sessionId: synced.snapshot.sessionId,
        roomCode: code,
        participantToken,
        slot: 'guest',
      }
    },
    sync(sessionId, token) {
      return transact(async (at) => ({ type: 'sync', sessionId, tokenHash: await sha256Hex(token), now: at }))
    },
    setReady(sessionId, token, isReady, cameraReady) {
      return transact(async (at) => ({
        type: 'set-ready',
        sessionId,
        tokenHash: await sha256Hex(token),
        isReady,
        cameraReady,
        now: at,
        eventId: crypto.randomUUID(),
      }))
    },
    startShot(sessionId, token) {
      return transact(async (at) => ({
        type: 'start-shot',
        sessionId,
        tokenHash: await sha256Hex(token),
        now: at,
        eventId: crypto.randomUUID(),
        captureAt: at + delayMs,
      }))
    },
    reportCapture(sessionId, token, shotIndex, status) {
      return transact(async (at) => ({
        type: 'report-capture',
        sessionId,
        tokenHash: await sha256Hex(token),
        shotIndex,
        status,
        now: at,
        eventId: crypto.randomUUID(),
      }))
    },
    resolveShot(sessionId, token, shotIndex, vote) {
      return transact(async (at) => ({
        type: 'resolve-shot',
        sessionId,
        tokenHash: await sha256Hex(token),
        shotIndex,
        vote,
        now: at,
        eventId: crypto.randomUUID(),
      }))
    },
    setTheme(sessionId, token, themeId) {
      return transact(async (at) => ({
        type: 'set-theme',
        sessionId,
        tokenHash: await sha256Hex(token),
        themeId,
        now: at,
        eventId: crypto.randomUUID(),
      }))
    },
    leave(sessionId, token, endSession) {
      return transact(async (at) => ({
        type: 'leave',
        sessionId,
        tokenHash: await sha256Hex(token),
        endSession,
        now: at,
        eventId: crypto.randomUUID(),
      }))
    },
    async postSignal(sessionId, token, signal) {
      await transact(async (at) => ({
        type: 'post-signal',
        sessionId,
        tokenHash: await sha256Hex(token),
        now: at,
        signal: { ...signal, createdAt: at },
      }))
    },
    subscribe(sessionId, listener) {
      if (options?.eventsUrl && typeof EventSource !== 'undefined') {
        const source = new EventSource(options.eventsUrl)
        source.onmessage = (message) => {
          const event = JSON.parse(message.data) as BoothEvent
          if (event.sessionId === sessionId) listener(event)
        }
        return () => source.close()
      }
      return bus.subscribe((event) => {
        if (event.sessionId === sessionId) listener(event)
      })
    },
  }
}
