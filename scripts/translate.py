#!/usr/bin/env python3
"""Draft missing translations of the JSON message files (and the backend .po files) with the model.

    python3 scripts/translate.py [--to tr] [--root DIR ...] [--redraft] [--skip-po]
    python3 scripts/translate.py export <lang> [--out i18n-review-<lang>.csv]
    python3 scripts/translate.py import <file.csv> [--to <lang>]
    python3 scripts/translate.py --self-test

Run on the host (stdlib only). Drafts go through `manage.py translate --draft` in the django container.
Each language keeps <root>/<lang>/<namespace>.json (English's key order) and <root>/<lang>.review.json:
{key: {"src": first 8 hex of sha1(English), "reviewed": bool}}. Reviewing is `export` then `import`.
Docs: docs/superpowers/specs/2026-10-28-four-languages-design.md.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROOTS = ["frontend-main/messages", "frontend-customer/messages", "packages/shared/src/i18n/messages"]
DEFAULT = "en"
CHUNK = 200  # texts per container call; files are written after each, so a stopped run resumes
IDENT = re.compile(r"^[a-z][A-Za-z0-9]*$")
COLUMNS = ["key", "english", "translation", "where"]


def languages() -> list[str]:
    data = json.loads((ROOT / "packages/shared/src/i18n/locales.json").read_text(encoding="utf-8"))
    return [entry["code"] for entry in data["locales"] if entry["code"] != data["default"]]


def digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


# --- flat keys <-> nested JSON ---


def flatten(node, prefix: str = "") -> dict[str, str]:
    """{"a": {"b": "x", "c": ["y"]}} -> {"a.b": "x", "a.c.0": "y"}. A list of bare identifiers is data, not text."""
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            out.update(flatten(value, f"{prefix}.{key}" if prefix else key))
        return out
    if isinstance(node, list):
        if _is_data(node):
            return {}
        return flatten(dict(enumerate(node)), prefix)
    return {prefix: node}


def _is_data(node) -> bool:
    return isinstance(node, list) and len(node) > 1 and all(isinstance(x, str) and IDENT.match(x) for x in node)


def unflatten(template, flat: dict[str, str], prefix: str = ""):
    """Rebuild `template`'s shape (English's) with the values in `flat`; a key without a value is left out."""
    if isinstance(template, dict):
        out = {}
        for key, value in template.items():
            built = unflatten(value, flat, f"{prefix}.{key}" if prefix else key)
            if built is not _MISSING:
                out[key] = built
        return out
    if isinstance(template, list):
        if _is_data(template):
            return template
        items = [unflatten(value, flat, f"{prefix}.{i}") for i, value in enumerate(template)]
        return _MISSING if _MISSING in items else items
    return flat.get(prefix, _MISSING)


_MISSING = object()


# --- the message files ---


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class Store:
    """One messages root in one language: English's namespaces, the language's values and its review state."""

    def __init__(self, root: str, lang: str):
        self.root, self.lang = root, lang
        base = ROOT / root
        self.dir, self.review_path = base / lang, base / f"{lang}.review.json"
        self.english = {p.stem: _read(p) for p in sorted((base / DEFAULT).glob("*.json"))}
        self.en_flat = {f"{ns}.{k}": v for ns, tree in self.english.items() for k, v in flatten(tree).items()}
        self.values = {}
        for ns in self.english:
            self.values.update({f"{ns}.{k}": v for k, v in flatten(_read(self.dir / f"{ns}.json")).items()})
        self.review = _read(self.review_path)

    def namespace(self, key: str) -> str:
        return key.split(".", 1)[0]

    def stale(self, redraft: bool) -> list[str]:
        out = []
        for key, text in self.en_flat.items():
            entry = self.review.get(key)
            if key not in self.values or entry is None or entry["src"] != digest(text):
                out.append(key)
            elif redraft and not entry["reviewed"]:
                out.append(key)
        return out

    def save(self) -> None:
        """Write every file in English's key order; keys English dropped go."""
        for ns, tree in self.english.items():
            flat = {k[len(ns) + 1 :]: v for k, v in self.values.items() if self.namespace(k) == ns}
            built = unflatten(tree, flat)
            _write(self.dir / f"{ns}.json", built)
        _write(self.review_path, {k: self.review[k] for k in self.en_flat if k in self.review})


def _docker_draft(lang: str, items: list[dict]) -> dict[str, str]:
    payload = json.dumps({"items": items})  # ASCII only
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", "django", "python", "manage.py", "translate", "--draft", lang],
        input=payload,
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=ROOT,
    )
    if proc.stderr.strip():
        print(proc.stderr.strip(), file=sys.stderr)
    if proc.returncode != 0:
        print(f"translate: the draft call failed (exit {proc.returncode})", file=sys.stderr)
        return {}
    for line in reversed(proc.stdout.splitlines()):  # the answer is the last JSON object line
        try:
            answer = json.loads(line)
        except ValueError:
            continue
        if isinstance(answer, dict):
            return answer
    print(f"translate: no JSON answer, got {proc.stdout[:200]!r}", file=sys.stderr)
    return {}


