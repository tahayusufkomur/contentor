# ruff: noqa: E501 — the HTML templates below read as markup, and wrapping their f-strings would hide it.
"""Email HTML from a design (block JSON), for every inbox: table layout, inline CSS, VML for
Outlook, PNG/JPEG images only. Ported from MailCraft's export engine (templates_api/export_engine.py),
so imported MailCraft templates render the same.

The design must already be resolved (``brand.resolve``): no ``brand:`` tokens, absolute links, item
blocks carrying their ``_item``. Merge variables ({{FirstName}}, {{UnsubscribeUrl}}) stay in the HTML and
are filled per recipient by ``personalize``. Pure: no database, no network.
"""

import html as html_module
import re

from django.templatetags.static import static
from django.utils.translation import gettext as _

from .images import with_aspect

BACKGROUND_STYLE_PRESETS = {
    "aurora": {
        "fallback_color": "#e7ecff",
        "background": (
            "radial-gradient(circle at 15% 15%, rgba(168, 85, 247, 0.22), transparent 45%), "
            "radial-gradient(circle at 85% 20%, rgba(14, 165, 233, 0.22), transparent 42%), "
            "linear-gradient(135deg, #f6f7ff 0%, #e0e7ff 45%, #dbeafe 100%)"
        ),
    },
    "sunset-glow": {
        "fallback_color": "#fdf1e8",
        "background": (
            "radial-gradient(circle at 78% 18%, rgba(251, 113, 133, 0.22), transparent 42%), "
            "radial-gradient(circle at 22% 78%, rgba(251, 191, 36, 0.2), transparent 48%), "
            "linear-gradient(145deg, #fff7ed 0%, #fee2e2 48%, #ffedd5 100%)"
        ),
    },
    "mint-weave": {
        "fallback_color": "#eafbf6",
        "background": (
            "repeating-linear-gradient(45deg, rgba(15, 118, 110, 0.05) 0, rgba(15, 118, 110, 0.05) 1px, "
            "transparent 1px, transparent 18px), "
            "repeating-linear-gradient(-45deg, rgba(20, 184, 166, 0.05) 0, rgba(20, 184, 166, 0.05) 1px, "
            "transparent 1px, transparent 18px), "
            "linear-gradient(135deg, #f0fdfa 0%, #dcfce7 100%)"
        ),
    },
    "midnight-grid": {
        "fallback_color": "#0f172a",
        "background": (
            "linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px), "
            "linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px), "
            "radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.18), transparent 36%), "
            "radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.16), transparent 34%), "
            "linear-gradient(135deg, #0f172a 0%, #111827 55%, #1e293b 100%)"
        ),
    },
    "paper-rings": {
        "fallback_color": "#f8f6f1",
        "background": (
            "radial-gradient(circle at 10% 10%, rgba(120, 113, 108, 0.08) 0, rgba(120, 113, 108, 0.08) 1px, "
            "transparent 1px), "
            "radial-gradient(circle at 70% 30%, rgba(148, 163, 184, 0.12) 0, rgba(148, 163, 184, 0.12) 2px, "
            "transparent 2px), "
            "radial-gradient(circle at 30% 80%, rgba(148, 163, 184, 0.1) 0, rgba(148, 163, 184, 0.1) 2px, "
            "transparent 2px), "
            "linear-gradient(140deg, #fafaf9 0%, #f5f5f4 52%, #e7e5e4 100%)"
        ),
    },
}

BODY_BACKGROUND_STYLE_PRESETS = {
    "mesh-blue": {
        "fallback_color": "#eef4ff",
        "background": (
            "radial-gradient(circle at 18% 16%, rgba(59, 130, 246, 0.09), transparent 42%), "
            "radial-gradient(circle at 84% 20%, rgba(14, 165, 233, 0.08), transparent 38%), "
            "linear-gradient(145deg, #f8fbff 0%, #eef4ff 48%, #e5edff 100%)"
        ),
    },
    "aurora-soft": {
        "fallback_color": "#f2f3ff",
        "background": (
            "radial-gradient(circle at 15% 10%, rgba(168, 85, 247, 0.11), transparent 36%), "
            "radial-gradient(circle at 85% 24%, rgba(34, 211, 238, 0.1), transparent 34%), "
            "linear-gradient(150deg, #fcfcff 0%, #f2f3ff 45%, #ebf6ff 100%)"
        ),
    },
    "sunset-paper": {
        "fallback_color": "#fff5ef",
        "background": (
            "radial-gradient(circle at 74% 20%, rgba(251, 146, 60, 0.11), transparent 40%), "
            "radial-gradient(circle at 20% 78%, rgba(251, 113, 133, 0.08), transparent 40%), "
            "linear-gradient(145deg, #fffaf7 0%, #fff1e8 55%, #fee4dc 100%)"
        ),
    },
    "carbon-grid": {
        "fallback_color": "#111827",
        "background": (
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), "
            "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), "
            "linear-gradient(135deg, #0f172a 0%, #111827 60%, #1f2937 100%)"
        ),
    },
    "opal-rings": {
        "fallback_color": "#f7f7f5",
        "background": (
            "radial-gradient(circle at 14% 14%, rgba(120,113,108,0.07) 0, rgba(120,113,108,0.07) 1px, transparent 1px), "
            "radial-gradient(circle at 72% 30%, rgba(148,163,184,0.1) 0, rgba(148,163,184,0.1) 2px, transparent 2px), "
            "linear-gradient(140deg, #fcfcfb 0%, #f7f7f5 56%, #efefeb 100%)"
        ),
    },
}

CSS_COLOR_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
_VAR_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
# The unsubscribe link of a brand footer, cut out when an email has none to offer (a receipt).
_UNSUB_START, _UNSUB_END = "<!--unsub-->", "<!--/unsub-->"
_UNSUB_SPAN = re.compile(re.escape(_UNSUB_START) + ".*?" + re.escape(_UNSUB_END), re.S)


def personalize(html: str, values: dict, *, escape: bool = True) -> str:
    """Fill {{Key}} merge variables with HTML-escaped values (safe in text and in attributes; escape=False
    for a subject line or the plain-text part); a key not given stays as written. With no UnsubscribeUrl the
    brand footer's unsubscribe link is removed."""
    if not values.get("UnsubscribeUrl"):
        html = _UNSUB_SPAN.sub("", html)

    def fill(match):
        key = match.group(1)
        if key not in values:
            return match.group(0)
        return html_module.escape(str(values[key])) if escape else str(values[key])

    return _VAR_PATTERN.sub(fill, html)


def render(design: dict, *, kit: dict, subject: str = "", preheader: str = "") -> str:
    """The email's HTML. ``kit`` is the brand kit (brand.kit): the brand blocks draw from it."""
    settings = design.get("settings") or {}
    bg_color, bg_css = _resolve_template_background(settings.get("backgroundStyle"), settings.get("backgroundColor"))
    content_bg_color, content_bg_css = _resolve_email_body_background(
        settings.get("bodyBackgroundStyle"), settings.get("bodyBackgroundColor")
    )
    content_width = _int(settings.get("contentWidth"), 600)
    ctx = {
        "content_width": content_width,
        "default_font": settings.get("defaultFont") or "Arial, Helvetica, sans-serif",
        "default_font_size": _int(settings.get("defaultFontSize"), 14),
        "default_color": _sanitize_css_color(settings.get("defaultColor"), "#333333"),
        "kit": kit,
    }
    header_html = _render_blocks((design.get("header") or {}).get("blocks") or [], ctx)
    body_html = _render_blocks((design.get("body") or {}).get("blocks") or [], ctx)
    footer_html = _render_blocks((design.get("footer") or {}).get("blocks") or [], ctx)
    return _email_skeleton(
        header_html=header_html,
        body_html=body_html,
        footer_html=footer_html,
        bg_color=bg_color,
        bg_css=bg_css,
        content_width=content_width,
        content_bg_color=content_bg_color,
        content_bg_css=content_bg_css,
        body_border_radius=_int(settings.get("bodyBorderRadius"), 0),
        google_font_link=_collect_google_font_links(design),
        stack_gaps=ctx.get("stack_gaps", ()),
        stack_pads=ctx.get("stack_pads", ()),
        subject=subject,
        preheader=preheader,
        lang=kit.get("language") or "en",
    )


