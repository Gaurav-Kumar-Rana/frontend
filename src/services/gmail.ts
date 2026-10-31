const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface GmailApiError {
  error?: {
    message?: string
  }
}

export class GmailRequestError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'GmailRequestError'
    this.status = status
  }
}

export async function gmailRequest<T>(
  path: string,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (!response.ok) {
    let message = `Gmail API request failed with status ${response.status}.`
    try {
      const body = (await response.json()) as GmailApiError
      message = body.error?.message || message
    } catch {
      // Keep the HTTP status message when the API response is not JSON.
    }
    throw new GmailRequestError(message, response.status)
  }

  return (await response.json()) as T
}
