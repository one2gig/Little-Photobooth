import { Button } from '../../components/Button.tsx'
import { SamplePrints } from '../../components/SamplePrints.tsx'
import { Screen } from '../../components/Screen.tsx'

export function LandingPage() {
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center pt-8">
        <p className="font-display text-5xl leading-tight text-strawberry">
          Little
          <br />
          Booth
        </p>
        <p className="mt-4 text-center text-lg leading-snug font-extrabold text-[#6d4c4c]">
          Two phones.
          <br />
          One moment.
          <br />
          A thousand memories.
        </p>
        <SamplePrints />
        <div className="mt-auto flex w-full flex-col gap-3 pb-2">
          <Button to="/create">Create a Booth</Button>
          <Button to="/join" variant="secondary">
            Join a Booth
          </Button>
          <p className="text-center text-sm font-extrabold text-strawberry">Little Booth ♥</p>
        </div>
      </div>
    </Screen>
  )
}
