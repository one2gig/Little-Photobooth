import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancel = false
    void QRCode.toDataURL(value, {
      margin: 1,
      width: 220,
      color: { dark: '#3f2d2d', light: '#ffffff' },
    }).then((url) => {
      if (!cancel) setSrc(url)
    })
    return () => {
      cancel = true
    }
  }, [value])
  if (!src) return <div className="size-52 animate-pulse rounded-3xl bg-white/70" />
  return <img src={src} alt="" className="size-52 rounded-3xl bg-white p-3" />
}
