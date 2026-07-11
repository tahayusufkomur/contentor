"""Deterministic markdown->sanitized-HTML rendering. No AI, no network."""

from apps.blog.ai import _BLOG_ATTRS, _BLOG_TAGS, _Section, render_body


def test_render_sections_to_headed_html():
    html = render_body(
        [
            _Section(heading="Why it matters", body_markdown="Strong start.\n\n- one\n- two"),
            _Section(heading="", body_markdown="Closing *thought*."),
        ]
    )
    assert "<h2>Why it matters</h2>" in html
    assert "<li>one</li>" in html
    assert "<em>thought</em>" in html
    assert "<h2></h2>" not in html  # empty headings dropped


def test_render_strips_dangerous_html():
    html = render_body(
        [
            _Section(
                heading="<script>alert(1)</script>Hi",
                body_markdown='<img src=x onerror=alert(1)> ok\n\n<a href="javascript:x()">l</a>',
            )
        ]
    )
    assert "<script" not in html and "onerror" not in html and "javascript:" not in html


def test_render_is_deterministic():
    sections = [_Section(heading="A", body_markdown="**b** and [l](https://x.com)")]
    assert render_body(sections) == render_body(sections)
    assert '<a href="https://x.com"' in render_body(sections)


def test_sanitizer_allowlist_is_unchanged():
    """Regression guard, not a design assertion: this pins the nh3 allow-list
    so nobody widens the model-content trust boundary (e.g. adding "img")
    without noticing. Images must only ever be inserted server-side by
    splice_image_placements — never through render_body's markdown/AI
    pipeline. If you're intentionally changing the allow-list, update this
    test AND re-read render_body's docstring claim that this is the trust
    boundary for model-generated content."""
    assert _BLOG_TAGS == {"p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "h2", "h3", "blockquote", "a"}
    assert _BLOG_ATTRS == {"a": {"href"}}
