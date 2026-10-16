import type { BoothError } from '../../types/booth.ts'

export const boothErrorCopy: Record<BoothError, { title: string; message: string }> = {
  not_found: {
    title: "We couldn't find this booth",
    message: 'Check the code with your person and try again.',
  },
  expired: {
    title: 'Session expired',
    message: 'This booth is no longer available or has ended.',
  },
  full: {
    title: 'This booth already has two people',
    message: 'Ask them to start a new booth if you still want to join.',
  },
  forbidden: {
    title: 'This booth is private',
    message: 'Open the original tab on this phone, or ask for a new booth.',
  },
  invalid: {
    title: "That didn't look right",
    message: 'Check the booth name, code, or theme and try again.',
  },
  rate_limited: {
    title: "Let's slow down a moment",
    message: 'Too many attempts. Wait a little, then try again.',
  },
  not_ready: {
    title: 'Both cameras need to be ready',
    message: "Each person taps I'm Ready after their camera is on.",
  },
  conflict: {
    title: 'This booth moved on',
    message: 'We refreshed the session. You can try that again.',
  },
}
