import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@shared/codes.ts'
import { countdownDisplay, estimateClockOffset, remainingUntil } from '@shared/clock.ts'
import { decodeChunk, encodeChunk, joinBytes, splitBytes } from '@shared/chunks.ts'
import { CREATE_LIMIT, FAIL_LIMIT, IDLE_TTL_MS, INVITE_TTL_MS } from '@shared/constants.ts'
import { createEventGate } from '@shared/eventGate.ts'
import { stripLayout } from '@shared/layout.ts'
import { applyCommand, emptyDatabase, type ApplyResult } from '@shared/stateMachine.ts'
import type { Command, Database } from '@shared/types.ts'
import { describeCameraError } from '../../src/features/camera/errors.ts'
import { derivePhase } from '../../src/features/booth/phase.ts'
import { releaseSessionResources } from '../../src/lib/cleanup.ts'

const HOST = 'host-token-plain'
const GUEST = 'guest-token-plain'

async function apply(db: Database, command: Command): Promise<ApplyResult> {
  return applyCommand(db, command)
}

async function pairedBooth(now = 5_000) {
  const hostHash = await sha256Hex(HOST)
  const guestHash = await sha256Hex(GUEST)
  const codeHash = await sha256Hex('ABC234')
  let state = emptyDatabase()
  let step = await apply(state, {
    type: 'create',
    sessionId: 'session-1',
    roomCodeHash: codeHash,
    hostId: 'host-1',
    hostTokenHash: hostHash,
    name: 'Our Little Date',
    themeId: 'strawberry-milk',
    now,
    eventId: 'create-1',
    rateKey: 'create:test',
  })
  state = step.db
  step = await apply(state, {
    type: 'join',
    roomCodeHash: codeHash,
    guestId: 'guest-1',
    guestTokenHash: guestHash,
    now,
    eventId: 'join-1',
    rateKey: 'join:test',
    failKey: 'fail:test',
  })
  return { db: step.db, hostHash, guestHash, codeHash, now, joined: step }
}

async function ready(db: Database, hostHash: string, guestHash: string, now: number) {
  let step = await apply(db, {
    type: 'set-ready',
    sessionId: 'session-1',
    tokenHash: hostHash,
    isReady: true,
    cameraReady: true,
    now,
    eventId: 'ready-host',
  })
  step = await apply(step.db, {
    type: 'set-ready',
    sessionId: 'session-1',
    tokenHash: guestHash,
    isReady: true,
    cameraReady: true,
    now,
    eventId: 'ready-guest',
  })
  return step.db
}

