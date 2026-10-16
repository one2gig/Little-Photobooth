export type {
  BoothError,
  BoothEvent,
  BoothStatus,
  CaptureStatus,
  ParticipantSlot,
  PublicParticipant,
  PublicShot,
  PublicSnapshot,
  ShotStatus,
  SignalRecord,
  Vote,
} from '@shared/types.ts'

export interface Credentials {
  sessionId: string
  token: string
  slot: 'host' | 'guest'
  roomCode: string
}

export type BoothPhase =
  | 'loading'
  | 'invite'
  | 'waiting'
  | 'countdown'
  | 'review'
  | 'strip'
  | 'theme'
  | 'permission'
  | 'expired'
