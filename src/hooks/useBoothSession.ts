import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEventGate } from '@shared/eventGate.ts'
import { formatBoothDate } from '@shared/codes.ts'
import type { SignalRecord } from '@shared/types.ts'
import { createBoothApi, measureOffset } from '../features/booth/api.ts'
import { BoothRequestError } from '../features/booth/errors.ts'
import { clearCredentials, loadCredentials, saveCredentials } from '../features/booth/credentials.ts'
import { derivePhase } from '../features/booth/phase.ts'
import { renderPair, renderStrip, type PhotoPair } from '../features/composition/render.ts'
import { releaseSessionResources } from '../lib/cleanup.ts'
import { iceServers } from '../lib/config.ts'
import { BoothPeer } from '../lib/webRTC.ts'
import type { Credentials, ParticipantSlot, PublicSnapshot } from '../types/booth.ts'
import { useCamera } from './useCamera.ts'
import { useCountdown } from './useCountdown.ts'

type PhotoMap = Map<number, Partial<Record<ParticipantSlot, Blob>>>

export function useBoothSession() {
  const api = useMemo(() => createBoothApi(), [])
  const camera = useCamera()
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials())
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null)
  const [offset, setOffset] = useState(0)
  const [linkState, setLinkState] = useState<'live' | 'reconnecting'>('live')
  const [showTheme, setShowTheme] = useState(false)
  const [transferError, setTransferError] = useState(false)
  const [partnerEnded, setPartnerEnded] = useState(false)
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null)
  const [stripBlob, setStripBlob] = useState<Blob | null>(null)
  const [stripError, setStripError] = useState(false)
  const [photoVersion, setPhotoVersion] = useState(0)
  const photos = useRef<PhotoMap>(new Map())
  const urls = useRef<string[]>([])
  const peerRef = useRef<BoothPeer | null>(null)
  const pendingSignals = useRef<SignalRecord[]>([])
  const capturedFor = useRef<string | null>(null)
  const startingFor = useRef<string | null>(null)
  const wantsReady = useRef(false)
  const readyQueue = useRef(Promise.resolve())
  const gate = useRef(createEventGate())
  const snapshotRef = useRef(snapshot)
  const credentialsRef = useRef(credentials)
  snapshotRef.current = snapshot
  credentialsRef.current = credentials

  const remember = useCallback((shotIndex: number, slot: ParticipantSlot, blob: Blob) => {
    const current = photos.current.get(shotIndex) ?? {}
    current[slot] = blob
    photos.current.set(shotIndex, current)
    setTransferError(false)
    setPhotoVersion((version) => version + 1)
  }, [])

  const applySync = useCallback((next: PublicSnapshot, serverNow: number, t0: number) => {
    setSnapshot(next)
    setOffset(measureOffset(t0, serverNow))
    setLinkState('live')
  }, [])

  const ingestSignals = useCallback(async (signals: SignalRecord[]) => {
    if (signals.length === 0) return
    if (peerRef.current) await peerRef.current.acceptSignals(signals)
    else pendingSignals.current.push(...signals)
  }, [])

  useEffect(() => {
    if (!credentials) return
    let stopped = false
    let pending = false
    let again = false
    const syncNow = async () => {
      if (pending) {
        again = true
        return
      }
      pending = true
      const current = credentialsRef.current
      if (!current) return
      const t0 = Date.now()
      try {
        const result = await api.sync(current.sessionId, current.token)
        if (stopped) return
        applySync(result.snapshot, result.serverNow, t0)
        await ingestSignals(result.signals)
      } catch (error) {
        if (stopped) return
        if (error instanceof BoothRequestError && error.snapshot) setSnapshot(error.snapshot)
        if (!(error instanceof BoothRequestError && error.code === 'expired')) setLinkState('reconnecting')
      } finally {
        pending = false
        if (again && !stopped) {
          again = false
          void syncNow()
        }
      }
    }
    void syncNow()
    const interval = window.setInterval(() => void syncNow(), 2000)
    const unsubscribe = api.subscribe(credentials.sessionId, (event) => {
      const currentShot = snapshotRef.current?.shotIndex ?? 0
      if (!gate.current(event, currentShot)) return
      if (event.type === 'session_ended' && event.reason === 'ended') setPartnerEnded(true)
      void syncNow()
    })
    return () => {
      stopped = true
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [api, applySync, credentials, ingestSignals])

  const bothConnected = Boolean(
    snapshot && snapshot.participants.length === 2 && snapshot.participants.every((person) => person.isConnected),
  )

  useEffect(() => {
    if (!bothConnected || !credentials) return
    const peer =
      peerRef.current ??
      new BoothPeer({
        slot: credentials.slot,
        iceServers: iceServers(),
        sendSignal: (signal) => api.postSignal(credentials.sessionId, credentials.token, signal),
        onPhoto: (shotIndex, fromSlot, blob) => remember(shotIndex, fromSlot, blob),
      })
    peerRef.current = peer
    if (credentials.slot === 'host') void peer.startOffer()
    const queued = pendingSignals.current.splice(0)
    if (queued.length > 0) void peer.acceptSignals(queued)
    return () => {
      peer.close()
      if (peerRef.current === peer) peerRef.current = null
    }
  }, [api, bothConnected, credentials, remember])

  const captureAt = snapshot?.currentShot?.status === 'capturing' ? snapshot.currentShot.captureAt : null
  const countdown = useCountdown(captureAt, offset)

  useEffect(() => {
    if (!countdown.fired) return
    const shot = snapshotRef.current?.currentShot
    const creds = credentialsRef.current
    if (!shot || shot.status !== 'capturing' || !creds || shot.captureAt == null) return
    const key = `${shot.shotIndex}:${shot.captureAt}`
    if (capturedFor.current === key) return
    capturedFor.current = key
    const shotIndex = shot.shotIndex
    void (async () => {
      try {
        playShutter()
        const blob = await camera.capture()
        remember(shotIndex, creds.slot, blob)
        peerRef.current?.sendPhoto(shotIndex, blob)
        const t0 = Date.now()
        const result = await api.reportCapture(creds.sessionId, creds.token, shotIndex, 'captured')
        applySync(result.snapshot, result.serverNow, t0)
      } catch {
        try {
          const t0 = Date.now()
          const result = await api.reportCapture(creds.sessionId, creds.token, shotIndex, 'failed')
          applySync(result.snapshot, result.serverNow, t0)
        } catch {
          setLinkState('reconnecting')
        }
      }
    })()
  }, [api, applySync, camera, countdown.fired, remember])

  useEffect(() => {
    if (!snapshot || credentials?.slot !== 'host') return
    const shot = snapshot.currentShot
    if (!shot || (shot.status !== 'pending' && shot.status !== 'retry')) return
    const ready =
      snapshot.participants.length === 2 &&
      snapshot.participants.every((person) => person.isReady && person.cameraReady && person.isConnected)
    if (!ready) {
      startingFor.current = null
      return
    }
    const key = `${shot.shotIndex}:${shot.status}`
    if (startingFor.current === key) return
    startingFor.current = key
    void api
      .startShot(credentials.sessionId, credentials.token)
      .then((result) => applySync(result.snapshot, result.serverNow, Date.now()))
      .catch(() => {
        startingFor.current = null
      })
  }, [api, applySync, credentials, snapshot])

  useEffect(() => {
    const shot = snapshot?.currentShot
    if (!shot || shot.status !== 'retry' || !photos.current.has(shot.shotIndex)) return
    photos.current.delete(shot.shotIndex)
    capturedFor.current = null
    setReviewBlob(null)
    setTransferError(false)
    setPhotoVersion((version) => version + 1)
  }, [snapshot?.currentShot?.shotIndex, snapshot?.currentShot?.status])

  const phase = derivePhase({ snapshot, cameraBlocked: camera.status === 'error', showTheme })

  useEffect(() => {
    if (phase !== 'review' || !snapshot?.currentShot) return
    const shotIndex = snapshot.currentShot.shotIndex
    const pair = photos.current.get(shotIndex)
    if (!pair?.host || !pair.guest) {
      setReviewBlob(null)
      const timer = window.setTimeout(() => {
        const latest = photos.current.get(shotIndex)
        const mine = credentials?.slot === 'host' ? latest?.host : latest?.guest
        const theirs = credentials?.slot === 'host' ? latest?.guest : latest?.host
        if (mine && !theirs) setTransferError(true)
      }, 6000)
      return () => window.clearTimeout(timer)
    }
    let cancel = false
    void renderPair({ host: pair.host, guest: pair.guest }, snapshot.themeId)
      .then((blob) => {
        if (!cancel) setReviewBlob(blob)
      })
      .catch(() => {
        if (!cancel) setStripError(true)
      })
    return () => {
      cancel = true
    }
  }, [credentials?.slot, phase, photoVersion, snapshot?.currentShot?.shotIndex, snapshot?.themeId])

  useEffect(() => {
    if (phase !== 'strip' || !snapshot) return
    const pairs: PhotoPair[] = []
    for (let index = 0; index < snapshot.shotCount; index += 1) {
      const pair = photos.current.get(index)
      if (!pair?.host || !pair.guest) return
      pairs.push({ host: pair.host, guest: pair.guest })
    }
    let cancel = false
    void renderStrip(pairs, snapshot.themeId, snapshot.name || 'Little Booth', formatBoothDate(snapshot.createdAt))
      .then((blob) => {
        if (!cancel) {
          setStripBlob(blob)
          setStripError(false)
        }
      })
      .catch(() => {
        if (!cancel) setStripError(true)
      })
    return () => {
      cancel = true
    }
  }, [phase, photoVersion, snapshot])

  useEffect(() => {
    const onHide = () => {
      const current = credentialsRef.current
      camera.stop()
      peerRef.current?.close()
      if (!current) return
      void api.leave(current.sessionId, current.token, false, true).catch(() => undefined)
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [api, camera])

  function enqueueReady(task: () => Promise<void>) {
    const run = readyQueue.current.then(task, task)
    readyQueue.current = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function enableCamera() {
    await enqueueReady(async () => {
      const live = await camera.enable()
      const current = credentialsRef.current
      if (!current || !live || wantsReady.current) return
      const t0 = Date.now()
      const result = await api.setReady(current.sessionId, current.token, false, true)
      applySync(result.snapshot, result.serverNow, t0)
    })
  }

  async function markReady() {
    wantsReady.current = true
    await enqueueReady(async () => {
      const current = credentialsRef.current
      if (!current) return
      const live = await camera.enable()
      if (!live) return
      const t0 = Date.now()
      const result = await api.setReady(current.sessionId, current.token, true, true)
      applySync(result.snapshot, result.serverNow, t0)
    })
  }

  async function vote(choice: 'keep' | 'retake') {
    const current = credentialsRef.current
    const shot = snapshotRef.current?.currentShot
    if (!current || !shot) return
    const t0 = Date.now()
    const result = await api.resolveShot(current.sessionId, current.token, shot.shotIndex, choice)
    applySync(result.snapshot, result.serverNow, t0)
    if (choice === 'keep') startingFor.current = null
  }

  async function retryTransfer() {
    const current = credentialsRef.current
    const shot = snapshotRef.current?.currentShot
    if (!current || !shot) return
    const pair = photos.current.get(shot.shotIndex)
    const mine = current.slot === 'host' ? pair?.host : pair?.guest
    setTransferError(false)
    peerRef.current?.restart()
    if (mine) peerRef.current?.sendPhoto(shot.shotIndex, mine)
  }

  async function changeTheme(themeId: string) {
    const current = credentialsRef.current
    if (!current) return
    const t0 = Date.now()
    const result = await api.setTheme(current.sessionId, current.token, themeId)
    applySync(result.snapshot, result.serverNow, t0)
    setShowTheme(false)
  }

  async function exportStrip(type: 'image/jpeg' | 'image/png') {
    if (!snapshot) return null
    const pairs: PhotoPair[] = []
    for (let index = 0; index < snapshot.shotCount; index += 1) {
      const pair = photos.current.get(index)
      if (!pair?.host || !pair.guest) return null
      pairs.push({ host: pair.host, guest: pair.guest })
    }
    return renderStrip(pairs, snapshot.themeId, snapshot.name || 'Little Booth', formatBoothDate(snapshot.createdAt), type)
  }

  function clearLocalSession() {
    releaseSessionResources({
      stopCamera: () => camera.stop(),
      closePeer: () => peerRef.current?.close(),
      photos: photos.current,
      urls: urls.current,
    })
    peerRef.current = null
    credentialsRef.current = null
    clearCredentials()
    setCredentials(null)
    setSnapshot(null)
    setReviewBlob(null)
    setStripBlob(null)
  }

  async function endBooth() {
    const current = credentialsRef.current
    if (current) await api.leave(current.sessionId, current.token, true, true).catch(() => undefined)
    clearLocalSession()
  }

  return {
    credentials,
    snapshot,
    phase,
    linkState,
    camera,
    countdown,
    reviewBlob,
    stripBlob,
    stripError,
    transferError,
    partnerEnded,
    photoVersion,
    setShowTheme,
    enableCamera,
    markReady,
    vote,
    retryTransfer,
    changeTheme,
    exportStrip,
    endBooth,
    saveSession: (next: Credentials) => {
      saveCredentials(next)
      setCredentials(next)
      setSnapshot(null)
    },
  }
}

function playShutter() {
  const Context = window.AudioContext ?? window.webkitAudioContext
  if (!Context) return
  const audio = new Context()
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.frequency.value = 740
  gain.gain.setValueAtTime(0.03, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12)
  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start()
  oscillator.stop(audio.currentTime + 0.12)
  oscillator.onended = () => void audio.close()
}
