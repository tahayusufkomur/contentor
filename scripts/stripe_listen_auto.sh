#!/usr/bin/env bash
set -e

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE file not found."
  exit 1
fi

API_KEY=$(grep -E '^STRIPE_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'")

if [ -z "$API_KEY" ]; then
  echo "Error: STRIPE_SECRET_KEY is not set in $ENV_FILE"
  exit 1
fi

echo "Starting Stripe CLI listener and auto-syncing STRIPE_WEBHOOK_SECRET to $ENV_FILE..."

stripe listen \
  --api-key "$API_KEY" \
  --forward-to http://localhost/api/webhooks/stripe/ \
  --forward-connect-to http://localhost/api/webhooks/stripe/ 2>&1 | while read -r line; do
    echo "$line"
    if [[ "$line" =~ (whsec_[a-zA-Z0-9]+) ]]; then
      WHSEC="${BASH_REMATCH[1]}"
      echo ""
      echo "[Auto-Sync] Detected Webhook Secret: $WHSEC"
      
      python3 -c "
import re, os
path = '$ENV_FILE'
secret = '$WHSEC'

# Update main .env
if os.path.exists(path):
    with open(path, 'r') as f:
        content = f.read()
    if re.search(r'^STRIPE_WEBHOOK_SECRET=', content, flags=re.MULTILINE):
        new_content = re.sub(r'^STRIPE_WEBHOOK_SECRET=.*$', f'STRIPE_WEBHOOK_SECRET={secret}', content, flags=re.MULTILINE)
    else:
        new_content = content + f'\nSTRIPE_WEBHOOK_SECRET={secret}\n'
    with open(path, 'w') as f:
        f.write(new_content)

# Update backend/.stripe_whsec (instant volume mount sync)
backend_sec_path = os.path.join('backend', '.stripe_whsec')
with open(backend_sec_path, 'w') as f:
    f.write(secret)
"
      echo "[Auto-Sync] Updated STRIPE_WEBHOOK_SECRET in $ENV_FILE and backend/.stripe_whsec successfully!"
      echo ""
    fi
  done
