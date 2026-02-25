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

## Fixing Polymarket 401 / Placeholder Credentials

### The Problem

The "Generate Credentials" button in the UI creates **placeholder** (fake) credentials to test the encryption/storage pipeline. These will always return a `401 Unauthorized` when tested against the Polymarket CLOB API.

### Solution: Get Real Credentials

Real Polymarket CLOB API credentials require an **L1 wallet signature** using `ethers@5` and your `PM_PRIVATE_KEY`. There are three ways to obtain them:

#### Option 1: GitHub Actions (Recommended — no local setup)

1. Add these **GitHub Secrets** to your repository:
   | Secret | Description |
   |---|---|
   | `PM_PRIVATE_KEY` | Your Polymarket wallet private key |
   | `MASTER_KEY` | AES-256-GCM encryption key (must match your backend secret) |
   | `SUPABASE_URL` | Your Lovable Cloud / Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key for database writes |
   | `CHAIN_ID` | (optional) Default: `137` (Polygon) |
   | `CLOB_HOST` | (optional) Default: `https://clob.polymarket.com` |

2. Go to **Actions** → **"Derive Polymarket API Credentials"** → **Run workflow**

3. The workflow will derive real credentials, encrypt them, and store them in the database.

4. Go to **Settings → Polymarket** in the UI and click **Test Auth** to verify.

#### Option 2: Run CLI Locally

```bash
cd apps/api
cp .env.example .env
# Fill in PM_PRIVATE_KEY, MASTER_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run polymarket:derive-cloud
```

#### Option 3: Import Manually

If you've already derived credentials externally:

1. Go to **Settings → Polymarket** in the UI
2. Paste your `apiKey`, `secret`, `passphrase`, and `address` into the **Import Real Credentials** form
3. Click **Import Credentials**

### Verifying

After storing real credentials via any method, click **Test Auth**. It performs an HMAC-SHA256 signed request to the Polymarket CLOB API. A green success message confirms your credentials are working.
