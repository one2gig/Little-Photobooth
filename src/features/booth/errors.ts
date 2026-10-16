import type { BoothError, PublicSnapshot } from '../../types/booth.ts'

export class BoothRequestError extends Error {
  readonly code: BoothError
  readonly snapshot: PublicSnapshot | null

  constructor(code: BoothError, snapshot: PublicSnapshot | null) {
    super(code)
    this.name = 'BoothRequestError'
    this.code = code
    this.snapshot = snapshot
  }
}
