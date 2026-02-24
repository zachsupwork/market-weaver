# Market Weaver — Standalone API

A Node.js + Express server for secure Polymarket CLOB API credential management.

## Setup

```bash
cd apps/api
npm install
cp .env.example .env
# Edit .env with your values
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PM_PRIVATE_KEY` | ✅ | Your Polygon wallet private key (never shared with frontend) |
| `CHAIN_ID` | ✅ | `137` for Polygon mainnet, `80001` for Mumbai testnet |
| `CLOB_HOST` | ✅ | `https://clob.polymarket.com` |
| `MASTER_KEY` | ✅ | 32+ char key for AES-256-GCM encryption |
| `ADMIN_TOKEN` | Prod | Token for authenticating admin API calls |
| `DATABASE_URL` | Prod | Postgres connection string |
| `WEB_ORIGIN` | ✅ | Frontend URL for CORS (e.g. `http://localhost:5173`) |
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | `development` or `production` |

## Running

```bash
# Development
npm run dev

# Production
npm run build && npm start

# One-time credential derivation (prints to console)
npm run polymarket:derive

# Test authentication
npm run polymarket:test
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/polymarket/derive-api-creds` | Derive CLOB API credentials |
| POST | `/polymarket/rotate-api-creds` | Rotate credentials (invalidates old) |
| GET | `/polymarket/has-creds` | Check if credentials exist |
| POST | `/polymarket/test-auth` | Test stored credentials |

## Security

- ⚠️ **NEVER** commit `.env` files
- ⚠️ **NEVER** run on shared/public computers
- ⚠️ Rotate keys immediately if exposed
- Admin endpoints require `x-admin-token` header in production
- All secrets are AES-256-GCM encrypted at rest
- Private key never leaves the server process
