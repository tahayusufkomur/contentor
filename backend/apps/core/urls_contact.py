from django.urls import path

from apps.core.views_contact import contact_submit

urlpatterns = [
    path("", contact_submit, name="contact-submit"),
]
