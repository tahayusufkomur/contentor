import logging

import resend
from django.conf import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, logging email instead")
        logger.info("Email to=%s subject=%s", to, subject)
        return False

    resend.api_key = settings.RESEND_API_KEY

    try:
        resend.Emails.send(
            {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
            }
        )
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def send_magic_link(to: str, link: str, brand_name: str = "Contentor") -> bool:
    subject = f"Your login link for {brand_name}"
    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px;">{brand_name}</h2>
        <p style="color: #444; font-size: 16px;">Click the button below to sign in. This link expires in {settings.MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
        <a href="{link}"
           style="display: inline-block; background: #7c3aed; color: white; padding: 12px 32px;
                  border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
            Sign In
        </a>
        <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
            Or copy this link: <br/>
            <span style="word-break: break-all;">{link}</span>
        </p>
    </div>
    """
    return send_email(to, subject, html)
