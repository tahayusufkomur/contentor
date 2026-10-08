"""The ``cx`` block: an AI-built section stored as a validated spec snapshot
plus content fields at the top level::

    {"id": "blk_…", "type": "cx", "enabled": true,
     "cx": {"ref": "cx_1a2b3c4d@2" | null, "spec": {…canonical CSL v1…}},
     …content fields declared by spec.fields…}

The snapshot makes the tenant's pages self-contained: rendering never reads
the registry. ``ref`` is lineage only and never trusted for rendering."""

from __future__ import annotations

import re

from apps.tenant_config import sections
from apps.tenant_config.defaults import CX_BLOCK_TYPE

from .validate import validate_spec

REF_RE = re.compile(r"^cx_[0-9a-f]{8}@[0-9]{1,4}$")
_BASE_KEYS = frozenset({"id", "type", "enabled", "style", "cx"})


def clean_cx_block(block):
    """The block re-validated and its content shaped by the spec, or None
    when no usable spec remains (the block is dropped)."""
    if not isinstance(block, dict) or block.get("type") != CX_BLOCK_TYPE:
        return None
    cx = block.get("cx") if isinstance(block.get("cx"), dict) else {}
    spec, _errors = validate_spec(cx.get("spec"))
    if spec is None:
        return None
    ref = cx.get("ref")
    out = {
        "id": block.get("id"),
        "type": CX_BLOCK_TYPE,
        "enabled": bool(block.get("enabled", True)),
        "cx": {"ref": ref if isinstance(ref, str) and REF_RE.match(ref) else None, "spec": spec},
    }
    out.update(sections._clean_fields(spec["fields"], block))
    return out


def content_of(block) -> dict:
    """A cx block's content fields (everything but the block's own keys)."""
    return {key: value for key, value in block.items() if key not in _BASE_KEYS}
