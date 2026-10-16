export const CHUNK_SIZE = 16 * 1024

export function splitBytes(bytes: Uint8Array, size = CHUNK_SIZE): Uint8Array[] {
  if (bytes.length === 0) return [new Uint8Array()]
  const parts: Uint8Array[] = []
  for (let index = 0; index < bytes.length; index += size) {
    parts.push(bytes.slice(index, index + size))
  }
  return parts
}

export function joinBytes(parts: Uint8Array[], byteLength: number): Uint8Array | null {
  const out = new Uint8Array(byteLength)
  let offset = 0
  for (const part of parts) {
    if (offset + part.length > byteLength) return null
    out.set(part, offset)
    offset += part.length
  }
  if (offset !== byteLength) return null
  return out
}

export function encodeChunk(
  shotIndex: number,
  chunkIndex: number,
  totalChunks: number,
  data: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(13 + data.length)
  const view = new DataView(out.buffer)
  out[0] = 1
  view.setUint32(1, shotIndex)
  view.setUint32(5, chunkIndex)
  view.setUint32(9, totalChunks)
  out.set(data, 13)
  return out
}

export function decodeChunk(buffer: Uint8Array): {
  shotIndex: number
  chunkIndex: number
  totalChunks: number
  data: Uint8Array
} | null {
  if (buffer.byteLength < 13 || buffer[0] !== 1) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return {
    shotIndex: view.getUint32(1),
    chunkIndex: view.getUint32(5),
    totalChunks: view.getUint32(9),
    data: buffer.slice(13),
  }
}
