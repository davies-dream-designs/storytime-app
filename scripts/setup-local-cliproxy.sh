#!/usr/bin/env bash
# setup-local-cliproxy.sh
#
# Populates .env.local for running Storycot locally with cliproxy for image generation.
# Run once: bash scripts/setup-local-cliproxy.sh
# Then: npm run dev
#
# Prerequisites:
#   - cliproxy running at localhost:8317 (part of agent-canvas docker stack)
#   - Vercel CLI linked: npx vercel link --scope=davies-dream-designs --project=storytime-app
#   - The secrets below filled in manually (copy from Vercel dashboard → Settings → Environment Variables)

set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO/.env.local"

echo "Setting up .env.local for local dev with cliproxy..."
echo ""

# ── Pull non-sensitive vars from Vercel (works without decrypt permission) ───
echo "Pulling Vercel env vars..."
if ! command -v vercel &>/dev/null; then
  npx vercel@latest env pull "$ENV_FILE" --environment=preview --yes 2>/dev/null || true
else
  vercel env pull "$ENV_FILE" --environment=preview --yes 2>/dev/null || true
fi

# ── Append / override with cliproxy settings ─────────────────────────────────
cat >> "$ENV_FILE" << 'ENVBLOCK'

# ── cliproxy overrides (local dev only) ──────────────────────────────────────
# Routes avatar + spread image generation through cliproxy (subscription)
# instead of pay-per-token OpenAI API calls.
# gpt-image-2 confirmed available via cliproxy.
OPENAI_API_BASE_URL=http://localhost:8317/v1
OPENAI_API_KEY=hive-local-key
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_AVATAR_IMAGE_MODEL=gpt-image-2
ENVBLOCK

# ── Use dev Clerk key ─────────────────────────────────────────────────────────
# CLERK_SECRET_KEY_DEV is registered in OpenHands secrets
CLERK_DEV=$(curl -s -H "X-Session-API-Key: ${OH_SESSION_API_KEYS_0:-}" \
  "http://localhost:18000/api/settings/secrets/CLERK_SECRET_KEY_DEV" 2>/dev/null || true)

if [[ "$CLERK_DEV" == sk_test_* ]]; then
  # Overwrite any empty CLERK_SECRET_KEY with the dev key
  sed -i "s|^CLERK_SECRET_KEY=$|CLERK_SECRET_KEY=$CLERK_DEV|" "$ENV_FILE"
  echo "✓ CLERK_SECRET_KEY set from OpenHands secrets (dev key)"
fi

# ── Prompt for secrets that require Vercel dashboard access ──────────────────
echo ""
echo "The following secrets need to be filled manually."
echo "Copy from: Vercel → storytime-app → Settings → Environment Variables → Preview"
echo ""

NEEDED=(
  "DATABASE_URL                  (storycot_DATABASE_URL or Neon connection string)"
  "ANTHROPIC_API_KEY             (for story generation)"
  "INNGEST_SIGNING_KEY           (for background jobs)"
  "INNGEST_EVENT_KEY             (for background jobs)"
  "BLOB_READ_WRITE_TOKEN         (for image storage)"
  "STRIPE_SECRET_KEY             (only if testing payments)"
)

for item in "${NEEDED[@]}"; do
  KEY="${item%%[[:space:]]*}"
  current=$(grep "^$KEY=" "$ENV_FILE" | cut -d= -f2-)
  if [[ -z "$current" ]]; then
    echo "  ✗ $item"
  else
    echo "  ✓ $KEY already set"
  fi
done

echo ""
echo "Edit .env.local directly to fill in missing values."
echo "Done! Once secrets are filled: npm run dev"
