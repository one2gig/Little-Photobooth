const MAX_EDGE = 1280

export async function captureFrame(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  await waitForDimensions(video)
  const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight))
  const width = Math.max(1, Math.round(video.videoWidth * scale))
  const height = Math.max(1, Math.round(video.videoHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  if (mirror) {
    context.translate(width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(video, 0, 0, width, height)
  return canvasToBlob(canvas, 'image/jpeg', 0.82)
}

function waitForDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('camera stalled')), 4000)
    const done = () => {
      if (video.videoWidth === 0) return
      window.clearTimeout(timer)
      resolve()
    }
    video.addEventListener('loadeddata', done, { once: true })
    done()
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('export failed'))), type, quality)
  })
}