describe('booth session rules', () => {
  it('creates a room for the host and lets one guest join', async () => {
    const { db, joined } = await pairedBooth()
    expect(joined.result.ok).toBe(true)
    expect(db.sessions[0]?.status).toBe('active')
    expect(db.sessions[0]?.participants).toHaveLength(2)
    expect(db.sessions[0]?.shotCount).toBe(4)
  })

  it('rejects a third participant and an unknown or expired code', async () => {
    const { db, codeHash, now } = await pairedBooth()
    const third = await apply(db, {
      type: 'join',
      roomCodeHash: codeHash,
      guestId: 'guest-2',
      guestTokenHash: await sha256Hex('someone-else'),
      now,
      eventId: 'join-2',
      rateKey: 'join:other',
      failKey: 'fail:other',
    })
    expect(third.result.ok).toBe(false)
    if (!third.result.ok) expect(third.result.error).toBe('full')
    expect(third.db.sessions[0]?.participants).toHaveLength(2)

    const missing = await apply(emptyDatabase(), {
      type: 'join',
      roomCodeHash: await sha256Hex('MISSING'),
      guestId: 'guest-3',
      guestTokenHash: await sha256Hex('nope'),
      now,
      eventId: 'join-missing',
      rateKey: 'join:missing',
      failKey: 'fail:missing',
    })
    expect(missing.result.ok).toBe(false)
    if (!missing.result.ok) expect(missing.result.error).toBe('not_found')

    let fresh = emptyDatabase()
    const created = await apply(fresh, {
      type: 'create',
      sessionId: 'old-session',
      roomCodeHash: await sha256Hex('OLD123'),
      hostId: 'host-old',
      hostTokenHash: await sha256Hex('old-host'),
      name: '',
      themeId: 'lavender-dreams',
      now: 0,
      eventId: 'create-old',
      rateKey: 'create:old',
    })
    fresh = created.db
    const expired = await apply(fresh, {
      type: 'join',
      roomCodeHash: await sha256Hex('OLD123'),
      guestId: 'guest-old',
      guestTokenHash: await sha256Hex('old-guest'),
      now: INVITE_TTL_MS,
      eventId: 'join-old',
      rateKey: 'join:old',
      failKey: 'fail:old',
    })
    expect(expired.result.ok).toBe(false)
    if (!expired.result.ok) expect(expired.result.error).toBe('expired')
    expect(expired.db.sessions[0]?.status).toBe('expired')
  })

  it('only lets the host start, and only when both people are ready', async () => {
    const { db, hostHash, guestHash, now } = await pairedBooth()
    const guestStart = await apply(db, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: guestHash,
      now,
      eventId: 'start-guest',
      captureAt: now + 4000,
    })
    expect(guestStart.result.ok).toBe(false)
    if (!guestStart.result.ok) expect(guestStart.result.error).toBe('forbidden')
    expect(guestStart.committed).toBe(false)

    const tooSoon = await apply(db, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now,
      eventId: 'start-early',
      captureAt: now + 4000,
    })
    expect(tooSoon.result.ok).toBe(false)
    if (!tooSoon.result.ok) expect(tooSoon.result.error).toBe('not_ready')

    const armed = await ready(db, hostHash, guestHash, now)
    const started = await apply(armed, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now,
      eventId: 'start-host',
      captureAt: now + 4000,
    })
    expect(started.result.ok).toBe(true)
    if (started.result.ok) expect(started.result.snapshot?.currentShot?.captureAt).toBe(now + 4000)
    expect(started.events.some((event) => event.type === 'countdown_started')).toBe(true)

    const again = await apply(started.db, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now,
      eventId: 'start-again',
      captureAt: now + 9000,
    })
    expect(again.committed).toBe(false)
    expect(again.events).toHaveLength(0)
    expect(again.db.sessions[0]?.shots[0]?.captureAt).toBe(now + 4000)
  })

  it('retries a failed capture without advancing and keeps a shot only when both agree', async () => {
    const { db, hostHash, guestHash, now } = await pairedBooth()
    const armed = await ready(db, hostHash, guestHash, now)
    const started = await apply(armed, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now,
      eventId: 'start',
      captureAt: now + 4000,
    })
    const failed = await apply(started.db, {
      type: 'report-capture',
      sessionId: 'session-1',
      tokenHash: hostHash,
      shotIndex: 0,
      status: 'failed',
      now,
      eventId: 'cap-fail',
    })
    expect(failed.db.sessions[0]?.shotIndex).toBe(0)
    expect(failed.db.sessions[0]?.shots[0]?.status).toBe('retry')

    const armedAgain = await ready(failed.db, hostHash, guestHash, now + 10)
    const restarted = await apply(armedAgain, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now: now + 10,
      eventId: 'start-2',
      captureAt: now + 4010,
    })
    let current = await apply(restarted.db, {
      type: 'report-capture',
      sessionId: 'session-1',
      tokenHash: hostHash,
      shotIndex: 0,
      status: 'captured',
      now: now + 20,
      eventId: 'cap-host',
    })
    const duplicate = await apply(current.db, {
      type: 'report-capture',
      sessionId: 'session-1',
      tokenHash: hostHash,
      shotIndex: 0,
      status: 'failed',
      now: now + 21,
      eventId: 'cap-host-again',
    })
    expect(duplicate.committed).toBe(false)
    expect(duplicate.db.sessions[0]?.shots[0]?.hostStatus).toBe('captured')
    current = await apply(current.db, {
      type: 'report-capture',
      sessionId: 'session-1',
      tokenHash: guestHash,
      shotIndex: 0,
      status: 'captured',
      now: now + 22,
      eventId: 'cap-guest',
    })
    expect(current.db.sessions[0]?.shots[0]?.status).toBe('review')

    const retake = await apply(current.db, {
      type: 'resolve-shot',
      sessionId: 'session-1',
      tokenHash: guestHash,
      shotIndex: 0,
      vote: 'retake',
      now: now + 30,
      eventId: 'retake',
    })
    expect(retake.db.sessions[0]?.shotIndex).toBe(0)
    expect(retake.db.sessions[0]?.shots[0]?.status).toBe('retry')
  })

  it('advances only after both keeps and finishes on the fourth', async () => {
    let { db, hostHash, guestHash, now } = await pairedBooth()
    for (let shot = 0; shot < 4; shot += 1) {
      db = await ready(db, hostHash, guestHash, now)
      const started = await apply(db, {
        type: 'start-shot',
        sessionId: 'session-1',
        tokenHash: hostHash,
        now,
        eventId: `start-${shot}`,
        captureAt: now + 4000,
      })
      const hostCap = await apply(started.db, {
        type: 'report-capture',
        sessionId: 'session-1',
        tokenHash: hostHash,
        shotIndex: shot,
        status: 'captured',
        now,
        eventId: `host-cap-${shot}`,
      })
      const guestCap = await apply(hostCap.db, {
        type: 'report-capture',
        sessionId: 'session-1',
        tokenHash: guestHash,
        shotIndex: shot,
        status: 'captured',
        now,
        eventId: `guest-cap-${shot}`,
      })
      const hostKeep = await apply(guestCap.db, {
        type: 'resolve-shot',
        sessionId: 'session-1',
        tokenHash: hostHash,
        shotIndex: shot,
        vote: 'keep',
        now,
        eventId: `host-keep-${shot}`,
      })
      const guestKeep = await apply(hostKeep.db, {
        type: 'resolve-shot',
        sessionId: 'session-1',
        tokenHash: guestHash,
        shotIndex: shot,
        vote: 'keep',
        now,
        eventId: `guest-keep-${shot}`,
      })
      db = guestKeep.db
      now += 100
    }
    const session = db.sessions[0]
    expect(session?.shots.filter((shot) => shot.status === 'kept')).toHaveLength(4)
    expect(session?.shotIndex).toBe(3)
    const themed = await apply(db, {
      type: 'set-theme',
      sessionId: 'session-1',
      tokenHash: hostHash,
      themeId: 'midnight-film',
      now,
      eventId: 'theme',
    })
    expect(themed.db.sessions[0]?.themeId).toBe('midnight-film')
    expect(themed.db.sessions[0]?.shots.map((shot) => shot.status)).toEqual(['kept', 'kept', 'kept', 'kept'])
  })

  it('reconnects the same token and cancels a countdown if the partner drops', async () => {
    const { db, hostHash, guestHash, now } = await pairedBooth()
    const resumed = await apply(db, { type: 'sync', sessionId: 'session-1', tokenHash: guestHash, now })
    expect(resumed.db.sessions[0]?.participants).toHaveLength(2)
    const armed = await ready(resumed.db, hostHash, guestHash, now)
    const started = await apply(armed, {
      type: 'start-shot',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now,
      eventId: 'start-drop',
      captureAt: now + 4000,
    })
    const dropped = await apply(started.db, {
      type: 'sync',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now: now + IDLE_TTL_MS,
    })
    expect(dropped.result.ok).toBe(false)
    const midDrop = await apply(started.db, {
      type: 'sync',
      sessionId: 'session-1',
      tokenHash: hostHash,
      now: now + 15_001,
    })
    expect(midDrop.db.sessions[0]?.shots[0]?.status).toBe('retry')
    expect(midDrop.db.sessions[0]?.participants.find((person) => person.slot === 'guest')?.isConnected).toBe(false)
    expect(midDrop.db.sessions[0]?.shotIndex).toBe(0)
  })

  it('never puts tokens in events or snapshots and rate limits repeats', async () => {
    const { joined, hostHash } = await pairedBooth()
    const packed = JSON.stringify(joined.events) + JSON.stringify(joined.result)
    expect(packed).not.toContain(HOST)
    expect(packed).not.toContain(GUEST)
    expect(packed).not.toContain(hostHash)

    let db = emptyDatabase()
    for (let index = 0; index < CREATE_LIMIT; index += 1) {
      const step = await apply(db, {
        type: 'create',
        sessionId: `session-${index}`,
        roomCodeHash: `hash-${index}`,
        hostId: `host-${index}`,
        hostTokenHash: `token-${index}`,
        name: '',
        themeId: 'sunday-memories',
        now: 10,
        eventId: `event-${index}`,
        rateKey: 'create:loop',
      })
      expect(step.result.ok).toBe(true)
      db = step.db
    }
    const blocked = await apply(db, {
      type: 'create',
      sessionId: 'session-extra',
      roomCodeHash: 'hash-extra',
      hostId: 'host-extra',
      hostTokenHash: 'token-extra',
      name: '',
      themeId: 'sunday-memories',
      now: 10,
      eventId: 'event-extra',
      rateKey: 'create:loop',
    })
    expect(blocked.result.ok).toBe(false)
    if (!blocked.result.ok) expect(blocked.result.error).toBe('rate_limited')

    let misses = emptyDatabase()
    for (let index = 0; index < FAIL_LIMIT; index += 1) {
      const step = await apply(misses, {
        type: 'join',
        roomCodeHash: `missing-${index}`,
        guestId: `guest-${index}`,
        guestTokenHash: `guest-token-${index}`,
        now: 10,
        eventId: `miss-${index}`,
        rateKey: 'join:miss',
        failKey: 'fail:miss',
      })
      expect(step.result.ok).toBe(false)
      if (!step.result.ok) expect(step.result.error).toBe('not_found')
      misses = step.db
    }
    const limited = await apply(misses, {
      type: 'join',
      roomCodeHash: 'missing-final',
      guestId: 'guest-final',
      guestTokenHash: 'guest-token-final',
      now: 10,
      eventId: 'miss-final',
      rateKey: 'join:miss',
      failKey: 'fail:miss',
    })
    expect(limited.result.ok).toBe(false)
    if (!limited.result.ok) expect(limited.result.error).toBe('rate_limited')
  })
})

