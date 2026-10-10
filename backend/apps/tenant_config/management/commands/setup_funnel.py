"""The /setup interview funnel, read from every tenant's transcript: how many
coaches reach and answer each question, how long they take on it, how often
they leave it to the guide ("you decide"), tap or type or speak, how long the
guide's reply took, and where idle coaches stopped.

Run turns are stamped by interview.run_turn (``at``, ``how``, ``ms``); older
turns are counted but not timed. ponytail: the transcript keeps the last 80
turns (TRANSCRIPT_KEEP), so a coach who went back and forth a lot loses her
earliest questions; a per-turn event table is the upgrade if that matters.
"""

import json as jsonlib
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from statistics import median

from django.core.management.base import BaseCommand
from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.core.models import Tenant
from apps.tenant_config import interview_brief as brief
from apps.tenant_config.models import TenantConfig


def _at(turn):
    return datetime.fromisoformat(turn["at"]) if turn.get("at") else None


def funnel(transcripts: list[dict], idle_before: datetime) -> dict:
    """``transcripts``: one {turns, asked, last_at, done} per tenant."""
    stats = defaultdict(lambda: {"reached": 0, "answered": 0, "secs": [], "how": Counter(), "reply_ms": []})
    dropped = Counter()
    for iv in transcripts:
        turns = iv["turns"]
        # The question on screen was reached, answered or not.
        reached, answered = {iv["asked"]} if iv.get("asked") else set(), set()
        for i, turn in enumerate(turns):
            field = turn.get("field")
            if not field:
                continue
            if turn.get("role") == "guide":
                reached.add(field)
                continue
            reply = turns[i + 1] if i + 1 < len(turns) else {}
            if reply.get("ms") is not None:
                stats[field]["reply_ms"].append(reply["ms"])
            if field in answered:
                continue  # a question gone back to: its first answer is the one timed
            answered.add(field)
            if turn.get("how"):
                stats[field]["how"][turn["how"]] += 1
            asked = next((t for t in reversed(turns[:i]) if t.get("role") == "guide" and t.get("field") == field), None)
            if asked and _at(asked) and _at(turn):
                stats[field]["secs"].append((_at(turn) - _at(asked)).total_seconds())
        # A question served without a stored guide turn (added after go-live) was still reached.
        for field in reached | answered:
            stats[field]["reached"] += 1
        for field in answered:
            stats[field]["answered"] += 1
        idle = iv.get("last_at") and datetime.fromisoformat(iv["last_at"]) < idle_before
        if not iv.get("done") and iv.get("asked") and idle:
            dropped[iv["asked"]] += 1
    order = {f.id: i for i, f in enumerate(brief.FIELDS)}
    fields = {
        field: {
            "reached": s["reached"],
            "answered": s["answered"],
            "median_secs": round(median(s["secs"])) if s["secs"] else None,
            "how": dict(s["how"]),
            "median_reply_ms": round(median(s["reply_ms"])) if s["reply_ms"] else None,
        }
        for field, s in sorted(stats.items(), key=lambda kv: order.get(kv[0], len(order)))
    }
    return {
        "tenants": len(transcripts),
        "done": sum(1 for iv in transcripts if iv.get("done")),
        "fields": fields,
        "dropped": dict(dropped),
    }


class Command(BaseCommand):
    help = "Report the /setup interview funnel: reach, time, you-decide/typed/tapped, reply time, drop-off."

    def add_arguments(self, parser):
        parser.add_argument("--since-days", type=int, default=30)
        parser.add_argument("--idle-hours", type=int, default=24, help="no turn for this long = dropped off")
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args, **options):
        now = timezone.now()
        transcripts = []
        tenants = Tenant.objects.exclude(schema_name="public").filter(
            created_at__gte=now - timedelta(days=options["since_days"])
        )
        for tenant in tenants:
            with tenant_context(tenant):
                config = TenantConfig.objects.first()
                flow = (config.setup_flow or {}) if config else {}
                iv = flow.get("interview") or {}
                if not iv.get("turns") and (tenant.wizard_state or {}).get("flow") == "interview":
                    # Never answered the first question: nothing stored yet, but
                    # she reached it (the likeliest place to leave).
                    first = brief.missing(brief.answers_of(tenant))
                    started = flow.get("started_at") or tenant.created_at.isoformat()
                    iv = {"turns": [], "asked": first[0].id if first else None, "last_at": started}
            if iv.get("turns") or iv.get("asked"):
                transcripts.append({**iv, "done": flow.get("status") == "done"})
        report = funnel(transcripts, idle_before=now - timedelta(hours=options["idle_hours"]))
        if options["as_json"]:
            self.stdout.write(jsonlib.dumps(report))
            return
        self.stdout.write(f"{report['tenants']} interviews, {report['done']} finished\n")
        self.stdout.write(
            f"{'question':<16}{'reached':>8}{'answered':>9}{'median s':>9}{'reply ms':>9}"
            f"{'decide':>8}{'typed':>7}{'spoken':>7}{'dropped':>8}"
        )
        for field, row in report["fields"].items():
            told = sum(row["how"].values()) or 1
            pct = {k: f"{round(100 * row['how'].get(k, 0) / told)}%" for k in ("delegate", "typed", "spoken")}
            self.stdout.write(
                f"{field:<16}{row['reached']:>8}{row['answered']:>9}{row['median_secs'] or '-':>9}"
                f"{row['median_reply_ms'] or '-':>9}{pct['delegate']:>8}{pct['typed']:>7}{pct['spoken']:>7}"
                f"{report['dropped'].get(field, 0):>8}"
            )
