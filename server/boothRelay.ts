import { applyCommand, emptyDatabase } from '../supabase/functions/_shared/stateMachine.ts'
import type { BoothEvent, Command, CommandResult } from '../supabase/functions/_shared/types.ts'

export function createBoothRelay() {
  let db = emptyDatabase()
  const listeners = new Set<(event: BoothEvent) => void>()

  return {
    handle(command: Command): CommandResult {
      const applied = applyCommand(db, retimed(command, Date.now()))
      if (applied.committed) db = applied.db
      for (const event of applied.events) {
        for (const listener of listeners) listener(event)
      }
      return applied.result
    },
    subscribe(listener: (event: BoothEvent) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function retimed(command: Command, now: number): Command {
  if (command.type !== 'start-shot') return { ...command, now }
  const delay = Math.min(15_000, Math.max(1000, command.captureAt - command.now))
  return { ...command, now, captureAt: now + delay }
}
