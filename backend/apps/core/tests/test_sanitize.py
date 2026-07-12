"""Regression tests for the shared XSS/CSS sanitizers (audit P0-B)."""

from apps.core.sanitize import clean_css, clean_rich_html


class TestCleanRichHtml:
    def test_strips_script_tag(self):
        assert "<script" not in clean_rich_html("<p>hi</p><script>alert(1)</script>")

    def test_strips_event_handler(self):
        out = clean_rich_html('<img src="x" onerror="alert(1)">')
        assert "onerror" not in out

    def test_strips_javascript_href(self):
        out = clean_rich_html('<a href="javascript:alert(1)">x</a>')
        assert "javascript:" not in out

    def test_keeps_safe_formatting_and_images(self):
        out = clean_rich_html('<h2>T</h2><img src="https://x/y.png" alt="a"><a href="https://x">l</a>')
        assert "<h2>" in out
        assert 'src="https://x/y.png"' in out
        assert 'href="https://x"' in out

    def test_non_string_becomes_empty(self):
        assert clean_rich_html(None) == ""

    def test_empty_passthrough(self):
        assert clean_rich_html("") == ""

    def test_idempotent(self):
        once = clean_rich_html("<p>hi</p><script>x</script>")
        assert clean_rich_html(once) == once


class TestCleanCss:
    def test_removes_style_breakout_chars(self):
        out = clean_css("body{}</style><script>alert(1)</script>")
        assert "<" not in out and ">" not in out

    def test_strips_expression(self):
        assert "expression(" not in clean_css("a{width:expression(alert(1))}")

    def test_strips_import(self):
        assert "@import" not in clean_css("@import url(evil.css); a{color:red}")

    def test_strips_javascript_url(self):
        assert "javascript:" not in clean_css("a{background:url(javascript:alert(1))}")

    def test_keeps_plain_css(self):
        css = "body { background: #fff; color: red; }"
        assert clean_css(css) == css

    def test_non_string_becomes_empty(self):
        assert clean_css(None) == ""
