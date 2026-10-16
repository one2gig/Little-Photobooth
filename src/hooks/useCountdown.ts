import { useEffect, useRef, useState } from 'react'
import { countdownDisplay, remainingUntil } from '@shared/clock.ts'

export function useCountdown(captureAt: number | null, offsetMs: number) {
  const offsetRef = useRef(offsetMs)
  offsetRef.current = offsetMs
  const [display, setDisplay] = useState<number | null>(captureAt == null ? null : 3)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (captureAt == null) {
      setDisplay(null)
      setFired(false)
      return
    }
    setFired(false)
    let frame = 0
    const tick = () => {
      const remaining = remainingUntil(captureAt, Date.now(), offsetRef.current)
      setDisplay(countdownDisplay(remaining))
      if (remaining <= 0) {
        setFired(true)
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [captureAt])

  return { display, fired }
}
