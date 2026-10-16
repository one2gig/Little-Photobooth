export const SHOT_COUNT = 4
export const INVITE_TTL_MS = 10 * 60 * 1000
export const IDLE_TTL_MS = 30 * 60 * 1000
export const DISCONNECT_AFTER_MS = 15_000
export const CAPTURE_DELAY_MS = 4_000
export const CREATE_LIMIT = 8
export const JOIN_LIMIT = 30
export const FAIL_LIMIT = 8
export const RATE_WINDOW_MS = 10 * 60 * 1000
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const MAX_SIGNAL_PAYLOAD = 30_000
export const MAX_SIGNALS = 40

export const THEME_IDS = [
  'strawberry-milk',
  'midnight-film',
  'sunday-memories',
  'lavender-dreams',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value)
}
