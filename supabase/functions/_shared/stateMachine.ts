import {
  CREATE_LIMIT,
  DISCONNECT_AFTER_MS,
  FAIL_LIMIT,
  IDLE_TTL_MS,
  INVITE_TTL_MS,
  isThemeId,
  JOIN_LIMIT,
  MAX_SIGNAL_PAYLOAD,
  MAX_SIGNALS,
  RATE_WINDOW_MS,
  SHOT_COUNT,
} from './constants.ts'
import type { ThemeId } from './constants.ts'
import { sanitizeBoothName, safeEqual } from './codes.ts'
import type {
  BoothError,
  BoothEvent,
  Command,
  CommandResult,
  Database,
  ParticipantRecord,
  PublicSnapshot,
  RateBucket,
  SessionRecord,
  ShotRecord,
  SignalKind,
} from './types.ts'

export interface ApplyResult {
  db: Database
  events: BoothEvent[]
  result: CommandResult
  committed: boolean
}

export function emptyDatabase(): Database {
  return { sessions: [], rateLimits: [] }
}

export function toSnapshot(session: SessionRecord): PublicSnapshot {
  const current = session.shots.find((shot) => shot.shotIndex === session.shotIndex) ?? null
  return {
    sessionId: session.id,
    name: session.name,
    status: session.status,
    themeId: session.themeId,
    shotIndex: session.shotIndex,
    shotCount: session.shotCount,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    participants: session.participants.map((participant) => ({
      slot: participant.slot,
      isReady: participant.isReady,
      cameraReady: participant.cameraReady,
      isConnected: participant.isConnected,
    })),
    currentShot: current
      ? {
          shotIndex: current.shotIndex,
          status: current.status,
          captureAt: current.captureAt,
          hostStatus: current.hostStatus,
          guestStatus: current.guestStatus,
          hostVote: current.hostVote,
          guestVote: current.guestVote,
        }
      : null,
    keptCount: session.shots.filter((shot) => shot.status === 'kept').length,
  }
}

export function applyCommand(db: Database, command: Command): ApplyResult {
  const next = structuredClone(db)
  const events: BoothEvent[] = []
  let committed = false
  const mark = () => {
    committed = true
  }
  const result = reduce(next, command, events, mark)
  return {
    db: committed ? next : db,
    events: committed ? events : [],
    result,
    committed,
  }
}

function reduce(
  db: Database,
  command: Command,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  switch (command.type) {
    case 'create':
      return createSession(db, command, mark)
    case 'join':
      return joinSession(db, command, events, mark)
    case 'sync':
      return syncSession(db, command, events, mark)
    case 'set-ready':
      return setReady(db, command, events, mark)
    case 'start-shot':
      return startShot(db, command, events, mark)
    case 'report-capture':
      return reportCapture(db, command, events, mark)
    case 'resolve-shot':
      return resolveShot(db, command, events, mark)
    case 'set-theme':
      return setTheme(db, command, events, mark)
    case 'leave':
      return leaveSession(db, command, events, mark)
    case 'post-signal':
      return postSignal(db, command, events, mark)
    case 'expire-sweep':
      return expireSweep(db, command, events, mark)
    default:
      return failure('invalid', commandNow(command), null)
  }
}

function createSession(
  db: Database,
  command: Extract<Command, { type: 'create' }>,
  mark: () => void,
): CommandResult {
  if (!isThemeId(command.themeId)) return failure('invalid', command.now, null)
  if (!takeRateLimit(db, command.rateKey, command.now, CREATE_LIMIT, RATE_WINDOW_MS)) {
    mark()
    return failure('rate_limited', command.now, null)
  }
  mark()
  if (db.sessions.some((session) => session.roomCodeHash === command.roomCodeHash)) {
    return failure('conflict', command.now, null)
  }
  const themeId: ThemeId = command.themeId
  const session: SessionRecord = {
    id: command.sessionId,
    version: 1,
    roomCodeHash: command.roomCodeHash,
    name: sanitizeBoothName(command.name),
    status: 'waiting',
    shotIndex: 0,
    shotCount: SHOT_COUNT,
    themeId,
    createdAt: command.now,
    expiresAt: command.now + INVITE_TTL_MS,
    lastActivityAt: command.now,
    participants: [
      {
        id: command.hostId,
        slot: 'host',
        tokenHash: command.hostTokenHash,
        isReady: false,
        cameraReady: false,
        isConnected: true,
        lastSeenAt: command.now,
      },
    ],
    shots: [emptyShot(0)],
    signals: [],
  }
  db.sessions.push(session)
  return success(session, command.now, [])
}

