# Portfolio overview

A small React + TypeScript app that reads a CAMS portfolio statement PDF
selected from your device and summarizes mutual fund holdings. The PDF is
processed locally in your browser and is not sent to a server.

## Run locally

1. Copy `.env.example` to `.env.local` if you want to configure Ollama.
2. Start the app:

   ```sh
   npm install
   npm run dev
   ```

Vite runs on port 3000 and will report an error if that port is already in use.
Select **Choose PDF** in the app to upload your statement. If it is
password-protected, enter its password when prompted. Files larger than 25 MB
are not accepted.

## Ollama Cloud setup

Install [Ollama](https://ollama.com/download), open the app, and sign in to
enable cloud models. The default model is `beam:cloud`; cloud models do not
need to be downloaded. You can try it from the terminal with:

```sh
ollama run beam:cloud
```

The app connects to the Ollama service at `http://127.0.0.1:11434` by default.
Override `OLLAMA_HOST` or `OLLAMA_MODEL` in `.env.local` if needed, then restart
Vite. Ollama processes cloud prompts and responses to provide the analysis;
see the [Ollama privacy policy](https://ollama.com/privacy) and
[usage plans](https://ollama.com/pricing).

The **Analyze with Ollama** action is explicit and optional. It sends fund
names and statement-derived invested/current values, returns, holding age, and
portfolio share to the configured Ollama model; it does not send the PDF. With
`beam:cloud`, this information is processed by Ollama Cloud. No live market,
fund, or global news data is provided. Signals are educational, not trade
instructions or personalized financial advice. The 12% annual-return goal is
aspirational and is not guaranteed or forecast; a statement snapshot cannot
establish suitability without risk tolerance, investment goals, and time
horizon. The local development/preview endpoint is intended for local use only.

The PDF password is requested only when needed and is kept in browser memory
for the current page session. It is not stored in `.env.local` or sent to a
server.

The portfolio overview reads scheme name, weighted-average age, invested and
current values, and annualized XIRR from Section 2 (“By Mutual Fund”) of the
CAMS statement. It shows the oldest/newest and highest/lowest-investment
highlights, plus a card for every fund. Each card includes absolute return
(current value minus invested amount, as a percentage of invested amount),
XIRR, and weighted-average age. The overview includes current value, invested
value, appreciation, and absolute return totals; each fund also shows its share
of current portfolio value. Fund cards use green for gains, red for losses, and
white for no change. Select one metric at a time in the column chart to compare
fund unit balance, appreciation, or weighted-average age on a clear individual
scale. A link to the source PDF is also provided.

These are historical statement measures, not buy/sell recommendations. To
assess future investments, compare each fund against an appropriate benchmark
and consider its category, risk, fees, diversification, investment goals, and
time horizon; those details are not provided by this statement overview.

## Available scripts

- `npm run dev` — start the development server
- `npm run build` — type-check and create a production build
- `npm run lint` — run Oxlint
- `npm run preview` — preview the production build
