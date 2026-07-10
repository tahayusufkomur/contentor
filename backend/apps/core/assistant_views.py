"""Public feedback endpoint shared by all three assistant widgets."""

from django.core import signing
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import assistant
from apps.core.models import AiTranscript
from apps.core.throttling import ClientIpAnonThrottle


class AiRateThrottle(ClientIpAnonThrottle):
    scope = "ai_rate"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AiRateThrottle])
def rate_answer(request):
    data = request.data if isinstance(request.data, dict) else {}
    rating = data.get("rating")
    if rating not in ("up", "down"):
        return Response({"error": "rating must be up|down"}, status=400)
    try:
        token_id = signing.loads(str(data.get("rate_token") or ""), salt=assistant.RATE_SALT, max_age=60 * 60 * 24 * 7)
    except signing.BadSignature:
        return Response({"error": "bad token"}, status=400)
    if token_id != data.get("transcript_id"):
        return Response({"error": "bad token"}, status=400)
    updated = AiTranscript.objects.filter(pk=token_id).update(rating=rating)
    if not updated:
        return Response(status=404)
    return Response(status=204)
