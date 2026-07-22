# Options Analyst

A quantitative options-portfolio analyst: enter your cash, equity, and options positions, and
the app pulls delayed market data, computes your portfolio Greeks deterministically, and asks
Claude — prompted as a risk-first quant PM — for defined-risk trade recommendations in strict
JSON.

## How it works

```
Portfolio (browser, localStorage)
        │  POST /api/analyze
        ▼
┌─ Server ─────────────────────────────────────────────┐
│ 1. Market data (keyless, delayed — Yahoo Finance)    │
│    quotes · option chains · 3m price history         │
│ 2. Deterministic quant layer (pure, unit-tested)     │
│    Black-Scholes Greeks · IV solver · ATM IV         │
│    realized vol · IV/RV ratio · expected move        │
│    median bid-ask spread (liquidity gauge)           │
│ 3. AI analyst (Claude, structured outputs)           │
│    strict JSON schema → market_read /                │
│    portfolio_health / recommended_actions            │
└──────────────────────────────────────────────────────┘
```

Design rules:

- **The math is deterministic and the model is grounded.** Net Delta/Theta/Vega are computed
  server-side with Black-Scholes at listed-contract IVs; the model is instructed to use those
  numbers, not re-estimate them.
- **No fabricated data.** True IV Rank needs a year of IV history, which a keyless source
  can't provide — the app computes an IV/RV ratio instead and the prompt forbids inventing
  rank/percentile numbers. Missing values are reported as unavailable.
- **Strict output.** The model's response is schema-enforced (`market_read`,
  `portfolio_health`, `recommended_actions[]` with legs, expiration, rationale, max loss/profit).
- **Defined risk only.** The system prompt requires spreads/condors over naked exposure and
  caps per-trade risk relative to portfolio size.

## Setup

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Market data (quotes, chains, vol metrics) works with **no keys at all**. The AI analysis
requires `ANTHROPIC_API_KEY` (server-only; never exposed to the client).

## Commands

- `npm run dev` — dev server
- `npm test` — unit tests for the quant library (Black-Scholes, IV solver, vol metrics)
- `npm run typecheck` — strict TypeScript
- `npm run build` — production build

## API

- `GET /api/market?symbols=SPY,AAPL` — delayed quotes
- `GET /api/chain?symbol=AAPL[&date=YYYY-MM-DD]` — option chain + vol metrics for one expiration
- `POST /api/analyze` — `{ portfolio, watchlist }` → `{ analysis, computed }`

## Troubleshooting

- **All quotes come back null / "Too Many Requests"** — Yahoo aggressively rate-limits
  datacenter and shared IPs (HTTP 429). Run the app from a residential connection or a
  deployment with a clean egress IP; the endpoints degrade gracefully in the meantime.
- **`/api/analyze` returns 503** — `ANTHROPIC_API_KEY` isn't set. Market data and the
  Greeks endpoints still work without it.

## Disclaimer

Educational tool. Quotes are delayed and may be inaccurate; Greeks are model estimates;
AI output is not investment advice. Options involve substantial risk of loss.
