from django.core.cache import cache
from django.db import connection
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import TenantConfig
from .serializers import TenantConfigSerializer


class TenantConfigView(RetrieveUpdateAPIView):
    serializer_class = TenantConfigSerializer

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_object(self):
        cache_key = f"tenant:{connection.tenant.schema_name}:config"
        config = cache.get(cache_key)
        if config is None:
            config = TenantConfig.objects.first()
            if config:
                cache.set(cache_key, config, timeout=300)
        return config

    def perform_update(self, serializer):
        serializer.save()
        cache_key = f"tenant:{connection.tenant.schema_name}:config"
        cache.delete(cache_key)
