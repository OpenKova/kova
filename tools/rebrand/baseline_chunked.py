#!/usr/bin/env python3
"""Chunked, resumable baseline runner.

Runs pytest per top-level test dir with 8 workers + 300s per-test timeout.
Each chunk's junit lands in baseline_parts/ immediately; completed chunks
are skipped on re-run. Safe against Kova restarts: just run again.

Usage:
  py tools/rebrand/baseline_chunked.py            # run remaining chunks
  py tools/rebrand/baseline_chunked.py --status   # show progress
"""
import os, subprocess, sys, time

ROOT = r"C:\Users\chira\kova-agent"
PARTS = os.path.join(ROOT, "tools", "rebrand", "baseline_parts")
PY = os.path.join(ROOT, ".venv", "Scripts", "python.exe")
LOG = os.path.join(ROOT, "tools", "rebrand", "chunk_last.log")

TEST_DIRS = [
    "tests/acp", "tests/acp_adapter", "tests/agent", "tests/cron",
    "tests/gateway", "tests/kova_cli", "tests/honcho_plugin",
    "tests/integration", "tests/plugins", "tests/tools", "tests/ui_tui",
    "tests/web", "tests",  # catch-all last (root-level files)
]


def chunk_done(tag):
    p = os.path.join(PARTS, f"chunk_{tag}.xml")
    return os.path.exists(p) and os.path.getsize(p) > 200


def status():
    print(f"{'CHUNK':28} STATE")
    for d in TEST_DIRS:
        tag = d.replace("/", "_")
        print(f"{d:28} {'DONE' if chunk_done(tag) else 'pending'}")


def main():
    if "--status" in sys.argv:
        status(); return
    os.makedirs(PARTS, exist_ok=True)
    t0 = time.time()
    for d in TEST_DIRS:
        tag = d.replace("/", "_")
        if chunk_done(tag):
            print(f"[skip] {d} (done)"); continue
        print(f"[run ] {d} ...", flush=True)
        junit = os.path.join(PARTS, f"chunk_{tag}.xml")
        cmd = [PY, "-m", "pytest", d, "-q", "--tb=no", "-rf", "-n", "8",
               "--timeout=300", "--timeout-method=thread",
               f"--junitxml={junit}", "-p", "no:cacheprovider"]
        if d == "tests":  # catch-all: skip already-run subdirs
            cmd += ["--ignore=" + os.path.join(ROOT, "tests", s)
                    for s in ("acp", "acp_adapter", "agent", "cron", "gateway",
                              "kova_cli", "honcho_plugin", "integration",
                              "plugins", "tools", "ui_tui", "web")]
        with open(LOG, "a", encoding="utf-8") as lf:
            lf.write(f"\n===== CHUNK {d} ({time.strftime('%H:%M:%S')}) =====\n")
            lf.flush()
            subprocess.run(cmd, cwd=ROOT, stdout=lf, stderr=subprocess.STDOUT)
        print(f"       -> {'OK' if chunk_done(tag) else 'NO XML (collection error?)'}")
    print(f"all chunks attempted in {time.time()-t0:.0f}s; merge next:")
    subprocess.run([PY, os.path.join(ROOT, "tools", "rebrand", "merge_junits.py")])


if __name__ == "__main__":
    main()
