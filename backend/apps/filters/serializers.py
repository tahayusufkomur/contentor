from rest_framework import serializers

from .models import FilterGroup, FilterOption


class FilterOptionSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    group_slug = serializers.SlugField(source="group.slug", read_only=True)

    class Meta:
        model = FilterOption
        fields = ["id", "name", "slug", "order", "group", "group_name", "group_slug"]
        read_only_fields = ["id", "slug", "group_name", "group_slug"]


class FilterGroupSerializer(serializers.ModelSerializer):
    options = FilterOptionSerializer(many=True, read_only=True)

    class Meta:
        model = FilterGroup
        fields = ["id", "name", "slug", "applies_to", "order", "options"]
        read_only_fields = ["id", "slug"]
