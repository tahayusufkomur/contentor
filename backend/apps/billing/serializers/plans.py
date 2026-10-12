from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers


class PlanAccessWriteItemSerializer(serializers.Serializer):
    """One piece of content a plan includes. GET /plans/<id>/access/ returns
    items in this shape (plus title, price and pricing_type, which a PUT
    ignores), so what the page loads is what it saves."""

    CONTENT_TYPE_MAP = {
        "course": "courses.course",
        "download": "downloads.downloadfile",
        "live_class": "live.liveclass",
        "live_stream": "live.livestream",
        "onsite_event": "live.onsiteevent",
    }

    content_type = serializers.ChoiceField(choices=list(CONTENT_TYPE_MAP.keys()))
    object_id = serializers.IntegerField(min_value=1)

    def resolve_content_type(self, type_string: str) -> ContentType:
        app_model = self.CONTENT_TYPE_MAP[type_string]
        app_label, model = app_model.split(".")
        return ContentType.objects.get(app_label=app_label, model=model)


class PlanAccessWriteSerializer(serializers.Serializer):
    items = PlanAccessWriteItemSerializer(many=True)
