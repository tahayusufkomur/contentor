from __future__ import annotations

import uuid

from .base import Cloudflare


class FakeCloudflare(Cloudflare):
    def __init__(self) -> None:
        self.zones: dict[str, dict] = {}

    def create_zone(self, domain: str) -> dict:
        zone_id = f"zone-{uuid.uuid4().hex[:12]}"
        self.zones[zone_id] = {"domain": domain, "records": [], "email_forward": ""}
        return {"zone_id": zone_id, "name_servers": ["a.ns.cloudflare.com", "b.ns.cloudflare.com"]}

    def upsert_dns_record(self, *, zone_id: str, type: str, name: str, content: str, proxied: bool = True) -> str:
        rid = f"rec-{uuid.uuid4().hex[:12]}"
        self.zones.setdefault(zone_id, {"records": []})["records"].append(
            {"id": rid, "type": type, "name": name, "content": content, "proxied": proxied}
        )
        return rid

    def enable_email_routing(self, *, zone_id: str, forward_to: str = "", worker_name: str = "") -> None:
        zone = self.zones.setdefault(zone_id, {})
        if worker_name:
            zone["email_worker"] = worker_name
        elif forward_to:
            zone["email_forward"] = forward_to

    def get_ssl_status(self, *, zone_id: str) -> str:
        return "active"
