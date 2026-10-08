"""Validator for AI component specs (CSL v1): the trust boundary every spec
crosses, whether the AI wrote it or a PATCH carried it.

Catalog-driven: primitives, their props and children come from
primitives.json; only the field-schema rules and the Opener/Num/Layout
special cases live here. validate_spec(raw) -> (spec | None, errors). The
spec is canonical (defaults filled, invalid props and nodes dropped), so
validating it again returns it unchanged and autosave round-trips are
stable. None means nothing renderable is left."""

from __future__ import annotations

import json
import re

from apps.tenant_config import sections

from .catalog import DYNAMIC_SOURCES, icons, limits, primitives

FIELD_NAME = re.compile(r"^[a-z][a-zA-Z0-9]{0,23}$")
RESERVED_FIELDS = frozenset({"id", "type", "variant", "enabled", "style", "cx"})
TOP_FIELD_TYPES = ("text", "richtext", "link", "image", "items")
ITEM_FIELD_TYPES = ("text", "link", "image")
ASPECTS = ("1:1", "4:5", "3:4", "2:3", "3:2", "4:3", "16:9")
# Family field type -> the spec field types that may fill it (Layout.map). A
# richtext slot is rendered as HTML, so only a (sanitised) richtext field fills it.
_FILLS = {"text": {"text"}, "richtext": {"richtext"}, "link": {"link"}, "image": {"image"}}
_OPENER_FIELDS = {
    "kicker": {"type": "text", "label": "Kicker", "max": 40},
    "intro": {"type": "text", "label": "Intro", "max": 220},
}
_MISSING = object()


def _int(value, lo, hi, default):
    if isinstance(value, bool):
        return default
    try:
        number = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default
    return max(lo, min(hi, number))


def _num(value, lo, hi, default):
    if isinstance(value, bool):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return round(max(lo, min(hi, number)), 3)


def clean_field_specs(raw, errors, *, in_items=False) -> dict:
    """A field schema in families.json format, limited to what cx renders."""
    if not isinstance(raw, dict):
        return {}
    allowed = ITEM_FIELD_TYPES if in_items else TOP_FIELD_TYPES
    out = {}
    for name, spec in raw.items():
        if len(out) >= limits()["fields"]:
            errors.append("too many fields")
            break
        if not isinstance(name, str) or not FIELD_NAME.match(name) or name in RESERVED_FIELDS:
            errors.append(f"field {name!r}: names are camelCase, at most 24 characters, and not a reserved word")
            continue
        kind = spec.get("type") if isinstance(spec, dict) else None
        if kind not in allowed:
            errors.append(f"field {name}: type must be one of {', '.join(allowed)}")
            continue
        clean = {"type": kind, "label": sections.clamp_text(spec.get("label"), 40) or name}
        if spec.get("required") is True:
            clean["required"] = True
        if kind == "text":
            clean["max"] = _int(spec.get("max"), 1, 600, 160)
        elif kind == "richtext":
            clean["max"] = _int(spec.get("max"), 1, 2000, 900)
        elif kind == "image":
            clean["aspect"] = spec["aspect"] if spec.get("aspect") in ASPECTS else "4:3"
            clean["role"] = sections.clamp_text(spec.get("role"), 120)
        elif kind == "items":
            sub = clean_field_specs(spec.get("fields"), errors, in_items=True)
            if not sub:
                errors.append(f"field {name}: an items field needs sub-fields")
                continue
            clean["fields"] = sub
            clean["max"] = _int(spec.get("max"), 1, 12, 6)
            clean["min"] = min(_int(spec.get("min"), 0, 12, 0), clean["max"])
            clean["itemLabel"] = sections.clamp_text(spec.get("itemLabel"), 30) or "Item"
        out[name] = clean
    return out


