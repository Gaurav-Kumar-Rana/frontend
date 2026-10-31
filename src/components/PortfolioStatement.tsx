import { useEffect, useState } from 'react'
import { gmailRequest } from '../services/gmail'

const MAX_PDF_SIZE = 25 * 1024 * 1024

interface GmailMessageList {
  messages?: Array<{ id: string }>
}

interface GmailMessagePart {
  mimeType?: string
  filename?: string
  body?: {
    attachmentId?: string
    data?: string
    size?: number
  }
  parts?: GmailMessagePart[]
}

interface GmailMessage {
  id: string
  snippet: string
  internalDate: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
  } & GmailMessagePart
}

interface GmailAttachment {
  data?: string
  size?: number
}

interface StatementEmail {
  sender: string
  receivedAt: Date
  snippet: string
}

interface PortfolioStatementProps {
  accessToken: string
  subject: string
}

function getHeader(message: GmailMessage, name: string): string {
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ''
  )
}

function normalizeSubject(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function findPdfPart(parts: GmailMessagePart[] = []): GmailMessagePart | undefined {
  for (const part of parts) {
    if (
      part.mimeType?.toLowerCase() === 'application/pdf' ||
      part.filename?.toLowerCase().endsWith('.pdf')
    ) {
      return part
    }

    const nestedPart = findPdfPart(part.parts)
    if (nestedPart) {
      return nestedPart
    }
  }
}

function decodePdf(data: string): Blob {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(paddedBase64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

  if (bytes.byteLength > MAX_PDF_SIZE) {
    throw new Error('The attached PDF is larger than the 25 MB viewer limit.')
  }

  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('The matching email attachment is not a valid PDF file.')
  }

  return new Blob([bytes], { type: 'application/pdf' })
}

async function loadStatement(
  token: string,
  subject: string,
  signal: AbortSignal,
): Promise<{ email: StatementEmail; pdf: Blob; filename: string }> {
  const query = new URLSearchParams({
    maxResults: '20',
    q: `subject:"${subject.replace(/["\\]/g, '\\$&')}"`,
  })
  const list = await gmailRequest<GmailMessageList>(
    `/messages?${query.toString()}`,
    token,
    signal,
  )

  if (!list.messages?.length) {
    throw new Error(`No email was found with the subject “${subject}”.`)
  }

  const candidates = await Promise.all(
    list.messages.map(({ id }) =>
      gmailRequest<GmailMessage>(
        `/messages/${encodeURIComponent(id)}?format=full`,
        token,
        signal,
      ),
    ),
  )
  const normalizedSubject = normalizeSubject(subject)
  const message = candidates
    .filter((candidate) =>
      normalizeSubject(getHeader(candidate, 'Subject')).includes(
        normalizedSubject,
      ),
    )
    .sort(
      (first, second) =>
        Number(second.internalDate) - Number(first.internalDate),
    )[0]

  if (!message) {
    throw new Error(
      `Gmail returned messages for this search, but none had a subject containing “${subject}”. Check the subject in .env.local.`,
    )
  }

  const part = findPdfPart(message.payload ? [message.payload] : [])
  const body = part?.body

  if (!part || !body) {
    throw new Error('The matching email does not contain a PDF attachment.')
  }

  if (body.size && body.size > MAX_PDF_SIZE) {
    throw new Error('The attached PDF is larger than the 25 MB viewer limit.')
  }

  const attachment = body.attachmentId
    ? await gmailRequest<GmailAttachment>(
        `/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(body.attachmentId)}`,
        token,
        signal,
      )
    : undefined
  if (attachment?.size && attachment.size > MAX_PDF_SIZE) {
    throw new Error('The attached PDF is larger than the 25 MB viewer limit.')
  }

  const data = body.data ?? attachment?.data

  if (!data) {
    throw new Error('Gmail did not return data for the PDF attachment.')
  }

  const timestamp = Number(message.internalDate)
  const receivedAt = new Date(timestamp)
  if (!Number.isFinite(timestamp) || Number.isNaN(receivedAt.getTime())) {
    throw new Error('Gmail returned an invalid date for the matching email.')
  }

  return {
    email: {
      sender: getHeader(message, 'From') || 'Unknown sender',
      receivedAt,
      snippet: message.snippet,
    },
    pdf: decodePdf(data),
    filename: part.filename?.trim() || 'portfolio-statement.pdf',
  }
}

function PortfolioStatement({ accessToken, subject }: PortfolioStatementProps) {
  const [email, setEmail] = useState<StatementEmail | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [filename, setFilename] = useState('portfolio-statement.pdf')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null

    async function fetchStatement() {
      setLoading(true)
      setError(null)
      setEmail(null)
      setPdfUrl(null)

      try {
        const statement = await loadStatement(
          accessToken,
          subject.trim(),
          controller.signal,
        )
        objectUrl = URL.createObjectURL(statement.pdf)
        setEmail(statement.email)
        setFilename(statement.filename)
        setPdfUrl(objectUrl)
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load the portfolio statement.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchStatement()

    return () => {
      controller.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [accessToken, subject])

  return (
    <section className="statement-panel" aria-labelledby="statement-title">
      <div className="statement-heading">
        <div>
          <p className="eyebrow">PORTFOLIO</p>
          <h2 id="statement-title">Portfolio statement</h2>
        </div>
        {pdfUrl && (
          <a className="action-button" href={pdfUrl} download={filename}>
            Download PDF
          </a>
        )}
      </div>

      {loading && (
        <div className="statement-state" role="status">
          Finding the matching email and PDF…
        </div>
      )}

      {error && (
        <div className="statement-state statement-error" role="alert">
          <strong>Could not load the portfolio statement</strong>
          <span>{error}</span>
        </div>
      )}

      {email && pdfUrl && (
        <>
          <div className="statement-email-meta">
            <span>{email.sender}</span>
            <time dateTime={email.receivedAt.toISOString()}>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(email.receivedAt)}
            </time>
          </div>
          {email.snippet && <p className="statement-snippet">{email.snippet}</p>}
          <iframe
            className="statement-pdf"
            src={pdfUrl}
            title={`PDF attachment from ${subject}`}
          />
        </>
      )}
    </section>
  )
}

export default PortfolioStatement
