"""Detect a stale Angular build (#69) - pure pathlib, no server needed."""

from pathlib import Path


def newest_mtime(root: Path) -> float:
    """
    Newest modification time of any file below `root` (recursive), or `0.0` when `root`
    is missing or contains no files.

    Directories themselves do not count (only files).
    """
    raise NotImplementedError


def web_build_is_stale(src: Path, dist: Path) -> bool:
    """
    `True` when `dist/index.html` exists but is older than the newest file under `src`.

    `False` when:
    - `dist/index.html` does not exist (the "web app not built" hint covers that case, #61),
    - or `src` contains no files,
    - or the timestamps are equal (`>=` counts as fresh).

    Rationale: `web/dist` is gitignored, so `git pull` only updates the sources. Without a
    rebuild the server keeps serving the previous `index.html` and assets - the failure mode
    from #69 (new favicon never appeared).
    """
    raise NotImplementedError
