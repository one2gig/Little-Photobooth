import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/Button.tsx'
import { BackLink, Screen } from '../../components/Screen.tsx'
import { createBoothApi } from '../../features/booth/api.ts'
import { boothErrorCopy } from '../../features/booth/copy.ts'
import { saveCredentials } from '../../features/booth/credentials.ts'
import { BoothRequestError } from '../../features/booth/errors.ts'
import { normalizeRoomCode } from '../../lib/security.ts'

export function JoinBoothPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const api = useMemo(() => createBoothApi(), [])
  const [code, setCode] = useState(normalizeRoomCode(params.get('code') ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [scanning, setScanning] = useState(false)
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window

  async function join(nextCode = code) {
    setPending(true)
    setError(null)
    try {
      const result = await api.joinBooth(nextCode)
      saveCredentials({
        sessionId: result.sessionId,
        token: result.participantToken,
        slot: result.slot,
        roomCode: result.roomCode,
      })
      navigate('/booth')
    } catch (caught) {
      const failure = caught instanceof BoothRequestError ? caught.code : 'invalid'
      setError(boothErrorCopy[failure].title)
      setPending(false)
    }
  }

  return (
    <Screen>
      <BackLink />
      <div className="mt-2 text-center">
        <p className="text-3xl" aria-hidden="true">📷</p>
        <h1 className="font-display text-4xl text-strawberry">Join a Booth</h1>
      </div>
      <form
        className="mt-8 flex flex-1 flex-col"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void join()
        }}
      >
        <label className="text-sm font-extrabold" htmlFor="room-code">
          Enter the room code
        </label>
        <input
          id="room-code"
          className="field mt-2 text-center text-2xl tracking-[0.3em] uppercase"
          value={code}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
        />
        {error && (
          <div className="card mt-4 px-4 py-3 text-center">
            <p className="font-extrabold">{error}</p>
            <p className="mt-1 text-sm font-bold text-[#8a6a6a]">{boothErrorCopy[errorKey(error)].message}</p>
          </div>
        )}
        <div className="mt-auto flex flex-col gap-3 pt-8">
          <Button type="submit" disabled={pending || code.length !== 6}>
            {pending ? 'Joining…' : 'Join'}
          </Button>
          {canScan && (
            <Button variant="secondary" onClick={() => setScanning(true)}>
              Scan QR code
            </Button>
          )}
        </div>
      </form>
      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onCode={(value) => {
            const next = normalizeRoomCode(value)
            setCode(next)
            setScanning(false)
            if (next.length === 6) void join(next)
          }}
        />
      )}
    </Screen>
  )
}

function errorKey(title: string): keyof typeof boothErrorCopy {
  const match = (Object.keys(boothErrorCopy) as Array<keyof typeof boothErrorCopy>).find((key) => boothErrorCopy[key].title === title)
  return match ?? 'invalid'
}

function QrScanner({ onCode, onClose }: { onCode: (value: string) => void; onClose: () => void }) {
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const Detector = window.BarcodeDetector
    if (!video || !Detector) return
    let cancel = false
    let stream: MediaStream | null = null
    let frame = 0
    void (async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (cancel) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      const detector = new Detector({ formats: ['qr_code'] })
      const tick = async () => {
        if (cancel) return
        const codes = await detector.detect(video).catch(() => [])
        const value = codes[0]?.rawValue
        if (value) {
          const parsed = value.includes('code=') ? new URL(value, window.location.origin).searchParams.get('code') : value
          onCodeRef.current(parsed ?? value)
          return
        }
        frame = window.requestAnimationFrame(() => void tick())
      }
      void tick()
    })()
    return () => {
      cancel = true
      window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-[#3f2d2d]/50 p-6">
      <div className="card w-full max-w-sm p-4">
        <video ref={videoRef} playsInline autoPlay muted className="aspect-square w-full rounded-2xl bg-black object-cover" />
        <div className="mt-3">
          <Button variant="secondary" onClick={onClose}>
            Close scanner
          </Button>
        </div>
      </div>
    </div>
  )
}
