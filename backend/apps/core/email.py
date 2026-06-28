import logging

import resend
from django.conf import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str, from_name: str = "", headers: dict | None = None) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, logging email instead")
        logger.info("Email to=%s subject=%s", to, subject)
        return False

    resend.api_key = settings.RESEND_API_KEY

    from_email = settings.RESEND_FROM_EMAIL
    if from_name:
        from_email = f"{from_name} <{settings.RESEND_FROM_EMAIL}>"

    payload = {
        "from": from_email,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if headers:
        payload["headers"] = headers

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
    },
    "tr": {
        "subject": "{brand} için giriş bağlantınız",
        "intro": "Aşağıdaki düğmeye tıklayarak giriş yapın. Bu bağlantı {minutes} dakika içinde sona erer.",
        "button": "Giriş yap",
        "ignore": "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
        "copy_hint": "Veya bu bağlantıyı kopyalayın:",
    },
}


def send_magic_link(
    to: str,
    link: str,
    brand_name: str = "Contentor",
    locale: str = "en",
) -> bool:
    copy = _MAGIC_LINK_COPY.get(locale, _MAGIC_LINK_COPY["en"])
    minutes = settings.MAGIC_LINK_EXPIRY_MINUTES
    subject = copy["subject"].format(brand=brand_name)
    intro = copy["intro"].format(minutes=minutes)
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px; letter-spacing: -0.02em;">{brand_name}</h2>
        <p style="color: #444; font-size: 16px;">{intro}</p>
        <a href="{link}"
           style="display: inline-block; background: #0391F9; color: white; padding: 12px 32px;
                  border-radius: 999px; text-decoration: none; font-weight: 600; margin: 24px 0;">
            {copy["button"]}
        </a>
        <p style="color: #888; font-size: 13px;">{copy["ignore"]}</p>
        <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
            {copy["copy_hint"]}<br/>
            <span style="word-break: break-all;">{link}</span>
        </p>
    </div>
    """
    return send_email(to, subject, html)
