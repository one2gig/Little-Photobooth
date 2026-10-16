import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { Command } from '../supabase/functions/_shared/types.ts'
import { createBoothRelay } from './boothRelay.ts'

export function boothDevPlugin(): Plugin {
  const relay = createBoothRelay()
  return {
    name: 'little-booth-dev-relay',
    configureServer(server) {
      server.middlewares.use('/api/booth', (request, response, next) => {
        const url = request.url ?? ''
        if (request.method === 'GET' && (url.startsWith('/events') || url.startsWith('/api/booth/events'))) {
          streamEvents(request, response, relay)
          return
        }
        if (request.method === 'POST' && (url === '/' || url === '' || url.startsWith('/?') || url === '/api/booth' || url.startsWith('/api/booth?'))) {
          void handleCommand(request, response, relay)
          return
        }
        next()
      })
    },
  }
}

function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  relay: ReturnType<typeof createBoothRelay>,
) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  const unsubscribe = relay.subscribe((event) => {
    response.write(`data: ${JSON.stringify(event)}\n\n`)
  })
  request.on('close', unsubscribe)
}

async function handleCommand(
  request: IncomingMessage,
  response: ServerResponse,
  relay: ReturnType<typeof createBoothRelay>,
) {
  try {
    const body = JSON.parse(await readBody(request)) as { command?: Command }
    if (!body.command || typeof body.command.type !== 'string') throw new Error('invalid')
    const result = relay.handle(body.command)
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(result))
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: false, error: 'invalid', snapshot: null, serverNow: Date.now() }))
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}
