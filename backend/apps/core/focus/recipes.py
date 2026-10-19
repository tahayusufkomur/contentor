"""The shape of what focus mode asks for a kind, in order (spec §5 and §7.1
of docs/superpowers/specs/2026-10-18-focus-mode-design.md); each kind's
adapter (apps.core.focus.kinds) holds its own. The questions use /setup's
``Field`` shape; code owns them, so a tap never waits on a model."""

from dataclasses import dataclass

from apps.tenant_config.interview_brief import Field


@dataclass(frozen=True)
class Recipe:
    kind: str
    questions: tuple[Field, ...]
    # Field id -> the team specialist asking it (frontend lib/copilot/team.ts).
    specialists: dict[str, str]
    # Field id -> the value sent for each of its options (Field.options are the labels).
    values: dict[str, tuple[str, ...]]
