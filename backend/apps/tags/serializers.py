from rest_framework import serializers

from .models import Tag


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "slug", "scope"]
        read_only_fields = ["id", "slug"]


def tag_ids_field(scope):
    """A write-only M2M field that only accepts tags of ``scope``.

    Used as ``tag_ids`` on each content type's create/update serializer so a
    tag from another pool (e.g. a "video" tag on a course) is rejected with a
    "does not exist" validation error — this is the scope enforcement."""
    return serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Tag.objects.filter(scope=scope),
        source="tags",
        required=False,
    )
