"""What focus mode asks for each kind it can make, in order (spec §5 and §7.1
of docs/superpowers/specs/2026-10-18-focus-mode-design.md). The questions use
/setup's ``Field`` shape; code owns them, so a tap never waits on a model."""

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


COURSE = Recipe(
    kind="course",
    questions=(
        Field(
            "topic",
            "Topic",
            "What will your students learn?",
            ("A course on ",),
            delegable=True,
            starter=True,
            why="One sentence is enough. I'll draft the rest for you to check.",
        ),
        Field(
            "level",
            "Who it is for",
            "Who is it for?",
            ("Complete beginners", "Some experience", "Advanced"),
            kind="choice",
            delegable=True,
            why="It sets the pace, and the words the lessons use.",
        ),
        Field(
            "size",
            "Size",
            "How big should it be?",
            ("Quick win", "Short course", "Full program"),
            kind="choice",
            hints=("1 module · 3–4 lessons", "3 modules · about 12 lessons", "6 modules"),
            delegable=True,
            why="You can add or remove lessons any time.",
        ),
        Field(
            "outline_review",
            "Outline",
            "Here's your outline. Does it fit?",
            kind="review",
            why="Say what to change, or edit it on the page yourself.",
        ),
        Field(
            "finish",
            "Finish",
            "Ready. Publish it now?",
            ("Publish now", "Keep as a draft"),
            kind="finish",
            why="A draft stays hidden from students until you publish it.",
        ),
    ),
    specialists={
        "topic": "content",
        "level": "content",
        "size": "content",
        "outline_review": "content",
        "finish": "marketing",
    },
    values={
        "level": ("beginners", "some", "advanced"),
        "size": ("quick", "short", "full"),
        "finish": ("publish", "draft"),
    },
)

RECIPES: dict[str, Recipe] = {"course": COURSE}

# Course size -> (modules, lessons per module).
SIZES: dict[str, tuple[int, int]] = {"quick": (1, 4), "short": (3, 4), "full": (6, 4)}
