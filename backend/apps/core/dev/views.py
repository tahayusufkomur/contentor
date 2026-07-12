import base64
import time

from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import DevOutboundEmail


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def latest_email(request):
    if not getattr(settings, "EMAIL_SINK_ENABLED", False):
        raise Http404
    to = request.query_params.get("to", "").strip()
    row = DevOutboundEmail.objects.filter(to__iexact=to).first() if to else None
    if not row:
        raise Http404
    return Response({"to": row.to, "subject": row.subject, "html": row.html, "created_at": row.created_at})


# --- Logo image debug page (dev only): prompt -> raw Gemini PNG + traced SVG ---

_LOGO_IMAGE_MODELS = (
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-lite-image",
)

_ROLE_PREVIEW_COLORS = {"mark": "#111827", "mark2": "#0f766e", "accent": "#f59e0b"}

_DEBUG_PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Logo image debug</title>
<style>
 body{font-family:system-ui,sans-serif;margin:2rem auto;max-width:1100px;padding:0 1rem;color:#111}
 textarea{width:100%;height:5rem;font:inherit;padding:.5rem;box-sizing:border-box}
 .row{display:flex;gap:1rem;align-items:center;margin:.75rem 0;flex-wrap:wrap}
 button{font:inherit;padding:.5rem 1.25rem;cursor:pointer}
 .panes{display:flex;gap:1rem;flex-wrap:wrap}
 .pane{flex:1;min-width:320px;border:1px solid #ddd;border-radius:8px;padding:1rem}
 .pane h3{margin-top:0;font-size:.9rem;color:#666;text-transform:uppercase;letter-spacing:.05em}
 .pane img,.pane svg{width:100%;height:auto;background:
   repeating-conic-gradient(#f3f3f3 0% 25%, #fff 0% 50%) 0 / 24px 24px}
 pre{background:#f6f6f6;padding:.75rem;border-radius:6px;overflow-x:auto;font-size:.8rem}
 #status{color:#666}
</style></head><body>
<h1>Logo image debug</h1>
<p>Prompt &rarr; Gemini raster (left) &rarr; what the studio tracer keeps (right). Costs real money per run.</p>
<textarea id="prompt">a single continuous line drawing of a lotus flower, one elegant thin line</textarea>
<div class="row">
  <label>Model <select id="model">__MODEL_OPTIONS__</select></label>
  <label><input type="checkbox" id="suffix" checked> apply studio no-text/flat/white suffix</label>
  <button id="go">Generate</button>
  <span id="status"></span>
</div>
<div class="panes">
  <div class="pane"><h3>Raw Gemini PNG</h3><div id="raw"></div></div>
  <div class="pane"><h3>Traced (studio vector)</h3><div id="traced"></div></div>
</div>
<pre id="stats"></pre>
<script>
const el = id => document.getElementById(id);
el("go").onclick = async () => {
  el("status").textContent = "generating\\u2026 (30-90s)";
  el("go").disabled = true;
  try {
    const res = await fetch(location.pathname, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({prompt: el("prompt").value, model: el("model").value, suffix: el("suffix").checked}),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.status);
    el("raw").innerHTML = '<img src="' + data.image + '">';
    el("traced").innerHTML =
      data.traced_svg || "<p>trace REJECTED \\u2014 studio falls back to authored paths</p>";
    el("stats").textContent = JSON.stringify(data.stats, null, 2);
    el("status").textContent = "done";
  } catch (e) {
    el("status").textContent = "error: " + e.message;
  } finally {
    el("go").disabled = false;
  }
};
</script></body></html>"""


@api_view(["GET", "POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def logo_image_debug(request):
    """Dev-only playground: type a prompt, see the raw Gemini image next to
    the traced vector the Logo Studio would actually keep. Mounted only under
    the EMAIL_SINK_ENABLED dev url block; additionally requires DEBUG and a
    GEMINI_API_KEY. Spends real provider money on every POST."""
    if not settings.DEBUG or not settings.GEMINI_API_KEY:
        raise Http404

    from apps.tenant_config import logo_image, logo_trace
    from apps.tenant_config.logo_ai import _validate_custom_paths

    if request.method == "GET":
        options = "".join(f'<option value="{m}">{m}</option>' for m in _LOGO_IMAGE_MODELS)
        return HttpResponse(_DEBUG_PAGE.replace("__MODEL_OPTIONS__", options))

    data = request.data if isinstance(request.data, dict) else {}
    prompt = str(data.get("prompt") or "").strip()[:2000]
    model = data.get("model") if data.get("model") in _LOGO_IMAGE_MODELS else _LOGO_IMAGE_MODELS[0]
    if not prompt:
        return Response({"error": "prompt required"}, status=400)
    if data.get("suffix", True):
        prompt = prompt.rstrip(". ") + logo_image._STRICT_MARK_SUFFIX

    started = time.monotonic()
    png, cost = logo_image._generate_one(prompt, model=model)
    generate_seconds = round(time.monotonic() - started, 1)
    if not png:
        return Response({"error": "generation failed (see django logs)"}, status=502)

    started = time.monotonic()
    traced = logo_trace.trace_mark(png)
    validated = _validate_custom_paths(traced) if traced else None
    trace_seconds = round(time.monotonic() - started, 1)

    traced_svg = None
    if validated:
        parts = [f'<path d="{p["d"]}" fill="{_ROLE_PREVIEW_COLORS.get(p["fill"], "#111827")}"/>' for p in validated]
        traced_svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{"".join(parts)}</svg>'

    return Response(
        {
            "image": "data:image/png;base64," + base64.b64encode(png).decode(),
            "traced_svg": traced_svg,
            "stats": {
                "model": model,
                "cost_usd": str(cost),
                "generate_seconds": generate_seconds,
                "trace_seconds": trace_seconds,
                "png_bytes": len(png),
                "traced": bool(validated),
                "n_paths": len(validated or []),
                "d_lens": [len(p["d"]) for p in (validated or [])],
                "roles": [p["fill"] for p in (validated or [])],
                "prompt_sent": prompt,
            },
        }
    )
