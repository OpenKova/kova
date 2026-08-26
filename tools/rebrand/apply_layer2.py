#!/usr/bin/env python3
"""Apply Layer 2 (internals): engine pass, then git mv of modules/dirs,
compat shim, pyproject wiring. Idempotent. Run AFTER layer 1 committed."""
import os, re, subprocess, sys

ROOT = r"C:\Users\chira\kova-agent"
STAGED = r"C:\Users\chira\kova-assets\staged"


def sh(cmd):
    r = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip()
    print(f"$ {cmd[:70]}\n  {out[:200]}")
    return r.returncode


def engine():
    return sh(f'"{os.path.join(ROOT, ".venv", "Scripts", "python.exe")}" '
              f'tools/rebrand/rename_engine.py --layer 2 --apply')


def moves():
    todo = [
        ("kova_cli", "kova_cli"),
        ("setup-kova.sh", "setup-kova.sh"),
        ("kova_constants.py", "kova_constants.py"),
        ("kova_bootstrap.py", "kova_bootstrap.py"),
        ("kova_logging.py", "kova_logging.py"),
        ("kova_state.py", "kova_state.py"),
        ("kova_state_common.py", "kova_state_common.py"),
        ("kova_state_portability.py", "kova_state_portability.py"),
        ("kova_state_schema.py", "kova_state_schema.py"),
        ("kova_state_search.py", "kova_state_search.py"),
        ("kova_time.py", "kova_time.py"),
    ]
    for a, b in todo:
        src, dst = os.path.join(ROOT, a), os.path.join(ROOT, b)
        if os.path.exists(dst) or not os.path.exists(src):
            print(f"mv skip {a}"); continue
        sh(f'git mv "{a}" "{b}"')
    # kova/ package dir: only rename when nothing left references it literally
    txt_probe = subprocess.run(
        ["grep", "-rl", "-E", r"(^|[^_\w])import kova($|[^_\w])|from kova import",
         "--include=*.py", "."], cwd=ROOT, capture_output=True, text=True)
    live = [l for l in txt_probe.stdout.splitlines() if l.strip()]
    if not live and os.path.exists(os.path.join(ROOT, "kova")):
        sh('git mv kova kova_pkg')
        print("kova/ -> kova_pkg/ renamed")
    else:
        print(f"kova/ dir KEPT ({len(live)} literal imports)")


def shim():
    d = os.path.join(ROOT, "kova_cli")
    if not os.path.isdir(d):
        print("shim: kova_cli already primary; ensuring shim exists")
        os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "__init__.py")
    body = open(os.path.join(STAGED, "kova_cli_shim.py"), encoding="utf-8").read()
    open(p, "w", encoding="utf-8", newline="").write(body)
    print("shim written:", p)


def repair_scripts_section():
    """Engine's word_lower pass turns the legacy `kova = ...` script lines
    into duplicates of our pre-added `kova = ...` lines. Rewrite the whole
    [project.scripts] block canonically instead."""
    p = os.path.join(ROOT, "pyproject.toml")
    txt = open(p, encoding="utf-8").read()
    block = re.compile(r"\[project\.scripts\][^\[]*", re.S)
    canonical = (
        '[project.scripts]\n'
        'kova = "kova_cli.main:main"\n'
        'kova-agent = "run_agent:main"\n'
        'kova-acp = "acp_adapter.entry:main"\n'
        'kova = "kova_cli.main:main"\n'
        'kova-agent = "run_agent:main"\n'
        'kova-acp = "acp_adapter.entry:main"\n\n'
    )
    if "[project.scripts]" in txt:
        txt = block.sub(canonical, txt, count=1)
        open(p, "w", encoding="utf-8", newline="").write(txt)
        print("pyproject: [project.scripts] rewritten canonically")


def pyproject_fixups():
    p = os.path.join(ROOT, "pyproject.toml")
    txt = open(p, encoding="utf-8").read()
    subs = [
        ('kova = "kova_cli.main:main"', 'kova = "kova_cli.main:main"'),
        ('kova = "kova_cli.main:main"', 'kova = "kova_cli.main:main"'),
        ('include = ["agent", "agent.*", "tools", "tools.*", "kova_cli", "kova_cli.*"',
         'include = ["agent", "agent.*", "tools", "tools.*", "kova_cli", "kova_cli.*"'),
        ('"kova-agent[', '"kova-agent['),   # self-referencing extras
        ('name = "kova-agent"', 'name = "kova-agent"'),
    ]
    for a, b in subs:
        if a in txt:
            txt = txt.replace(a, b); print("pyproject:", a[:40], "-> ok")
    open(p, "w", encoding="utf-8", newline="").write(txt)


if __name__ == "__main__":
    rc = engine()
    moves()
    shim()
    repair_scripts_section()
    pyproject_fixups()
    # reinstall so entry points point at new module paths
    sh(f'"{os.path.join(ROOT, ".venv", "Scripts", "python.exe")}" -m pip install -q -e .')
    sys.exit(rc)
