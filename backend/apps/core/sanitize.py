"""Shared sanitization helpers for untrusted rich text and CSS.

The trust boundary for coach/student-authored content. Any HTML that will be
rendered back to a browser (blog bodies, lesson content) MUST pass through
``clean_rich_html``; any value injected into a ``<style>`` tag MUST pass through
``clean_css``. Both are idempotent, so re-cleaning already-clean values is safe.
"""

import re

# Rich-text HTML allowlist — formatting, links, images, tables. Deliberately
# excludes script/style/iframe/object/embed/form and all event handlers.
_RICH_HTML_TAGS = {
    "p",
    "br",
    "hr",
    "span",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "strike",
    "sub",
    "sup",
    "mark",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "img",
    "code",
    "pre",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}
_RICH_HTML_ATTRS = {
    # nh3 manages "rel" on links itself (adds noopener/noreferrer), so it must
    # not appear here.
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}

# CSS constructs that enable script execution or a <style> breakout.
_CSS_DANGER = re.compile(
    r"(?i)(javascript:|expression\s*\(|@import\b|behavior\s*:|-moz-binding|url\s*\(\s*['\"]?\s*javascript:)"
)


def clean_rich_html(value):
    """Clamp untrusted HTML to the safe rich-text allowlist.

    nh3 strips scripts, event handlers, and unsafe URL schemes (keeps
    http/https/mailto on href/src). Non-string input -> ``""``; empty passes
    through unchanged.
    """
    if not isinstance(value, str):
        return ""
    if not value:
        return value
    import nh3

    return nh3.clean(value, tags=_RICH_HTML_TAGS, attributes=_RICH_HTML_ATTRS)


def clean_css(value):
    """Neutralize a user-supplied CSS blob before it is injected into a
    ``<style>`` tag.

    Removes ``<``/``>`` (which is the ``</style><script>`` breakout vector) and
    strips active-content constructs (``javascript:``, ``expression()``,
    ``@import``, ``behavior:``, ``-moz-binding``). Non-string -> ``""``.
    """
    if not isinstance(value, str):
        return ""
    if not value:
        return value
    cleaned = value.replace("<", "").replace(">", "")
    return _CSS_DANGER.sub("", cleaned)
