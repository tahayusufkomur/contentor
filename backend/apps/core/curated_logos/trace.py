"""Best-effort vectorization of a curated logo PNG into Logo Studio mark path
dicts, reusing the same tracer the AI image-mark flow uses. Kept within the
recipe's custom-mark caps (trace_mark enforces them), so a saved coach recipe
still passes validate_logo_recipe. Never raises: returns None when the art
can't become a clean mark, and the studio falls back to the raster PNG."""

import logging

logger = logging.getLogger(__name__)


def trace_curated_mark(png_bytes):
    try:
        from apps.tenant_config.logo_trace import trace_mark

        return trace_mark(png_bytes)
    except Exception:
        logger.warning("curated logo trace failed", exc_info=True)
        return None
