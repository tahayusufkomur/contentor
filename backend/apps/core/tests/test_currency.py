from apps.core.currency import currency_for_country


def test_currency_for_country():
    assert currency_for_country("DE") == "EUR"
    assert currency_for_country("fr") == "EUR"
    assert currency_for_country("US") == "USD"
    assert currency_for_country("TR") == "USD"
    assert currency_for_country(None) == "USD"
    assert currency_for_country("") == "USD"
