from django.urls import path

from apps.core.copilot import views

urlpatterns = [
    path("converse/", views.copilot_converse, name="copilot-converse"),
    path("execute/", views.copilot_execute, name="copilot-execute"),
    path("audit/", views.copilot_audit, name="copilot-audit"),
    path("undo/", views.copilot_undo, name="copilot-undo"),
]
