# Mailbox

A small React + TypeScript app that shows the 10 most recent messages in a
connected Gmail inbox. It requests Google's read-only Gmail scope and keeps the
OAuth access token in session storage so a page reload in the same tab does not
require signing in again. The token is removed when it expires, the user signs
out, or the tab session ends.

## Run locally

1. Create a Google OAuth 2.0 Web application client ID in the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Enable the Gmail API for that Google Cloud project and configure the OAuth
   consent screen.
3. Add `http://localhost:3000` as an authorized JavaScript origin for the OAuth
   client.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` to your
   client ID. Set `VITE_STRATEGY_SUBJECT` to the exact subject of the
   statement email you want to display.
5. Start the app:

   ```sh
   npm install
   npm run dev
   ```

Vite runs on port 3000 and will report an error if that port is already in use.
After changing `.env.local`, restart Vite for the changes to take effect.

## Available scripts

- `npm run dev` — start the development server
- `npm run build` — type-check and create a production build
- `npm run lint` — run Oxlint
- `npm run preview` — preview the production build
