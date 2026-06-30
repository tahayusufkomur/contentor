# mailbox-inbound Cloudflare Email Worker

Account-level Cloudflare Email Worker that receives inbound messages for every mailbox-enabled coach domain and forwards them to the Contentor webhook for processing.

## How it works

Cloudflare Email Routing invokes this Worker for each inbound message arriving at a catch-all rule bound to it. The Worker parses the raw email (via `postal-mime`), serialises the relevant fields to JSON, signs the body with HMAC-SHA-256, and POSTs it to the Django inbound webhook. Django verifies the signature before processing. Because this is an account-level Worker, a single deployment serves all tenant zones — no per-zone Worker config is needed.

## Deploy

### 1. Install dependencies and deploy the Worker

```bash
cd infra/cloudflare/mailbox-worker
npm install
npx wrangler deploy
```

This deploys the Worker under the name `mailbox-inbound` to your Cloudflare account.

### 2. Set the inbound secret

Generate a strong secret (do this once — reuse the same value everywhere):

```bash
openssl rand -hex 32
```

Then upload it as a Wrangler secret (never commit it to the repo):

```bash
npx wrangler secret put MAILBOX_INBOUND_SECRET
```

When prompted, paste the value from the step above.

### 3. Configure Django

Add the same secret, plus the Worker name, to `.env.prod` on the server:

```
MAILBOX_INBOUND_SECRET=<same value as above>
CLOUDFLARE_EMAIL_WORKER_NAME=mailbox-inbound
```

`MAILBOX_INBOUND_SECRET` is used by `apps/mailbox/signing.py` to verify the HMAC on every inbound request. `CLOUDFLARE_EMAIL_WORKER_NAME` is used by the provisioning code (Task 4) to bind each new mailbox-enabled zone's Email Routing catch-all rule to this Worker.

### 4. Re-binding already-provisioned domains

The provisioning code (Task 4, `_step_email_auth`) automatically binds the catch-all rule to this Worker when a coach domain is first provisioned with `mailbox_enabled=True`. For domains that were already provisioned before the Worker was deployed, re-run `_step_email_auth` (or the corresponding one-off management action) after setting `mailbox_enabled=True` on the custom domain record.

## Architecture note

This Worker is account-level and shared across all tenant zones. The Django webhook (`/api/v1/mailbox/inbound/`) resolves the tenant from the recipient domain (`to` field), so one Worker and one secret serve every coach. There is no per-tenant Worker config.

## Failure handling

If the Django webhook returns a 5xx response the Worker calls `message.setReject(...)`, which causes Cloudflare Email Routing to bounce the message back to the sender with a temporary failure notice. 4xx responses (e.g. unknown domain) are treated as silent drops — the message is consumed without retry.
