#!/usr/bin/env python3
"""Compare a post-change junit.xml against the baseline.

Usage:
  python tools/rebrand/check_regression.py path/to/run_junit.xml

Prints ONLY problems that are new or worse than baseline:
  - tests failing/erroring now that passed at baseline
  - tests missing now that existed at baseline
Exit code 0 = clean gate, 1 = regressions found.
"""
import sys, xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent


def paramless(key):
    # Parametrize args may themselves contain brand strings that were
    # renamed ("[pkill -f kova.*gateway]" -> "[pkill -f kova.*gateway]").
    # Compare identity without the bracket section for baseline matching.
    return key.split("[", 1)[0]


def load(path):
    root = ET.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else root.findall("testsuite")
    bad, ids = {}, set()

    def norm(key):
        # The rebrand renamed tests/kova_cli -> tests/kova_cli and
        # hermes_* modules -> kova_*. Normalize both sides so history
        # compares cleanly across the rename boundary.
        return (key.replace("tests.kova_cli", "tests.kova_cli")
                   .replace("tests.kova_cli.test_hermes_", "tests.kova_cli.test_kova_"))

    def paramless(key):
        # Parametrize args may themselves contain brand strings that were
        # renamed ("[pkill -f kova.*gateway]" -> "[pkill -f kova.*gateway]").
        # Compare identity without the bracket section for baseline matching.
        return key.split("[", 1)[0]

    for s in suites:
        for tc in s.iter("testcase"):
            key = norm(f"{tc.get('classname','')}#{tc.get('name','')}")
            ids.add(key)
            f, e = tc.find("failure"), tc.find("error")
            if f is not None or e is not None:
                node = f if f is not None else e
                bad[key] = (node.get("message") or "")[:120]
    return ids, bad


def main():
    run_path = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "run_junit.xml")
    base_ids, base_bad = load(HERE / "baseline_junit.xml")
    run_ids, run_bad = load(run_path)

    # Match across the rename boundary: a run-test counts as "was at
    # baseline" if its full id OR its param-stripped id exists there.
    base_by_paramless = {}
    for k in base_ids:
        base_by_paramless.setdefault(paramless(k), set()).add(k)
    base_bad_paramless = {}
    for k, v in base_bad.items():
        base_bad_paramless.setdefault(paramless(k), []).append(v)

    newly_broken = {}
    for k, v in run_bad.items():
        p = paramless(k)
        if k in base_bad:
            continue  # was already failing at baseline
        if p in {paramless(b) for b in base_bad}:
            continue  # same test (renamed params) already failing at baseline
        newly_broken[k] = v

    vanished = sorted(
        bid for bid in base_ids
        if paramless(bid) not in {paramless(r) for r in run_ids}
    )

    print(f"baseline : {len(base_ids)} tests, {len(base_bad)} bad")
    print(f"this run : {len(run_ids)} tests, {len(run_bad)} bad")
    print(f"\nNEWLY BROKEN ({len(newly_broken)}):")
    for k in sorted(newly_broken)[:60]:
        print(f"  ✗ {k}\n      {newly_broken[k]}")
    print(f"\nVANISHED FROM COLLECTION ({len(vanished)}):")
    for k in vanished[:40]:
        print(f"  ? {k}")
    fixed = len(base_bad) - len([k for k in base_bad if k in run_bad])
    print(f"\n(also: {fixed} baseline-bad now passing)")
    if newly_broken or vanished:
        print("\nGATE: FAIL ❌"); sys.exit(1)
    print("\nGATE: PASS ✅  (no new failures vs baseline)")


if __name__ == "__main__":
    main()
