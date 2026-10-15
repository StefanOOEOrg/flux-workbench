"""Open an image in the macOS default viewer."""

import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

Runner = Callable[..., Any]


class ViewerError(RuntimeError):
    """``open`` failed. API maps this to HTTP 500 with the message."""


def open_in_viewer(path: Path, runner: Runner = subprocess.run) -> None:
    """Run ``runner(["open", str(path)], check=True, timeout=10)``.

    ``open`` returns immediately on macOS. ``runner`` is injected for tests.

    Raises:
        ViewerError: if the runner raises ``OSError`` (e.g. ``open`` not found),
            ``subprocess.CalledProcessError`` or ``subprocess.TimeoutExpired``;
            message ``f"Viewer could not be started: {exc}"``.
    """
    try:
        runner(["open", str(path)], check=True, timeout=10)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ViewerError(f"Viewer could not be started: {exc}") from exc
