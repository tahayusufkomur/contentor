from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework import serializers

from apps.billing.models import SubscriptionPlan


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


class PlanWriteSerializer(serializers.ModelSerializer):
    """What the coach sets on a membership. The currency is the tenant's."""

    class Meta:
        model = SubscriptionPlan
        fields = ["name", "description", "price", "billing_interval_months", "is_active"]

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("A membership needs a price above zero.")
        return value

    def update(self, instance, validated_data):
        """Off sale to on sale only as focus mode's finish would (what members get, a price, selling
        open); refused, nothing in the request is saved. A plan on sale already is left as it is."""
        selling = validated_data.get("is_active") is True and not instance.is_active
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if selling and (why := instance.refusal()):
                raise serializers.ValidationError({"is_active": [why]})
        return instance
