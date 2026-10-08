import subprocess
from pathlib import Path

import pytest

from flux_workbench.viewer import ViewerError, open_in_viewer


def test_open_calls_macos_open() -> None:
    calls = []
    open_in_viewer(Path("/p/1.png"), runner=lambda *a, **kw: calls.append((a, kw)))
    assert calls == [((["open", "/p/1.png"],), {"check": True, "timeout": 10})]


@pytest.mark.parametrize(
    "exc",
    [
        FileNotFoundError("open"),
        subprocess.CalledProcessError(1, ["open"]),
        subprocess.TimeoutExpired(["open"], 10),
    ],
)
def test_open_errors_become_viewer_error(exc: Exception) -> None:
    def runner(*_a, **_kw):
        raise exc

    with pytest.raises(ViewerError, match="Viewer"):
        open_in_viewer(Path("/p/1.png"), runner=runner)
