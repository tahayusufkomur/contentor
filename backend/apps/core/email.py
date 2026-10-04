import logging
import mimetypes

import requests
import resend
from django.conf import settings

logger = logging.getLogger(__name__)

_CF_SEND_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send"

# RFC 2606 reserved TLDs: undeliverable by definition. Seeded/test users live on
# them (demo-yoga's coach@demo-yoga.test, priya@demo.test); sending would only
# bounce and dent the sender reputation of the real domains.
_RESERVED_TLDS = (".test", ".example", ".invalid", ".localhost")


def _sender_domain(address: str) -> str:
    return address.rsplit("@", 1)[-1].strip("> ").lower() if "@" in address else ""


def _routes_via_cloudflare(domain: str) -> bool:
    """Platform domains and live coach custom domains (whose zones live in our
    Cloudflare account and are onboarded to Email Sending by provisioning)."""
    if domain in settings.CF_EMAIL_DOMAINS:
        return True
    try:
        from apps.domains.models import CustomDomain  # local import: avoids app-load cycle

        return CustomDomain.objects.filter(domain=domain, provisioning_status="live").exists()
    except Exception:
        logger.exception("CustomDomain lookup failed for %s; falling back to Resend", domain)
        return False


def _send_via_cloudflare(
    sender: str,
    from_name: str,
    to: str,
    subject: str,
    html: str,
    headers: dict | None,
    attachments: list[dict] | None,
    text: str = "",
) -> bool:
    payload: dict = {
        "from": {"address": sender, **({"name": from_name} if from_name else {})},
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    if headers:
        payload["headers"] = headers
    if attachments:
        # Incoming attachments use the Resend shape: {filename, content(b64)}.
        payload["attachments"] = [
            {
                "content": a["content"],
                "filename": a.get("filename", "attachment"),
                "type": a.get("type") or mimetypes.guess_type(a.get("filename", ""))[0] or "application/octet-stream",
                "disposition": "attachment",
            }
            for a in attachments
        ]
    try:
        resp = requests.post(
            _CF_SEND_URL.format(account_id=settings.CF_ACCOUNT_ID),
            json=payload,
            headers={"Authorization": f"Bearer {settings.CF_EMAIL_TOKEN}"},
            timeout=30,
        )
        data = resp.json()
        if resp.status_code >= 400 or not data.get("success"):
            logger.error("Cloudflare email send failed to=%s: %s", to, data.get("errors"))
            return False
        bounces = (data.get("result") or {}).get("permanent_bounces") or []
        if bounces:
            logger.error("Cloudflare email permanent bounce to=%s: %s", to, bounces)
            return False
        return True
    except Exception:
        logger.exception("Failed to send email (cloudflare) to %s", to)
        return False


def send_email(
    to: str,
    subject: str,
    html: str,
    from_name: str = "",
    headers: dict | None = None,
    from_email: str = "",
    attachments: list[dict] | None = None,
    text: str = "",
) -> bool:
    if getattr(settings, "EMAIL_SINK_ENABLED", False):
        from apps.core.models import DevOutboundEmail

        DevOutboundEmail.objects.create(to=to, subject=subject, html=html)
        logger.info("[email-sink] captured to=%s subject=%s", to, subject)
        if attachments:
            logger.info("[email-sink] %d attachment(s) omitted from sink", len(attachments))
        return True

    if _sender_domain(to).endswith(_RESERVED_TLDS):
        logger.info("Skipping email to reserved-domain address to=%s subject=%s", to, subject)
        return False

    sender_address = from_email or settings.RESEND_FROM_EMAIL

    # Platform domains and Cloudflare-onboarded coach custom domains go through
    # Cloudflare Email Sending; anything else falls back to Resend.
    if settings.CF_EMAIL_TOKEN and _routes_via_cloudflare(_sender_domain(sender_address)):
        return _send_via_cloudflare(sender_address, from_name, to, subject, html, headers, attachments, text)

    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, logging email instead")
        logger.info("Email to=%s subject=%s", to, subject)
        return False

    resend.api_key = settings.RESEND_API_KEY

    sender = sender_address
    if from_name:
        sender = f"{from_name} <{sender}>"

    payload = {
        "from": sender,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text
    if headers:
        payload["headers"] = headers
    if attachments:
        payload["attachments"] = attachments

    try:
        resend.Emails.send(payload)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


_MAGIC_LINK_COPY: dict[str, dict[str, str]] = {
    "en": {
        "subject": "Your login link for {brand}",
        "intro": "Click the button below to sign in. This link expires in {minutes} minutes.",
        "button": "Sign in",
        "ignore": "If you didn't request this, you can safely ignore this email.",
        "copy_hint": "Or copy this link:",
        "code_hint": "Using the installed app? Enter this code on the sign-in screen instead:",
    },
}


def send_magic_link(
    to: str,
    link: str,
    brand_name: str = "Contentor",
    code: str | None = None,
) -> bool:
    copy = _MAGIC_LINK_COPY["en"]
    minutes = settings.MAGIC_LINK_EXPIRY_MINUTES
    from django.utils.html import escape

    subject = copy["subject"].format(brand=brand_name)  # plain text
    safe_brand = escape(brand_name)  # coach-controlled: never raw into HTML
    intro = copy["intro"].format(minutes=minutes)
    font_stack = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    code_block = ""
    if code:
        spaced = f"{code[:3]} {code[3:]}"
        code_block = f"""
        <p style="color: #444; font-size: 14px; margin-top: 24px;">{copy["code_hint"]}</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e;">{spaced}</p>
        """
    html = f"""
    <div style="font-family: {font_stack}; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px; letter-spacing: -0.02em;">{safe_brand}</h2>
        <p style="color: #444; font-size: 16px;">{intro}</p>
        <a href="{link}"
           style="display: inline-block; background: #0391F9; color: white; padding: 12px 32px;
                  border-radius: 999px; text-decoration: none; font-weight: 600; margin: 24px 0;">
            {copy["button"]}
        </a>
        {code_block}
        <p style="color: #888; font-size: 13px;">{copy["ignore"]}</p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
            {copy["copy_hint"]}<br/>
            <span style="word-break: break-all;">{link}</span>
        </p>
    </div>
    """
    return send_email(to, subject, html)


def action_email(*, heading: str, intro: str, button: str, link: str, expires: str) -> tuple[str, str]:
    """The one branded "click this button" email (signup verification, wizard
    recovery). Returns (html, text). Every argument is plain text and gets
    escaped here, so coach-supplied text (a brand name in ``intro``) is safe. The raw link is deliberately NOT repeated in the HTML (the button is the
    link); the plain-text alternative carries it for clients that strip buttons."""
    from django.utils.html import escape

    font_stack = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    html = f"""
    <div style="font-family: {font_stack}; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <p style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #1a1a2e; margin: 0 0 24px;">Contentor</p>
        <h2 style="color: #1a1a2e; margin: 0 0 8px; letter-spacing: -0.02em;">{escape(heading)}</h2>
        <p style="color: #444; font-size: 16px; line-height: 1.5;">{escape(intro)}</p>
        <a href="{escape(link)}"
           style="display: inline-block; background: #0391F9; color: white; padding: 12px 32px;
                  border-radius: 999px; text-decoration: none; font-weight: 600; margin: 24px 0;">
            {escape(button)}
        </a>
        <p style="color: #888; font-size: 13px;">{escape(expires)}</p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">Contentor · Courses, live classes and payments under your own brand.</p>
    </div>
    """
    text = f"{heading}\n\n{intro}\n\n{button}: {link}\n\n{expires}\n"
    return html, text
