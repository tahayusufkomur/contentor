from apps.domains.pricing import compute_price


def test_eur_markup_and_ceil(settings):
    # $9.99 cost, EUR rate 0.92 -> 9.99*0.92 = 9.19 EUR cost -> *1.20 = 11.03 -> ceil to 12.00
    settings.DOMAINS_MARKUP_MULTIPLIER = 1.20
    settings.DOMAINS_FX_RATES = {"USD": 1.0, "EUR": 0.92, "TRY": 32.0}
    price_minor, fx = compute_price(999, "EUR")
    assert price_minor == 1200  # €12.00
    assert fx == 0.92


def test_usd_passthrough_ceil(settings):
    settings.DOMAINS_MARKUP_MULTIPLIER = 1.20
    settings.DOMAINS_FX_RATES = {"USD": 1.0}
    # $9.99 * 1.20 = 11.988 -> ceil to whole unit = $12.00
    price_minor, fx = compute_price(999, "USD")
    assert price_minor == 1200


def test_unknown_currency_falls_back_to_usd_rate(settings):
    settings.DOMAINS_FX_RATES = {"USD": 1.0}
    price_minor, fx = compute_price(999, "GBP")
    assert fx == 1.0
    assert price_minor == 1200
