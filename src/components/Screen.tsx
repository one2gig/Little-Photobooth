import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Screen({
  tone = 'cream',
  children,
}: {
  tone?: 'cream' | 'pink' | 'mint' | 'lilac'
  children: ReactNode
}) {
  return (
    <main className={`tone-${tone} min-h-dvh`}>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Doodles />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </div>
    </main>
  )
}

function Doodles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-[#f3a0b8]">
      <span className="absolute top-6 left-5 text-xl">✦</span>
      <span className="absolute top-10 right-6 text-lg">♥</span>
      <span className="absolute top-24 right-10 text-sm">✧</span>
      <span className="absolute bottom-28 left-6 text-lg">♥</span>
      <span className="absolute right-8 bottom-16 text-xl">✦</span>
    </div>
  )
}

export function BackLink({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="grid size-11 place-items-center rounded-full text-2xl text-strawberry" aria-label="Back">
      ‹
    </Link>
  )
}
