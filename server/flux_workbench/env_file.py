"""Minimal `.env` reader (#52) - no extra dependency, the real environment always wins."""

import os
from pathlib import Path


def load_env_file(path: Path) -> list[str]:
    """
    Read `KEY=VALUE` lines from `path` into `os.environ` and return the keys that were applied.

    Rules (exactly these, nothing more):
    - Missing file -> `[]`. Not an error: the app must start without a `.env`.
    - Blank lines and lines whose first non-blank character is `#` are ignored.
    - A leading `export ` (with one space) is allowed and dropped.
    - `KEY` and `VALUE` are stripped. If the value is wrapped in matching single or double
      quotes, exactly one pair is removed (`KEY="a b"` -> `a b`).
    - A line without `=` is ignored (no exception, the rest of the file is still read).
    - A line whose key is empty after stripping is ignored.
    - An existing entry in `os.environ` is NEVER overwritten - the shell wins over the file.
    - The returned list holds the keys actually written to `os.environ`, in file order
      (keys that were skipped because they already existed are not part of it).
    """
    applied: list[str] = []

    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return applied

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        line = line.removeprefix("export ").strip()

        key, separator, value = line.partition("=")
        if not separator:
            continue

        key = key.strip()
        value = value.strip()
        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        if key in os.environ:
            continue  # the real environment wins over the file
        os.environ[key] = value
        applied.append(key)

    return applied