def _int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _email_skeleton(
    header_html,
    body_html,
    footer_html,
    bg_color,
    bg_css,
    content_width,
    content_bg_color,
    content_bg_css,
    body_border_radius=0,
    google_font_link="",
    stack_gaps=(),
    stack_pads=(),
    subject="",
    preheader="",
    lang="en",
):
    # Stacked columns drop their side gutters and keep the gap as space above each column.
    gap_css = "".join(f"\n      .stack-gap-{g} {{ padding: {g}px 0 0 0 !important; }}" for g in sorted(stack_gaps))
    gap_css += "".join(
        f"\n      .stack-pad-{p} {{ padding-left: {p}px !important; padding-right: {p}px !important; }}"
        for p in sorted(stack_pads)
    )
    # The inbox's preview line, hidden in the email itself; the padding keeps the body text out of it.
    hidden = (
        f'<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">{html_module.escape(preheader)}'
        + "&#847; &zwnj; &nbsp; " * 40
        + "</div>"
        if preheader
        else ""
    )
    radius = f" border-radius: {body_border_radius}px; overflow: hidden;" if body_border_radius else ""
    return f"""<!DOCTYPE html>
<html lang="{html_module.escape(lang)}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{html_module.escape(subject)}</title>
  {google_font_link}
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
    img {{ -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }}
    body {{ margin: 0; padding: 0; width: 100% !important; height: 100% !important; }}

    @media only screen and (max-width: {content_width + 20}px) {{
      .email-container {{ width: 100% !important; max-width: 100% !important; }}
      .stack-column {{ display: block !important; width: 100% !important; max-width: 100% !important; }}
      .stack-gutter {{ padding: 0 !important; }}{gap_css}
      .mobile-padding {{ padding-left: 16px !important; padding-right: 16px !important; }}
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: {bg_color}; background: {bg_css};">
  {hidden}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color: {bg_color}; background: {bg_css};">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" class="email-container" width="{content_width}" cellpadding="0"
               cellspacing="0" border="0" align="center"
               style="margin: 0 auto; background-color: {content_bg_color}; background: {content_bg_css};{radius}">
          {header_html}
          {body_html}
          {footer_html}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _resolve_template_background(background_style, background_color):
    default_color = "#f4f4f4"
    safe_color = _sanitize_css_color(background_color, default_color)
    preset = BACKGROUND_STYLE_PRESETS.get(background_style)
    if not preset:
        return safe_color, safe_color
    fallback_color = _sanitize_css_color(preset.get("fallback_color"), default_color)
    resolved_color = safe_color if background_color else fallback_color
    return resolved_color, preset["background"]


def _resolve_email_body_background(background_style, background_color):
    default_color = "#ffffff"
    preset = BODY_BACKGROUND_STYLE_PRESETS.get(background_style)
    if background_style in (None, "", "solid") or not preset:
        safe_color = _sanitize_css_color(background_color, default_color)
        return safe_color, safe_color
    fallback_color = _sanitize_css_color(preset.get("fallback_color"), default_color)
    return _sanitize_css_color(background_color, fallback_color), preset["background"]


def _sanitize_css_color(value, default):
    if not value:
        return default
    normalized = str(value).strip()
    return normalized if CSS_COLOR_PATTERN.match(normalized) else default


def _color(value, default):
    """A colour for a style attribute: a hex value, "transparent", or the default (never free text)."""
    if isinstance(value, str) and value.strip() == "transparent":
        return "transparent"
    return _sanitize_css_color(value, default)


_FONT_SAFE = re.compile(r"^[\w\s,'\"-]{1,200}$")


def _font(value, default):
    """A font-family list for a style attribute: names, quotes, commas and hyphens only."""
    text = str(value or "").strip()
    return text.replace('"', "'") if text and _FONT_SAFE.match(text) else default


FRAME_KEYS = ("backgroundImage", "backgroundGradient", "backgroundOverlay", "borderWidth", "borderRadius")
# These blocks already draw their own border/radius.
_OWN_BORDER_TYPES = ("card", "profile", "button", "image", "item", "brandHeader", "brandFooter")
_HEX_COLOR_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def _render_blocks(blocks, ctx):
    parts = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type", "")
        renderer = BLOCK_RENDERERS.get(block_type)
        if renderer:
            html = renderer(block, ctx)
            style = block.get("style") or {}
            if block_type in _OWN_BORDER_TYPES:
                style = {k: v for k, v in style.items() if k not in ("borderWidth", "borderRadius")}
            if html and any(style.get(k) for k in FRAME_KEYS):
                html = _frame(html, style, ctx)
            parts.append(html)
    return "\n".join(parts)


def _vml_bg_open(img, width):
    return (
        f'<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" '
        f'style="width:{width}px;"><v:fill type="tile" src="{img}" />'
        f'<v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0"><![endif]-->'
    )


_VML_BG_CLOSE = "<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->"
# A CSS gradient may only hold these characters: no quotes, no semicolons, no url().
_GRADIENT_SAFE = re.compile(r"^[\w\s#%(),.+-]{1,400}$")


def _frame(block_html, style, ctx):
    """Wrap a rendered block row in a bordered / rounded / background-image row."""
    img = html_module.escape(style.get("backgroundImage") or "")
    gradient = style.get("backgroundGradient") or ""
    gradient = gradient if _GRADIENT_SAFE.match(gradient) and "url" not in gradient.lower() else ""
    overlay = style.get("backgroundOverlay")
    css = ["padding: 0"]
    border_w = _int(style.get("borderWidth"), 0)
    if border_w > 0:
        border_c = _sanitize_css_color(style.get("borderColor"), "#000000")
        border_s = style.get("borderStyle") if style.get("borderStyle") in ("solid", "dashed", "dotted") else "solid"
        css.append(f"border: {border_w}px {border_s} {border_c}")
    if style.get("borderRadius"):
        css.append(f"border-radius: {_int(style['borderRadius'], 0)}px")
    if img:
        css.append(f"background-image: url('{img}'); background-size: cover; background-position: center")
    elif gradient:
        css.append(f"background: {gradient}")
    td_attrs = f' background="{img}"' if img else ""
    vml_open, vml_close = (_vml_bg_open(img, ctx["content_width"]), _VML_BG_CLOSE) if img else ("", "")

    inner = block_html
    if overlay:
        if not _HEX_COLOR_PATTERN.match(str(overlay)):
            overlay = "#000000"
        opacity = style.get("backgroundOverlayOpacity")
        opacity = 0.4 if opacity is None else opacity
        inner = (
            f'<tr><td style="background: {_hex_to_rgba(overlay, opacity)};">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            f"{block_html}</table></td></tr>"
        )

    return f"""<tr>
  <td{td_attrs} style="{"; ".join(css)};" valign="top">
    {vml_open}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      {inner}
    </table>
    {vml_close}
  </td>