function joinSession(
  db: Database,
  command: Extract<Command, { type: 'join' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  if (!takeRateLimit(db, command.rateKey, command.now, JOIN_LIMIT, RATE_WINDOW_MS)) {
    mark()
    return failure('rate_limited', command.now, null)
  }
  mark()
  const session = db.sessions.find((item) => item.roomCodeHash === command.roomCodeHash)
  if (!session) {
    const allowed = takeRateLimit(db, command.failKey, command.now, FAIL_LIMIT, RATE_WINDOW_MS)
    return failure(allowed ? 'not_found' : 'rate_limited', command.now, null)
  }
  const expiry = expireIfNeeded(session, command.now, events)
  if (expiry === 'expired' || expiry === 'newly_expired' || session.status === 'completed') {
    return failure('expired', command.now, toSnapshot(session))
  }
  if (session.status !== 'waiting' || session.participants.length >= 2) {
    return failure('full', command.now, toSnapshot(session))
  }
  session.participants.push({
    id: command.guestId,
    slot: 'guest',
    tokenHash: command.guestTokenHash,
    isReady: false,
    cameraReady: false,
    isConnected: true,
    lastSeenAt: command.now,
  })
  session.status = 'active'
  session.lastActivityAt = command.now
  session.expiresAt = command.now + IDLE_TTL_MS
  session.version += 1
  events.push({
    type: 'participant_joined',
    eventId: command.eventId,
    sessionId: session.id,
    participantSlot: 'guest',
    createdAt: command.now,
  })
  return success(session, command.now, [])
}

function syncSession(
  db: Database,
  command: Extract<Command, { type: 'sync' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  participant.lastSeenAt = command.now
  participant.isConnected = true
  touchActivity(session, command.now)
  refreshPresence(session, command.now, participant.id)
  cancelIfPeerGone(session, command.now, events)
  const signals = session.signals.filter((signal) => signal.toSlot === participant.slot)
  if (signals.length > 0) {
    session.signals = session.signals.filter((signal) => signal.toSlot !== participant.slot)
  }
  session.version += 1
  mark()
  return success(session, command.now, signals)
}

function setReady(
  db: Database,
  command: Extract<Command, { type: 'set-ready' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  if (session.status !== 'active') return failure('conflict', command.now, toSnapshot(session))
  if (command.isReady && !command.cameraReady) return failure('invalid', command.now, toSnapshot(session))
  participant.cameraReady = command.cameraReady
  participant.isReady = command.cameraReady ? command.isReady : false
  participant.lastSeenAt = command.now
  participant.isConnected = true
  touchActivity(session, command.now)
  session.version += 1
  mark()
  events.push({
    type: 'participant_ready',
    eventId: command.eventId,
    sessionId: session.id,
    participantSlot: participant.slot,
    isReady: participant.isReady,
    cameraReady: participant.cameraReady,
    createdAt: command.now,
  })
  return success(session, command.now, [])
}

function startShot(
  db: Database,
  command: Extract<Command, { type: 'start-shot' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  if (participant.slot !== 'host') return failure('forbidden', command.now, toSnapshot(session))
  if (session.status !== 'active') return failure('conflict', command.now, toSnapshot(session))
  const shot = currentShot(session)
  if (!shot) return failure('conflict', command.now, toSnapshot(session))
  if (shot.status === 'capturing' && shot.captureAt) return success(session, command.now, [])
  if (shot.status !== 'pending' && shot.status !== 'retry') {
    return failure('conflict', command.now, toSnapshot(session))
  }
  const bothReady =
    session.participants.length === 2 &&
    session.participants.every((person) => person.isReady && person.cameraReady && person.isConnected)
  if (!bothReady) return failure('not_ready', command.now, toSnapshot(session))
  if (command.captureAt < command.now || command.captureAt > command.now + 15_000) {
    return failure('invalid', command.now, toSnapshot(session))
  }
  shot.status = 'capturing'
  shot.captureAt = command.captureAt
  shot.hostStatus = 'pending'
  shot.guestStatus = 'pending'
  shot.hostVote = null
  shot.guestVote = null
  participant.lastSeenAt = command.now
  touchActivity(session, command.now)
  session.version += 1
  mark()
  events.push({
    type: 'countdown_started',
    eventId: command.eventId,
    sessionId: session.id,
    shotIndex: shot.shotIndex,
    captureAt: command.captureAt,
    createdAt: command.now,
  })
  return success(session, command.now, [])
}

function reportCapture(
  db: Database,
  command: Extract<Command, { type: 'report-capture' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  const shot = currentShot(session)
  if (!shot || shot.shotIndex !== command.shotIndex) return failure('conflict', command.now, toSnapshot(session))
  if (shot.status === 'review' || shot.status === 'retry' || shot.status === 'kept') {
    return success(session, command.now, [])
  }
  if (shot.status !== 'capturing') return failure('conflict', command.now, toSnapshot(session))
  const field = participant.slot === 'host' ? 'hostStatus' : 'guestStatus'
  if (shot[field] !== 'pending') return success(session, command.now, [])
  shot[field] = command.status
  participant.lastSeenAt = command.now
  participant.isConnected = true
  touchActivity(session, command.now)
  events.push({
    type: 'capture_result',
    eventId: command.eventId,
    sessionId: session.id,
    shotIndex: shot.shotIndex,
    participantSlot: participant.slot,
    status: command.status,
    createdAt: command.now,
  })
  if (shot.hostStatus === 'failed' || shot.guestStatus === 'failed') {
    resetShot(shot)
    clearReady(session)
    events.push({
      type: 'shot_resolved',
      eventId: `${command.eventId}:retry`,
      sessionId: session.id,
      shotIndex: shot.shotIndex,
      status: 'retry',
      createdAt: command.now,
    })
  } else if (shot.hostStatus === 'captured' && shot.guestStatus === 'captured') {
    shot.status = 'review'
    events.push({
      type: 'shot_resolved',
      eventId: `${command.eventId}:review`,
      sessionId: session.id,
      shotIndex: shot.shotIndex,
      status: 'review',
      createdAt: command.now,
    })
  }
  session.version += 1
  mark()
  return success(session, command.now, [])
}

function resolveShot(
  db: Database,
  command: Extract<Command, { type: 'resolve-shot' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  const shot = currentShot(session)
  if (!shot || shot.shotIndex !== command.shotIndex) return failure('conflict', command.now, toSnapshot(session))
  if (shot.status === 'kept' || shot.status === 'retry') return success(session, command.now, [])
  if (shot.status !== 'review') return failure('conflict', command.now, toSnapshot(session))
  const voteField = participant.slot === 'host' ? 'hostVote' : 'guestVote'
  if (shot[voteField] === command.vote) return success(session, command.now, [])
  shot[voteField] = command.vote
  participant.lastSeenAt = command.now
  touchActivity(session, command.now)
  const retake = command.vote === 'retake' || shot.hostVote === 'retake' || shot.guestVote === 'retake'
  if (retake) {
    resetShot(shot)
    clearReady(session)
  } else if (shot.hostVote === 'keep' && shot.guestVote === 'keep') {
    shot.status = 'kept'
    clearReady(session)
    const keptCount = session.shots.filter((item) => item.status === 'kept').length
    if (keptCount < session.shotCount) {
      session.shotIndex += 1
      if (!session.shots.some((item) => item.shotIndex === session.shotIndex)) {
        session.shots.push(emptyShot(session.shotIndex))
      }
    }
  }
  session.version += 1
  mark()
  events.push({
    type: 'shot_resolved',
    eventId: command.eventId,
    sessionId: session.id,
    shotIndex: command.shotIndex,
    status: shot.status,
    createdAt: command.now,
  })
  return success(session, command.now, [])
}

function setTheme(
  db: Database,
  command: Extract<Command, { type: 'set-theme' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  if (!isThemeId(command.themeId)) return failure('invalid', command.now, toSnapshot(session))
  session.themeId = command.themeId
  participant.lastSeenAt = command.now
  touchActivity(session, command.now)
  session.version += 1
  mark()
  events.push({
    type: 'theme_changed',
    eventId: command.eventId,
    sessionId: session.id,
    themeId: command.themeId,
    createdAt: command.now,
  })
  return success(session, command.now, [])
}

function leaveSession(
  db: Database,
  command: Extract<Command, { type: 'leave' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  participant.isConnected = false
  participant.isReady = false
  participant.lastSeenAt = command.now
  events.push({
    type: 'participant_left',
    eventId: command.eventId,
    sessionId: session.id,
    participantSlot: participant.slot,
    createdAt: command.now,
  })
  cancelIfPeerGone(session, command.now, events)
  if (command.endSession && session.status !== 'expired') {
    session.status = 'completed'
    session.signals = []
    events.push({
      type: 'session_ended',
      eventId: `${command.eventId}:ended`,
      sessionId: session.id,
      reason: 'ended',
      createdAt: command.now,
    })
  }
  session.version += 1
  mark()
  return success(session, command.now, [])
}

function postSignal(
  db: Database,
  command: Extract<Command, { type: 'post-signal' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  const located = locate(db, command.sessionId, command.tokenHash, command.now, events, mark)
  if (!located.ok) return located.result
  const { session, participant } = located
  const signal = command.signal
  if (signal.fromSlot !== participant.slot || signal.toSlot === participant.slot) {
    return failure('forbidden', command.now, toSnapshot(session))
  }
  if (!isSignalKind(signal.kind) || signal.payload.length === 0 || signal.payload.length > MAX_SIGNAL_PAYLOAD) {
    return failure('invalid', command.now, toSnapshot(session))
  }
  session.signals.push(signal)
  if (session.signals.length > MAX_SIGNALS) {
    session.signals.splice(0, session.signals.length - MAX_SIGNALS)
  }
  participant.lastSeenAt = command.now
  participant.isConnected = true
  session.version += 1
  mark()
  events.push({
    type: 'signal_available',
    eventId: signal.id,
    sessionId: session.id,
    participantSlot: signal.toSlot,
    createdAt: command.now,
  })
  return success(session, command.now, [])
}

function expireSweep(
  db: Database,
  command: Extract<Command, { type: 'expire-sweep' }>,
  events: BoothEvent[],
  mark: () => void,
): CommandResult {
  for (const session of db.sessions) {
    if (expireIfNeeded(session, command.now, events) === 'newly_expired') {
      session.version += 1
      mark()
    }
  }
  return { ok: true, snapshot: null, signals: [], serverNow: command.now }
}

function locate(
  db: Database,
  sessionId: string,
  tokenHash: string,
  now: number,
  events: BoothEvent[],
  mark: () => void,
):
  | { ok: true; session: SessionRecord; participant: ParticipantRecord }
  | { ok: false; result: CommandResult } {
  const session = db.sessions.find((item) => item.id === sessionId)
  if (!session) return { ok: false, result: failure('not_found', now, null) }
  const expiry = expireIfNeeded(session, now, events)
  if (expiry === 'newly_expired') mark()
  if (expiry !== 'active') {
    return { ok: false, result: failure('expired', now, toSnapshot(session)) }
  }
  const participant = session.participants.find((item) => safeEqual(item.tokenHash, tokenHash))
  if (!participant) return { ok: false, result: failure('forbidden', now, null) }
  return { ok: true, session, participant }
}

function expireIfNeeded(session: SessionRecord, now: number, events: BoothEvent[]): 'active' | 'expired' | 'newly_expired' {
  if (session.status === 'completed') return 'active'
  if (session.status === 'expired') return 'expired'
  const inviteExpired = session.status === 'waiting' && now >= session.expiresAt
  const idleExpired = session.status === 'active' && now - session.lastActivityAt >= IDLE_TTL_MS
  if (!inviteExpired && !idleExpired) return 'active'
  session.status = 'expired'
  session.signals = []
  events.push({
    type: 'session_ended',
    eventId: `expired:${session.id}`,
    sessionId: session.id,
    reason: 'expired',
    createdAt: now,
  })
  return 'newly_expired'
}

function refreshPresence(session: SessionRecord, now: number, exceptId: string) {
  for (const participant of session.participants) {
    if (participant.id === exceptId) continue
    if (now - participant.lastSeenAt > DISCONNECT_AFTER_MS) participant.isConnected = false
  }
}

function cancelIfPeerGone(session: SessionRecord, now: number, events: BoothEvent[]) {
  const shot = currentShot(session)
  if (!shot || shot.status !== 'capturing') return
  const peerGone = session.participants.length < 2 || session.participants.some((participant) => !participant.isConnected)
  if (!peerGone) return
  const shotIndex = shot.shotIndex
  resetShot(shot)
  clearReady(session)
  events.push({
    type: 'shot_resolved',
    eventId: `cancel:${session.id}:${shotIndex}:${now}`,
    sessionId: session.id,
    shotIndex,
    status: 'retry',
    createdAt: now,
  })
}

function touchActivity(session: SessionRecord, now: number) {
  if (session.status !== 'active') return
  session.lastActivityAt = now
  session.expiresAt = now + IDLE_TTL_MS
}

function clearReady(session: SessionRecord) {
  for (const participant of session.participants) participant.isReady = false
}

function resetShot(shot: ShotRecord) {
  shot.status = 'retry'
  shot.captureAt = null
  shot.hostStatus = 'pending'
  shot.guestStatus = 'pending'
  shot.hostVote = null
  shot.guestVote = null
}

function currentShot(session: SessionRecord): ShotRecord | null {
  return session.shots.find((shot) => shot.shotIndex === session.shotIndex) ?? null
}

function emptyShot(shotIndex: number): ShotRecord {
  return {
    shotIndex,
    captureAt: null,
    hostStatus: 'pending',
    guestStatus: 'pending',
    hostVote: null,
    guestVote: null,
    status: 'pending',
  }
}

function takeRateLimit(db: Database, key: string, now: number, limit: number, windowMs: number): boolean {
  let bucket: RateBucket | undefined = db.rateLimits.find((item) => item.key === key)
  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (!bucket) {
      bucket = { key, windowStart: now, count: 0 }
      db.rateLimits.push(bucket)
    } else {
      bucket.windowStart = now
      bucket.count = 0
    }
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

function isSignalKind(kind: string): kind is SignalKind {
  return kind === 'offer' || kind === 'answer' || kind === 'ice'
}

function success(session: SessionRecord, now: number, signals: SessionRecord['signals']): CommandResult {
  return { ok: true, snapshot: toSnapshot(session), signals, serverNow: now }
}

function failure(error: BoothError, now: number, snapshot: PublicSnapshot | null): CommandResult {
  return { ok: false, error, snapshot, serverNow: now }
}

function commandNow(command: Command): number {
  return 'now' in command ? command.now : Date.now()
}
