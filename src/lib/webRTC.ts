import { decodeChunk, encodeChunk, joinBytes, splitBytes } from '@shared/chunks.ts'
import type { ParticipantSlot, SignalRecord } from '@shared/types.ts'

interface PhotoStart {
  kind: 'start'
  shotIndex: number
  fromSlot: ParticipantSlot
  byteLength: number
}

interface IncomingPhoto {
  byteLength: number
  fromSlot: ParticipantSlot
  parts: Uint8Array[]
}

interface BoothPeerOptions {
  slot: ParticipantSlot
  iceServers: RTCIceServer[]
  sendSignal: (signal: SignalRecord) => Promise<void>
  onPhoto: (shotIndex: number, fromSlot: ParticipantSlot, blob: Blob) => void
  onOpen?: () => void
  onClose?: () => void
}

export class BoothPeer {
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private offering = false
  private generation = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
  private appliedGeneration = -1
  private pendingIce: RTCIceCandidateInit[] = []
  private outgoing: Array<{ shotIndex: number; blob: Blob }> = []
  private pumping = false
  private incoming = new Map<number, IncomingPhoto>()
  private readonly options: BoothPeerOptions

  constructor(options: BoothPeerOptions) {
    this.options = options
  }

  async startOffer(): Promise<void> {
    if (this.options.slot !== 'host' || this.offering || this.pc?.connectionState === 'connected') return
    this.offering = true
    try {
      this.ensurePeer()
      if (!this.channel) {
        this.channel = this.pc!.createDataChannel('photos')
        this.bindChannel(this.channel)
      }
      const offer = await this.pc!.createOffer()
      await this.pc!.setLocalDescription(offer)
      await this.emit('offer', JSON.stringify({ sdp: offer.sdp, generation: this.generation }))
    } catch {
      this.offering = false
      this.options.onClose?.()
    }
  }

  async acceptSignals(signals: SignalRecord[]): Promise<void> {
    for (const signal of signals) {
      let payload: { sdp?: string; candidate?: RTCIceCandidateInit; generation?: number } = {}
      try {
        payload = JSON.parse(signal.payload) as typeof payload
      } catch {
        continue
      }
      if (signal.kind === 'offer' && this.options.slot === 'guest' && payload.sdp) {
        if (payload.generation === this.appliedGeneration && this.pc?.remoteDescription) continue
        this.appliedGeneration = payload.generation ?? 0
        this.resetPeer()
        this.ensurePeer()
        await this.pc!.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
        const answer = await this.pc!.createAnswer()
        await this.pc!.setLocalDescription(answer)
        await this.emit('answer', JSON.stringify({ sdp: answer.sdp, generation: this.appliedGeneration }))
        await this.flushIce()
      } else if (
        signal.kind === 'answer' &&
        this.options.slot === 'host' &&
        payload.sdp &&
        payload.generation === this.generation &&
        this.pc &&
        !this.pc.currentRemoteDescription
      ) {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
        await this.flushIce()
      } else if (signal.kind === 'ice' && payload.candidate && (payload.generation == null || payload.generation === this.generation || payload.generation === this.appliedGeneration)) {
        this.pendingIce.push(payload.candidate)
        await this.flushIce()
      }
    }
  }

  sendPhoto(shotIndex: number, blob: Blob): void {
    this.outgoing = this.outgoing.filter((item) => item.shotIndex !== shotIndex)
    this.outgoing.push({ shotIndex, blob })
    void this.flushQueue()
  }

  restart(): void {
    this.generation += 1
    this.offering = false
    this.resetPeer()
    if (this.options.slot === 'host') void this.startOffer()
  }

  close(): void {
    this.outgoing = []
    this.incoming.clear()
    this.resetPeer()
  }

  private ensurePeer(): void {
    if (this.pc) return
    this.pc = new RTCPeerConnection({ iceServers: this.options.iceServers })
    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return
      void this.emit('ice', JSON.stringify({ candidate: event.candidate.toJSON(), generation: this.activeGeneration() }))
    }
    this.pc.ondatachannel = (event) => this.bindChannel(event.channel)
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      if (state === 'failed' || state === 'disconnected' || state === 'closed') this.options.onClose?.()
    }
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => {
      this.options.onOpen?.()
      void this.flushQueue()
    }
    channel.onclose = () => this.options.onClose?.()
    channel.onmessage = (event) => this.onMessage(event)
  }

  private onMessage(event: MessageEvent<string | ArrayBuffer>): void {
    if (typeof event.data === 'string') {
      const message = JSON.parse(event.data) as PhotoStart | { kind: 'end'; shotIndex: number }
      if (message.kind === 'start') {
        this.incoming.set(message.shotIndex, { byteLength: message.byteLength, fromSlot: message.fromSlot, parts: [] })
      } else if (message.kind === 'end') {
        const item = this.incoming.get(message.shotIndex)
        if (!item) return
        const bytes = joinBytes(item.parts, item.byteLength)
        this.incoming.delete(message.shotIndex)
        if (!bytes) {
          this.channel?.send(JSON.stringify({ kind: 'nack', shotIndex: message.shotIndex }))
          return
        }
        this.options.onPhoto(message.shotIndex, item.fromSlot, new Blob([toArrayBuffer(bytes)], { type: 'image/jpeg' }))
        this.channel?.send(JSON.stringify({ kind: 'ack', shotIndex: message.shotIndex }))
      }
      return
    }
    const chunk = decodeChunk(new Uint8Array(event.data))
    if (!chunk) return
    const item = this.incoming.get(chunk.shotIndex)
    if (!item) return
    item.parts[chunk.chunkIndex] = chunk.data
  }

  private async flushQueue(): Promise<void> {
    if (this.pumping || !this.channel || this.channel.readyState !== 'open') return
    this.pumping = true
    try {
      while (this.outgoing.length > 0 && this.channel.readyState === 'open') {
        const item = this.outgoing.shift()
        if (!item) break
        const bytes = new Uint8Array(await item.blob.arrayBuffer())
        const parts = splitBytes(bytes)
        this.channel.send(JSON.stringify({ kind: 'start', shotIndex: item.shotIndex, fromSlot: this.options.slot, byteLength: bytes.length }))
        for (let index = 0; index < parts.length; index += 1) {
          const part = parts[index]
          if (!part) continue
          this.channel.send(toArrayBuffer(encodeChunk(item.shotIndex, index, parts.length, part)))
        }
        this.channel.send(JSON.stringify({ kind: 'end', shotIndex: item.shotIndex }))
      }
    } finally {
      this.pumping = false
    }
  }

  private async flushIce(): Promise<void> {
    if (!this.pc?.remoteDescription) return
    const queued = this.pendingIce.splice(0)
    for (const candidate of queued) {
      await this.pc.addIceCandidate(candidate).catch(() => undefined)
    }
  }

  private async emit(kind: SignalRecord['kind'], payload: string): Promise<void> {
    const toSlot: ParticipantSlot = this.options.slot === 'host' ? 'guest' : 'host'
    await this.options.sendSignal({
      id: crypto.randomUUID(),
      fromSlot: this.options.slot,
      toSlot,
      kind,
      payload,
      createdAt: Date.now(),
    })
  }

  private activeGeneration(): number {
    return this.options.slot === 'host' ? this.generation : Math.max(this.appliedGeneration, 0)
  }

  private resetPeer(): void {
    this.channel?.close()
    this.pc?.close()
    this.channel = null
    this.pc = null
    this.pendingIce = []
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}