class _Walker:
    def __init__(self, fields, dynamic, errors):
        self.fields = fields
        self.dynamic = dynamic
        self.errors = errors
        self.count = 0
        self.full = False
        self.has_opener = False

    def _drop(self, message):
        self.errors.append(message)
        return None

    def node(self, raw, depth, item_scope, roles):
        if not isinstance(raw, dict):
            return self._drop("every node must be an object")
        t = raw.get("t")
        prim = primitives().get(t) if isinstance(t, str) else None
        if prim is None:
            return self._drop(f"unknown primitive {t!r}")
        if prim["role"] not in roles:
            return self._drop(f"{t} is not allowed there")
        if depth > limits()["depth"]:
            return self._drop("the tree is too deep")
        if self.count >= limits()["nodes"]:
            if not self.full:
                self.full = True
                self.errors.append("the tree has too many nodes")
            return None
        self.count += 1
        out = {"t": t}
        for name, pdef in (prim.get("props") or {}).items():
            value = self._prop(t, name, pdef, raw.get(name), item_scope)
            if value is _MISSING:
                if pdef.get("required"):
                    return self._drop(f"{t} needs {name}")
                continue
            out[name] = value
        if t == "Opener" and (self.fields.get("heading") or {}).get("type") != "text":
            return self._drop("Opener needs a text field named heading")
        if t == "Opener":
            self.has_opener = True
        if t == "Num" and "bind" not in out and item_scope is None:
            return self._drop("Num without bind only works inside an item template")
        if t == "Layout" and not self._layout(out):
            return None
        kind = prim.get("children", "none")
        if kind == "item":
            scope = self.fields[out["each"]]["fields"]
            out["item"] = self.nodes(raw.get("item"), depth + 1, scope, ("block",))
            if not out["item"]:
                return self._drop(f"{t} needs an item template")
        elif kind != "none":
            roles = ("band",) if kind == "bands" else ("block",)
            kids = self.nodes(raw.get("children"), depth + 1, item_scope, roles)
            if kind == "two":
                if len(kids) < 2:
                    return self._drop(f"{t} needs exactly two children")
                kids = kids[:2]
            if not kids:
                return self._drop(f"{t} has no children")
            out["children"] = kids
        return out

    def nodes(self, raw, depth, item_scope, roles):
        if not isinstance(raw, list):
            return []
        return [n for n in (self.node(r, depth, item_scope, roles) for r in raw) if n is not None]

    def _prop(self, t, name, pdef, value, item_scope):
        if value is None:
            return pdef.get("default", _MISSING)
        if "enum" in pdef:
            if value in pdef["enum"]:
                return value
            self.errors.append(f"{t}.{name}: {value!r} is not one of {', '.join(map(str, pdef['enum']))}")
            return pdef.get("default", _MISSING)
        if "int" in pdef:
            lo, hi = pdef["int"]
            return _int(value, lo, hi, pdef.get("default", lo))
        if "num" in pdef:
            lo, hi = pdef["num"]
            return _num(value, lo, hi, pdef.get("default", lo))
        if "bool" in pdef:
            return value if isinstance(value, bool) else str(value).strip().lower() == "true"
        if "text" in pdef:
            return sections.clamp_text(value, pdef["text"]) or pdef.get("default", _MISSING)
        if "map" in pdef:
            return value if isinstance(value, dict) else _MISSING
        if "icon" in pdef:
            ok = isinstance(value, str) and value in icons()
        elif "family" in pdef:
            ok = isinstance(value, str) and value in sections.families()
        elif "each" in pdef:
            ok = isinstance(value, str) and (self.fields.get(value) or {}).get("type") == "items"
        elif "bind" in pdef:
            ok = self._binds(pdef, value, item_scope)
        else:
            ok = False
        if ok:
            return value
        self.errors.append(f"{t}.{name}: {value!r} is not valid here")
        return _MISSING

    def _binds(self, pdef, value, item_scope):
        if not isinstance(value, str):
            return False
        if value.startswith("$."):
            spec = (item_scope or {}).get(value[2:])
            return not pdef.get("top") and spec is not None and spec["type"] in pdef["bind"]
        spec = self.fields.get(value)
        return spec is not None and spec["type"] in pdef["bind"]

    def _layout(self, out):
        family = sections.families()[out["family"]]
        known = {n for sid in sections.styles() for n in sections.variants(sid, out["family"])}
        if out["variant"] != "auto" and out["variant"] not in known:
            self.errors.append(f"Layout {out['family']}: unknown variant {out['variant']!r}")
            out["variant"] = "auto"
        if family.get("kind") == "dynamic" and self.dynamic != family.get("source"):
            self._drop(f"Layout {out['family']} needs dynamic set to {family.get('source')!r}")
            return False
        clean = {}
        for to, frm in (out.get("map") or {}).items():
            target = family["fields"].get(to) if isinstance(to, str) else None
            source = self.fields.get(frm) if isinstance(frm, str) else None
            if target is None or source is None:
                self.errors.append(f"Layout {out['family']}: cannot map {to!r} to {frm!r}")
                continue
            if target["type"] == "items":
                shared = set(source.get("fields") or {}) & set(target.get("fields") or {})
                ok = (
                    source["type"] == "items"
                    and bool(shared)
                    and all(
                        source["fields"][k]["type"] in _FILLS.get(target["fields"][k]["type"], set()) for k in shared
                    )
                )
            else:
                ok = source["type"] in _FILLS.get(target["type"], set())
            if not ok:
                self.errors.append(
                    f"Layout {out['family']}: {frm} ({source['type']}) cannot fill {to} ({target['type']})"
                )
                continue
            clean[to] = frm
        if not clean and family.get("kind") != "dynamic":
            self._drop(f"Layout {out['family']} maps none of your fields")
            return False
        out["map"] = clean
        return True


def validate_spec(raw):
    """(canonical spec | None, errors)."""
    if not isinstance(raw, dict):
        return None, ["the spec must be an object"]
    errors: list[str] = []
    fields = clean_field_specs(raw.get("fields"), errors)
    dynamic = raw.get("dynamic") if raw.get("dynamic") in DYNAMIC_SOURCES else None
    walker = _Walker(fields, dynamic, errors)
    tree = walker.node(raw.get("tree"), 1, None, ("root", "band"))
    if tree is None:
        return None, [*errors, "nothing renderable is left"]
    if walker.has_opener:
        # The Opener draws a kicker and an intro too; declare them so inline
        # edits of those slots are stored instead of dropped on the next save.
        for name, field in _OPENER_FIELDS.items():
            if name not in fields and len(fields) < limits()["fields"]:
                fields[name] = dict(field)
    spec = {
        "csl": 1,
        "name": sections.clamp_text(raw.get("name"), 60) or "Custom section",
        "summary": sections.clamp_text(raw.get("summary"), 200),
        "fields": fields,
        "dynamic": dynamic,
        "tree": tree,
    }
    if len(json.dumps(spec)) > limits()["bytes"]:
        return None, [*errors, "the section is too large"]
    return spec, errors
