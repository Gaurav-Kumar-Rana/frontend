import { useCallback, useEffect, useRef, useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import PortfolioStatement from './PortfolioStatement'
import { GmailRequestError, gmailRequest } from '../services/gmail'

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const SESSION_STORAGE_KEY = 'mailbox.google.session'
const PORTFOLIO_EMAIL_SUBJECT =
  import.meta.env.VITE_STRATEGY_SUBJECT?.trim()
const AVATAR_COLORS = [
  ['#eee9ff', '#6649b7'],
  ['#e7f5ef', '#357c5b'],
  ['#fff0e8', '#ad6540'],
  ['#e8f1ff', '#4268a4'],
  ['#fff1f4', '#a34d68'],
]

interface GmailMessageList {
  messages?: Array<{ id: string; threadId: string }>
  resultSizeEstimate: number
}

interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  internalDate: string
  labelIds?: string[]
  payload?: {
    headers?: Array<{ name: string; value: string }>
  }
}

interface Email {
  id: string
  sender: string
  subject: string
  snippet: string
  date: Date
  unread: boolean
}

interface GoogleSession {
  accessToken: string
  expiresAt: number
  scope: string
}

function getSavedAccessToken(): string | null {
  const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!savedSession) {
    return null
  }

  let session: unknown
  try {
    session = JSON.parse(savedSession)
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }

  if (
    typeof session === 'object' &&
    session !== null &&
    'accessToken' in session &&
    typeof session.accessToken === 'string' &&
    'expiresAt' in session &&
    typeof session.expiresAt === 'number' &&
    session.expiresAt > Date.now() &&
    'scope' in session &&
    typeof session.scope === 'string' &&
    session.scope.split(' ').includes(GMAIL_READONLY_SCOPE)
  ) {
    return session.accessToken
  }

  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  return null
}

function getHeader(message: GmailMessage, name: string): string {
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ''
  )
}

