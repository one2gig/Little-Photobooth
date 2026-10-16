export function releaseSessionResources(input: {
  stopCamera: () => void
  closePeer: () => void
  photos: { clear: () => void }
  urls: string[]
  revoke?: (url: string) => void
}): void {
  input.stopCamera()
  input.closePeer()
  input.photos.clear()
  const revoke = input.revoke ?? ((url: string) => URL.revokeObjectURL(url))
  for (const url of input.urls) revoke(url)
  input.urls.length = 0
}
