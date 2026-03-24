from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers


class PaymentItemInputSerializer(serializers.Serializer):
    content_type = serializers.CharField()
    object_id = serializers.IntegerField()

    CONTENT_TYPE_MAP = {
        "course": "courses.course",
        "download": "downloads.downloadfile",
        "live_class": "live.liveclass",
        "live_stream": "live.livestream",
        "bundle": "billing.bundle",
    }

    def validate_content_type(self, value):
        if value not in self.CONTENT_TYPE_MAP:
            raise serializers.ValidationError(
                f"Invalid content type. Choose from: {', '.join(self.CONTENT_TYPE_MAP.keys())}"
            )
        return value

    def resolve(self):
        key = self.validated_data["content_type"]
        app_label, model = self.CONTENT_TYPE_MAP[key].split(".")
        ct = ContentType.objects.get(app_label=app_label, model=model)
        model_class = ct.model_class()
        obj = model_class.objects.get(pk=self.validated_data["object_id"])
        return ct, obj


class PaymentInitializeSerializer(serializers.Serializer):
    items = PaymentItemInputSerializer(many=True)
    card_token = serializers.CharField(required=False, allow_blank=True)
    save_card = serializers.BooleanField(required=False, default=False)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value
