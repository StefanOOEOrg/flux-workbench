"""Projects on disk: ``<root>/YYYYMMDD-<name>/<n>.png`` + ``<n>.json``.

All paths that come from the outside (project ids, image numbers) are validated
here, so nothing outside ``root`` can ever be read, written or deleted.
"""

import re
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

#: Valid project id, e.g. ``20261007-Mein_Auto``.
PROJECT_ID_RE = re.compile(r"^\d{8}-[A-Za-z0-9_-]+$")

#: Image file name, e.g. ``12.png`` -> group 1 = ``12``.
IMAGE_RE = re.compile(r"^(\d+)\.png$")

#: Umlauts are transliterated before invalid characters are dropped.
TRANSLITERATION = {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"}


class ProjectError(ValueError):
    """Invalid input (bad name, bad id, bad JSON). API maps this to HTTP 400."""


class ProjectExists(ProjectError):
    """Project folder already exists. API maps this to HTTP 409."""


class NotFound(LookupError):
    """Project, image or settings file does not exist. API maps this to HTTP 404."""


def sanitize_name(name: str) -> str:
    """Turn a user-entered project name into the ``<name>`` part of a project id.

    Steps, in this order:
    1. ``name.strip()``.
    2. Replace each key of ``TRANSLITERATION`` by its value (``"Größe"`` -> ``"Groesse"``).
    3. Replace every run of whitespace by a single ``"_"`` (``re.sub(r"\\s+", "_", ...)``).
    4. Remove every character that is not in ``[A-Za-z0-9_-]``.
    5. Strip leading/trailing ``"_"`` and ``"-"``.
    6. Truncate to 60 characters.

    Examples: ``"Mein Auto!"`` -> ``"Mein_Auto"``, ``"  a  b "`` -> ``"a_b"``,
    ``"../etc"`` -> ``"etc"``.

    Raises:
        ProjectError: if the result is empty (e.g. ``""``, ``"!!!"``, ``"   "``).
    """
    raise NotImplementedError


class ProjectStore:
    """File-system access for projects. One instance per server, shared by API and queue."""

    def __init__(self, root: Path, today: Callable[[], date] = date.today) -> None:
        """Store ``root`` (create it with ``mkdir(parents=True, exist_ok=True)``) and ``today``.

        ``today`` is injected so tests can fix the date prefix.
        """
        self.root = root
        self.today = today
        self.root.mkdir(parents=True, exist_ok=True)

    def list_projects(self) -> list[str]:
        """Return the ids of all project folders, sorted descending (newest first).

        Only direct sub-directories of ``root`` whose name matches ``PROJECT_ID_RE``
        are returned; files, symlinks and other folders are ignored.
        Empty root -> ``[]``.
        """
        raise NotImplementedError

    def create_project(self, name: str) -> str:
        """Create ``root/<YYYYMMDD>-<sanitize_name(name)>`` and return its id.

        Date = ``self.today().strftime("%Y%m%d")``.

        Raises:
            ProjectError: from ``sanitize_name`` (empty name).
            ProjectExists: if the folder already exists (do not touch it).
        """
        raise NotImplementedError

    def project_dir(self, project_id: str) -> Path:
        """Return ``root / project_id`` after validating it.

        Raises:
            ProjectError: if ``project_id`` does not match ``PROJECT_ID_RE``
                (this blocks ``..``, ``/``, empty strings, etc.).
            NotFound: if the folder does not exist or is not a directory.
        """
        raise NotImplementedError

    def delete_project(self, project_id: str) -> None:
        """Delete the project folder recursively (``shutil.rmtree``).

        Uses ``project_dir`` for validation, so the same exceptions apply.
        """
        raise NotImplementedError

    def list_images(self, project_id: str) -> list[int]:
        """Return the numbers ``n`` of all ``<n>.png`` files, sorted ascending as ints.

        ``[1, 2, 10]`` - numeric, not lexical. Files not matching ``IMAGE_RE``
        (e.g. ``bild.png``, ``3.json``) are ignored. A ``.png`` without a ``.json``
        is still listed. Raises like ``project_dir``.
        """
        raise NotImplementedError

    def image_path(self, project_id: str, n: int) -> Path:
        """Return the path of ``<n>.png`` in the project.

        Raises:
            ProjectError: invalid project id (via ``project_dir``) or ``n < 1``.
            NotFound: project or file does not exist.
        """
        raise NotImplementedError

    def read_settings(self, project_id: str, n: int) -> dict[str, Any]:
        """Read ``<n>.json`` and return it as ``{"request": dict, "effective": dict | None}``.

        Normalisation: if the parsed JSON is a dict that has neither a ``"request"``
        nor an ``"effective"`` key (older, hand-written files), return
        ``{"request": data, "effective": None}``. If ``"effective"`` is missing, use ``None``;
        if ``"request"`` is missing, use ``{}``.

        Raises:
            ProjectError: invalid project id, ``n < 1``, file is not valid JSON
                or not a JSON object.
            NotFound: project or ``<n>.json`` does not exist.
        """
        raise NotImplementedError

    def next_number(self, project_id: str) -> int:
        """Return 1 + the highest ``n`` of any ``<n>.png`` or ``<n>.json`` (1 if there is none).

        Raises like ``project_dir``.
        """
        raise NotImplementedError

    def save_render(self, project_id: str, png: bytes, settings: dict[str, Any]) -> int:
        """Store a finished render as the next number and return that number.

        ``n = next_number(project_id)``; write ``<n>.png`` (bytes) first, then ``<n>.json``
        (``json.dumps(settings, indent=2, ensure_ascii=False)``, UTF-8).
        ``settings`` is ``{"request": ..., "effective": ...}`` as built by the queue.

        Raises like ``project_dir`` (e.g. NotFound if the project was deleted meanwhile).
        """
        raise NotImplementedError
