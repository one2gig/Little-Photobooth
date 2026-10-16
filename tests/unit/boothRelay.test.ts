import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@shared/codes.ts'
import { createBoothRelay } from '../../server/boothRelay.ts'

describe('dev booth relay', () => {
  it('lets a second client join a booth it did not create', async () => {
    const relay = createBoothRelay()
    const codeHash = await sha256Hex('XFSPBA')
    const created = relay.handle({
      type: 'create',
      sessionId: 'session-1',
      roomCodeHash: codeHash,
      hostId: 'host-1',
      hostTokenHash: await sha256Hex('host-token'),
      name: 'Our Little Date',
      themeId: 'strawberry-milk',
      now: 1_000,
      eventId: 'create-1',
      rateKey: 'create:local',
    })
    const joined = relay.handle({
      type: 'join',
      roomCodeHash: codeHash,
      guestId: 'guest-1',
      guestTokenHash: await sha256Hex('guest-token'),
      now: 2_000,
      eventId: 'join-1',
      rateKey: 'join:local',
      failKey: 'fail:local',
    })

    expect(created.ok).toBe(true)
    expect(joined.ok).toBe(true)
    if (joined.ok) expect(joined.snapshot?.participants).toHaveLength(2)
  })
})