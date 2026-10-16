export interface CameraErrorInfo {
  code: 'denied' | 'missing' | 'busy' | 'unsupported' | 'aborted' | 'insecure'
  title: string
  message: string
}

export function describeCameraError(error: unknown): CameraErrorInfo {
  const name = errorName(error)
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        code: 'denied',
        title: 'Camera access needed',
        message: 'Camera access is needed to take your photos. Please allow camera access to use Little Booth.',
      }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'missing',
        title: "We couldn't find a camera on this device.",
        message: 'Try again, or head home if this phone has no camera.',
      }
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'busy',
        title: 'Your camera might be in use by another app.',
        message: 'Close other camera apps, then try again.',
      }
    case 'OverconstrainedError':
      return {
        code: 'unsupported',
        title: "This camera setting isn't supported.",
        message: 'We will try a simpler camera mode when you retry.',
      }
    case 'AbortError':
      return {
        code: 'aborted',
        title: 'Your camera stopped unexpectedly.',
        message: 'Tap try again to start the camera.',
      }
    default:
      return {
        code: 'insecure',
        title: "Camera access isn't available here.",
        message: 'Open Little Booth over HTTPS in Safari or Chrome.',
      }
  }
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error && 'name' in error && typeof error.name === 'string') return error.name
  return 'Unknown'
}
