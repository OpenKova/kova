#!/usr/bin/env python3
"""Kova rebrand engine — whitelist-driven, category-based, dry-run-first.

Usage:
  python tools/rebrand/rename_engine.py --layer 1 --dry-run
  python tools/rebrand/rename_engine.py --layer 1 --apply
  python tools/rebrand/rename_engine.py --all   --dry-run

Mechanics: PROTECTED tokens are masked with sentinels before any category
runs, restored afterwards. Lockfiles and binaries skipped. Report written to
tools/rebrand/last_run.json.
"""
import argparse, json, os, re, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", "dist", "build",
             "coverage", ".next", "target"}
SKIP_FILES = {"uv.lock", "package-lock.json", "flake.lock", "rename_engine.py"}
ALLOWED_EXTS = {".py", ".md", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
                ".json", ".yaml", ".yml", ".sh", ".ps1", ".nix", ".rs", ".toml",
                ".html", ".css", ".txt", ".example", ".cfg", ".ini", ".svg",
                ".xml", ".plist", ".iss", ".nsi", ""}

# ---- PROTECTED: masked before replacement, restored after -------------------
PROTECT = [
    ("model_ids",      re.compile(r"\bHermes[- ]?\d[\w.\-]*", re.I)),
    ("model_slugs",    re.compile(r"(?:nousresearch|nous)/hermes-\d[\w.\-/]*", re.I)),
    ("license_line",   re.compile(r"Copyright \(c\) 2025 Nous Research")),
]

# ---- CATEGORIES: (regex, replacement, layer) --------------------------------
# ORDER MATTERS: specific identity patterns MUST precede the generic word
# passes, or word_lower consumes the "hermes" inside them (preview caught
# com.nousresearch.hermes -> com.nousresearch.kova leakage).
CATEGORIES = {
    # --- identity / coexistence first ---
    "service_label": (re.compile(r"\bai\.hermes\b"),                    "in.neuralstudio.kova", 1),
    "app_id":        (re.compile(r"\bcom\.nousresearch\.hermes\b"),     "in.neuralstudio.kova", 1),
    "url_scheme":    (re.compile(r"\bhermes://"),                       "kova://",  1),
    "tunnel_port":   (re.compile(r'("tunnel_port":\s*)9090'),           r"\g<1>9190", 1),
    "org_name":      (re.compile(r"\bNous Research\b"),                 "Neural Studio", 1),
    # --- generic passes ---
    "config_dir":    (re.compile(r"(?<![\w.\-])\.hermes(?![\w.\-])"),   ".kova",    1),
    "brand_full":    (re.compile(r"\bHermes Agent\b"),                  "Kova Agent", 1),
    "word_cap":      (re.compile(r"\bHermes\b(?!\s?[-–]?\d)"),          "Kova",     1),
    "modules":       (re.compile(r"\bhermes_([A-Za-z_]\w*)"),            r"kova_\1", 2),
    "env_vars":      (re.compile(r"\bHERMES_([A-Z0-9_]+)\b"),           r"KOVA_\1", 2),
    "word_upper":    (re.compile(r"\bHERMES\b(?!\s?_?\d)"),             "KOVA",     2),
    "word_lower":    (re.compile(r"\bhermes\b(?![\w.\-]*\d)"),          "kova",     2),
}

# Layer-3 URL remaps (docs/install/repo -> Neural Studio infra).
# Deliberately NOT remapped: portal.nousresearch.com and
# inference-api.nousresearch.com stay functional (Nous remains an
# optional model provider); only Kova's own surfaces move.
URL_MAP = {
    "https://kova.neuralstudio.in/docs":  "https://kova.neuralstudio.in/docs",
    "https://kova.neuralstudio.in/install.sh": "https://kova.neuralstudio.in/install.sh",
    "https://kova.neuralstudio.in/install.ps1": "https://kova.neuralstudio.in/install.ps1",
    "https://kova.neuralstudio.in":       "https://kova.neuralstudio.in",
    "https://github.com/NousResearch/hermes-agent.git": "https://github.com/OpenKova/kova.git",
    "https://github.com/NousResearch/hermes-agent": "https://github.com/OpenKova/kova",
}


def iter_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn in SKIP_FILES:
                continue
            if os.path.splitext(fn)[1].lower() not in ALLOWED_EXTS:
                continue
            yield os.path.join(dirpath, fn)


def process(path, layers, url_map, stats, changed_files, write=False):
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError:
        return
    if b"\x00" in raw[:4096]:
        return
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return

    orig = text
    sentinels = {}

    def mask(m):
        key = f"\x00P{len(sentinels)}\x00"
        sentinels[key] = m.group(0)
        return key

    for _, rx in PROTECT:
        text = rx.sub(mask, text)

    for name, (rx, rep, layer) in CATEGORIES.items():
        if layer not in layers:
            continue
        text, n = rx.subn(rep, text)
        if n:
            stats[name] += n

    for old, new in url_map.items():
        if old in text:
            n = text.count(old)
            text = text.replace(old, new)
            stats["url_map"] += n

    for key, val in sentinels.items():   # unmask protected tokens
        text = text.replace(key, val)

    if text != orig and write:
        with open(path, "wb") as f:
            f.write(text.encode("utf-8"))
        changed_files.append(os.path.relpath(path, ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", type=int, choices=[1, 2, 3])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--apply", action="store_true", help="default is dry-run")
    args = ap.parse_args()

    if args.all:
        layers = {1, 2}
    elif args.layer:
        layers = {args.layer}
    else:
        sys.exit("pick --layer N or --all")

    url_map = URL_MAP if 3 in layers else {}
    stats = {name: 0 for name in CATEGORIES if CATEGORIES[name][2] in layers}
    stats["url_map"] = 0
    changed_files = []
    t0 = time.time()

    for p in iter_files():
        process(p, layers, url_map, stats, changed_files, write=args.apply)

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] layer={sorted(layers)} files_changed={len(changed_files)} "
          f"in {time.time()-t0:.1f}s")
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"  {k:14} {v}")
    report = {"mode": mode, "layers": sorted(layers), "stats": stats,
              "files": changed_files[:2000],
              "total_files": len(changed_files)}
    out = os.path.join(os.path.dirname(__file__), "last_run.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
    print(f"report -> {out}")
    if not args.apply:
        print("(dry-run only; rerun with --apply to write)")


if __name__ == "__main__":
    main()
