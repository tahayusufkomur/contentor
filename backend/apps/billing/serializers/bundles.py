from dataclasses import asdict
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from apps.billing.models import Bundle, BundleItem
from apps.billing.ways import ShorthandMixin
from apps.core.access import AccessInfo, ContentAccessService
from apps.core.permissions import is_coach_or_owner


def is_draft(obj) -> bool:
    """A course or download not published yet, or a class held in draft (G4): students never see it listed."""
    return getattr(obj, "is_published", True) is False or getattr(obj, "status", "") == "draft"


def listed_items(bundle, *, drafts: bool) -> list:
    """The bundle's items as the viewer sees them: a draft only with ``drafts`` (her own view)."""
    return [i for i in bundle.items.all() if drafts or not is_draft(i.content_object)]


def original_price(items) -> Decimal:
    """What the items cost bought apart."""
    total = Decimal("0.00")
    for item in items:
        content_obj = item.content_object
        if content_obj is not None:
            price = getattr(content_obj, "price", None)
            # Free keeps a covered price on the item; it is not part of what the bundle saves.
            if price is not None and getattr(content_obj, "pricing_type", "paid") == "paid":
                total += Decimal(str(price))
    return total


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
        "onsite_event": "live.onsiteevent",
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
            "is_published",
            "item_count",
            "access_info",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _drafts(self) -> bool:
        request = self.context.get("request")
        return bool(request and is_coach_or_owner(request.user))

    def get_item_count(self, obj):
        return len(listed_items(obj, drafts=self._drafts()))

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

    def to_representation(self, obj):
        data = super().to_representation(obj)
        listed = {i.pk for i in listed_items(obj, drafts=self._drafts())}
        data["items"] = [i for i in data["items"] if i["id"] in listed]
        return data

    def get_original_price(self, obj):
        return original_price(listed_items(obj, drafts=self._drafts()))


class BundleCreateSerializer(ShorthandMixin, serializers.ModelSerializer):
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
            "is_published",
            "items",
        ]
        # Always the tenant's charge currency (the model default) — never client-chosen.
        read_only_fields = ["currency"]

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
