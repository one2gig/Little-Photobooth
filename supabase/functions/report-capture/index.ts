import { handleRequest } from '../_shared/server.ts'

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void }

Deno.serve((request) => handleRequest(request, 'report-capture'))
