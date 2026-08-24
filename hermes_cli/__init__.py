"""Legacy-compat shim: ``import hermes_cli`` -> Kova Agent internals.

Created during Layer 2 (internals rename). The real implementation lives
in :mod:`kova_cli`. This package exists only so that older user skills,
scripts, and third-party integrations referencing ``hermes_cli*`` keep
working. It will be removed in a future release — migrate to ``kova_cli``.

Mechanism: this module replaces itself in ``sys.modules`` with the real
``kova_cli`` package. Because ``kova_cli.__path__`` comes along, even
``import hermes_cli.submodule`` resolves against the kova_cli tree.
"""
import sys

import kova_cli

sys.modules[__name__] = kova_cli

from kova_cli import *  # noqa: E402,F401,F403
