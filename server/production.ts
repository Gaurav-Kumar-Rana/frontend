import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  handlePortfolioInsightsRequest,
  isAllowedOllamaConfig,
  type OllamaConfig,
} from './portfolioInsights.js'

const port = Number(process.env.PORT ?? 8080)
const staticDirectory = resolve(
  fileURLToPath(new URL('../../dist', import.meta.url)),
)
const ollamaConfig: OllamaConfig = {
  host: process.env.OLLAMA_HOST ?? 'https://ollama.com',
  model: process.env.OLLAMA_MODEL ?? 'beam',
  apiKey: process.env.OLLAMA_API_KEY,
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.')
}
if (!ollamaConfig.apiKey || !isAllowedOllamaConfig(ollamaConfig)) {
  throw new Error(
    'Configure OLLAMA_API_KEY and set OLLAMA_HOST to https://ollama.com before starting the production server.',
  )
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/healthz' && request.method === 'GET') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    })
    response.end('{"status":"ok"}')
    return
  }

  if (url.pathname === '/api/portfolio-insights') {
    void handlePortfolioInsightsRequest(request, response, ollamaConfig).catch(
      (error: unknown) => {
        console.error('Portfolio insights request failed:', error)
        if (!response.headersSent) {
          response.writeHead(500, {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
          })
        }
        if (!response.writableEnded) {
          response.end('{"error":"Portfolio analysis failed unexpectedly."}')
        }
      },
    )
    return
  }

  if (url.pathname.startsWith('/api/')) {
    response.writeHead(404, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    })
    response.end('{"error":"Not found."}')
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    response.end()
    return
  }

  void serveStaticFile(request, response, url.pathname).catch(
    (error: unknown) => {
      console.error('Static file request failed:', error)
      if (!response.headersSent) {
        response.writeHead(500)
      }
      if (!response.writableEnded) {
        response.end('Internal server error.')
      }
    },
  )
})

async function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    response.writeHead(400)
    response.end('Invalid URL path.')
    return
  }

  const requestedPath = resolve(staticDirectory, `.${decodedPath}`)
  if (
    requestedPath !== staticDirectory &&
    !requestedPath.startsWith(`${staticDirectory}${sep}`)
  ) {
    response.writeHead(404)
    response.end('Not found.')
    return
  }

  let filePath = requestedPath
  try {
    if ((await stat(filePath)).isDirectory()) {
      filePath = resolve(filePath, 'index.html')
    }
    await stat(filePath)
  } catch {
    if (extname(decodedPath)) {
      response.writeHead(404)
      response.end('Not found.')
      return
    }
    filePath = resolve(staticDirectory, 'index.html')
  }

  let content: Buffer
  try {
    content = await readFile(filePath)
  } catch {
    response.writeHead(404)
    response.end('Not found.')
    return
  }

  const isAsset = filePath.startsWith(`${staticDirectory}${sep}assets${sep}`)
  response.writeHead(200, {
    'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': content.length,
    'Content-Type':
      contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : content)
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Portfolio app listening on port ${port}.`)
})
