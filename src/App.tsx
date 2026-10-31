import { GoogleOAuthProvider } from '@react-oauth/google'
import ListLatestEmails from './components/ListLatestEmails'
import './App.css'

function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  if (!clientId) {
    return (
      <main className="app-shell">
        <section className="setup-card" aria-labelledby="setup-title">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <p className="eyebrow">MAILBOX</p>
          <h1 id="setup-title">Connect your Google account</h1>
          <p>
            Add <code>VITE_GOOGLE_CLIENT_ID</code> to your local environment to
            sign in and read your latest inbox messages.
          </p>
        </section>
      </main>
    )
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <main className="app-shell">
        <ListLatestEmails />
      </main>
    </GoogleOAuthProvider>
  )
}

export default App
