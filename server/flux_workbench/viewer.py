"""Open an image in the system's default viewer (multi-platform since #61)."""

import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

Runner = Callable[..., Any]


class ViewerError(RuntimeError):
    """``open``/``xdg-open``/``os.startfile`` failed. API maps this to HTTP 500 with the message."""


def viewer_command(path: Path, platform: str) -> list[str] | None:
    """
    Command that opens `path` in the default viewer for `platform` (`sys.platform` syntax):

    - macOS (`platform == "darwin"`): `["open", str(path)]`
    - any other POSIX (`"linux"`, `"freebsd13"`, ...): `["xdg-open", str(path)]`
    - Windows (`platform.startswith("win")`): `None` - there is no portable command; Windows is
      opened through `os.startfile(str(path))` instead.
    """
    raise NotImplementedError


def open_in_viewer(
    path: Path,
    runner: Runner = subprocess.run,
    platform: str | None = None,
) -> None:
    """
    Open `path` in the system viewer; `platform=None` means `sys.platform` (#61).

    - Windows: call `os.startfile(str(path))`, looked up via `getattr(os, "startfile", None)`.
      A missing attribute -> ``ViewerError("Viewer could not be started: os.startfile is not
      available")``. `runner` is NOT used on Windows.
    - Otherwise: run ``viewer_command(path, platform)`` as
      ``runner(cmd, check=True, timeout=10)``.

    Raises:
        ViewerError: if opening fails - ``OSError``, ``subprocess.CalledProcessError`` or
            ``subprocess.TimeoutExpired``; message ``f"Viewer could not be started: {exc}"``.
    """
    raise NotImplementedError
