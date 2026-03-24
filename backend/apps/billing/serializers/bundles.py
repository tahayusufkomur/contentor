from dataclasses import asdict
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from apps.billing.models import Bundle, BundleItem
from apps.core.access import AccessInfo, ContentAccessService


class BundleItemSerializer(serializers.ModelSerializer):
    content_type_name = serializers.SerializerMethodField()

    class Meta:
        model = BundleItem
        fields = ["id", "content_type", "object_id", "content_type_name"]
        read_only_fields = ["id"]

    def get_content_type_name(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"


class BundleItemWriteSerializer(serializers.Serializer):
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


class BundleListSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()

    class Meta:
        model = Bundle
        fields = [
            "id",
            "name",
            "description",
            "price",
            "currency",
            "thumbnail_url",
            "is_active",
            "item_count",
            "access_info",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_item_count(self, obj):
        return obj.items.count()

    def get_access_info(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return asdict(
                AccessInfo(
                    has_access=False,
                    pricing_type="paid",
                    price=obj.price,
                    currency=obj.currency,
                    unlock_methods=["purchase"],
                )
            )
        service = ContentAccessService()
        info = service.get_access_info(request.user, obj)
        return asdict(info)


class BundleDetailSerializer(BundleListSerializer):
    items = BundleItemSerializer(many=True, read_only=True)
    original_price = serializers.SerializerMethodField()

    class Meta(BundleListSerializer.Meta):
        fields = BundleListSerializer.Meta.fields + ["items", "original_price"]

    def get_original_price(self, obj):
        total = Decimal("0.00")
        for item in obj.items.all():
            content_obj = item.content_object
            if content_obj is not None:
                price = getattr(content_obj, "price", None)
                if price is not None:
                    total += Decimal(str(price))
        return total


class BundleCreateSerializer(serializers.ModelSerializer):
    items = BundleItemWriteSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Bundle
        fields = [
            "name",
            "description",
            "price",
            "currency",
            "thumbnail_url",
            "is_active",
            "items",
        ]

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        bundle = Bundle.objects.create(**validated_data)
        self._save_items(bundle, items_data)
        return bundle

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            self._save_items(instance, items_data)
        return instance

    def _save_items(self, bundle, items_data):
        item_serializer = BundleItemWriteSerializer()
        for item_data in items_data:
            ct = item_serializer.resolve_content_type(item_data["content_type"])
            BundleItem.objects.get_or_create(
                bundle=bundle,
                content_type=ct,
                object_id=item_data["object_id"],
            )