</tr>"""


_P_TAG = re.compile(r"<p(\s[^>]*)?>", re.IGNORECASE)
_A_TAG = re.compile(r"<a(\s[^>]*)?>", re.IGNORECASE)
_STYLE_ATTR = re.compile(r'\sstyle\s*=\s*"', re.IGNORECASE)


def _normalize_text_html(text_html, color):
    """Give editor HTML explicit email styling: the rich-text editor stores bare <p> and <a>, which
    clients would render with their own paragraph margins and blue links. Existing styles win."""
    p_tags = list(_P_TAG.finditer(text_html))

    def p_repl(m):
        margin = "0" if m.start() == p_tags[-1].start() else "0 0 1em"
        attrs = m.group(1) or ""
        if "margin" in attrs.lower():
            return m.group(0)
        if _STYLE_ATTR.search(attrs):
            return "<p" + _STYLE_ATTR.sub(f' style="margin: {margin}; ', attrs, count=1) + ">"
        return f'<p{attrs} style="margin: {margin};">'

    def a_repl(m):
        attrs = m.group(1) or ""
        if _STYLE_ATTR.search(attrs):
            return m.group(0)
        return f'<a{attrs} style="color: {color}; text-decoration: underline;">'

    return _A_TAG.sub(a_repl, _P_TAG.sub(p_repl, text_html))


def _bg_style(style):
    bg = style.get("backgroundColor")
    return f" background-color: {_color(bg, '#ffffff')};" if bg else ""


def _render_text_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    padding = _padding_str(style.get("padding", {}))
    alignment = _align(style.get("alignment"), "left")
    font_size = _int(style.get("fontSize"), 0) or ctx["default_font_size"]
    color = _sanitize_css_color(style.get("color"), ctx["default_color"])
    text_html = _normalize_text_html(data.get("html", ""), color)
    line_height = int(font_size * (_float(style.get("lineHeight")) or 1.6))
    return f"""<tr>
  <td style="padding: {padding}; font-family: {ctx["default_font"]}; font-size: {font_size}px;
             line-height: {line_height}px; color: {color};
             text-align: {alignment};{_bg_style(style)}">
    {text_html}
  </td>
</tr>"""


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _align(value, default):
    return value if value in ("left", "center", "right") else default


def _render_image_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    full_width = bool(style.get("fullWidth"))
    padding = "0" if full_width else _padding_str(style.get("padding", {}))
    alignment = _align(style.get("alignment"), "center")
    src = html_module.escape(data.get("src") or "")
    if not src:
        return ""
    alt = html_module.escape(data.get("alt") or "")
    width = ctx["content_width"] if full_width else _int(data.get("width"), ctx["content_width"])
    height = _int(data.get("height"), 0)
    link = data.get("link") or ""
    border_radius = _int(style.get("borderRadius"), 0)
    height_attr = f' height="{height}"' if height and not full_width else ""
    radius_style = f" border-radius: {border_radius}px;" if border_radius else ""
    img_tag = (
        f'<img src="{src}" alt="{alt}" width="{width}"{height_attr} '
        f'style="display: block; width: 100%; max-width: {width}px; height: auto; border: 0;{radius_style}" />'
    )
    if link:
        img_tag = f'<a href="{html_module.escape(link)}" target="_blank" style="text-decoration: none;">{img_tag}</a>'
    return f"""<tr>
  <td style="padding: {padding};" align="{alignment}">
    {img_tag}
  </td>
</tr>"""


def _button_html(text, url, *, bg, color, radius, font, size, weight, px, py, full, align, border="", extra=""):
    """A bulletproof button: VML roundrect for Outlook, a padded link for everyone else."""
    border = border or f"0px solid {bg}"
    width_attr = ' width="100%"' if full else ""
    table_width_style = "width: 100%;" if full else ""
    display, width = ("block", "width: 100%;") if full else ("inline-block", "")
    vml_width = "100%" if full else f"{max(120, len(text) * 9 + px * 2)}px"
    height = size + py * 2 + 4
    arc = min(50, int(radius / max(height, 1) * 100))
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="{align}"{width_attr} style="{table_width_style}">
      <tr>
        <td style="border-radius: {radius}px; background-color: {bg}; border: {border};" align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                       xmlns:w="urn:schemas-microsoft-com:office:word"
                       href="{url}"
                       style="height:{height}px;v-text-anchor:middle;width:{vml_width};"
                       arcsize="{arc}%" fillcolor="{bg}" strokecolor="{bg}">
            <w:anchorlock/>
            <center style="color:{color};font-family:{font};font-size:{size}px;font-weight:{weight};">{text}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="{url}" target="_blank"
             style="display: {display}; {width} box-sizing: border-box; padding: {py}px {px}px; background-color: {bg};
                    color: {color}; font-family: {font}; font-size: {size}px; font-weight: {weight};{extra}
                    text-decoration: none; border-radius: {radius}px; border: {border}; text-align: center;">
            {text}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>"""


def _render_button_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    bg = _color(style.get("backgroundColor"), "#007bff")
    border_width = _int(style.get("borderWidth"), 0)
    border_style = style.get("borderStyle") if style.get("borderStyle") in ("solid", "dashed", "dotted") else "solid"
    border = f"{border_width}px {border_style} {_color(style.get('borderColor'), bg)}"
    transform = (
        style.get("textTransform") if style.get("textTransform") in ("uppercase", "lowercase", "capitalize") else ""
    )
    extra = f" letter-spacing: {_float(style.get('letterSpacing'))}px;" if style.get("letterSpacing") else ""
    extra += f" text-transform: {transform};" if transform else ""
    button = _button_html(
        html_module.escape(data.get("text") or _("Click here")),
        html_module.escape(data.get("url") or "#"),
        bg=bg,
        color=_color(style.get("color"), "#ffffff"),
        radius=_int(style.get("borderRadius"), 4),
        font=_font(style.get("fontFamily"), ctx["default_font"]),
        size=_int(style.get("fontSize"), 16),
        weight=_int(style.get("fontWeight"), 600),
        px=_int(style.get("paddingX"), 24),
        py=_int(style.get("paddingY"), 12),
        full=bool(style.get("fullWidth")),
        align=_align(style.get("alignment"), "center"),
        border=border,
        extra=extra,
    )
    return f"""<tr>
  <td style="padding: {_padding_str(style.get("padding", {}))};" align="{_align(style.get("alignment"), "center")}">
    {button}
  </td>
</tr>"""


def _render_divider_block(block, ctx):
    style = block.get("style") or {}
    line_style = style.get("lineStyle") if style.get("lineStyle") in ("solid", "dashed", "dotted") else "solid"
    line_color = _color(style.get("lineColor"), "#cccccc")
    line_thickness = _int(style.get("lineThickness"), 1)
    spacing = _int(style.get("spacing"), 20)
    padding = style.get("padding")
    side = f"{_int(padding.get('left'), 0)}px" if isinstance(padding, dict) else "0"
    return f"""<tr>
  <td style="padding: {spacing}px {side};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border-top: {line_thickness}px {line_style} {line_color}; font-size: 0; line-height: 0;" height="1">
          &nbsp;
        </td>
      </tr>
    </table>
  </td>
</tr>"""


def _column_widths(ratios, count, total):
    """Split `total` px by the column ratios; the last column takes the rounding remainder."""
    ratios = [r if isinstance(r, int | float) and r > 0 else 0 for r in (ratios or [])][:count]
    if len(ratios) != count or not sum(ratios):
        ratios = [1] * count
    widths = [int(total * r / sum(ratios)) for r in ratios]
    widths[-1] = total - sum(widths[:-1])
    return widths


