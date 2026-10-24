"""Tests for the multi-platform viewer (#61)."""

import os
import subprocess
from pathlib import Path

import pytest

from flux_workbench.viewer import ViewerError, open_in_viewer, viewer_command

PNG = Path("/p/1.png")


def test_macos_runs_open() -> None:
    calls = []

    open_in_viewer(PNG, runner=lambda *a, **kw: calls.append((a, kw)), platform="darwin")

    assert calls == [((["open", "/p/1.png"],), {"check": True, "timeout": 10})]


def test_linux_runs_xdg_open() -> None:
    calls = []

    open_in_viewer(PNG, runner=lambda *a, **kw: calls.append((a, kw)), platform="linux")

    assert calls == [((["xdg-open", "/p/1.png"],), {"check": True, "timeout": 10})]


def test_other_posix_uses_xdg_open() -> None:
    calls = []

    open_in_viewer(PNG, runner=lambda *a, **kw: calls.append((a, kw)), platform="freebsd13")

    assert calls == [((["xdg-open", "/p/1.png"],), {"check": True, "timeout": 10})]


def test_windows_uses_startfile_and_not_the_runner(monkeypatch: pytest.MonkeyPatch) -> None:
    opened: list[str] = []
    runner_calls: list[object] = []
    monkeypatch.setattr(os, "startfile", opened.append, raising=False)

    open_in_viewer(PNG, runner=lambda *a, **kw: runner_calls.append(a), platform="win32")

    assert opened == ["/p/1.png"]
    assert runner_calls == []


def test_windows_without_startfile_reports_viewer_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delattr(os, "startfile", raising=False)

    with pytest.raises(ViewerError, match="startfile"):
        open_in_viewer(PNG, runner=lambda *a, **kw: None, platform="win32")


@pytest.mark.parametrize("platform", ["darwin", "linux"])
@pytest.mark.parametrize(
    "exc",
    [
        FileNotFoundError("nope"),
        subprocess.CalledProcessError(1, ["x"]),
        subprocess.TimeoutExpired(["x"], 10),
    ],
)
def test_errors_become_viewer_error(exc: Exception, platform: str) -> None:
    def runner(*_a, **_kw):
        raise exc

    with pytest.raises(ViewerError, match="Viewer could not be started"):
        open_in_viewer(PNG, runner=runner, platform=platform)


def test_viewer_command_returns_the_platform_command() -> None:
    assert viewer_command(PNG, "darwin") == ["open", "/p/1.png"]
    assert viewer_command(PNG, "linux") == ["xdg-open", "/p/1.png"]
    assert viewer_command(PNG, "win32") is None
