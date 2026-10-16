import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'success' | 'ghost'

export function Button({
  children,
  variant = 'primary',
  to,
  type = 'button',
  disabled,
  onClick,
}: {
  children: ReactNode
  variant?: Variant
  to?: string
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
}) {
  const className = `btn btn-${variant}`
  if (to) return <Link to={to} className={className}>{children}</Link>
  return (
    <button type={type} className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
