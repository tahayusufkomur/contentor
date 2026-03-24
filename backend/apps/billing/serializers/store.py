from rest_framework import serializers


class StoreItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField(allow_blank=True, default="")
    type = serializers.CharField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField(default="TRY")
    thumbnail_url = serializers.CharField(allow_blank=True, default="")
    is_active = serializers.BooleanField(default=True)
    item_count = serializers.IntegerField(default=0)
    original_price = serializers.DecimalField(max_digits=10, decimal_places=2, default=None, allow_null=True)
    access_info = serializers.DictField()
    sales_count = serializers.IntegerField(default=None, allow_null=True, required=False)
