export function PhotoStrip({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return <div className="card mx-auto h-[420px] w-[220px] animate-pulse bg-white/70" aria-hidden="true" />
  }
  return (
    <img
      src={src}
      alt={alt}
      className="mx-auto max-h-[62dvh] w-auto rounded-[28px] shadow-[0_16px_40px_rgb(92_50_70_/_18%)]"
    />
  )
}
