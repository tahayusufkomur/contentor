"""One-command answer to "is my AI provider working?" — prints the active
provider, runs the core.ai preflight with a fix-it message on failure, then
fires ONE tiny end-to-end structured call (~10 output tokens). With
AI_PROVIDER=anthropic that call bills a fraction of a cent and says so."""

from django.conf import settings
from django.core.management.base import BaseCommand
from pydantic import BaseModel

from apps.core import ai


class _Ping(BaseModel):
    ok: bool


_FIXES = {
    "cli_no_binary": (
        "claude CLI not found in this container — the dev compose must build "
        "the django image with INSTALL_CLAUDE_CLI=1 (rebuild with `make dev`)."
    ),
    "cli_no_token": (
        "CLAUDE_CODE_OAUTH_TOKEN is empty — run `claude setup-token` on the "
        "host, paste the token into .env, then restart django + celery-worker."
    ),
    "no_api_key": "ANTHROPIC_API_KEY is empty — set it in the environment.",  # pragma: allowlist secret
}


class Command(BaseCommand):
    help = "Verify the AI provider end-to-end (fires ONE tiny model call)."

    def handle(self, *args, **options):
        provider = settings.AI_PROVIDER
        self.stdout.write(f"AI_PROVIDER={provider}")
        if provider == "cli":
            self.stdout.write(f"AI_CLI_BIN={settings.AI_CLI_BIN}  AI_CLI_MODEL={settings.AI_CLI_MODEL}")
        ok, reason = ai.available()
        if not ok:
            self.stderr.write(self.style.ERROR(f"preflight failed: {reason}"))
            self.stderr.write(_FIXES.get(reason, ""))
            raise SystemExit(1)
        self.stdout.write("preflight: ok")
        if provider == "anthropic":
            self.stdout.write("firing one ~10-token call against the BILLED API key...")
        try:
            parsed, cost, model = ai.structured(
                system="You are a health check. Follow the instruction exactly.",
                user='Return {"ok": true}',
                output_model=_Ping,
                model=settings.HELP_BOT_MODEL,
                max_tokens=32,
            )
        except ai.AiError as exc:
            self.stderr.write(self.style.ERROR(f"end-to-end call failed: {exc}"))
            raise SystemExit(1) from exc
        self.stdout.write(self.style.SUCCESS(f"end-to-end: ok (model={model}, ok={parsed.ok}, cost=${cost})"))
