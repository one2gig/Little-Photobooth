import type { ReactNode } from 'react'

export function ParticipantCard({
  label,
  ready,
  connected,
  children,
}: {
  label: string
  ready: boolean
  connected: boolean
  children: ReactNode
}) {
  return (
    <article className="card overflow-hidden">
      <div className="aspect-[3/4]">{children}</div>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="font-extrabold">{label}</p>
        <p className={`text-sm font-extrabold ${ready ? 'text-mint-deep' : 'text-[#8a6a6a]'}`}>
          {!connected ? 'Away' : ready ? 'Ready' : 'Here'}
        </p>
      </div>
    </article>
  )
}
