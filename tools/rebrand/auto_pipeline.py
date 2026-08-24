#!/usr/bin/env python3
"""Auto-pipeline: wait for baseline completion, then Layer1 -> gate -> Layer2.

Run:  py tools/rebrand/auto_pipeline.py
Safe to re-run; skips work that's already committed."""
import os, subprocess, sys, time

ROOT = r"C:\Users\chira\kova-agent"
RB = os.path.join(ROOT, "tools", "rebrand")
PY = os.path.join(ROOT, ".venv", "Scripts", "python.exe")
EXPECTED_CHUNKS = 13


def chunks_done():
    return len([f for f in os.listdir(os.path.join(RB, "baseline_parts"))
                if f.endswith(".xml")])


def sh(cmd, timeout=1800):
    print(f"\n$ {cmd[:90]}", flush=True)
    return subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True,
                          text=True, timeout=timeout)


def main():
    # 1. finish baseline if the chunked runner died early
    while chunks_done() < EXPECTED_CHUNKS:
        print(f"baseline: {chunks_done()}/{EXPECTED_CHUNKS} chunks — resuming runner",
              flush=True)
        r = sh(f'"{PY}" "{os.path.join(RB, "baseline_chunked.py")}"',
               timeout=7200)
        print(r.stdout[-500:] if r.stdout else "", flush=True)
        if chunks_done() < EXPECTED_CHUNKS:
            print("chunks still missing after pass; retrying in 60s", flush=True)
            time.sleep(60)
    print("BASELINE COMPLETE.", flush=True)

    # 2. Layer 1 (apply_layer1.py is idempotent)
    r = sh(f'"{PY}" "{os.path.join(RB, "apply_layer1.py")}"', timeout=3600)
    print((r.stdout or "")[-800:], (r.stderr or "")[-300:], flush=True)
    gate = sh(f'"{PY}" -m pytest tests/test_kova_home_migration.py '
              f'tests/kova_cli/test_config.py -q '
              f'--tb=line -p no:cacheprovider --timeout=120', timeout=900)
    print("L1 GATE:", gate.stdout[-600:], flush=True)
    sh('git add -A && git commit -m "feat(surface): Kova branding, ~/.kova home + Kova migration, KOVA_* aliases"')

    # 3. Layer 2
    log = subprocess.run(["git", "-C", ROOT, "log", "--oneline", "-8"],
                         capture_output=True, text=True).stdout
    if "internals renamed" not in log:
        r = sh(f'"{PY}" "{os.path.join(RB, "apply_layer2.py")}"', timeout=7200)
        print((r.stdout or "")[-1500:], (r.stderr or "")[-400:], flush=True)
        gate = sh(f'"{PY}" -m pytest tests/kova_cli tests/tools -q --tb=no -rf '
                  f'-n 8 --timeout=300 -p no:cacheprovider '
                  f'--junitxml={os.path.join(RB, "l2_gate.xml")}', timeout=3600)
        print("L2 GATE:", gate.stdout[-600:], flush=True)
        sh('git add -A && git commit -m "refactor!: internals kova->kova (compat shims kept)"')

    # 4. merge final baseline ledger
    sh(f'"{PY}" "{os.path.join(RB, "merge_junits.py")}"')
    print("\nPIPELINE DONE — full suite verification next.", flush=True)


if __name__ == "__main__":
    main()
