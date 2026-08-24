# Kova Agent — Rebrand Playbook

Turning the Kova Agent fork into **Kova Agent**: layered, verifiable, CI-safe.
Golden rule: **one layer = one commit = suite still green.** Never mix layers.

## License obligations (MIT)
- Keep `Copyright (c) 2025 Nous Research` in `LICENSE` (add Kova line above it).
- Credit "based on Kova Agent by Neural Studio" in README. Nothing else owed.
- NEVER market under the name/logo "Kova".

## Survey results (baseline, pre-rename)
| Category | Count |
|---|---|
| total `kova` matches | 86,619 across 5,659 files |
| in `tests/` | 28,212 |
| in `website/` (docs site source) | 20,261 |
| unique `HERMES_*` env vars | 599 |
| model-ID tokens (PROTECTED) | 15 unique / 73 hits |
| unique upstream URLs | 378 |
| `~/.kova`-style path refs | 5,552 |
| python imports of `kova*` modules | 8,550 |

## Protected forever (the whitelist)
1. **Model IDs**: `Hermes-4-70B`, `Hermes-3-Llama-3.1-70B`, `Hermes 3`, … and
   URL slugs like `nousresearch/hermes-4-405b` — these are *products on other
   platforms*, renaming breaks providers/models.
2. **The LICENSE copyright line.**
3. **Lockfiles**: `uv.lock`, `package-lock.json`, `flake.lock`.
4. Git history stays intact — we rewrite nothing historical.

## Layers (each = one atomic commit)

### Identity decisions (user-approved)
- Product/org: **Kova** by **Neural Studio** (`neuralstudio.in`).
- Landing + docs: **https://kova.neuralstudio.in** (docs live under /docs).
- Repo: OpenKova/kova.
- Logo: user-supplied mark (`kova-assets/staged/icons_user/`) — replaces ALL
  Kova/Nous artwork incl. the mascot ("nous girl") frames.
- Naming follows upstream convention: product "Kova"→"Kova", CLI
  `kova`→`kova`. Docs content + SOUL.md strings ride the same engine passes.
- portal.nousresearch.com / inference-api.nousresearch.com are NOT rebranded:
  they stay as an optional model provider. Only Kova's own surfaces move.

### Coexistence audit (done): Kova vs existing Kova install
Shared-resource scan result — after rename there is NO collision:
| Resource | Kova | Kova |
|---|---|---|
| Config dir | ~/.kova (%LOCALAPPDATA%\kova) | ~/.kova (%LOCALAPPDATA%\kova) |
| Binaries | kova.exe / kova | kova.exe / kova |
| launchd label | in.neuralstudio.kova.* | in.neuralstudio.kova |
| Win app-id | in.neuralstudio.kova | in.neuralstudio.kova |
| URL scheme | kova:// | kova:// |
| Tunnel port | 9090 (wizard reassigns on collide) | default moved to 9190 |
| Sockets/pipes/mutexes | derived from home dir/app-id | derived from home dir/app-id |
| Ollama 11434 | shared third-party service | intentionally shared |
Only leftover risk: BOTH apps running simultaneously doubles RAM/CPU — not
a conflict, just resource use. Documented in README troubleshooting later.

### Layer 0 — Brand skin (zero-risk)
- Electron `productName`, window titles, icons, installer metadata (`apps/`).
- Add second CLI entry point `kova` alongside `kova` in `pyproject.toml`.
- Landing page/README top-level naming.

### Layer 1 — User-facing surface (low risk)
- **Env-var aliasing at bootstrap**: in `kova_bootstrap.py` /
  `kova_constants.py`, seed `os.environ` so every `KOVA_*` var is readable as
  its legacy `HERMES_*` name (one shim, not 599 edits). All internal reads
  unchanged → tests unaffected.
- Config dir: resolve `~/.kova` with automatic migration/import of an existing
  `~/.kova` on first run.
- User-visible strings: CLI help text, desktop UI copy, `locales/*`,
  docs pages users read.
- Tool: `python tools/rebrand/rename_engine.py --layer 1 --dry-run` → review → `--apply`.

### Layer 2 — Internals (atomic, medium risk)
- Content pass: `hermes_*` identifiers → `kova_*`, `HERMES_*` env strings →
  `KOVA_*`, remaining prose. Engine `--layer 2`.
- Path pass: `git mv kova_cli kova_cli`, root `hermes_*.py` → `kova_*.py`,
  `setup-kova.sh` → `setup-kova.sh`, etc. **Same commit** as the content pass.
- Compat shims left behind: `kova_cli/__init__.py` re-exporting `kova_cli`
  (old skills/userscripts keep working; delete shims in a LATER release).
- Update tests asserting old strings in the SAME commit.

### Layer 3 — Decoupling (product work, ongoing)
- Update-checker + fork-sync checks → Kova endpoint (or disable by default).
- `portal.nousresearch.com`, `inference-api.nousresearch.com` OAuth flows →
  Kova auth/billing stub behind the same interface.
- Install scripts (`install.sh`/`install.ps1`) → Kova CDN URLs.
- Docs site (`website/`) → kova.dev (or wherever).
- GitHub links in templates/issues → OpenKova/kova.

## Verification protocol (per layer)
1. Baseline BEFORE any edits: create venv, `pip install -e .[dev]` (or uv sync),
   run the suite, record failures in `tools/rebrand/baseline.txt`.
   Pre-existing red ≠ your fault; anything NEW after a layer is.
2. `--dry-run` first; eyeball per-category counts against expectations.
3. Apply; `grep -ri kova --include=*.py -l` diff vs expectation; spot-check
   protected tokens survived (`Hermes-4-405B` still present!).
4. Full test suite. New failures fixed in-layer or layer reverted.
5. Commit.

## Known traps (from prior failed attempt)
- Tests assert on renamed strings → fix tests in the same commit, not after.
- `gateway.example.com/kova` style URL *paths*: renaming changes API surface;
  decide deliberately (keep `/kova` route as alias during transition).
- `locales/` translations: brand hides in translated strings — engine covers
  them, but have a native speaker skim user-facing ones later.
- `website/` is huge: treat docs as its own sub-project, don't block code layers on it.
