# JevTrade

A decision-support tool for Indian equities (NSE/BSE). You enter what you know about a
stock — technicals, fundamentals, market context, risk/events — and Jev turns it into a
typed Buy/Hold/Sell call with a probability, a trade plan, and an audit of your inputs.

JevTrade is Jev-API-only: all 20 questions go to the TypeSafe Jev API
(`POST /v1/systemone`) in one request, evaluated in parallel. The API key stays
server-side; the browser never sees it. There is no local/offline fallback — if
`TYPESAFE_API_KEY` isn't configured or the API call fails, analysis is blocked and
the UI shows a clear error instead of a guessed result.

## Project structure

```
.
├── server.js              Zero-dependency Node http server: serves public/, proxies /api/jev
├── package.json           npm scripts (start/dev), Node engine requirement
├── .env.example           Copy to .env and fill in TYPESAFE_API_KEY
└── public/
    ├── index.html          Markup only
    ├── css/styles.css      All styling (design tokens, layout, components)
    └── js/
        ├── model.js        Pure scoring engine (no DOM) — composes Jev's 20 typed
        │                   answers into dimension scores, a trade plan and an audit
        └── app.js          UI wiring: rendering, form handling, TypeSafe API calls, Ask Jev
```

No build step, no bundler, no frontend framework — plain HTML/CSS/JS served directly.
`server.js` uses only Node's built-in `http`/`fs`/`fetch`, so there are no npm packages
to install for the server either.

## Run it

Requires Node 18 or newer.

```
npm install       # no-op today (zero dependencies), but keeps npm scripts working
cp .env.example .env
# paste your TypeSafe API key into .env
npm start         # or: npm run dev   (auto-restarts on file changes)
# open http://localhost:3000
```

Without a `.env`/API key, the page still loads, but "Analyze with Jev" is blocked
and shows an error until `TYPESAFE_API_KEY` is set and the server is restarted.

## Why a server

The API key must never reach the browser: anyone can view a page's source, so a key
embedded in HTML is effectively public. `server.js` keeps the key in an environment
variable, proxies only `{ state, questions }` to TypeSafe, rate-limits per IP, caps
request body size, and retries `429`/`529` responses with backoff.

## Deploy

Any Node host works (Render, Railway, Fly.io, a VPS). Set `TYPESAFE_API_KEY` as a secret
environment variable in the host's dashboard rather than uploading `.env`.

## Limits to know

- Jev's probabilities are not validated on Indian market outcomes — treat them as a way
  to compare setups, not as true odds.
- Jev doesn't see options open interest, delivery percentage, block deals, or intraday
  tape.
- In the Indian cash market, delivery-based shorting isn't allowed — a Sell call means
  exit or avoid, not a short position.
- Not SEBI-registered investment advice.
