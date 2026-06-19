from django.urls import path

from apps.core.contact.views import contact_submit

urlpatterns = [
    path("", contact_submit, name="contact-submit"),
]
