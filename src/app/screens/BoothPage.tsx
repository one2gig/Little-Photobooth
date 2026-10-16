import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '../../components/Button.tsx'
import { CameraPreview } from '../../components/CameraPreview.tsx'
import { Countdown } from '../../components/Countdown.tsx'
import { ParticipantCard } from '../../components/ParticipantCard.tsx'
import { PhotoStrip } from '../../components/PhotoStrip.tsx'
import { QrCode } from '../../components/QrCode.tsx'
import { Screen } from '../../components/Screen.tsx'
import { ThemeCard } from '../../components/ThemeCard.tsx'
import { describeCameraError } from '../../features/camera/errors.ts'
import { isSupabaseConfigured } from '../../lib/supabase.ts'
import { downloadBlob, openBlob, shareBlob } from '../../features/composition/download.ts'
import { THEMES } from '../../features/composition/themes.ts'
import { useBoothSession } from '../../hooks/useBoothSession.ts'
import type { PublicParticipant } from '../../types/booth.ts'

export function BoothPage() {
  const navigate = useNavigate()
  const session = useBoothSession()
  const reviewUrl = useBlobUrl(session.reviewBlob)
  const stripUrl = useBlobUrl(session.stripBlob)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themeId, setThemeId] = useState(session.snapshot?.themeId ?? 'strawberry-milk')

  useEffect(() => {
    if (!session.credentials) navigate('/')
  }, [navigate, session.credentials])

  useEffect(() => {
    if (session.snapshot?.themeId) setThemeId(session.snapshot.themeId)
  }, [session.snapshot?.themeId])

  if (!session.credentials || !session.snapshot || session.phase === 'loading') {
    return (
      <Screen>
        <div className="card mt-16 h-40 animate-pulse" />
        <div className="card mt-4 h-12 animate-pulse" />
      </Screen>
    )
  }

  const { snapshot, credentials } = session
  const me = snapshot.participants.find((person) => person.slot === credentials.slot)
  const partner = snapshot.participants.find((person) => person.slot !== credentials.slot)
  const inviteLink = `${window.location.origin}/join?code=${credentials.roomCode}`

  if (session.phase === 'expired') {
    return (
      <Screen tone="lilac">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-7xl" aria-hidden="true">☁️</p>
          <h1 className="font-display mt-4 text-4xl text-lilac-deep">Session expired</h1>
          <p className="mt-2 max-w-xs font-bold text-[#6d5a86]">This booth is no longer available or has ended.</p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </Screen>
    )
  }

  if (session.phase === 'permission') {
    const info = session.camera.error ?? describeCameraError(new Error('insecure'))
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-6xl" aria-hidden="true">📷</p>
          <h1 className="mt-4 text-2xl font-extrabold">{info.title}</h1>
          <p className="mt-2 max-w-xs font-bold text-[#6d4c4c]">{info.message}</p>
          {settingsOpen && (
            <div className="card mt-4 px-4 py-3 text-left text-sm font-bold">
              <p>iPhone: Settings → Safari → Camera → Allow.</p>
              <p className="mt-2">Android: tap the lock icon in the address bar, then allow Camera.</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Button onClick={() => setSettingsOpen(true)}>Open Settings</Button>
          <Button variant="secondary" onClick={() => void session.enableCamera()}>
            Try Again
          </Button>
        </div>
      </Screen>
    )
  }

  if (session.phase === 'invite') {
    return (
      <Screen tone="pink">
        <div className="text-center">
          <h1 className="font-display text-4xl text-strawberry">Your booth is ready!</h1>
          <p className="mt-2 font-bold">Share this link or QR code with your partner.</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-4">
          <QrCode value={inviteLink} />
          <p className="text-3xl font-extrabold tracking-[0.35em]" aria-label="Room code">
            {credentials.roomCode}
          </p>
          <p className="max-w-full truncate text-sm font-bold text-[#8a5366]">{inviteLink}</p>
        </div>
        <div className="mt-auto flex flex-col gap-3">
          <Button
            onClick={() => void navigator.clipboard?.writeText(inviteLink)}
          >
            Copy link
          </Button>
          <Button
            variant="secondary"
            onClick={() => void navigator.share?.({ title: 'Little Booth', url: inviteLink })}
          >
            Share
          </Button>
          <p className="text-center font-extrabold text-strawberry">Waiting for your partner to join…</p>
          <Hearts />
          {!isSupabaseConfigured() && (
            <p className="text-center text-xs font-bold text-[#8a5366]">
              Another browser on this computer can join this code. A phone needs the deployed site.
            </p>
          )}
        </div>
      </Screen>
    )
  }

  if (session.phase === 'theme') {
    return (
      <Screen>
        <h1 className="font-display text-center text-4xl text-strawberry">Choose a Theme</h1>
        <div className="mt-6 flex flex-1 flex-col gap-3">
          {THEMES.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} selected={theme.id === themeId} onSelect={() => setThemeId(theme.id)} />
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Button onClick={() => void session.changeTheme(themeId)}>Apply</Button>
          <Button variant="ghost" onClick={() => session.setShowTheme(false)}>
            Back
          </Button>
        </div>
      </Screen>
    )
  }

  if (session.phase === 'strip') {
    return (
      <Screen>
        <h1 className="font-display text-center text-4xl text-strawberry">Your Photo Strip</h1>
        {session.partnerEnded && <p className="mt-2 text-center text-sm font-bold">Your person ended the booth. You can still save your copy.</p>}
        <div className="mt-4 flex flex-1 items-center justify-center">
          {session.stripError ? (
            <p className="text-center font-bold">The decorations could not render. You can still download the photos.</p>
          ) : (
            <PhotoStrip src={stripUrl} alt="Your photo strip" />
          )}
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Button variant="secondary" onClick={() => session.setShowTheme(true)}>
            Change Theme
          </Button>
          <Button onClick={() => void saveStrip(session, 'image/jpeg', 'little-booth.jpg')}>Download</Button>
          <Button variant="secondary" onClick={() => void saveStrip(session, 'image/png', 'little-booth.png')}>
            Save another version
          </Button>
          <Button variant="ghost" onClick={() => void shareStrip(session)}>
            Share
          </Button>
          <Button variant="ghost" onClick={() => void session.exportStrip('image/jpeg').then((blob) => blob && openBlob(blob))}>
            Open image
          </Button>
          <Button variant="secondary" onClick={() => void session.endBooth().then(() => navigate('/'))}>
            End Booth
          </Button>
        </div>
      </Screen>
    )
  }

  if (session.phase === 'countdown') {
    const shot = snapshot.currentShot
    return (
      <Screen tone="pink">
        <p className="text-center text-sm font-extrabold">
          Shot {(shot?.shotIndex ?? 0) + 1} / {snapshot.shotCount}
        </p>
        <h1 className="font-display text-center text-4xl text-strawberry">Get ready!</h1>
        <div className="mt-4 flex flex-1 flex-col items-center justify-center">
          <Countdown value={session.countdown.display ?? 3} />
          <div className="mt-4 w-full max-w-[240px]">
            <CameraPreview attach={session.camera.attach} mirrored={session.camera.facingMode === 'user'} live={session.camera.status === 'live'} />
          </div>
          <p className="mt-3 text-sm font-extrabold">{me?.isReady && partner?.isReady ? 'Both ready' : 'Waiting on a camera'}</p>
        </div>
        <p className="text-center text-sm font-bold text-[#8a5366]">{(shot?.shotIndex ?? 0) + 1} / {snapshot.shotCount}</p>
      </Screen>
    )
  }

  if (session.phase === 'review') {
    const shot = snapshot.currentShot
    const myVote = credentials.slot === 'host' ? shot?.hostVote : shot?.guestVote
    return (
      <Screen>
        <div className="text-center">
          <h1 className="font-display text-4xl text-strawberry">Nice shot!</h1>
          <p className="font-extrabold">Keep it or retake?</p>
          <p className="text-sm font-bold text-[#8a5366]">A little memory! · Shot {(shot?.shotIndex ?? 0) + 1} / {snapshot.shotCount}</p>
        </div>
        <div className="relative mt-4 flex flex-1 items-center justify-center">
          {reviewUrl ? (
            <img src={reviewUrl} alt="Combined shot" className="max-h-[52dvh] rounded-[28px] bg-white p-3 shadow-lg" />
          ) : (
            <div className="card w-full px-4 py-10 text-center font-extrabold">
              {session.transferError ? 'The photo transfer needs another try before either of you moves on.' : "Getting your person's photo…"}
            </div>
          )}
          {reviewUrl && <span className="absolute bottom-6 rounded-full bg-white px-3 py-1 text-sm font-extrabold text-strawberry">Better Together</span>}
        </div>
        {myVote === 'keep' && shot?.status === 'review' && <p className="text-center text-sm font-bold">Waiting for your person to keep it.</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={myVote != null} onClick={() => void session.vote('retake')}>
            Retake
          </Button>
          <Button disabled={!reviewUrl || myVote != null} onClick={() => void session.vote('keep')}>
            Keep
          </Button>
        </div>
        {session.transferError && (
          <div className="mt-3">
            <Button variant="ghost" onClick={() => void session.retryTransfer()}>
              Try sending again
            </Button>
          </div>
        )}
      </Screen>
    )
  }

  return (
    <Screen tone="mint">
      <div className="text-center">
        <h1 className="font-display text-4xl text-mint-deep">You're in!</h1>
        <p className="font-bold">{partner?.isConnected === false ? 'Your person got disconnected' : 'Waiting for your partner…'}</p>
        {session.linkState === 'reconnecting' && <p className="text-sm font-extrabold">Reconnecting…</p>}
      </div>
      <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
        <ParticipantCard label="You" ready={Boolean(me?.isReady)} connected={me?.isConnected !== false}>
          <CameraPreview attach={session.camera.attach} mirrored={session.camera.facingMode === 'user'} live={session.camera.status === 'live'} />
        </ParticipantCard>
        <ParticipantCard label="Partner" ready={Boolean(partner?.isReady)} connected={Boolean(partner?.isConnected)}>
          <PartnerTile partner={partner} />
        </ParticipantCard>
      </div>
      <p className="mt-3 text-center text-xs font-bold text-[#5f6b62]">
        Your person receives a copy of each photo. Little Booth does not keep a gallery.
      </p>
      <p className="mt-1 text-center text-sm font-extrabold">Shot {snapshot.shotIndex + 1} / {snapshot.shotCount}</p>
      <div className="mt-3 flex flex-col gap-3">
        {session.camera.status !== 'live' ? (
          <Button onClick={() => void session.enableCamera()}>
            {session.camera.status === 'starting' ? 'Starting camera…' : 'Enable my camera'}
          </Button>
        ) : (
          <Button variant="success" disabled={Boolean(me?.isReady)} onClick={() => void session.markReady()}>
            {me?.isReady ? 'Ready' : "I'm Ready"}
          </Button>
        )}
        {session.camera.canFlip && session.camera.status === 'live' && (
          <Button variant="secondary" onClick={() => void session.camera.flip()}>
            Flip camera
          </Button>
        )}
      </div>
    </Screen>
  )
}

function PartnerTile({ partner }: { partner: PublicParticipant | undefined }) {
  return (
    <div className="grid h-full place-items-center bg-[#f7eef8] text-center">
      <div>
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-white text-2xl">☺</div>
        <p className="mt-2 text-sm font-extrabold">{partner ? (partner.isConnected ? 'Connected' : 'Disconnected') : 'Not here yet'}</p>
      </div>
    </div>
  )
}

function Hearts() {
  const reduce = useReducedMotion()
  if (reduce) return <p className="text-center text-strawberry">♥ ♥ ♥</p>
  return (
    <div className="flex justify-center gap-3 text-xl text-strawberry" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span key={index} animate={{ y: [0, -10, 0] }} transition={{ duration: 2.2, repeat: Infinity, delay: index * 0.25 }}>
          ♥
        </motion.span>
      ))}
    </div>
  )
}

function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

async function saveStrip(
  session: ReturnType<typeof useBoothSession>,
  type: 'image/jpeg' | 'image/png',
  filename: string,
) {
  const blob = type === 'image/jpeg' && session.stripBlob ? session.stripBlob : await session.exportStrip(type)
  if (!blob) return
  await downloadBlob(blob, filename)
}

async function shareStrip(session: ReturnType<typeof useBoothSession>) {
  const blob = session.stripBlob ?? (await session.exportStrip('image/jpeg'))
  if (!blob) return
  const shared = await shareBlob(blob, 'little-booth.jpg', 'Little Booth').catch(() => false)
  if (!shared) await downloadBlob(blob, 'little-booth.jpg')
}
