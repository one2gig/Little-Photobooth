import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button.tsx'
import { BackLink, Screen } from '../../components/Screen.tsx'
import { ThemeCard } from '../../components/ThemeCard.tsx'
import { createBoothApi } from '../../features/booth/api.ts'
import { boothErrorCopy } from '../../features/booth/copy.ts'
import { saveCredentials } from '../../features/booth/credentials.ts'
import { BoothRequestError } from '../../features/booth/errors.ts'
import { THEMES } from '../../features/composition/themes.ts'

export function CreateBoothPage() {
  const navigate = useNavigate()
  const api = useMemo(() => createBoothApi(), [])
  const [name, setName] = useState('')
  const [themeId, setThemeId] = useState(THEMES[0]?.id ?? 'strawberry-milk')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await api.createBooth({ name, themeId })
      saveCredentials({
        sessionId: result.sessionId,
        token: result.participantToken,
        slot: result.slot,
        roomCode: result.roomCode,
      })
      navigate('/booth')
    } catch (caught) {
      const code = caught instanceof BoothRequestError ? caught.code : 'invalid'
      setError(boothErrorCopy[code].message)
      setPending(false)
    }
  }

  return (
    <Screen>
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-1 flex-col">
        <BackLink />
        <div className="mt-2 text-center">
          <p className="text-3xl" aria-hidden="true">📷</p>
          <h1 className="font-display text-4xl text-strawberry">Create a Booth</h1>
        </div>
        <label className="mt-6 text-sm font-extrabold" htmlFor="booth-name">
          Give your booth a name
        </label>
        <input
          id="booth-name"
          className="field mt-2"
          maxLength={30}
          value={name}
          placeholder="Our Little Date"
          onChange={(event) => setName(event.target.value)}
        />
        <p className="mt-1 text-right text-xs font-bold text-[#8a6a6a]">{name.length}/30</p>
        <p className="mt-4 text-sm font-extrabold">Choose a theme</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {THEMES.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} selected={theme.id === themeId} onSelect={() => setThemeId(theme.id)} />
          ))}
        </div>
        <p className="mt-4 text-center text-sm font-bold text-[#8a6a6a]">4 shots · both of you keep a copy</p>
        {error && <p className="mt-3 text-center text-sm font-bold text-strawberry">{error}</p>}
        <div className="mt-auto pt-6">
          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create Booth'}
          </Button>
        </div>
      </form>
    </Screen>
  )
}