def _render_columns_block(block, ctx):
    """Columns keep the gap between them (none at the outer edges), like the editor canvas.

    Stacking columns use the fluid-hybrid pattern (inline-block divs + MSO ghost table) and
    collapse to full width on small screens. With stackOnMobile false they are a plain table
    row that never wraps, so data rows (prices, times, scores) stay aligned on phones.
    """
    data = block.get("data") or {}
    style = block.get("style") or {}
    columns = [c for c in data.get("columns") or [] if isinstance(c, dict)]
    if not columns:
        return ""
    count = len(columns)
    gap = max(0, _int(style.get("gap", 10), 0))
    min_height = _int(style.get("minHeight"), 0)
    height_style = f" height: {min_height}px;" if min_height else ""
    v_align = {"center": "middle", "bottom": "bottom"}.get(style.get("verticalAlignment"), "top")
    # The ratio splits what is left after the gaps, so equal ratios give equal content widths.
    widths = _column_widths(data.get("columnRatio"), count, ctx["content_width"] - gap * (count - 1))
    stack = style.get("stackOnMobile", True) is not False
    outer_bg = _bg_style(style)

    def content(col, width, cls=""):
        """The column's own box: background, radius, padding and its blocks."""
        inner = f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          {_render_blocks(col.get("blocks") or [], ctx)}
        </table>"""
        css = f"padding: {_padding_str(col['padding']) if col.get('padding') else '0'};"
        if col.get("backgroundColor"):
            css += f" background-color: {_color(col['backgroundColor'], '#ffffff')};"
        if col.get("borderRadius"):
            css += f" border-radius: {_int(col['borderRadius'], 0)}px;"
        attr = f' class="{cls}"' if cls else ""
        img = html_module.escape(col.get("backgroundImage") or "")
        if img:
            attr += f' background="{img}"'
            css += f" background-image: url('{img}'); background-size: cover; background-position: center;"
            inner = f"{_vml_bg_open(img, width)}{inner}{_VML_BG_CLOSE}"
        return attr, css, inner

    if not stack:
        cells = []
        for i, col in enumerate(columns):
            if i:
                cells.append(f'<td width="{gap}" style="width: {gap}px; font-size: 0; line-height: 0;">&nbsp;</td>')
            attr, css, inner = content(col, widths[i])
            pct = round(widths[i] * 100 / ctx["content_width"], 2)
            cells.append(f'<td{attr} width="{pct}%" valign="{v_align}" style="{css}">{inner}</td>')
        return f"""<tr>
  <td valign="{v_align}" style="padding: {_padding_str(style.get("padding", {}))};{height_style}{outer_bg}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout: fixed;">
      <tr>{"".join(cells)}</tr>
    </table>
  </td>
</tr>"""

    ctx.setdefault("stack_gaps", set()).add(gap)
    # Stacked, every column takes the block's widest side padding on both sides, so an inset
    # given to the outer edges of a row (e.g. 40px left of column 1) holds for every column.
    pads = [
        max(_int(c["padding"].get("left"), 0), _int(c["padding"].get("right"), 0))
        for c in columns
        if isinstance(c.get("padding"), dict)
    ]
    pad_class = f"stack-pad-{int(max(pads))}" if pads and max(pads) > 0 else ""
    if pad_class:
        ctx.setdefault("stack_pads", set()).add(int(max(pads)))
    cols_html = []
    for i, col in enumerate(columns):
        left = gap // 2 if i > 0 else 0
        right = gap - gap // 2 if i < count - 1 else 0
        outer = widths[i] + left + right
        attr, css, inner = content(col, widths[i], pad_class)
        mso_start = (
            f'<!--[if mso]><td width="{outer}" valign="{v_align}"><![endif]-->'
            if i
            else f'<!--[if mso]><table role="presentation" width="{ctx["content_width"]}" cellpadding="0" '
            f'cellspacing="0" border="0"><tr><td width="{outer}" valign="{v_align}"><![endif]-->'
        )
        mso_end = "<!--[if mso]></td><![endif]-->" if i < count - 1 else "<!--[if mso]></td></tr></table><![endif]-->"
        gutter_class = f"stack-gap-{gap}" if i else "stack-gutter"
        cols_html.append(f"""{mso_start}<div class="stack-column" style="display: inline-block; width: 100%; max-width: {outer}px; vertical-align: {v_align}; font-size: {ctx["default_font_size"]}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="{gutter_class}" style="padding: 0 {right}px 0 {left}px;" valign="top">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td{attr} style="{css}" valign="top">{inner}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </div>{mso_end}""")

    # font-size: 0 removes the whitespace gap between the inline-block columns.
    return f"""<tr>
  <td valign="{v_align}" style="font-size: 0; padding: {_padding_str(style.get("padding", {}))};{height_style}{outer_bg}">{"".join(cols_html)}</td>
</tr>"""


SOCIAL_NETWORKS = ("instagram", "youtube", "tiktok", "facebook", "x", "linkedin")
_SOCIAL_ALIASES = {"twitter": "x"}
_SOCIAL_NAMES = {
    "instagram": "Instagram",
    "youtube": "YouTube",
    "tiktok": "TikTok",
    "facebook": "Facebook",
    "x": "X",
    "linkedin": "LinkedIn",
}


def social_icon_url(kit, network, variant="color"):
    """A hosted PNG of the network's icon (colour, dark or light), on the site the email comes from:
    Gmail and Outlook show neither SVG nor data: images."""
    return f"{kit.get('site', '')}{static(f'email/social/{network}-{variant}.png')}"


def _social_row(kit, platforms, *, size, spacing, variant, align):
    cells = []
    for network, url in platforms:
        network = _SOCIAL_ALIASES.get(network, network)
        if network not in SOCIAL_NETWORKS or not url:
            continue
        cells.append(
            f'<td style="padding: 0 {spacing // 2}px;"><a href="{html_module.escape(url)}" target="_blank">'
            f'<img src="{social_icon_url(kit, network, variant)}" alt="{_SOCIAL_NAMES[network]}" width="{size}" '
            f'height="{size}" style="display: block; border: 0;" /></a></td>'
        )
    if not cells:
        return ""
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="{align}">'
        f"<tr>{''.join(cells)}</tr></table>"
    )


def _render_social_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    alignment = _align(style.get("alignment"), "center")
    platforms = [
        (str(p.get("type", "")), p.get("url") or "") for p in data.get("platforms") or [] if isinstance(p, dict)
    ]
    variant = "dark" if style.get("iconStyle") == "monochrome" else "color"
    row = _social_row(
        ctx["kit"],
        platforms,
        size=_int(style.get("iconSize"), 32),
        spacing=_int(style.get("spacing"), 10),
        variant=variant,
        align=alignment,
    )
    if not row:
        return ""
    return f"""<tr>
  <td align="{alignment}" style="padding: {_padding_str(style.get("padding", {}))};{_bg_style(style)}">
    {row}
  </td>
</tr>"""


def _render_heading_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    padding = _padding_str(style.get("padding", {}))
    alignment = _align(style.get("alignment"), "left")
    level = data.get("level") if data.get("level") in (1, 2, 3, 4) else 2
    text = html_module.escape(data.get("text") or "")
    font_size = _int(style.get("fontSize"), 28)
    font_weight = _int(style.get("fontWeight"), 700)
    color = _color(style.get("color"), ctx["default_color"])
    font_family = _font(style.get("fontFamily"), ctx["default_font"])
    letter_spacing = _float(style.get("letterSpacing"))
    text_transform = (
        style.get("textTransform") if style.get("textTransform") in ("uppercase", "lowercase", "capitalize") else ""
    )
    ls_style = f" letter-spacing: {letter_spacing}px;" if letter_spacing else ""
    tt_style = f" text-transform: {text_transform};" if text_transform else ""
    line_height = int(font_size * (_float(style.get("lineHeight")) or 1.2))
    return f"""<tr>
  <td style="padding: {padding}; text-align: {alignment};{_bg_style(style)}">
    <h{level} style="margin: 0; font-family: {font_family}; font-size: {font_size}px; line-height: {line_height}px; color: {color}; font-weight: {font_weight};{ls_style}{tt_style}">
      {text}
    </h{level}>
  </td>
</tr>"""


