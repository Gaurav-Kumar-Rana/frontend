import { useEffect, useState } from 'react'
import {
  extractPortfolioPdfText,
  PdfPasswordError,
} from '../services/portfolioPdf'
import type { PdfTextLine } from '../services/portfolioAnalysis'
import PortfolioDetails from './PortfolioDetails'

interface PortfolioStatementProps {
  file: File
  pdfUrl: string
}

function PortfolioStatement({ file, pdfUrl }: PortfolioStatementProps) {
  const [pdfLines, setPdfLines] = useState<PdfTextLine[] | null>(null)
  const [pdfTextError, setPdfTextError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [submittedPassword, setSubmittedPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordAttempt, setPasswordAttempt] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function extractStatement() {
      try {
        const extractedLines = await extractPortfolioPdfText(
          file,
          submittedPassword,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          setPdfLines(extractedLines)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error instanceof PdfPasswordError) {
            setPasswordMessage(error.message)
          } else {
            setPdfTextError(
              error instanceof Error
                ? error.message
                : 'Unable to extract text from the PDF.',
            )
          }
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
  }, [file, submittedPassword, passwordAttempt])

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

      {!loading && passwordMessage && (
        <form
          className="statement-password"
          onSubmit={(event) => {
            event.preventDefault()
            setLoading(true)
            setPdfTextError(null)
            setPasswordMessage(null)
            setSubmittedPassword(password)
            setPasswordAttempt((attempt) => attempt + 1)
          }}
        >
          <label htmlFor="statement-password">PDF password</label>
          <p role="alert">{passwordMessage}</p>
          <div className="statement-password-controls">
            <input
              id="statement-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
            />
            <button
              className="action-button action-button-primary"
              type="submit"
            >
              Unlock PDF
            </button>
          </div>
        </form>
      )}

      {!loading && !passwordMessage && (
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
