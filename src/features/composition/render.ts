import { pairLayout, stripLayout, PAIR_HEIGHT, PAIR_WIDTH, type Rect } from '@shared/layout.ts'
import { canvasToBlob } from '../capture/captureFrame.ts'
import { themeById, type ThemeStyle } from './themes.ts'

export interface PhotoPair {
  host: Blob
  guest: Blob
}

export async function renderPair(pair: PhotoPair, themeId: string): Promise<Blob> {
  await readyFonts()
  const theme = themeById(themeId)
  const canvas = document.createElement('canvas')
  canvas.width = PAIR_WIDTH
  canvas.height = PAIR_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  const images = await Promise.all([loadImage(pair.host), loadImage(pair.guest)])
  paintScene(context, canvas.width, canvas.height, theme)
  const layout = pairLayout()
  drawPanel(context, layout.frame, layout.photos, layout.heart, images, theme)
  return canvasToBlob(canvas, 'image/jpeg', 0.92)
}

export async function renderStrip(
  pairs: PhotoPair[],
  themeId: string,
  title: string,
  dateLabel: string,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<Blob> {
  await readyFonts()
  const theme = themeById(themeId)
  const layout = stripLayout()
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas')
  paintScene(context, canvas.width, canvas.height, theme)
  context.fillStyle = theme.ink
  context.textAlign = 'center'
  context.font = '64px Pacifico, cursive'
  context.fillText(title || 'Little Booth', canvas.width / 2, 96)
  for (let index = 0; index < layout.panels.length; index += 1) {
    const panel = layout.panels[index]
    const pair = pairs[index]
    if (!panel || !pair) continue
    const images = await Promise.all([loadImage(pair.host), loadImage(pair.guest)])
    drawPanel(context, panel.frame, panel.photos, panel.heart, images, theme)
  }
  context.font = '700 28px Nunito, sans-serif'
  context.fillStyle = theme.ink
  context.fillText(dateLabel, canvas.width / 2, canvas.height - 40)
  return canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined)
}

function paintScene(context: CanvasRenderingContext2D, width: number, height: number, theme: ThemeStyle) {
  context.fillStyle = theme.background
  context.fillRect(0, 0, width, height)
  context.fillStyle = theme.backgroundAccent
  context.globalAlpha = 0.55
  context.beginPath()
  context.arc(width * 0.12, height * 0.08, 70, 0, Math.PI * 2)
  context.arc(width * 0.9, height * 0.16, 46, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 1
  if (theme.doodle === 'film') drawFilmEdge(context, width, height, theme)
  else scatter(context, width, height, theme)
}

function drawPanel(
  context: CanvasRenderingContext2D,
  frame: Rect,
  photos: [Rect, Rect],
  heart: { x: number; y: number },
  images: [HTMLImageElement, HTMLImageElement],
  theme: ThemeStyle,
) {
  roundRect(context, frame, 28)
  context.fillStyle = theme.frame
  context.fill()
  context.lineWidth = 6
  context.strokeStyle = theme.border
  context.stroke()
  photos.forEach((rect, index) => {
    const image = images[index]
    if (!image) return
    context.save()
    roundRect(context, rect, 18)
    context.clip()
    drawCover(context, image, rect)
    context.restore()
  })
  drawHeart(context, heart.x, heart.y, 16, theme.accent)
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, rect: Rect) {
  const scale = Math.max(rect.width / image.width, rect.height / image.height)
  const sourceWidth = rect.width / scale
  const sourceHeight = rect.height / scale
  const sx = (image.width - sourceWidth) / 2
  const sy = Math.max(0, (image.height - sourceHeight) * 0.35)
  context.drawImage(image, sx, sy, sourceWidth, sourceHeight, rect.x, rect.y, rect.width, rect.height)
}

function scatter(context: CanvasRenderingContext2D, width: number, height: number, theme: ThemeStyle) {
  const marks = [
    [48, 48],
    [width - 54, 70],
    [36, height - 80],
    [width - 48, height - 64],
  ]
  marks.forEach(([x, y], index) => {
    if (x === undefined || y === undefined) return
    if (theme.doodle === 'hearts') drawHeart(context, x, y, 14 + (index % 2) * 4, theme.accent)
    else if (theme.doodle === 'stars') drawStar(context, x, y, 12, theme.accent)
    else drawFlower(context, x, y, 12, theme.accent)
  })
}

function drawFilmEdge(context: CanvasRenderingContext2D, width: number, height: number, theme: ThemeStyle) {
  context.fillStyle = theme.accent
  for (let y = 24; y < height; y += 36) {
    roundRect(context, { x: 16, y, width: 18, height: 12 }, 3)
    context.fill()
    roundRect(context, { x: width - 34, y, width: 18, height: 12 }, 3)
    context.fill()
  }
}

function drawHeart(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  context.save()
  context.translate(x, y)
  context.fillStyle = color
  context.beginPath()
  context.moveTo(0, size * 0.35)
  context.bezierCurveTo(-size, -size * 0.4, -size * 0.2, -size, 0, -size * 0.35)
  context.bezierCurveTo(size * 0.2, -size, size, -size * 0.4, 0, size * 0.35)
  context.fill()
  context.restore()
}

function drawStar(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  context.save()
  context.translate(x, y)
  context.fillStyle = color
  context.beginPath()
  for (let point = 0; point < 5; point += 1) {
    const angle = -Math.PI / 2 + point * ((Math.PI * 2) / 5)
    const px = Math.cos(angle) * radius
    const py = Math.sin(angle) * radius
    if (point === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
    const inner = angle + Math.PI / 5
    context.lineTo(Math.cos(inner) * radius * 0.45, Math.sin(inner) * radius * 0.45)
  }
  context.closePath()
  context.fill()
  context.restore()
}

function drawFlower(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  context.fillStyle = color
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = (Math.PI * 2 * petal) / 5
    context.beginPath()
    context.arc(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7, radius * 0.45, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = '#fff8ee'
  context.beginPath()
  context.arc(x, y, radius * 0.35, 0, Math.PI * 2)
  context.fill()
}

function roundRect(context: CanvasRenderingContext2D, rect: Rect, radius: number) {
  context.beginPath()
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    image.src = url
  })
}

async function readyFonts() {
  if (!document.fonts) return
  await document.fonts.load('64px Pacifico')
  await document.fonts.load('700 28px Nunito')
  await document.fonts.ready
}
