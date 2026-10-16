import type { Ref } from 'react'

export function CameraPreview({
  attach,
  mirrored,
  live,
}: {
  attach: Ref<HTMLVideoElement>
  mirrored: boolean
  live: boolean
}) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-[28px] bg-[#f8d5e2]">
      <video
        ref={attach}
        playsInline
        autoPlay
        muted
        className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${live ? 'opacity-100' : 'opacity-0'}`}
      />
      {!live && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-extrabold text-[#8a5366]">
          Your camera shows up here
        </div>
      )}
    </div>
  )
}
