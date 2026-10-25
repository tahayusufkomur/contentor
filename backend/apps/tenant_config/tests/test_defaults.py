from apps.tenant_config.defaults import header_cta


def test_header_cta_names_the_offer():
    assert header_cta(["/courses", "/events"]) == {"text": "Start a course", "href": "/courses"}
    assert header_cta(["/events", "/about"]) == {"text": "Book a session", "href": "/events"}
    assert header_cta(["/about"]) == {"text": "Get in touch", "href": "/contact"}
    # A coach with no courses and no events still gets a button that leads somewhere.
    assert header_cta([]) == {"text": "Get in touch", "href": "/contact"}