def _render_spacer_block(block, ctx):
    style = block.get("style") or {}
    height = max(0, _int(style.get("height"), 0))
    return f"""<tr>
  <td style="line-height: 0; font-size: 0; height: {height}px;{_bg_style(style)}">
    &nbsp;
  </td>
</tr>"""


def _render_html_block(block, ctx):
    """Only imported MailCraft templates carry one; brand.clean_design sanitises its HTML on the way in."""
    data = block.get("data") or {}
    style = block.get("style") or {}
    return f"""<tr>
  <td style="padding: {_padding_str(style.get("padding", {}))}; text-align: {_align(style.get("alignment"), "left")};{_bg_style(style)}">
    {data.get("html", "")}
  </td>
</tr>"""


def _padding_str(padding):
    if not padding:
        return "0"
    if isinstance(padding, int | float):
        return f"{int(padding)}px"
    if not isinstance(padding, dict):
        return "0"
    top, right, bottom, left = (_int(padding.get(k), 0) for k in ("top", "right", "bottom", "left"))
    return f"{top}px {right}px {bottom}px {left}px"


def _icon_cell(size, radius, bg, inner, font_size=None):
    font = f" font-size: {font_size}px; line-height: {size}px;" if font_size else ""
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 12px;">'
        f'<tr><td style="width: {size}px; height: {size}px; border-radius: {radius}%; background-color: {bg}; '
        f'text-align: center; vertical-align: middle;{font}">{inner}</td></tr></table>'
    )


def _render_card_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    default_font = ctx["default_font"]
    bg = _color(style.get("backgroundColor"), "#ffffff")
    radius = _int(style.get("borderRadius"), 12)
    border_w = _int(style.get("borderWidth"), 1)
    border_c = _color(style.get("borderColor"), "#e2e8f0")
    border_s = style.get("borderStyle") if style.get("borderStyle") in ("solid", "dashed", "dotted") else "solid"
    align = _align(style.get("contentAlignment"), "center")
    padding = _padding_str(style.get("padding", {}))
    heading_color = _color(style.get("headingColor"), "#0f172a")
    heading_size = _int(style.get("headingFontSize"), 22)
    heading_font = _font(style.get("headingFontFamily"), default_font)
    heading_weight = _int(style.get("headingFontWeight"), 700)
    body_color = _color(style.get("bodyColor"), "#475569")
    body_size = _int(style.get("bodyFontSize"), 15)
    body_font = _font(style.get("bodyFontFamily"), default_font)
    heading = html_module.escape(data.get("heading") or "")
    body_text = html_module.escape(data.get("body") or "")

    icon_html = ""
    if data.get("showIcon"):
        icon_size = _int(style.get("iconSize"), 48)
        icon_radius = _int(style.get("iconBorderRadius"), 50)
        icon_bg = _color(style.get("iconBackgroundColor"), "#eef2ff")
        if data.get("iconMode") == "image" and data.get("iconImageSrc"):
            src = html_module.escape(data["iconImageSrc"])
            alt = html_module.escape(data.get("iconImageAlt") or "")
            icon_html = (
                f'<img src="{src}" alt="{alt}" width="{icon_size}" height="{icon_size}" '
                f'style="border-radius: {icon_radius}%; display: block; margin: 0 auto 12px;" />'
            )
        else:  # emoji; a lucide icon (an SVG no inbox shows) falls back to its emoji too
            emoji = html_module.escape(data.get("iconEmoji") or "✨")
            icon_html = _icon_cell(icon_size, icon_radius, icon_bg, emoji, int(icon_size * 0.55))

    badge_html = ""
    if data.get("showBadge") and data.get("badgeText"):
        badge_html = (
            f'<div style="margin-bottom: 8px;"><span style="display: inline-block; padding: 3px 10px; '
            f"border-radius: 12px; background-color: {_color(style.get('badgeBackgroundColor'), '#eef2ff')}; "
            f"color: {_color(style.get('badgeTextColor'), '#4338ca')}; font-size: 11px; font-weight: 600; "
            f'letter-spacing: 0.5px; text-transform: uppercase; font-family: {default_font};">'
            f"{html_module.escape(data['badgeText'])}</span></div>"
        )

    btn_html = ""
    if data.get("showButton") and data.get("buttonText"):
        btn_bg = _color(style.get("buttonBackgroundColor"), "#4f46e5")
        btn_border_s = (
            style.get("buttonBorderStyle")
            if style.get("buttonBorderStyle") in ("solid", "dashed", "dotted")
            else "solid"
        )
        btn_html = (
            '<div style="margin-top: 16px;">'
            + _button_html(
                html_module.escape(data.get("buttonText") or ""),
                html_module.escape(data.get("buttonUrl") or "#"),
                bg=btn_bg,
                color=_color(style.get("buttonTextColor"), "#ffffff"),
                radius=_int(style.get("buttonBorderRadius"), 6),
                font=_font(style.get("buttonFontFamily"), default_font),
                size=_int(style.get("buttonFontSize"), 14),
                weight=_int(style.get("buttonFontWeight"), 600),
                px=_int(style.get("buttonPaddingX"), 20),
                py=_int(style.get("buttonPaddingY"), 10),
                full=bool(style.get("buttonFullWidth")),
                align=align,
                border=f"{_int(style.get('buttonBorderWidth'), 0)}px {btn_border_s} "
                f"{_color(style.get('buttonBorderColor'), btn_bg)}",
            )
            + "</div>"
        )

    border = f"{border_w}px {border_s} {border_c}" if border_w > 0 and style.get("borderStyle") != "none" else "none"
    line_height = _float(style.get("lineHeight")) or 1.5
    body_html = (
        f'<p style="margin: 0 0 16px; font-family: {body_font}; font-size: {body_size}px; color: {body_color}; '
        f'line-height: {line_height};">{body_text}</p>'
        if body_text
        else ""
    )
    return f"""<tr>
  <td style="padding: 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: {bg}; border-radius: {radius}px; border: {border};">
      <tr>
        <td style="padding: {padding}; text-align: {align};">
          {icon_html}
          {badge_html}
          <h3 style="margin: 0 0 8px; font-family: {heading_font}; font-size: {heading_size}px; font-weight: {heading_weight}; color: {heading_color}; line-height: 1.3;">{heading}</h3>
          {body_html}
          {btn_html}
        </td>
      </tr>
    </table>
  </td>
</tr>"""


