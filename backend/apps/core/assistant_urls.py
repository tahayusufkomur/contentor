from django.urls import path

from .assistant_views import rate_answer

urlpatterns = [path("rate/", rate_answer, name="ai-rate")]
