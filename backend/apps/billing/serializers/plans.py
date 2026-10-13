from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess


class PlanAccessItemSerializer(serializers.ModelSerializer):
    content_type_name = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPlanAccess
        fields = ["id", "content_type", "object_id", "content_type_name"]
        read_only_fields = ["id"]

    def get_content_type_name(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"


class PlanAccessWriteItemSerializer(serializers.Serializer):
    CONTENT_TYPE_MAP = {
        "course": "courses.course",
        "download": "downloads.downloadfile",
        "live_class": "live.liveclass",
        "live_stream": "live.livestream",
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
