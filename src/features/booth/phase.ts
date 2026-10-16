import type { BoothPhase, PublicSnapshot } from '../../types/booth.ts'

export function derivePhase(input: {
  snapshot: PublicSnapshot | null
  cameraBlocked: boolean
  showTheme: boolean
}): BoothPhase {
  const { snapshot } = input
  if (!snapshot) return 'loading'
  if (snapshot.status === 'expired') return 'expired'
  if (input.showTheme && (snapshot.keptCount >= snapshot.shotCount || snapshot.status === 'completed')) return 'theme'
  if (snapshot.status === 'waiting') return 'invite'
  if (snapshot.status === 'completed' || snapshot.keptCount >= snapshot.shotCount) return 'strip'
  const shot = snapshot.currentShot
  const needsCamera = !shot || shot.status === 'pending' || shot.status === 'retry'
  if (needsCamera && input.cameraBlocked) return 'permission'
  if (shot?.status === 'capturing') return 'countdown'
  if (shot?.status === 'review') return 'review'
  return 'waiting'
}
