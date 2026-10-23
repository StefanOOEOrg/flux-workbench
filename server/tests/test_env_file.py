"""Tests for the minimal `.env` reader (#52)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from flux_workbench.env_file import load_env_file


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """No FLUX_* variable of the surrounding shell may leak into these tests."""
    for key in [k for k in os.environ if k.startswith("FLUX_")]:
        monkeypatch.delenv(key, raising=False)


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / ".env"
    path.write_text(text, encoding="utf-8")
    return path


def test_loads_key_value_pairs_in_file_order(tmp_path: Path) -> None:
    path = write(tmp_path, "FLUX_BRIDGE_URL=http://example.test:1/generate\nFLUX_PORT=9000\n")

    applied = load_env_file(path)

    assert applied == ["FLUX_BRIDGE_URL", "FLUX_PORT"]
    assert os.environ["FLUX_BRIDGE_URL"] == "http://example.test:1/generate"
    assert os.environ["FLUX_PORT"] == "9000"


def test_ignores_comments_blank_lines_and_lines_without_equals(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        "# a comment\n\n   \n  # indented comment\nnonsense\nFLUX_PORT=8081\n",
    )

    applied = load_env_file(path)

    assert applied == ["FLUX_PORT"]
    assert "nonsense" not in os.environ


def test_strips_export_prefix_and_matching_quotes(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        "export FLUX_PROJECTS_DIR='/tmp/a b'\nFLUX_BRIDGE_URL=\"http://host:1/x\"\nFLUX_HOST=x'y\n",
    )

    load_env_file(path)

    assert os.environ["FLUX_PROJECTS_DIR"] == "/tmp/a b"
    assert os.environ["FLUX_BRIDGE_URL"] == "http://host:1/x"
    assert os.environ["FLUX_HOST"] == "x'y"  # only matching pairs are stripped


def test_never_overrides_the_real_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FLUX_PORT", "1234")
    path = write(tmp_path, "FLUX_PORT=9999\nFLUX_HOST=127.0.0.2\n")

    applied = load_env_file(path)

    assert applied == ["FLUX_HOST"]
    assert os.environ["FLUX_PORT"] == "1234"


def test_missing_file_is_not_an_error(tmp_path: Path) -> None:
    assert load_env_file(tmp_path / "does-not-exist") == []


def test_config_reads_the_env_file_before_its_constants(tmp_path: Path) -> None:
    """The module constants are built at import time - the file must be loaded first."""
    env_file = write(tmp_path, "FLUX_BRIDGE_URL=http://192.0.2.10:8002/generate\n")
    env = {k: v for k, v in os.environ.items() if not k.startswith("FLUX_")}
    env["FLUX_ENV_FILE"] = str(env_file)

    result = subprocess.run(
        [sys.executable, "-c", "from flux_workbench import config; print(config.BRIDGE_URL)"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "http://192.0.2.10:8002/generate"