def draft_language(lang: str, roots: list[str], redraft: bool, drafter=_docker_draft) -> list[str]:
    """Draft what is missing or stale for `lang` -> the keys that could not be drafted."""
    stores = {root: Store(root, lang) for root in roots}
    todo = []  # (root, key)
    for root, store in stores.items():
        todo += [(root, key) for key in store.stale(redraft)]
    print(f"{lang}: {len(todo)} text(s) to draft", file=sys.stderr)
    failed = []
    for start in range(0, len(todo), CHUNK):
        chunk = todo[start : start + CHUNK]
        items = [
            {"key": f"{root}:{key}", "en": stores[root].en_flat[key], "where": f"{root}:{stores[root].namespace(key)}"}
            for root, key in chunk
        ]
        got = drafter(lang, items)
        for root, key in chunk:
            text = got.get(f"{root}:{key}")
            if text is None:
                failed.append(f"{root}:{key}")
                continue
            stores[root].values[key] = text
            stores[root].review[key] = {"src": digest(stores[root].en_flat[key]), "reviewed": False}
        for store in stores.values():
            store.save()
        print(f"{lang}: {min(start + CHUNK, len(todo))}/{len(todo)}", file=sys.stderr)
    for store in stores.values():  # also writes the files of a language with nothing to draft (drops old keys)
        store.save()
    return failed


def run_po(to: str | None, redraft: bool) -> int:
    cmd = ["docker", "compose", "exec", "-T", "django", "python", "manage.py", "translate", "--po"]
    cmd += (["--to", to] if to else []) + (["--redraft"] if redraft else [])
    return subprocess.run(cmd, cwd=ROOT).returncode


# --- review sheets ---


def export_rows(lang: str, roots: list[str]) -> list[dict]:
    rows = []
    for root in roots:
        store = Store(root, lang)
        for key, text in store.en_flat.items():
            entry = store.review.get(key)
            if key in store.values and entry is not None and not entry["reviewed"]:
                rows.append(
                    {"key": f"{root}:{key}", "english": text, "translation": store.values[key],
                     "where": f"{root}:{store.namespace(key)}"}
                )
    return rows


def write_csv(path, rows: list[dict]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def import_rows(lang: str, rows: list[dict]) -> list[dict]:
    """Apply the JSON rows (the reviewed value, reviewed: true) -> the `backend:` rows for the .po files."""
    stores, backend = {}, []
    for row in rows:
        root, _, key = row["key"].partition(":")
        if root == "backend":
            backend.append({"key": row["key"], "translation": row["translation"]})
            continue
        store = stores.get(root) or stores.setdefault(root, Store(root, lang))
        if key not in store.en_flat:
            print(f"translate: unknown key {row['key']!r}", file=sys.stderr)
            continue
        store.values[key] = row["translation"]
        store.review[key] = {"src": store.review.get(key, {}).get("src", digest(store.en_flat[key])), "reviewed": True}
    for store in stores.values():
        store.save()
    return backend


def _docker_po(flag: str, lang: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "compose", "exec", "-T", "django", "python", "manage.py", "translate", flag, lang],
        input=stdin, text=True, encoding="utf-8", capture_output=True, cwd=ROOT,
    )


# --- self test ---


