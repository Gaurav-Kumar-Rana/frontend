import { useEffect, useState } from 'react'
import { extractPortfolioPdfText } from '../services/portfolioPdf'
import type { PdfTextLine } from '../services/portfolioAnalysis'
import PortfolioDetails from './PortfolioDetails'

const PDF_PASSWORD = import.meta.env.VITE_STRATEGY_PDF_PASSWORD ?? ''

interface PortfolioStatementProps {
  file: File
  pdfUrl: string
}

function PortfolioStatement({ file, pdfUrl }: PortfolioStatementProps) {
  const [pdfLines, setPdfLines] = useState<PdfTextLine[] | null>(null)
  const [pdfTextError, setPdfTextError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function extractStatement() {
      try {
        const extractedLines = await extractPortfolioPdfText(
          file,
          PDF_PASSWORD,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          setPdfLines(extractedLines)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPdfTextError(
            error instanceof Error
              ? error.message
              : 'Unable to extract text from the PDF.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void extractStatement()

    return () => {
      controller.abort()
    }
  }, [file])

  return (
    <section className="statement-panel" aria-labelledby="statement-title">
      <div className="statement-heading">
        <div>
          <p className="eyebrow">PORTFOLIO</p>
          <h2 id="statement-title">Portfolio statement</h2>
        </div>
      </div>

      {loading && (
        <div className="statement-state" role="status">
          Reading the uploaded statement and building your overview…
        </div>
      )}

      {!loading && (
        <PortfolioDetails pdfLines={pdfLines} error={pdfTextError} />
      )}

      <div className="statement-source">
        <a href={pdfUrl} target="_blank" rel="noreferrer">
          Open source PDF: {file.name}
        </a>
      </div>
    </section>
  )
}

export default PortfolioStatement
