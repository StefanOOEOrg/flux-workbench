"""Shared fixtures for server tests."""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from flux_workbench.bridge import PNG_SIGNATURE, RenderResult
from flux_workbench.projects import ProjectStore

PNG = PNG_SIGNATURE + b"fake-png-body"
TODAY = date(2026, 10, 7)


@pytest.fixture
def store(tmp_path: Path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects", today=lambda: TODAY)


def make_project(store: ProjectStore, project_id: str, images: dict[int, Any]) -> Path:
    """Create a project folder by hand with ``<n>.png`` + ``<n>.json`` (value = JSON content)."""
    folder = store.root / project_id
    folder.mkdir()
    for n, settings in images.items():
        (folder / f"{n}.png").write_bytes(PNG)
        (folder / f"{n}.json").write_text(json.dumps(settings), encoding="utf-8")
    return folder


class FakeRenderer:
    """Records calls and detects parallel use; optional per-call error."""

    def __init__(self, errors: dict[int, Exception] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.active = 0
        self.max_active = 0
        self.errors = errors or {}

    async def render(self, request: dict[str, Any]) -> RenderResult:
        import asyncio

        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            index = len(self.calls)
            self.calls.append(request)
            await asyncio.sleep(0.01)
            if index in self.errors:
                raise self.errors[index]
            return RenderResult(png=PNG, effective={**request, "seed": 1000 + index})
        finally:
            self.active -= 1