def self_test() -> int:
    import tempfile

    tree = {"a": {"b": "x", "c": ["Why not", "Zed is dead"], "d": ["students", "storage"]}, "e": "w"}
    flat = flatten(tree)
    assert flat == {"a.b": "x", "a.c.0": "Why not", "a.c.1": "Zed is dead", "e": "w"}, flat
    assert unflatten(tree, {k: k.upper() for k in flat}) == {
        "a": {"b": "A.B", "c": ["A.C.0", "A.C.1"], "d": ["students", "storage"]},
        "e": "E",
    }
    assert unflatten(tree, {"e": "w"}) == {"a": {"d": ["students", "storage"]}, "e": "w"}  # missing keys are left out

    # a stale hash is redrafted, a fresh one is not, and --redraft takes the unreviewed
    global ROOT
    saved_root = ROOT
    with tempfile.TemporaryDirectory() as tmp:
        ROOT = Path(tmp)
        (ROOT / "m/en").mkdir(parents=True)
        _write(ROOT / "m/en/ns.json", {"one": "One", "two": "Two", "three": "Three"})
        _write(ROOT / "m/tr/ns.json", {"one": "Bir", "two": "Iki", "three": "Uc"})
        _write(
            ROOT / "m/tr.review.json",
            {
                "ns.one": {"src": digest("One"), "reviewed": True},
                "ns.two": {"src": digest("Two (old)"), "reviewed": True},
                "ns.three": {"src": digest("Three"), "reviewed": False},
            },
        )
        store = Store("m", "tr")
        assert store.stale(False) == ["ns.two"], store.stale(False)
        assert store.stale(True) == ["ns.two", "ns.three"], store.stale(True)
        seen = []

        def drafter(lang, items):
            seen.extend(i["key"] for i in items)
            return {i["key"]: f"[{lang}] {i['en']}" for i in items}

        assert draft_language("tr", ["m"], False, drafter) == []
        assert seen == ["m:ns.two"]
        assert _read(ROOT / "m/tr/ns.json") == {"one": "Bir", "two": "[tr] Two", "three": "Uc"}
        assert _read(ROOT / "m/tr.review.json")["ns.two"] == {"src": digest("Two"), "reviewed": False}
        assert draft_language("tr", ["m"], False, lambda lang, items: {}) == []  # nothing left to draft
        _write(ROOT / "m/en/ns.json", {"one": "One", "four": "Four"})  # English dropped two keys, added one
        assert draft_language("tr", ["m"], False, lambda lang, items: {}) == ["m:ns.four"]  # a failed draft is named
        assert _read(ROOT / "m/tr/ns.json") == {"one": "Bir"} and "ns.two" not in _read(ROOT / "m/tr.review.json")

        # export, then import: values and reviewed flags land
        assert draft_language("tr", ["m"], False, drafter) == []
        rows = export_rows("tr", ["m"])
        assert [r["key"] for r in rows] == ["m:ns.four"], rows
        rows[0]["translation"] = "Dort"
        assert import_rows("tr", rows + [{"key": "backend:Save", "translation": "Kaydet"}]) == [
            {"key": "backend:Save", "translation": "Kaydet"}
        ]
        assert _read(ROOT / "m/tr/ns.json")["four"] == "Dort"
        assert _read(ROOT / "m/tr.review.json")["ns.four"]["reviewed"] is True
        assert export_rows("tr", ["m"]) == []
    ROOT = saved_root

    # a CSV round trip with commas, quotes and newlines
    rows = [
        {"key": "r:a.b", "english": 'Say "hi", then\nleave', "translation": "Selam, \"dunya\"\r\nbye", "where": "r:a"},
        {"key": "backend:x\x04y", "english": "a,b", "translation": "", "where": "apps/x.py; context: y"},
    ]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "sheet.csv"
        write_csv(path, rows)
        assert read_csv(path) == rows
    print("translate.py: self-test passed")
    return 0


def main(argv: list[str]) -> int:
    if argv and argv[0] == "export":
        parser = argparse.ArgumentParser(prog="translate.py export")
        parser.add_argument("lang", choices=languages())
        parser.add_argument("--out")
        parser.add_argument("--root", action="append")
        args = parser.parse_args(argv[1:])
        rows = export_rows(args.lang, args.root or ROOTS)
        proc = _docker_po("--export", args.lang)
        if proc.returncode != 0:
            print(proc.stderr, file=sys.stderr)
            return 1
        rows += [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
        out = args.out or f"i18n-review-{args.lang}.csv"
        write_csv(ROOT / out, rows)
        print(f"{len(rows)} unreviewed text(s) -> {out}")
        return 0
    if argv and argv[0] == "import":
        parser = argparse.ArgumentParser(prog="translate.py import")
        parser.add_argument("file")
        parser.add_argument("--to", choices=languages())
        parser.add_argument("--root", action="append")
        args = parser.parse_args(argv[1:])
        lang = args.to or (re.search(r"i18n-review-(\w+)\.csv$", args.file) or [None, None])[1]
        if lang not in languages():
            print("translate: say which language with --to", file=sys.stderr)
            return 1
        backend = import_rows(lang, read_csv(args.file))
        if backend:
            proc = _docker_po("--import", lang, "\n".join(json.dumps(r) for r in backend))
            print(proc.stderr.strip(), file=sys.stderr)
            return proc.returncode
        return 0

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--to", choices=languages())
    parser.add_argument("--root", action="append")
    parser.add_argument("--redraft", action="store_true")
    parser.add_argument("--skip-po", action="store_true", help="skip the .po pass (run it once after parallel runs)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        import contextlib
        import io

        with contextlib.redirect_stderr(io.StringIO()):  # the progress lines of the cases
            return self_test()
    failed = []
    for lang in [args.to] if args.to else languages():
        failed += draft_language(lang, args.root or ROOTS, args.redraft)
    if failed:
        print(f"translate: {len(failed)} text(s) not drafted (run again):", file=sys.stderr)
        for key in failed:
            print(f"  {key}", file=sys.stderr)
    code = 0 if args.skip_po else run_po(args.to, args.redraft)
    return 1 if failed else code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
