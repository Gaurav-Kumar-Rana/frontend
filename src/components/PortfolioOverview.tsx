import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import PortfolioStatement from './PortfolioStatement'

const MAX_PDF_SIZE = 25 * 1024 * 1024

interface UploadedStatement {
  file: File
  url: string
  id: number
}

function PortfolioOverview() {
  const [statement, setStatement] = useState<UploadedStatement | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const statementUrlRef = useRef<string | null>(null)
  const statementIdRef = useRef(0)

  useEffect(
    () => () => {
      if (statementUrlRef.current) {
        URL.revokeObjectURL(statementUrlRef.current)
      }
    },
    [],
  )

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) {
      return
    }

    setUploadError(null)
    if (
      file.type !== 'application/pdf' &&
      !file.name.toLocaleLowerCase().endsWith('.pdf')
    ) {
      setUploadError('Choose a PDF file to create the portfolio overview.')
      return
    }

    if (file.size > MAX_PDF_SIZE) {
      setUploadError('The PDF must be 25 MB or smaller.')
      return
    }

    try {
      const signature = await file.slice(0, 5).text()
      if (signature !== '%PDF-') {
        setUploadError('This file does not appear to be a valid PDF.')
        return
      }
      if (statementUrlRef.current) {
        URL.revokeObjectURL(statementUrlRef.current)
      }
      const url = URL.createObjectURL(file)
      statementUrlRef.current = url
      statementIdRef.current += 1
      setStatement({ file, url, id: statementIdRef.current })
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? `Could not read the selected file: ${error.message}`
          : 'Could not read the selected file.',
      )
    }
  }

  return (
    <div className="portfolio-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>Portfolio</span>
        </div>
        <span className="portfolio-note">Your portfolio, at a glance</span>
      </header>

      <section aria-labelledby="portfolio-title">
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR INVESTMENTS</p>
            <h1 id="portfolio-title">Portfolio overview</h1>
            <p>Upload a CAMS statement PDF to see your mutual fund highlights.</p>
          </div>
        </div>

        <section className="upload-panel" aria-labelledby="upload-title">
          <div>
            <h2 id="upload-title">Portfolio statement PDF</h2>
            <p>
              Your statement is analyzed in this browser and is not uploaded to
              a server.
            </p>
          </div>
          <input
            ref={inputRef}
            className="upload-input"
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose a portfolio statement PDF"
            onChange={(event) => void handleFileChange(event)}
          />
          <button
            className="action-button action-button-primary"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            {statement ? 'Choose another PDF' : 'Choose PDF'}
          </button>
          {statement && (
            <p className="upload-filename" aria-live="polite">
              Selected: {statement.file.name}
            </p>
          )}
          {uploadError && (
            <p className="upload-error" role="alert">
              {uploadError}
            </p>
          )}
        </section>

        {statement && (
          <PortfolioStatement
            key={statement.id}
            file={statement.file}
            pdfUrl={statement.url}
          />
        )}
      </section>
    </div>
  )
}

export default PortfolioOverview
