import type { ThemeId } from './constants.ts'

export type ParticipantSlot = 'host' | 'guest'
export type BoothStatus = 'waiting' | 'active' | 'completed' | 'expired'
export type ShotStatus = 'pending' | 'capturing' | 'review' | 'kept' | 'retry'
export type CaptureStatus = 'pending' | 'captured' | 'failed'
export type Vote = 'keep' | 'retake' | null
export type SignalKind = 'offer' | 'answer' | 'ice'

export type BoothError =
  | 'not_found'
  | 'expired'
  | 'full'
  | 'forbidden'
  | 'invalid'
  | 'rate_limited'
  | 'not_ready'
  | 'conflict'

export interface RateBucket {
  key: string
  windowStart: number
  count: number
}

export interface SignalRecord {
  id: string
  fromSlot: ParticipantSlot
  toSlot: ParticipantSlot
  kind: SignalKind
  payload: string
  createdAt: number
}

export interface ParticipantRecord {
  id: string
  slot: ParticipantSlot
  tokenHash: string
  isReady: boolean
  cameraReady: boolean
  isConnected: boolean
  lastSeenAt: number
}

export interface ShotRecord {
  shotIndex: number
  captureAt: number | null
  hostStatus: CaptureStatus
  guestStatus: CaptureStatus
  hostVote: Vote
  guestVote: Vote
  status: ShotStatus
}

export interface SessionRecord {
  id: string
  version: number
  roomCodeHash: string
  name: string
  status: BoothStatus
  shotIndex: number
  shotCount: number
  themeId: ThemeId
  createdAt: number
  expiresAt: number
  lastActivityAt: number
  participants: ParticipantRecord[]
  shots: ShotRecord[]
  signals: SignalRecord[]
}

export interface Database {
  sessions: SessionRecord[]
  rateLimits: RateBucket[]
}

export interface PublicParticipant {
  slot: ParticipantSlot
  isReady: boolean
  cameraReady: boolean
  isConnected: boolean
}

export interface PublicShot {
  shotIndex: number
  status: ShotStatus
  captureAt: number | null
  hostStatus: CaptureStatus
  guestStatus: CaptureStatus
  hostVote: Vote
  guestVote: Vote
}

export interface PublicSnapshot {
  sessionId: string
  name: string
  status: BoothStatus
  themeId: ThemeId
  shotIndex: number
  shotCount: number
  createdAt: number
  expiresAt: number
  participants: PublicParticipant[]
  currentShot: PublicShot | null
  keptCount: number
}

export type BoothEvent =
  | {
      type: 'participant_joined'
      eventId: string
      sessionId: string
      participantSlot: ParticipantSlot
      createdAt: number
    }
  | {
      type: 'participant_ready'
      eventId: string
      sessionId: string
      participantSlot: ParticipantSlot
      isReady: boolean
      cameraReady: boolean
      createdAt: number
    }
  | {
      type: 'countdown_started'
      eventId: string
      sessionId: string
      shotIndex: number
      captureAt: number
      createdAt: number
    }
  | {
      type: 'capture_result'
      eventId: string
      sessionId: string
      shotIndex: number
      participantSlot: ParticipantSlot
      status: 'captured' | 'failed'
      createdAt: number
    }
  | {
      type: 'shot_resolved'
      eventId: string
      sessionId: string
      shotIndex: number
      status: ShotStatus
      createdAt: number
    }
  | {
      type: 'session_ended'
      eventId: string
      sessionId: string
      reason: 'completed' | 'expired' | 'ended'
      createdAt: number
    }
  | {
      type: 'participant_left'
      eventId: string
      sessionId: string
      participantSlot: ParticipantSlot
      createdAt: number
    }
  | {
      type: 'theme_changed'
      eventId: string
      sessionId: string
      themeId: ThemeId
      createdAt: number
    }
  | {
      type: 'signal_available'
      eventId: string
      sessionId: string
      participantSlot: ParticipantSlot
      createdAt: number
    }

export type Command =
  | {
      type: 'create'
      sessionId: string
      roomCodeHash: string
      hostId: string
      hostTokenHash: string
      name: string
      themeId: string
      now: number
      eventId: string
      rateKey: string
    }
  | {
      type: 'join'
      roomCodeHash: string
      guestId: string
      guestTokenHash: string
      now: number
      eventId: string
      rateKey: string
      failKey: string
    }
  | {
      type: 'sync'
      sessionId: string
      tokenHash: string
      now: number
    }
  | {
      type: 'set-ready'
      sessionId: string
      tokenHash: string
      isReady: boolean
      cameraReady: boolean
      now: number
      eventId: string
    }
  | {
      type: 'start-shot'
      sessionId: string
      tokenHash: string
      now: number
      eventId: string
      captureAt: number
    }
  | {
      type: 'report-capture'
      sessionId: string
      tokenHash: string
      shotIndex: number
      status: 'captured' | 'failed'
      now: number
      eventId: string
    }
  | {
      type: 'resolve-shot'
      sessionId: string
      tokenHash: string
      shotIndex: number
      vote: 'keep' | 'retake'
      now: number
      eventId: string
    }
  | {
      type: 'set-theme'
      sessionId: string
      tokenHash: string
      themeId: string
      now: number
      eventId: string
    }
  | {
      type: 'leave'
      sessionId: string
      tokenHash: string
      endSession: boolean
      now: number
      eventId: string
    }
  | {
      type: 'post-signal'
      sessionId: string
      tokenHash: string
      signal: SignalRecord
      now: number
    }
  | {
      type: 'expire-sweep'
      now: number
    }

export type CommandResult =
  | {
      ok: true
      snapshot: PublicSnapshot | null
      signals: SignalRecord[]
      serverNow: number
    }
  | {
      ok: false
      error: BoothError
      snapshot: PublicSnapshot | null
      serverNow: number
    }
