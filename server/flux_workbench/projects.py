"""Projects on disk: ``<root>/YYYYMMDD-<name>/<n>.png`` + ``<n>.json``.

All paths that come from the outside (project ids, image numbers) are validated
here, so nothing outside ``root`` can ever be read, written or deleted.
"""

import json
import re
import shutil
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

#: Valid project id, e.g. ``20261007-Mein_Auto``.
PROJECT_ID_RE = re.compile(r"^\d{8}-[A-Za-z0-9_-]+$")

#: Image file name, e.g. ``12.png`` -> group 1 = ``12``.
IMAGE_RE = re.compile(r"^(\d+)\.png$")

#: Settings file name, e.g. ``12.json`` -> group 1 = ``12``.
JSON_RE = re.compile(r"^(\d+)\.json$")

#: Umlauts are transliterated before invalid characters are dropped.
TRANSLITERATION = {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"}

#: Maximum length of an image comment (characters).
MAX_COMMENT_LEN = 5000


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
    result = name.strip()
    for key, value in TRANSLITERATION.items():
        result = result.replace(key, value)
    result = re.sub(r"\s+", "_", result)
    result = re.sub(r"[^A-Za-z0-9_-]", "", result)
    result = result.strip("_-")
    result = result[:60]
    if not result:
        raise ProjectError(f"Leerer Projektname nach Bereinigung: {name!r}")
    return result


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
        return sorted(
            (
                entry.name
                for entry in self.root.iterdir()
                if entry.is_dir() and not entry.is_symlink() and PROJECT_ID_RE.fullmatch(entry.name)
            ),
            reverse=True,
        )

    def list_project_infos(self) -> list[dict[str, Any]]:
        """Return ``[{"id": str, "image_count": int}, ...]`` in the order of ``list_projects()``.

        ``image_count`` = number of ``<n>.png`` files (``len(self.list_images(id))``).
        A project folder deleted between listing and counting is skipped (catch ``NotFound``).
        """
        raise NotImplementedError

    def create_project(self, name: str) -> str:
        """Create ``root/<YYYYMMDD>-<sanitize_name(name)>`` and return its id.

        Date = ``self.today().strftime("%Y%m%d")``.

        Raises:
            ProjectError: from ``sanitize_name`` (empty name).
            ProjectExists: if the folder already exists (do not touch it).
        """
        project_id = f"{self.today().strftime('%Y%m%d')}-{sanitize_name(name)}"
        folder = self.root / project_id
        if folder.exists():
            raise ProjectExists(project_id)
        folder.mkdir()
        return project_id

    def project_dir(self, project_id: str) -> Path:
        """Return ``root / project_id`` after validating it.

        Raises:
            ProjectError: if ``project_id`` does not match ``PROJECT_ID_RE``
                (this blocks ``..``, ``/``, empty strings, etc.).
            NotFound: if the folder does not exist or is not a directory.
        """
        if not PROJECT_ID_RE.fullmatch(project_id):
            raise ProjectError(f"Ungültige Projekt-ID: {project_id!r}")
        folder = self.root / project_id
        if not folder.is_dir():
            raise NotFound(project_id)
        return folder

    def delete_project(self, project_id: str) -> None:
        """Delete the project folder recursively (``shutil.rmtree``).

        Uses ``project_dir`` for validation, so the same exceptions apply.
        """
        shutil.rmtree(self.project_dir(project_id))

    def list_images(self, project_id: str) -> list[int]:
        """Return the numbers ``n`` of all ``<n>.png`` files, sorted ascending as ints.

        ``[1, 2, 10]`` - numeric, not lexical. Files not matching ``IMAGE_RE``
        (e.g. ``bild.png``, ``3.json``) are ignored. A ``.png`` without a ``.json``
        is still listed. Raises like ``project_dir``.
        """
        folder = self.project_dir(project_id)
        return sorted(self._file_numbers(folder, IMAGE_RE))

    @staticmethod
    def _file_numbers(folder: Path, pattern: re.Pattern[str]) -> set[int]:
        """Return the integer ``n`` of every file name in ``folder`` matching ``pattern``."""
        return {
            int(match.group(1))
            for match in (pattern.fullmatch(f.name) for f in folder.iterdir())
            if match
        }

    def image_path(self, project_id: str, n: int) -> Path:
        """Return the path of ``<n>.png`` in the project.

        Raises:
            ProjectError: invalid project id (via ``project_dir``) or ``n < 1``.
            NotFound: project or file does not exist.
        """
        if n < 1:
            raise ProjectError(f"Ungültige Bildnummer: {n}")
        folder = self.project_dir(project_id)
        path = folder / f"{n}.png"
        if not path.is_file():
            raise NotFound(str(path))
        return path

    def read_settings(self, project_id: str, n: int) -> dict[str, Any]:
        """Read ``<n>.json``; return ``{"request": dict, "effective": dict|None, "comment": str}``.

        TODO(WP1): currently returns no ``"comment"`` – extend per the rules below.

        Normalisation: if the parsed JSON is a dict that has neither a ``"request"``
        nor an ``"effective"`` key (older, hand-written files), return
        ``{"request": data, "effective": None, "comment": ""}``. If ``"effective"`` is missing,
        use ``None``; if ``"request"`` is missing, use ``{}``.
        ``"comment"``: the file's ``"comment"`` value if it is a ``str``, otherwise ``""``
        (missing, ``null``, number, ...).

        Raises:
            ProjectError: invalid project id, ``n < 1``, file is not valid JSON
                or not a JSON object.
            NotFound: project or ``<n>.json`` does not exist.
        """
        if n < 1:
            raise ProjectError(f"Ungültige Bildnummer: {n}")
        folder = self.project_dir(project_id)
        path = folder / f"{n}.json"
        if not path.is_file():
            raise NotFound(str(path))
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ProjectError(f"Ungültiges JSON in {path.name}: {exc}") from exc
        if not isinstance(data, dict):
            raise ProjectError(f"Settings sind kein JSON-Objekt: {path.name}")
        if "request" not in data and "effective" not in data:
            return {"request": data, "effective": None}
        return {"request": data.get("request", {}), "effective": data.get("effective")}

    def save_comment(self, project_id: str, n: int, comment: str) -> None:
        """Store ``comment`` as the ``"comment"`` field of ``<n>.json``; keep everything else.

        Steps: validate like ``read_settings`` (same exceptions, same messages for invalid JSON);
        if ``len(comment) > MAX_COMMENT_LEN`` raise ``ProjectError("Kommentar zu lang")``.
        Load the raw JSON dict. If it is an old plain dict (neither ``"request"`` nor
        ``"effective"`` key), first convert it to ``{"request": data, "effective": None}`` so the
        comment does not end up inside the request. Set ``data["comment"] = comment`` and write the
        file back with ``json.dumps(data, indent=2, ensure_ascii=False)`` (UTF-8), like
        ``save_render``. An empty string is stored as ``""`` (not removed).
        Never touches ``<n>.png``.

        Raises:
            ProjectError: invalid id, ``n < 1``, invalid JSON / not an object, comment too long.
            NotFound: project or ``<n>.json`` does not exist.
        """
        raise NotImplementedError

    def next_number(self, project_id: str) -> int:
        """Return 1 + the highest ``n`` of any ``<n>.png`` or ``<n>.json`` (1 if there is none).

        Raises like ``project_dir``.
        """
        folder = self.project_dir(project_id)
        numbers = self._file_numbers(folder, IMAGE_RE) | self._file_numbers(folder, JSON_RE)
        return max(numbers, default=0) + 1

    def save_render(self, project_id: str, png: bytes, settings: dict[str, Any]) -> int:
        """Store a finished render as the next number and return that number.

        ``n = next_number(project_id)``; write ``<n>.png`` (bytes) first, then ``<n>.json``
        (``json.dumps(settings, indent=2, ensure_ascii=False)``, UTF-8).
        ``settings`` is ``{"request": ..., "effective": ...}`` as built by the queue.

        Raises like ``project_dir`` (e.g. NotFound if the project was deleted meanwhile).
        """
        n = self.next_number(project_id)
        folder = self.project_dir(project_id)
        (folder / f"{n}.png").write_bytes(png)
        (folder / f"{n}.json").write_text(
            json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return n
