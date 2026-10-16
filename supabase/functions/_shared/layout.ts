export const STRIP_WIDTH = 1200
export const STRIP_HEIGHT = 2400
export const PAIR_WIDTH = 1200
export const PAIR_HEIGHT = 860

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PanelLayout {
  index: number
  frame: Rect
  photos: [Rect, Rect]
  heart: { x: number; y: number }
}

function pairPhotos(frame: Rect): { photos: [Rect, Rect]; heart: { x: number; y: number } } {
  const photoHeight = frame.height - 36
  const photoWidth = Math.round(photoHeight * 0.75)
  const gap = 16
  const total = photoWidth * 2 + gap
  const startX = frame.x + (frame.width - total) / 2
  const y = frame.y + 18
  return {
    photos: [
      { x: startX, y, width: photoWidth, height: photoHeight },
      { x: startX + photoWidth + gap, y, width: photoWidth, height: photoHeight },
    ],
    heart: { x: startX + photoWidth + gap / 2, y: y + photoHeight / 2 },
  }
}

export function pairLayout(): { frame: Rect; photos: [Rect, Rect]; heart: { x: number; y: number } } {
  const frame = { x: 70, y: 70, width: PAIR_WIDTH - 140, height: PAIR_HEIGHT - 140 }
  return { frame, ...pairPhotos(frame) }
}

export function stripLayout(): { width: number; height: number; panels: PanelLayout[] } {
  const titleHeight = 150
  const footerHeight = 90
  const gap = 18
  const margin = 70
  const innerHeight = STRIP_HEIGHT - titleHeight - footerHeight
  const panelHeight = (innerHeight - gap * 3) / 4
  const frame = { width: STRIP_WIDTH - margin * 2 }

  const panels = Array.from({ length: 4 }, (_, index) => {
    const panelFrame = {
      x: margin,
      y: titleHeight + index * (panelHeight + gap),
      width: frame.width,
      height: panelHeight,
    }
    const photos = pairPhotos(panelFrame)
    return { index, frame: panelFrame, ...photos }
  })

  return { width: STRIP_WIDTH, height: STRIP_HEIGHT, panels }
}
