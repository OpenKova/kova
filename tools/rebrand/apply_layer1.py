#!/usr/bin/env python3
"""Apply Layer 1 (surface) surgically: env alias, ~/.kova home + migration,
migration test, then engine pass. Idempotent."""
import os, re, sys

ROOT = r"C:\Users\chira\kova-agent"
STAGED = r"C:\Users\chira\kova-assets\staged"


def patch_bootstrap():
    p = os.path.join(ROOT, "kova_bootstrap.py")
    txt = open(p, encoding="utf-8").read()
    if "KOVA_" in txt and "HERMES_\" + _k" in txt.replace("'", '"'):
        print("bootstrap: already patched"); return
    alias = """
# -- Kova compat (Layer 1): KOVA_* aliases resolve onto legacy names ----
import os as _os
for _k, _v in list(_os.environ.items()):
    if _k.startswith("KOVA_"):
        _legacy = "HERMES_" + _k[len("KOVA_"):]
        if _legacy not in _os.environ:
            _os.environ[_legacy] = _v
del _k, _v, _legacy
# ----------------------------------------------------------------------
"""
    # insert right after the module docstring (second quote-triple line)
    end = txt.find('"""', txt.find('"""') + 3) + 3
    txt = txt[:end] + "\n" + alias + txt[end:]
    open(p, "w", encoding="utf-8", newline="").write(txt)
    print("bootstrap: KOVA_* alias seeded")


def patch_constants():
    p = os.path.join(ROOT, "kova_constants.py")
    txt = open(p, encoding="utf-8").read()
    if "_migrate_legacy_home" in txt:
        print("constants: already patched"); return
    block = open(os.path.join(STAGED, "home_migration_block.py"),
                 encoding="utf-8").read()
    # strip the instructional header comment of the staged file
    block = block.split('"""', 2)[2].lstrip("\n")
    start = txt.index("def _get_platform_default_hermes_home")
    nxt = txt.index("\ndef ", txt.index("def _hermes_home_from_env"))
    txt = txt[:start] + block.rstrip() + "\n\n" + txt[nxt + 1:]
    open(p, "w", encoding="utf-8", newline="").write(txt)
    print("constants: kova default home + migration installed")


def add_test():
    dst = os.path.join(ROOT, "tests", "test_kova_home_migration.py")
    if os.path.exists(dst):
        print("test: already present"); return
    src = open(os.path.join(STAGED, "test_kova_home_migration.py"),
               encoding="utf-8").read()
    open(dst, "w", encoding="utf-8", newline="").write(src)
    print("test: migration tests added")


if __name__ == "__main__":
    patch_bootstrap()
    patch_constants()
    add_test()
    r = subprocess_ok = os.system(
        f'"{os.path.join(ROOT, ".venv", "Scripts", "python.exe")}" '
        f'{os.path.join(ROOT, "tools", "rebrand", "rename_engine.py")} '
        f"--layer 1 --apply")
    print("engine layer1:", "OK" if r == 0 else f"EXIT {r}")
    sys.exit(0 if r == 0 else 1)
