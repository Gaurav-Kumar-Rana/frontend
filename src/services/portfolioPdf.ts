import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfTextLine } from './portfolioAnalysis'

function isPasswordException(
  error: unknown,
): error is Error & { code: number } {
  return (
    error instanceof Error &&
    error.name === 'PasswordException' &&
    'code' in error &&
    typeof error.code === 'number'
  )
}

async function extractPdfLines(
  document: PDFDocumentProxy,
): Promise<PdfTextLine[]> {
  const lines: PdfTextLine[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageLines: PdfTextLine[] = []

    for (const item of content.items) {
      if (!('str' in item) || !('transform' in item) || !item.str.trim()) {
        continue
      }

      const y = Math.round(item.transform[5] * 2) / 2
      const existing = pageLines.find((line) => Math.abs(line.y - y) <= 2)
      const run = { text: item.str, x: item.transform[4] }

      if (existing) {
        existing.runs.push(run)
      } else {
        pageLines.push({ pageNumber, y, runs: [run] })
      }
    }

    for (const line of pageLines) {
      line.runs.sort((first, second) => first.x - second.x)
    }
    lines.push(...pageLines.sort((first, second) => second.y - first.y))
  }

  return lines
}

export async function extractPortfolioPdfText(
  file: Blob,
  password: string,
  signal: AbortSignal,
): Promise<PdfTextLine[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  if (signal.aborted) {
    throw new DOMException('PDF extraction was cancelled.', 'AbortError')
  }

  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loadingTask: PDFDocumentLoadingTask = pdfjs.getDocument({
    data,
    password: password || undefined,
  })
  let destroyPromise: Promise<void> | null = null
  const abortLoading = () => {
    destroyPromise = loadingTask.destroy()
  }
  if (signal.aborted) {
    abortLoading()
  } else {
    signal.addEventListener('abort', abortLoading, { once: true })
  }

  try {
    const document = await loadingTask.promise
    return await extractPdfLines(document)
  } catch (error) {
    if (signal.aborted) {
      throw new DOMException('PDF extraction was cancelled.', 'AbortError')
    }
    if (isPasswordException(error)) {
      const { PasswordResponses } = await import('pdfjs-dist')
      throw new Error(
        error.code === PasswordResponses.NEED_PASSWORD
          ? 'This PDF requires a password. Set VITE_STRATEGY_PDF_PASSWORD in .env.local.'
          : 'The configured PDF password was rejected. Check VITE_STRATEGY_PDF_PASSWORD in .env.local.',
      )
    }
    throw error
  } finally {
    signal.removeEventListener('abort', abortLoading)
    await (destroyPromise ?? loadingTask.destroy())
  }
}
