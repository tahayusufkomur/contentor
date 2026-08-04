from django.urls import path

from . import wizard_views

urlpatterns = [
    path("search/", wizard_views.wizard_domain_search, name="wizard-domain-search"),
    path("checkout/", wizard_views.wizard_domain_checkout, name="wizard-domain-checkout"),
    path("sync/", wizard_views.wizard_domain_sync, name="wizard-domain-sync"),
]