function getSender(from: string): string {
  const match = from.match(/^(.+?)\s*<[^>]+>$/)
  return (match?.[1] ?? from).replace(/^["']|["']$/g, '').trim() || 'Unknown sender'
}

function getInitials(sender: string): string {
  const words = sender.split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function formatEmailDate(date: Date): string {
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function toEmail(message: GmailMessage): Email {
  const timestamp = Number(message.internalDate)
  const date = new Date(timestamp)

  if (!Number.isFinite(timestamp) || Number.isNaN(date.getTime())) {
    throw new Error('Gmail returned a message with an invalid date.')
  }

  return {
    id: message.id,
    sender: getSender(getHeader(message, 'From')),
    subject: getHeader(message, 'Subject') || '(no subject)',
    snippet: message.snippet,
    date,
    unread: message.labelIds?.includes('UNREAD') ?? false,
  }
}

function ListLatestEmails() {
  const [emails, setEmails] = useState<Email[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(
    getSavedAccessToken,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedToken = useRef<string | null>(null)

  const loadEmails = useCallback(async (token: string) => {
    setLoading(true)
    setError(null)

    try {
      const query = new URLSearchParams({
        maxResults: '10',
        q: 'in:inbox',
      })
      const list = await gmailRequest<GmailMessageList>(
        `/messages?${query.toString()}`,
        token,
      )
      const messages = await Promise.all(
        (list.messages ?? []).map(({ id }) => {
          const fields = new URLSearchParams({
            format: 'metadata',
            metadataHeaders: 'From',
          })
          fields.append('metadataHeaders', 'Subject')
          return gmailRequest<GmailMessage>(
            `/messages/${encodeURIComponent(id)}?${fields.toString()}`,
            token,
          )
        }),
      )
      const latestEmails = messages.map(toEmail).sort(
        (first, second) => second.date.getTime() - first.date.getTime(),
      )

      setEmails(latestEmails)
    } catch (requestError) {
      if (
        requestError instanceof GmailRequestError &&
        requestError.status === 401
      ) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
        loadedToken.current = null
        setAccessToken(null)
        setEmails([])
        setError('Your Google session expired. Sign in again to continue.')
        return
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load Gmail messages. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (accessToken && loadedToken.current !== accessToken) {
      loadedToken.current = accessToken
      void loadEmails(accessToken)
    }
  }, [accessToken, loadEmails])

  const login = useGoogleLogin({
    scope: GMAIL_READONLY_SCOPE,
    include_granted_scopes: false,
    onSuccess: ({ access_token: token, expires_in: expiresIn, scope }) => {
      if (!scope.split(' ').includes(GMAIL_READONLY_SCOPE)) {
        setAccessToken(null)
        setError(
          'Google did not grant Gmail read-only access. Please sign in again and approve the Gmail permission.',
        )
        return
      }

      const session: GoogleSession = {
        accessToken: token,
        expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
        scope,
      }
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      loadedToken.current = null
      setAccessToken(token)
    },
    onError: ({ error_description, error: oauthError }) => {
      setError(error_description || oauthError || 'Google sign-in failed.')
    },
    onNonOAuthError: ({ type }) => {
      setError(`Google sign-in could not complete (${type}). Please try again.`)
    },
  })

  function signOut() {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    loadedToken.current = null
    setAccessToken(null)
    setEmails([])
    setError(null)
  }

  function connectGmail() {
    setError(null)
    login()
  }

  return (
    <div className="mail-app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>Mailbox</span>
        </div>
        {accessToken ? (
          <div className="connection-status">
            <span className="status-dot" aria-hidden="true" />
            Gmail connected
          </div>
        ) : (
          <span className="connection-status">Your inbox, at a glance</span>
        )}
      </header>

      <section aria-labelledby="inbox-title">
        <div className="inbox-heading">
          <div>
            <p className="eyebrow">YOUR MAIL</p>
            <h1 id="inbox-title">Latest emails</h1>
            <p>A quiet place to catch up on what matters.</p>
          </div>
          <div className="heading-actions">
            {accessToken && (
              <>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => void loadEmails(accessToken)}
                  disabled={loading}
                >
                  <span aria-hidden="true">↻</span>
                  Refresh
                </button>
                <button className="action-button" type="button" onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>

        {accessToken && PORTFOLIO_EMAIL_SUBJECT && (
          <PortfolioStatement
            accessToken={accessToken}
            subject={PORTFOLIO_EMAIL_SUBJECT}
          />
        )}

        {accessToken && !PORTFOLIO_EMAIL_SUBJECT && (
          <div className="statement-panel statement-state statement-error">
            Set <code>VITE_STRATEGY_SUBJECT</code> in <code>.env.local</code>{' '}
            to show the portfolio statement.
          </div>
        )}

        <div className="email-panel" aria-live="polite">
          <div className="panel-heading">
            <h2>Inbox</h2>
            <span className="inbox-count">
              {accessToken && !loading && !error
                ? `${emails.length} latest ${emails.length === 1 ? 'message' : 'messages'}`
                : 'Most recent messages'}
            </span>
          </div>

          {!accessToken && !error && (
            <div className="message-state">
              <div>
                <strong>See what’s new in your inbox</strong>
                <p>
                  Connect Gmail to securely view your 10 most recent inbox
                  messages. Access is read-only.
                </p>
                <button
                  className="action-button action-button-primary"
                  type="button"
                  onClick={connectGmail}
                  style={{ marginTop: 18 }}
                >
                  Continue with Google
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="message-state" role="status">
              <p>Loading your latest emails…</p>
            </div>
          )}

          {error && (
            <div className="message-state message-state-error" role="alert">
              <div>
                <strong>We couldn’t load your inbox</strong>
                <p>{error}</p>
                {accessToken && (
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => void loadEmails(accessToken)}
                    disabled={loading}
                    style={{ marginTop: 16 }}
                  >
                    Try again
                  </button>
                )}
                {!accessToken && (
                  <button
                    className="action-button action-button-primary"
                    type="button"
                    onClick={connectGmail}
                    style={{ marginTop: 16 }}
                  >
                    Try Google sign-in again
                  </button>
                )}
              </div>
            </div>
          )}

          {accessToken && !loading && !error && emails.length === 0 && (
            <div className="message-state">
              <p>
                <strong>Your inbox is clear</strong>
                No messages were found in your Gmail inbox.
              </p>
            </div>
          )}

          {accessToken && !loading && !error && emails.length > 0 && (
            <ul className="email-list">
              {emails.map((email, index) => {
                const [avatarBackground, avatarColor] =
                  AVATAR_COLORS[index % AVATAR_COLORS.length]

                return (
                  <li
                    className={`email-row${email.unread ? ' email-row-unread' : ''}`}
                    key={email.id}
                  >
                    <a
                      className="email-link"
                      href={`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(email.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${email.sender}: ${email.subject}, ${formatEmailDate(email.date)}`}
                    >
                      <span
                        className="sender-avatar"
                        style={
                          {
                            '--avatar-bg': avatarBackground,
                            '--avatar-color': avatarColor,
                          } as React.CSSProperties
                        }
                        aria-hidden="true"
                      >
                        {getInitials(email.sender)}
                      </span>
                      <div className="email-copy">
                        <div className="email-meta">
                          <span className="email-sender">{email.sender}</span>
                        </div>
                        <p className="email-subject">{email.subject}</p>
                        <p className="email-snippet">{email.snippet}</p>
                      </div>
                      <time className="email-date" dateTime={email.date.toISOString()}>
                        {formatEmailDate(email.date)}
                      </time>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

export default ListLatestEmails
