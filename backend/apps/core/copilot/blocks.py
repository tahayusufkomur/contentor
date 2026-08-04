"""Pure block operations behind the copilot's add/remove/move actions.

Addable types and writable fields are ai_compose's WRITABLE_FIELDS — the same
trust boundary the edit engine uses (so no testimonials: fabricated social
proof stays impossible). All functions are dict-in/dict-out and never mutate
their inputs; DB writes happen in the execute view."""

from copy import deepcopy
from uuid import uuid4

from apps.core.onboarding.ai_compose import FIELD_CAPS, MAX_FAQ_ITEMS, WRITABLE_FIELDS
from apps.tenant_config.defaults import sanitize_rich_text


class BlockOpError(Exception):
    """User-safe message describing why a block operation was refused."""


def mint_block_id() -> str:
    return f"blk_{uuid4().hex[:8]}"


def _clamp(value, field):
    return str(value)[: FIELD_CAPS.get(field, 200)]


def build_block(block_type, fields):
    writable = WRITABLE_FIELDS.get(block_type)
    if writable is None:
        raise BlockOpError(f"unknown block type: {block_type}")
    block = {"id": mint_block_id(), "type": block_type, "enabled": True}
    for field in writable:
        if field not in (fields or {}):
            continue
        value = fields[field]
        if field == "items":
            block["items"] = [
                {"q": _clamp(it.get("q", ""), "q"), "a": _clamp(it.get("a", ""), "a")}
                for it in list(value or [])[:MAX_FAQ_ITEMS]
                if isinstance(it, dict)
            ]
        elif field == "body":
            block["body"] = sanitize_rich_text(_clamp(value, "body"))
        else:
            block[field] = _clamp(value, field)
    return block


def _page_blocks(pages, page):
    blocks_ = (pages or {}).get(page)
    if not isinstance(blocks_, list):
        raise BlockOpError(f"unknown page: {page}")
    return blocks_


def _index_of(blocks_, block_id, page):
    for i, b in enumerate(blocks_):
        if isinstance(b, dict) and b.get("id") == block_id:
            return i
    raise BlockOpError(f"no block {block_id} on {page}")


def add_block(pages, page, block, after_block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    if after_block_id is None:
        blocks_.append(block)
    else:
        blocks_.insert(_index_of(blocks_, after_block_id, page) + 1, block)
    return new_pages


def remove_block(pages, page, block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    blocks_.pop(_index_of(blocks_, block_id, page))
    return new_pages


def move_block(pages, page, block_id, after_block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    moving = blocks_.pop(_index_of(blocks_, block_id, page))
    if after_block_id is None:
        blocks_.insert(0, moving)
    else:
        blocks_.insert(_index_of(blocks_, after_block_id, page) + 1, moving)
    return new_pages
