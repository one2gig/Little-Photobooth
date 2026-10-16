import { useCallback, useEffect, useRef, useState } from 'react'
import { describeCameraError, type CameraErrorInfo } from '../features/camera/errors.ts'
import { captureFrame } from '../features/capture/captureFrame.ts'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'error'
export type FacingMode = 'user' | 'environment'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<CameraErrorInfo | null>(null)
  const [facingMode, setFacingMode] = useState<FacingMode>('user')
  const [canFlip, setCanFlip] = useState(false)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const attach = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (!node || !streamRef.current) return
    node.srcObject = streamRef.current
    void node.play().catch(() => undefined)
  }, [])

  const stop = useCallback(() => {
    stopTracks()
    void wakeLock.current?.release().catch(() => undefined)
    wakeLock.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [stopTracks])

  const enable = useCallback(
    async (nextFacing?: FacingMode): Promise<boolean> => {
      const facing = nextFacing ?? facingMode
      if (!nextFacing && streamRef.current?.getVideoTracks().some((track) => track.readyState === 'live')) {
        setStatus('live')
        return true
      }
      setStatus('starting')
      setError(null)
      stopTracks()
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(describeCameraError(new Error('insecure')))
        setStatus('error')
        return false
      }
      try {
        const stream = await openStream(facing)
        streamRef.current = stream
        setFacingMode(facing)
        setStatus('live')
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setError(describeCameraError(Object.assign(new Error('stopped'), { name: 'AbortError' })))
            setStatus('error')
          }
        })
        try {
          wakeLock.current = (await navigator.wakeLock?.request('screen')) ?? null
        } catch {
          wakeLock.current = null
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
        setCanFlip(devices.filter((device) => device.kind === 'videoinput').length > 1)
        return true
      } catch (caught) {
        setError(describeCameraError(caught))
        setStatus('error')
        return false
      }
    },
    [facingMode, stopTracks],
  )

  const flip = useCallback(() => enable(facingMode === 'user' ? 'environment' : 'user'), [enable, facingMode])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video) throw new Error('camera')
    return captureFrame(video, facingMode === 'user')
  }, [facingMode])

  useEffect(() => stop, [stop])

  return { attach, status, error, facingMode, canFlip, enable, flip, stop, capture, videoRef }
}

async function openStream(facing: FacingMode): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1600 } },
    })
  } catch (error) {
    if (errorName(error) !== 'OverconstrainedError') throw error
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing } })
  }
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error && 'name' in error && typeof error.name === 'string' ? error.name : ''
}
