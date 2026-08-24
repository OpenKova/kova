"""``kova migrate import`` — explicitly adopt data from a legacy install.

Dry-run by default: prints what WOULD be copied (per top-level item, with
sizes). ``--apply`` performs the copy into the current Kova home. Never
touches the legacy home itself; never overwrites files that already exist
in the Kova home unless ``--overwrite`` is given.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Any

from kova_cli.colors import Colors, color

# Regenerable trees we never copy.
_IGNORES = shutil.ignore_patterns(
    "__pycache__", "*.pyc", "logs", "*.log", "cache", "node_modules",
    ".git", ".venv", "*.pid", "*.lock", ".migrated-from-kova",
)


def _find_legacy_homes() -> list[Path]:
    """Existing prior-install homes, newest generation first."""
    from kova_constants import _legacy_candidate_homes

    return [c for c in _legacy_candidate_homes() if c.is_dir()]


def _tree_size_mb(path: Path) -> float:
    total = 0
    for p in path.rglob("*"):
        try:
            if p.is_file():
                total += p.stat().st_size
        except OSError:
            continue
    return total / (1024 * 1024)


def cmd_migrate_import(args: Any) -> int:
    from kova_constants import get_hermes_home

    kova_home = Path(get_hermes_home())
    candidates = _find_legacy_homes()

    print()
    print(color("◆ Kova — import data from a previous Hermes/Kova install",
                Colors.CYAN, Colors.BOLD))
    print()

    if not candidates:
        print(f"  {color('✓', Colors.GREEN)} No legacy installs found. "
              "Nothing to import.")
        return 0

    print("  Legacy installs found:")
    for i, cand in enumerate(candidates):
        try:
            size = _tree_size_mb(cand)
        except OSError:
            size = 0.0
        print(f"    [{i}] {cand}  ({size:.1f} MB)")
    print()

    chosen = getattr(args, "from_path", None)
    if chosen:
        src = Path(chosen).expanduser().resolve()
        if not src.is_dir():
            print(color(f"  ✗ Not a directory: {src}", Colors.RED), file=__import__("sys").stderr)
            return 2
    else:
        src = candidates[0]  # newest generation wins by default
        if len(candidates) > 1:
            print(f"  Multiple installs found — defaulting to newest: {src}")
            print("  (pick another with --from <path>)")
            print()

    apply_mode = bool(getattr(args, "apply", False))
    overwrite = bool(getattr(args, "overwrite", False))

    # Plan: top-level items in the legacy home.
    plan_copy: list[Path] = []
    plan_skip_existing: list[Path] = []
    for entry in sorted(src.iterdir()):
        if _IGNORES and entry.name.startswith(".migrated-from"):
            continue
        dest = kova_home / entry.name
        if dest.exists() and not overwrite:
            plan_skip_existing.append(entry)
        else:
            plan_copy.append(entry)

    if not plan_copy and not plan_skip_existing:
        print(f"  {color('✓', Colors.GREEN)} Source home is empty. Nothing to import.")
        return 0

    print(f"  Source : {src}")
    print(f"  Target : {kova_home}")
    print()
    if plan_copy:
        print(f"  Will copy ({len(plan_copy)}):")
        for e in plan_copy:
            kind = "dir " if e.is_dir() else "file"
            print(f"    [{kind}] {e.name}")
    if plan_skip_existing:
        print(f"  Already exists in target — kept as-is ({len(plan_skip_existing)}):")
        for e in plan_skip_existing:
            print(f"    [skip] {e.name}")
        if not overwrite:
            print("  (use --overwrite to replace these)")
    print()

    if not apply_mode:
        print(color("  DRY RUN — nothing written. Re-run with --apply to import.",
                    Colors.YELLOW, Colors.BOLD))
        return 0

    copied = 0
    errors = 0
    for e in plan_copy:
        dest = kova_home / e.name
        try:
            kova_home.mkdir(parents=True, exist_ok=True)
            if e.is_dir():
                shutil.copytree(e, dest, symlinks=True, ignore=_IGNORES,
                                ignore_dangling_symlinks=True,
                                dirs_exist_ok=overwrite)
            else:
                shutil.copy2(e, dest)
            copied += 1
        except OSError as exc:
            errors += 1
            print(color(f"  ✗ {e.name}: {exc}", Colors.RED))

    print()
    if errors == 0:
        marker = kova_home / ".imported-from-hermes"
        marker.write_text(f"imported from {src}\n", encoding="utf-8")
        print(f"  {color('✓', Colors.GREEN)} Imported {copied} item(s) into {kova_home}")
        print("  Your old install was left untouched. Sessions, profiles and")
        print("  config now live inside Kova's own home.")
        return 0
    print(color(f"  Finished with {errors} error(s); "
                f"{copied} item(s) imported.", Colors.YELLOW))
    return 1


def register_migrate_import(subparsers: Any) -> None:
    parser = subparsers.add_parser(
        "import",
        help="Import sessions/profiles/config from an existing Hermes install",
        description="Adopt data from a legacy Hermes/Kova home. Dry-run by "
                    "default; add --apply to perform the copy.",
    )
    parser.add_argument("--apply", action="store_true",
                        help="Actually copy (default: dry run)")
    parser.add_argument("--from", dest="from_path", metavar="PATH",
                        help="Legacy home to import from (default: auto-detect)")
    parser.add_argument("--overwrite", action="store_true",
                        help="Replace items that already exist in the Kova home")
    parser.set_defaults(func=cmd_migrate_import)