def _render_hero_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    bg_img = html_module.escape(data.get("backgroundImage") or "")
    height = _int(style.get("height"), 400)
    overlay_rgba = _hex_to_rgba(_color(style.get("overlayColor"), "#000000"), _float(style.get("overlayOpacity", 0.4)))
    heading_color = _color(style.get("headingColor"), "#ffffff")
    heading_size = _int(style.get("headingFontSize"), 32)
    heading_font = _font(style.get("headingFontFamily"), ctx["default_font"])
    sub_color = _color(style.get("subheadingColor"), "#ffffffcc")
    btn_bg = _color(style.get("buttonBackgroundColor"), "#ffffff")
    btn_color = _color(style.get("buttonTextColor"), "#000000")
    btn_radius = _int(style.get("buttonBorderRadius"), 50)
    align = _align(style.get("contentAlignment"), "center")
    v_align = style.get("verticalAlignment", "bottom")
    valign_attr = "top" if v_align == "top" else ("middle" if v_align == "center" else "bottom")
    grad_dir = "to bottom" if v_align == "top" else "to top"
    heading = html_module.escape(data.get("heading") or "")
    sub = html_module.escape(data.get("subheading") or "")
    btn_text = html_module.escape(data.get("buttonText") or "")
    btn_url = html_module.escape(data.get("buttonUrl") or "#")
    content_width = ctx["content_width"]
    default_font = ctx["default_font"]
    line_height = _float(style.get("lineHeight")) or 1.5
    sub_html = (
        f'<p style="margin: 0 0 20px; font-family: {default_font}; font-size: {ctx["default_font_size"]}px; '
        f'color: {sub_color}; line-height: {line_height};">{sub}</p>'
        if sub
        else ""
    )
    btn_html = (
        _button_html(
            btn_text,
            btn_url,
            bg=btn_bg,
            color=btn_color,
            radius=btn_radius,
            font=default_font,
            size=15,
            weight=600,
            px=32,
            py=14,
            full=False,
            align=align,
        )
        if btn_text
        else ""
    )
    heading_line = int(heading_size * (_float(style.get("lineHeight")) or 1.15))
    return f"""<tr>
  <td background="{bg_img}" width="{content_width}" height="{height}" valign="{valign_attr}"
      style="background-image: url('{bg_img}'); background-color: #333333; background-size: cover; background-position: center; height: {height}px;">
    <!--[if gte mso 9]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:{content_width}px;height:{height}px;">
      <v:fill type="tile" src="{bg_img}" />
      <v:textbox inset="0,0,0,0">
    <![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height: {height}px;">
      <tr>
        <td style="background: linear-gradient({grad_dir}, {overlay_rgba} 60%, transparent 100%); padding: 32px; text-align: {align};" valign="{valign_attr}">
          <h1 style="margin: 0 0 8px; font-family: {heading_font}; font-size: {heading_size}px; line-height: {heading_line}px; color: {heading_color}; font-weight: 700;">{heading}</h1>
          {sub_html}
          {btn_html}
        </td>
      </tr>
    </table>
    <!--[if gte mso 9]>
      </v:textbox>
    </v:rect>
    <![endif]-->
  </td>
</tr>"""


def _hex_to_rgba(hex_color, opacity):
    h = str(hex_color).lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    h = (h + "000000")[:6]
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        r = g = b = 0
    return f"rgba({r}, {g}, {b}, {max(0.0, min(1.0, opacity))})"


_GOOGLE_FONT_SLUGS = {
    "Noto Serif": "Noto+Serif:wght@400;700",
    "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@300;400;500;600;700",
    "Be Vietnam Pro": "Be+Vietnam+Pro:wght@300;400;500;600;700",
    "Inter": "Inter:wght@300;400;500;600;700",
    "Playfair Display": "Playfair+Display:wght@400;700",
    "Lora": "Lora:wght@400;700",
    "Montserrat": "Montserrat:wght@300;400;500;600;700",
    "Open Sans": "Open+Sans:wght@300;400;600;700",
    "Raleway": "Raleway:wght@300;400;500;600;700",
    "Poppins": "Poppins:wght@300;400;500;600;700",
    "Roboto": "Roboto:wght@300;400;500;700",
    "DM Sans": "DM+Sans:wght@400;500;600;700",
    "Source Serif 4": "Source+Serif+4:wght@400;600;700",
    "Merriweather": "Merriweather:wght@400;700",
    "Archivo": "Archivo:wght@400;500;600;700;800",
    "Alfa Slab One": "Alfa+Slab+One",
    "Barlow Condensed": "Barlow+Condensed:wght@400;500;600;700",
    "Big Shoulders Stencil": "Big+Shoulders+Stencil:wght@700;800",
    "Bungee": "Bungee",
    "Courier Prime": "Courier+Prime:wght@400;700",
    "EB Garamond": "EB+Garamond:ital,wght@0,400;0,600;1,400",
    "Overpass": "Overpass:wght@400;600;700;800",
    "Press Start 2P": "Press+Start+2P",
    "Silkscreen": "Silkscreen:wght@400;700",
    "Fraunces": "Fraunces:wght@400;600;700",
    "Cormorant": "Cormorant:wght@400;600;700",
    "Newsreader": "Newsreader:wght@400;500",
    "Young Serif": "Young+Serif",
    "Instrument Serif": "Instrument+Serif",
    "Literata": "Literata:wght@400;600;700",
    "Spectral": "Spectral:wght@400;600;700",
    "Alegreya": "Alegreya:wght@400;700",
    "Zilla Slab": "Zilla+Slab:wght@400;600;700",
    "Manrope": "Manrope:wght@400;600;700",
    "Outfit": "Outfit:wght@400;600;700",
    "Space Grotesk": "Space+Grotesk:wght@400;600;700",
}


_FONT_DECL = re.compile(r"font-family\s*:\s*([^;\"]+)", re.IGNORECASE)


def _collect_google_font_links(design):
    """Link every Google font the design names (Apple Mail and some others use it; the rest fall back
    to the stack): any *fontFamily / defaultFont value, plus font-family inside rich-text HTML."""
    fonts = []

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, str) and (k.lower().endswith("fontfamily") or k == "defaultFont"):
                    fonts.append(v)
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, str) and "font-family" in node.lower():
            fonts.extend(_FONT_DECL.findall(node))

    walk(design)
    names = {name for ff in fonts for name in _GOOGLE_FONT_SLUGS if name in ff}
    if not names:
        return ""
    families = "&family=".join(_GOOGLE_FONT_SLUGS[n] for n in sorted(names))
    return f'<link href="https://fonts.googleapis.com/css2?family={families}&display=swap" rel="stylesheet">'


def _render_list_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    default_font = ctx["default_font"]
    items = [i for i in data.get("items") or [] if isinstance(i, dict)]
    if not items:
        return ""
    padding = _padding_str(style.get("padding", {}))
    bg = _color(style.get("backgroundColor"), "transparent") if style.get("backgroundColor") else "transparent"
    align = _align(style.get("contentAlignment"), "left")
    icon_size = _int(style.get("iconSize"), 20)
    icon_color = _color(style.get("iconColor"), "#4f46e5")
    txt_color = _color(style.get("textColor"), "#0f172a")
    txt_size = _int(style.get("textFontSize"), 15)
    txt_font = _font(style.get("textFontFamily"), default_font)
    txt_weight = _int(style.get("textFontWeight"), 500)
    sub_color = _color(style.get("subtitleColor"), "#64748b")
    sub_size = _int(style.get("subtitleFontSize"), 13)
    gap = _int(style.get("spacing"), 12)
    is_horiz = style.get("layout") == "horizontal"

    def render_item(item):
        text = html_module.escape(item.get("text") or "")
        subtitle = item.get("subtitle") or ""
        sub_html = (
            f'<div style="color: {sub_color}; font-size: {sub_size}px; font-family: {txt_font}; '
            f'line-height: 1.4; margin-top: 2px;">{html_module.escape(subtitle)}</div>'
            if subtitle
            else ""
        )
        v_align = "top" if subtitle else "middle"
        pad_top = "2px" if subtitle else "0"
        # A lucide icon (an SVG no inbox shows) falls back to the item's text icon.
        icon = html_module.escape(item.get("icon") or "•")
        icon_cell = (
            f'<td style="width: {icon_size + 4}px; text-align: center; vertical-align: {v_align}; '
            f'font-size: {icon_size}px; color: {icon_color}; line-height: 1; padding-top: {pad_top};">{icon}</td>'
        )
        return (
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>{icon_cell}'
            f'<td style="padding-left: 10px; vertical-align: top;">'
            f'<span style="color: {txt_color}; font-size: {txt_size}px; font-family: {txt_font}; '
            f'font-weight: {txt_weight}; line-height: 1.4;">{text}</span>{sub_html}</td></tr></table>'
        )

    if is_horiz:
        cells = "".join(
            f'<td style="padding: 0 {gap // 2}px 0 0; vertical-align: top;">{render_item(item)}</td>' for item in items
        )
        table_content, width_attr, align_attr = f"<tr>{cells}</tr>", "", f' align="{align}"'
    else:
        table_content = "".join(
            f'<tr><td style="padding-bottom: {gap}px;">{render_item(item)}</td></tr>' for item in items
        )
        width_attr, align_attr = ' width="100%"', ""
    return f"""<tr>
  <td style="padding: {padding}; background-color: {bg}; text-align: {align};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"{width_attr}{align_attr}>
      {table_content}
    </table>
  </td>
</tr>"""


