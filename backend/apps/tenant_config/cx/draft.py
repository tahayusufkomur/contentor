"""The model's answer for an AI component, and its assembly into a spec.

The answer is FLAT (nodes point at their parent by id, sub-fields at their
items field) because recursive JSON schemas are not supported by every
provider's structured output. assemble() rebuilds the nested spec; nothing
here is trusted — the validator and the content cleaner run next."""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel, Field

from .catalog import primitives

_MAX_BUILD_DEPTH = 12  # the validator allows 8; this only guards recursion
_NODE_KEYS = frozenset({"t", "children", "item"})


class DraftField(BaseModel):
    name: str
    parent: str | None = None
    type: str
    label: str = ""
    max: int | None = None
    min: int | None = None
    required: bool = False
    item_label: str | None = None
    aspect: str | None = None
    role: str | None = None


class DraftProp(BaseModel):
    name: str
    value: str


class DraftNode(BaseModel):
    id: str
    parent: str | None = None
    slot: str = "children"
    t: str
    props: list[DraftProp] = Field(default_factory=list)


class DraftText(BaseModel):
    field: str
    value: str


class DraftCell(BaseModel):
    key: str
    value: str


class DraftRow(BaseModel):
    cells: list[DraftCell] = Field(default_factory=list)


class DraftList(BaseModel):
    field: str
    rows: list[DraftRow] = Field(default_factory=list)


class CxDraft(BaseModel):
    name: str
    summary: str = ""
    dynamic: str | None = None
    fields: list[DraftField] = Field(default_factory=list)
    nodes: list[DraftNode] = Field(default_factory=list)
    texts: list[DraftText] = Field(default_factory=list)
    lists: list[DraftList] = Field(default_factory=list)
    missing_capabilities: list[str] = Field(default_factory=list)


def _field(f: DraftField) -> dict:
    out = {"type": f.type, "label": f.label or f.name}
    for key in ("max", "min", "aspect", "role"):
        value = getattr(f, key)
        if value is not None:
            out[key] = value
    if f.required:
        out["required"] = True
    if f.item_label:
        out["itemLabel"] = f.item_label
    return out


def _map(value: str) -> dict:
    """ "heading=heading, items=perks" -> {"heading": "heading", "items": "perks"}"""
    out = {}
    for pair in value.split(","):
        to, sep, frm = pair.partition("=")
        if sep and to.strip() and frm.strip():
            out[to.strip()] = frm.strip()
    return out


def _coerce(t: str, name: str, value: str):
    """A prop's string value as the type the catalog declares for it."""
    pdef = (primitives().get(t, {}).get("props") or {}).get(name) or {}
    try:
        if "int" in pdef:
            return int(float(value))
        if "num" in pdef:
            return float(value)
    except (ValueError, OverflowError):
        return value
    if "bool" in pdef:
        return value.strip().lower() == "true"
    if "map" in pdef:
        return _map(value)
    return value


def assemble(draft: CxDraft) -> tuple[dict, dict]:
    """(raw spec, raw content)."""
    fields = {f.name: _field(f) for f in draft.fields if not f.parent}
    for f in draft.fields:
        parent = fields.get(f.parent) if f.parent else None
        if parent is not None and parent["type"] == "items":
            parent.setdefault("fields", {})[f.name] = _field(f)

    children = defaultdict(list)
    for node in draft.nodes:
        if node.parent:
            children[node.parent].append(node)
    seen: set[str] = set()

    def build(node: DraftNode, depth: int) -> dict:
        seen.add(node.id)
        out = {"t": node.t}
        out.update({p.name: _coerce(node.t, p.name, p.value) for p in node.props if p.name not in _NODE_KEYS})
        if depth < _MAX_BUILD_DEPTH:
            for child in children[node.id]:
                if child.id not in seen:
                    slot = "item" if child.slot == "item" else "children"
                    out.setdefault(slot, []).append(build(child, depth + 1))
        return out

    roots = [n for n in draft.nodes if not n.parent]
    raw = {
        "csl": 1,
        "name": draft.name,
        "summary": draft.summary,
        "fields": fields,
        "dynamic": draft.dynamic,
        "tree": build(roots[0], 1) if roots else None,
    }
    content: dict = {t.field: t.value for t in draft.texts}
    for lst in draft.lists:
        content[lst.field] = [{c.key: c.value for c in row.cells} for row in lst.rows]
    return raw, content
