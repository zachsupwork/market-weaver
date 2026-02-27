# Market Weaver / PolyView

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Technologies

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Custom Domain

Navigate to Project > Settings > Domains and click Connect Domain.
Read more: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## Polymarket Client Setup

PolyView is a rebranded Polymarket client that trades via the CLOB API using server-side credentials.

### Architecture

- **Frontend** fetches public market data directly from Polymarket Gamma API (proxied through backend functions for CORS)
- **Trading operations** (place/cancel orders, positions) go through server-side functions that decrypt stored credentials and sign requests with HMAC-SHA256
- **Private keys never leave the server** — all signing happens in edge functions or `apps/api`

### Required Secrets

| Secret | Where | Description |
|---|---|---|
| `PM_PRIVATE_KEY` | GitHub + Cloud | Your Polygon wallet private key |
| `MASTER_KEY` | GitHub + Cloud | AES-256-GCM encryption key (32+ chars) |
| `SUPABASE_URL` | GitHub | Backend project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub | Service role key for DB writes |
| `CHAIN_ID` | Optional | Default: `137` (Polygon mainnet) |
| `CLOB_HOST` | Optional | Default: `https://clob.polymarket.com` |
| `POLY_BUILDER_API_KEY` | Optional | Builder key for gasless tx + attribution |
| `POLY_BUILDER_SECRET` | Optional | Builder secret |
| `POLY_BUILDER_PASSPHRASE` | Optional | Builder passphrase |
| `POLY_BRIDGE_DEPOSIT_URL` | Edge Function | Full URL for deposit address creation (e.g. `https://bridge.polymarket.com/deposit-addresses`) |

### Generating Real Credentials

#### Option 1: GitHub Actions (Recommended)
1. Add GitHub Secrets listed above
2. Go to **Actions → "Derive Polymarket API Credentials" → Run workflow**
3. The smoke test job verifies credentials work after derivation

#### Option 2: CLI
```bash
cd apps/api && npm install
cp .env.example .env  # fill in values
npm run polymarket:derive-cloud
npm run polymarket:smoke
```

#### Option 3: Manual Import
Use the **Import Real Credentials** form in Settings → Polymarket

### Running Locally

```bash
# Frontend
npm install && npm run dev

# API server (for order placement)
cd apps/api && npm install && npm run dev
```

### Fixing 401 Errors

Placeholder credentials (generated via the UI "Generate Placeholder" button) are intentionally fake and will always return 401. Use one of the three methods above to store real credentials, then click **Test Auth** to verify.
