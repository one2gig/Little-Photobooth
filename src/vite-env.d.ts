/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_TURN_URL?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
  readonly VITE_CAPTURE_DELAY_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

interface Window {
  BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetector
  webkitAudioContext?: typeof AudioContext
}