def _render_profile_block(block, ctx):
    data = block.get("data") or {}
    style = block.get("style") or {}
    default_font = ctx["default_font"]
    padding = _padding_str(style.get("padding", {}))
    bg = _color(style.get("backgroundColor"), "#ffffff")
    radius = _int(style.get("borderRadius"), 12)
    border_w = _int(style.get("borderWidth"), 1)
    border_s = style.get("borderStyle") if style.get("borderStyle") in ("solid", "dashed", "dotted") else "solid"
    border = (
        f"{border_w}px {border_s} {_color(style.get('borderColor'), '#e2e8f0')}"
        if border_w > 0 and style.get("borderStyle") != "none"
        else "none"
    )
    img_size = _int(style.get("imageSize"), 72)
    img_radius = _int(style.get("imageBorderRadius"), 50)
    img_pos = style.get("imagePosition") if style.get("imagePosition") in ("left", "right", "top") else "left"
    align = _align(style.get("contentAlignment"), "left")
    name_color = _color(style.get("nameColor"), "#0f172a")
    name_size = _int(style.get("nameFontSize"), 18)
    name_font = _font(style.get("nameFontFamily"), default_font)
    name_weight = _int(style.get("nameFontWeight"), 700)
    role_color = _color(style.get("roleColor"), "#6366f1")
    role_size = _int(style.get("roleFontSize"), 13)
    bio_color = _color(style.get("bioColor"), "#64748b")
    bio_size = _int(style.get("bioFontSize"), 14)
    bio_font = _font(style.get("bioFontFamily"), default_font)
    img_src = html_module.escape(data.get("imageSrc") or "")
    img_alt = html_module.escape(data.get("imageAlt") or "")
    name = html_module.escape(data.get("name") or "")
    role_text = html_module.escape(data.get("role") or "")
    bio_text = html_module.escape(data.get("bio") or "")

    badge_html = ""
    if data.get("showBadge") and data.get("badgeText"):
        badge_html = (
            f'<div style="margin-bottom: 4px;"><span style="display: inline-block; padding: 2px 8px; '
            f"border-radius: 10px; background-color: {_color(style.get('badgeBackgroundColor'), '#eef2ff')}; "
            f"color: {_color(style.get('badgeTextColor'), '#4338ca')}; font-size: 10px; font-weight: 600; "
            f'letter-spacing: 0.5px; text-transform: uppercase; font-family: {default_font};">'
            f"{html_module.escape(data['badgeText'])}</span></div>"
        )
    img_html = (
        f'<img src="{img_src}" alt="{img_alt}" width="{img_size}" height="{img_size}" '
        f'style="border-radius: {img_radius}%; display: block;" />'
        if img_src
        else ""
    )
    role_html = (
        f'<div style="color: {role_color}; font-size: {role_size}px; font-family: {bio_font}; '
        f'font-weight: 600; line-height: 1.3; margin-top: 2px;">{role_text}</div>'
        if role_text
        else ""
    )
    line_height = _float(style.get("lineHeight")) or 1.5
    bio_html = (
        f'<div style="color: {bio_color}; font-size: {bio_size}px; font-family: {bio_font}; '
        f'line-height: {line_height}; margin-top: 6px;">{bio_text}</div>'
        if bio_text
        else ""
    )
    name_html = (
        f'<div style="color: {name_color}; font-size: {name_size}px; font-family: {name_font}; '
        f'font-weight: {name_weight}; line-height: 1.3;">{name}</div>'
    )
    if img_pos == "top":
        img_block = f'<div style="margin: 0 auto 12px; width: {img_size}px;">{img_html}</div>' if img_html else ""
        inner = f'<td style="text-align: {align};">{img_block}{badge_html}{name_html}{role_html}{bio_html}</td>'
    else:
        img_td = f'<td style="width: {img_size}px; vertical-align: top;">{img_html}</td>' if img_html else ""
        pad = "padding-left: 16px; " if img_html and img_pos == "left" else ""
        pad += "padding-right: 16px; " if img_html and img_pos == "right" else ""
        text_td = (
            f'<td style="vertical-align: top; {pad}text-align: left;">{badge_html}{name_html}{role_html}{bio_html}</td>'
        )
        inner = f"{text_td}{img_td}" if img_pos == "right" else f"{img_td}{text_td}"
    width_attr = "" if img_pos == "top" else ' width="100%"'
    return f"""<tr>
  <td style="padding: 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: {bg}; border-radius: {radius}px; border: {border};">
      <tr>
        <td style="padding: {padding};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"{width_attr}>
            <tr>{inner}</tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>"""


# ── Contentor's blocks: her brand and her content ───────────────────────────────────────────────


def _render_brand_header(block, ctx):
    """Her logo and/or name, from the brand kit at send time (a new logo reaches every email)."""
    kit = ctx["kit"]
    data = block.get("data") or {}
    style = block.get("style") or {}
    variant = data.get("variant") if data.get("variant") in ("logo", "logoName", "name", "mark") else "logo"
    align = _align(style.get("alignment"), "center")
    color = _color(style.get("color"), ctx["default_color"])
    height = max(16, min(160, _int(style.get("logoHeight"), 48)))
    name = html_module.escape(kit.get("name") or "")
    site = html_module.escape(kit.get("site") or "")
    logo = kit.get("logo") or ""
    if variant == "mark" or not logo:
        logo = kit.get("mark") or ""
    font = _font(kit.get("fonts", {}).get("heading"), ctx["default_font"])
    name_html = (
        f'<span style="font-family: {font}; font-size: {max(18, round(height * 0.5))}px; font-weight: 700; '
        f'color: {color}; text-decoration: none; letter-spacing: 0.2px;">{name}</span>'
    )
    if variant == "name" or not logo:
        inner = name_html
    else:
        # A square mark is drawn at the height; a wide logo keeps its height and scales its width.
        img = (
            f'<img src="{html_module.escape(logo)}" alt="{name}" height="{height}" '
            f'style="display: block; height: {height}px; width: auto; max-width: 320px; border: 0;" />'
        )
        if variant == "logoName":
            inner = (
                f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="{align}"><tr>'
                f'<td style="vertical-align: middle; padding-right: 12px;">{img}</td>'
                f'<td style="vertical-align: middle;">{name_html}</td></tr></table>'
            )
        else:
            inner = (
                f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="{align}">'
                f"<tr><td>{img}</td></tr></table>"
            )
    padding = _padding_str(style.get("padding") or {"top": 28, "right": 32, "bottom": 20, "left": 32})
    return f"""<tr>
  <td align="{align}" style="padding: {padding}; text-align: {align};{_bg_style(style)}">
    <a href="{site}" target="_blank" style="text-decoration: none; color: {color};">{inner}</a>
  </td>
</tr>"""