describe('sync helpers', () => {
  it('shares one capture timestamp instead of ticking numbers over the network', () => {
    const offset = estimateClockOffset(1_000, 1_250, 1_200)
    expect(offset).toBe(150)
    expect(countdownDisplay(remainingUntil(5_000, 1_000, 0))).toBe(3)
    expect(countdownDisplay(remainingUntil(2_000, 1_100, 0))).toBe(1)
    expect(countdownDisplay(remainingUntil(1_000, 1_000, 0))).toBe(0)
  })

  it('reassembles chunked photo bytes and ignores duplicate events', () => {
    const original = new Uint8Array(20_000)
    for (let index = 0; index < original.length; index += 1) original[index] = index % 251
    const parts = splitBytes(original, 1000)
    const decoded = parts.map((part, index) => decodeChunk(encodeChunk(2, index, parts.length, part))!)
    const joined = joinBytes(decoded.map((part) => part.data), original.length)
    expect(joined).toEqual(original)
    const gate = createEventGate()
    expect(gate({ eventId: 'a', shotIndex: 1 }, 1)).toBe(true)
    expect(gate({ eventId: 'a', shotIndex: 1 }, 1)).toBe(false)
    expect(gate({ eventId: 'b', shotIndex: 0 }, 1)).toBe(false)
  })

  it('lays the strip out with the host portrait on the left', () => {
    const layout = stripLayout()
    expect(layout.width).toBe(1200)
    expect(layout.height).toBe(2400)
    expect(layout.panels).toHaveLength(4)
    for (const panel of layout.panels) {
      expect(panel.photos[0].x).toBeLessThan(panel.photos[1].x)
      expect(panel.photos[0].height).toBeGreaterThan(panel.photos[0].width)
    }
  })

  it('maps camera failures and session phases', () => {
    expect(describeCameraError(Object.assign(new Error('no'), { name: 'NotAllowedError' })).title).toBe('Camera access needed')
    expect(describeCameraError(Object.assign(new Error('no'), { name: 'NotFoundError' })).title).toContain("couldn't find a camera")
    expect(describeCameraError(Object.assign(new Error('no'), { name: 'NotReadableError' })).title).toContain('another app')
    expect(derivePhase({ snapshot: null, cameraBlocked: false, showTheme: false })).toBe('loading')
  })

  it('stops the camera, closes the peer, and drops temporary photos', () => {
    const revoked: string[] = []
    const photos = new Map([[0, { host: new Blob(['a']) }]])
    let stopped = false
    let closed = false
    const urls = ['blob:one']
    releaseSessionResources({
      stopCamera: () => {
        stopped = true
      },
      closePeer: () => {
        closed = true
      },
      photos,
      urls,
      revoke: (url) => revoked.push(url),
    })
    expect(stopped).toBe(true)
    expect(closed).toBe(true)
    expect(photos.size).toBe(0)
    expect(urls).toEqual([])
    expect(revoked).toEqual(['blob:one'])
  })
})
