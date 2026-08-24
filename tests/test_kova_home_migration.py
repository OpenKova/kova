"""Kova home resolution tests (post fresh-home policy).

Kova owns a dedicated home (%LOCALAPPDATA%/KovaAgent on Windows,
~/.kova-agent elsewhere). Legacy Hermes/Kova homes are NEVER adopted
silently — import is explicit via ``kova migrate import``.
"""

import os
from pathlib import Path

import pytest

import kova_constants


@pytest.fixture()
def fake_homes(monkeypatch, tmp_path):
    """Point Path.home() and LOCALAPPDATA at a scratch world."""
    home = tmp_path / "home"
    lad = tmp_path / "lad"
    home.mkdir()
    lad.mkdir()
    monkeypatch.setattr(Path, "home", lambda: home)
    monkeypatch.setenv("LOCALAPPDATA", str(lad))
    return {"home": home, "lad": lad, "tmp": tmp_path}


def test_default_home_is_dedicated_kovaagent(fake_homes):
    got = kova_constants._get_platform_default_hermes_home()
    assert got == Path(os.environ["LOCALAPPDATA"]) / "KovaAgent"


def _make_legacy_hermes_home(root):
    legacy = root / ".hermes"
    (legacy / "skills").mkdir(parents=True)
    (legacy / "config.yaml").write_text("display:\n  skin: default\n")
    (legacy / "skills" / "demo.md").write_text("hello")
    (legacy / "logs").mkdir()
    (legacy / "logs" / "gateway.log").write_text("noise")
    (legacy / "__pycache__").mkdir()
    (legacy / "__pycache__" / "junk.pyc").write_bytes(b"\x00")
    return legacy


def test_no_silent_adoption_of_legacy_homes(fake_homes):
    """The old silent copy must never fire, whatever legacy homes exist."""
    _make_legacy_hermes_home(fake_homes["home"])
    new_home = kova_constants._get_platform_default_hermes_home()

    kova_constants._migrate_legacy_home(new_home)  # deprecated no-op

    assert not new_home.exists()  # nothing was created
    assert not list(new_home.parent.glob("*.migrated-from*"))


def test_explicit_env_var_still_wins(fake_homes, monkeypatch, tmp_path):
    _make_legacy_hermes_home(fake_homes["home"])
    custom = tmp_path / "custom-home"
    monkeypatch.setenv("KOVA_HOME", str(custom))

    resolved = kova_constants._hermes_home_from_env()
    assert resolved == custom
    assert not custom.exists()          # nothing copied


def test_legacy_candidates_cover_all_generations(fake_homes):
    cands = kova_constants._legacy_candidate_homes()
    names = [c.name for c in cands]
    assert "kova" in names      # upstream codename-era (%LOCALAPPDATA%)
    assert ".kova" in names     # brief dot-dir generation
    assert ".hermes" in names   # original Hermes home