def _render_brand_footer(block, ctx):
    """Her name and site, her socials, her address, a note, and the unsubscribe link (campaigns)."""
    kit = ctx["kit"]
    data = block.get("data") or {}
    style = block.get("style") or {}
    align = _align(style.get("alignment"), "center")
    color = _color(style.get("color"), "#6b6b6b")
    size = max(10, min(18, _int(style.get("fontSize"), 13)))
    font = ctx["default_font"]
    link_style = f"color: {color}; text-decoration: underline;"
    rows = []
    if data.get("showSocial", True):
        light = _is_dark(style.get("backgroundColor"))
        row = _social_row(
            kit,
            [(s.get("network", ""), s.get("url", "")) for s in kit.get("socials") or []],
            size=26,
            spacing=12,
            variant="light" if light else "dark",
            align=align,
        )
        if row:
            rows.append(f'<tr><td align="{align}" style="padding-bottom: 14px;">{row}</td></tr>')
    name = html_module.escape(kit.get("name") or "")
    site, host = html_module.escape(kit.get("site") or ""), html_module.escape(kit.get("host") or "")
    line = (
        f'<strong>{name}</strong> · <a href="{site}" target="_blank" style="{link_style}">{host}</a>' if site else name
    )
    rows.append(f"<tr><td>{line}</td></tr>")
    address = kit.get("address") or ""
    if data.get("showAddress", True) and address:
        rows.append(f'<tr><td style="padding-top: 4px;">{html_module.escape(address)}</td></tr>')
    note = html_module.escape(data.get("note") or "")
    if note:
        rows.append(f'<tr><td style="padding-top: 8px;">{note}</td></tr>')
    rows.append(
        f'{_UNSUB_START}<tr><td style="padding-top: 8px;"><a href="{{{{UnsubscribeUrl}}}}" target="_blank" '
        f'style="{link_style}">{html_module.escape(_("Unsubscribe"))}</a></td></tr>{_UNSUB_END}'
    )
    padding = _padding_str(style.get("padding") or {"top": 24, "right": 32, "bottom": 32, "left": 32})
    return f"""<tr>
  <td align="{align}" style="padding: {padding};{_bg_style(style)}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="font-family: {font}; font-size: {size}px; line-height: {round(size * 1.5)}px; color: {color}; text-align: {align};">
      {"".join(rows)}
    </table>
  </td>
</tr>"""


def _is_dark(value) -> bool:
    """Whether a background colour is dark enough for light icons on it."""
    if not isinstance(value, str) or not CSS_COLOR_PATTERN.match(value.strip()):
        return False
    h = value.strip().lstrip("#")
    h = "".join(c * 2 for c in h) if len(h) == 3 else h[:6]
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140


def _render_item_block(block, ctx):
    """One of her offers or pages (resolved into data._item by brand.resolve): its picture, title, words,
    price or date, and a button to its page. Nothing when it no longer resolves."""
    data = block.get("data") or {}
    item = data.get("_item")
    if not isinstance(item, dict) or not item.get("title"):
        return ""
    style = block.get("style") or {}
    layout = data.get("layout") if data.get("layout") in ("card", "row", "compact") else "card"
    font = ctx["default_font"]
    heading_font = _font(ctx["kit"].get("fonts", {}).get("heading"), font)
    bg = _color(style.get("backgroundColor"), "#ffffff") if style.get("backgroundColor") else "transparent"
    radius = _int(style.get("borderRadius"), 12)
    title_color = _color(style.get("titleColor"), ctx["default_color"])
    text_color = _color(style.get("textColor"), "#555555")
    btn_bg = _color(style.get("buttonColor"), "#111111")
    btn_color = _color(style.get("buttonTextColor"), "#ffffff")
    url = html_module.escape(item.get("url") or "")
    title = html_module.escape(item["title"])
    summary = html_module.escape(item.get("summary") or "") if data.get("showSummary", True) else ""
    meta = html_module.escape(item.get("meta") or "") if data.get("showMeta", True) else ""
    # A picture of any shape sits in the card as a wide frame, in a row as a square.
    picture = with_aspect(item.get("image") or "", "1:1" if layout == "row" else "16:9")
    image = html_module.escape(picture) if data.get("showImage", True) else ""
    button_text = html_module.escape(data.get("buttonText") or "")
    padding = _padding_str(style.get("padding") or {"top": 12, "right": 32, "bottom": 12, "left": 32})
    width = ctx["content_width"] - sum(_int((style.get("padding") or {}).get(k, 32), 32) for k in ("left", "right"))

    title_html = (
        f'<a href="{url}" target="_blank" style="color: {title_color}; text-decoration: none;">{title}</a>'
        if url
        else title
    )
    meta_html = (
        f'<p style="margin: 0 0 6px; font-family: {font}; font-size: 14px; font-weight: 600; '
        f'color: {text_color};">{meta}</p>'
        if meta
        else ""
    )
    summary_html = (
        f'<p style="margin: 6px 0 0; font-family: {font}; font-size: 15px; line-height: 23px; color: {text_color};">'
        f"{summary}</p>"
        if summary
        else ""
    )
    button_html = (
        '<div style="margin-top: 16px;">'
        + _button_html(
            button_text,
            url,
            bg=btn_bg,
            color=btn_color,
            radius=min(radius, 8),
            font=font,
            size=15,
            weight=600,
            px=22,
            py=11,
            full=False,
            align="left",
        )
        + "</div>"
        if button_text and url
        else ""
    )
    if layout == "compact":
        linked = (
            f'<a href="{url}" target="_blank" style="color: {title_color}; text-decoration: underline;">{title}</a>'
            if url
            else title
        )
        return f"""<tr>
  <td style="padding: {padding};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: {bg}; border-radius: {radius}px;">
      <tr><td style="padding: {"12px 16px" if bg != "transparent" else "4px 0"};">
        <h3 style="margin: 0 0 4px; font-family: {heading_font}; font-size: 18px; line-height: 24px; color: {title_color};">{linked}</h3>
        {meta_html}
      </td></tr>
    </table>
  </td>
</tr>"""
    text_cell = (
        f'{meta_html}<h3 style="margin: 0; font-family: {heading_font}; font-size: 21px; line-height: 27px; '
        f'color: {title_color}; font-weight: 700;">{title_html}</h3>{summary_html}{button_html}'
    )
    if layout == "row" and image:
        thumb = min(180, width // 3)
        img = (
            f'<a href="{url}" target="_blank"><img src="{image}" alt="{title}" width="{thumb}" '
            f'style="display: block; width: 100%; max-width: {thumb}px; height: auto; border: 0; border-radius: {min(radius, 16)}px;" /></a>'
        )
        body = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td width="{thumb}" valign="top" style="width: {thumb}px; padding-right: 18px;">{img}</td>'
            f'<td valign="top">{text_cell}</td></tr></table>'
        )
        inner_pad = "16px" if bg != "transparent" else "0"
    else:
        img = (
            f'<a href="{url}" target="_blank"><img src="{image}" alt="{title}" width="{width}" '
            f'style="display: block; width: 100%; max-width: {width}px; height: auto; border: 0; '
            f'border-radius: {radius}px {radius}px 0 0;" /></a>'
            if image
            else ""
        )
        text_pad = "20px 22px 22px" if bg != "transparent" or image else "0"
        body = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            f'{f"<tr><td>{img}</td></tr>" if img else ""}<tr><td style="padding: {text_pad};">{text_cell}</td></tr></table>'
        )
        inner_pad = "0"
    border = "1px solid #e7e5e4" if bg == "transparent" and layout == "card" and image else "none"
    return f"""<tr>
  <td style="padding: {padding};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color: {bg}; border-radius: {radius}px; border: {border}; overflow: hidden;">
      <tr><td style="padding: {inner_pad};">{body}</td></tr>
    </table>
  </td>
</tr>"""


BLOCK_RENDERERS = {
    "text": _render_text_block,
    "image": _render_image_block,
    "button": _render_button_block,
    "divider": _render_divider_block,
    "columns": _render_columns_block,
    "social": _render_social_block,
    "heading": _render_heading_block,
    "spacer": _render_spacer_block,
    "html": _render_html_block,
    "hero": _render_hero_block,
    "card": _render_card_block,
    "list": _render_list_block,
    "profile": _render_profile_block,
    "brandHeader": _render_brand_header,
    "brandFooter": _render_brand_footer,
    "item": _render_item_block,
}
