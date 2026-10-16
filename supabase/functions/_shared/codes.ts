import { CODE_ALPHABET } from './constants.ts'

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function sanitizeBoothName(name: string): string {
  let cleaned = ''
  for (const character of name) {
    const code = character.charCodeAt(0)
    if (code < 32 || character === '<' || character === '>') continue
    cleaned += character
  }
  return cleaned.trim().slice(0, 30)
}

export function generateRoomCode(): string {
  let code = ''
  while (code.length < 6) {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length
    for (const byte of bytes) {
      if (byte >= limit) continue
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
      if (code.length === 6) break
    }
  }
  return code
}

export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

export function formatBoothDate(ms: number): string {
  const date = new Date(ms)
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getUTCFullYear()}`
}
