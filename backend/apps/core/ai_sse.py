"""SSE framing for streamed AI progress.

The chat features frame their own events inside apps.core.assistant (they
carry chat-specific concerns like the suggestions tail). The structured
generators — blog drafts, logo designs — only need the wire format, which is
this module: one JSON object per frame, discriminated by "type", matching the
shape the frontend readers already parse.

Event types by convention:
  {"type": "phase",   "phase": "drafting"}      progress step changed
  {"type": "preview", ...}                      feature-shaped partial result
  {"type": "done",    ...}                      terminal success payload
  {"type": "error",   "source": "error"}        terminal failure
"""

import json

from django.http import StreamingHttpResponse
from rest_framework.renderers import BaseRenderer
from rest_framework.utils.encoders import JSONEncoder


def sse_frame(payload):
    """One SSE frame. Mirrors apps.core.assistant._event's wire format.

    Uses DRF's encoder, not plain json.dumps: these frames carry serializer
    output (a done frame ships the same dict the JSON endpoint returns), which
    routinely contains UUIDs, Decimals and datetimes that stdlib json refuses.
    Without it a post with a cover photo fails to serialize mid-stream and the
    coach sees an error after a successful 45s generation."""
    return f"data: {json.dumps(payload, cls=JSONEncoder)}\n\n"


def sse_headers(response):
    """Apply the no-buffering headers every streamed endpoint here needs.
    Without X-Accel-Buffering the proxy holds frames until the response ends,
    which defeats the entire point of streaming progress."""
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


class EventStreamRenderer(BaseRenderer):
    """Exists only so DRF's content negotiation accepts
    ``Accept: text/event-stream`` instead of 406ing before the view runs.

    Never actually renders: the streaming paths return StreamingHttpResponse
    and the pre-stream guards return JsonResponse, both of which bypass DRF
    rendering entirely."""

    media_type = "text/event-stream"
    format = "txt"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


def wants_stream(request):
    return "text/event-stream" in (request.headers.get("Accept") or "")


def stream_response(frames):
    """Generator of SSE frames -> a fully configured streaming response."""
    return sse_headers(StreamingHttpResponse(frames, content_type="text/event-stream"))
