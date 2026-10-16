export function SamplePrints() {
  return (
    <div className="relative mx-auto mt-6 h-64 w-full max-w-[320px]" aria-hidden="true">
      <Polaroid className="absolute top-2 left-4 w-36 -rotate-6" tone="#ffe4ef" accent="#e25b88" label="you" />
      <Polaroid className="absolute top-8 right-3 w-40 rotate-6" tone="#f4eeff" accent="#a78bdb" label="them" />
    </div>
  )
}

function Polaroid({ className, tone, accent, label }: { className: string; tone: string; accent: string; label: string }) {
  return (
    <div className={`${className} rounded-2xl bg-white p-2 shadow-[0_12px_24px_rgb(199_54_103_/_14%)]`}>
      <svg viewBox="0 0 160 190" className="w-full rounded-xl" style={{ background: tone }}>
        <circle cx="80" cy="78" r="28" fill="#f6d3bf" />
        <path d="M48 78c6-28 58-28 64 0" fill={accent} />
        <circle cx="70" cy="78" r="3" fill="#3f2d2d" />
        <circle cx="92" cy="78" r="3" fill="#3f2d2d" />
        <path d="M72 90c6 6 12 6 18 0" fill="none" stroke="#c73667" strokeWidth="3" strokeLinecap="round" />
        <path d="M42 150c10-24 66-24 78 0v40H42z" fill={accent} opacity="0.85" />
        <text x="80" y="24" textAnchor="middle" fontSize="12" fill={accent} fontFamily="Nunito, sans-serif">
          {label}
        </text>
      </svg>
    </div>
  )
}
