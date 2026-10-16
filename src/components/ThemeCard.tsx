import type { ThemeStyle } from '../features/composition/themes.ts'

export function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeStyle
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-h-11 rounded-3xl border-2 p-3 text-left ${selected ? 'border-strawberry' : 'border-transparent'} `}
      style={{ background: theme.card, color: theme.ink }}
    >
      <span className="block h-10 rounded-2xl" style={{ background: theme.backgroundAccent }} />
      <span className="mt-2 block text-sm font-extrabold">{theme.name}</span>
    </button>
  )
}
