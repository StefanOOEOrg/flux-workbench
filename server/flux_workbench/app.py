"""FastAPI app: REST API under ``/api`` + the built Angular app under ``/``.

Wiring (lifespan, exception mapping, static files, ``main``) is complete; the route
bodies are stubs. Every route is a thin call into ``ProjectStore`` / ``RenderQueue`` -
domain exceptions are translated to HTTP by the handlers below, routes do not catch them.
"""

import asyncio
import contextlib
from collections.abc import AsyncIterator, Callable
from dataclasses import asdict  # noqa: F401  (used by the route implementations)
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .bridge import BridgeClient
from .loras import load_loras
from .projects import NotFound, ProjectError, ProjectExists, ProjectStore
from .render_queue import JobNotCancellable, RenderQueue
from .viewer import ViewerError, open_in_viewer


class CreateProject(BaseModel):
    name: str


class SubmitJob(BaseModel):
    project_id: str
    request: dict[str, Any]


class SaveComment(BaseModel):
    comment: str


def create_app(
    store: ProjectStore,
    queue: RenderQueue,
    viewer: Callable[[Path], None] = open_in_viewer,
    web_dist: Path | None = None,
    lora_config_path: Path | None = None,
) -> FastAPI:
    """Build the app. Tests pass a ``tmp_path`` store, a queue with a fake renderer and a fake
    ``viewer``; ``web_dist=None`` means no static files are served. ``lora_config_path=None``
    means ``config.LORA_CONFIG_PATH`` (#34)."""

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        worker = asyncio.create_task(queue.run_worker())
        try:
            yield
        finally:
            worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await worker

    app = FastAPI(title="Flux Workbench", lifespan=lifespan)
    _add_exception_handlers(app)

    @app.get("/api/projects")
    def list_projects() -> list[dict[str, Any]]:
        """Return ``store.list_project_infos()`` (``[{"id", "image_count"}]``, newest first)."""
        return store.list_project_infos()

    @app.post("/api/projects", status_code=201)
    def create_project(body: CreateProject) -> dict[str, str]:
        """Return ``{"id": store.create_project(body.name)}``."""
        return {"id": store.create_project(body.name)}

    @app.delete("/api/projects/{project_id}", status_code=204)
    def delete_project(project_id: str) -> Response:
        """``store.delete_project(project_id)``; return ``Response(status_code=204)``."""
        store.delete_project(project_id)
        return Response(status_code=204)

    @app.get("/api/projects/{project_id}/images")
    def list_images(project_id: str) -> list[int]:
        """Return ``store.list_images(project_id)``."""
        return store.list_images(project_id)

    @app.get("/api/projects/{project_id}/images/{n}")
    def get_image(project_id: str, n: int) -> FileResponse:
        """Return ``FileResponse(store.image_path(project_id, n), media_type="image/png")``."""
        return FileResponse(store.image_path(project_id, n), media_type="image/png")

    @app.get("/api/projects/{project_id}/images/{n}/settings")
    def get_settings(project_id: str, n: int) -> dict[str, Any]:
        """Return ``store.read_settings(project_id, n)``."""
        return store.read_settings(project_id, n)

    @app.put("/api/projects/{project_id}/images/{n}/comment", status_code=204)
    def save_comment(project_id: str, n: int, body: SaveComment) -> Response:
        """``store.save_comment(project_id, n, body.comment)``; return 204 ``Response``."""
        store.save_comment(project_id, n, body.comment)
        return Response(status_code=204)

    @app.post("/api/projects/{project_id}/images/{n}/open", status_code=204)
    def open_image(project_id: str, n: int) -> Response:
        """``viewer(store.image_path(project_id, n))``; return ``Response(status_code=204)``."""
        viewer(store.image_path(project_id, n))
        return Response(status_code=204)

    @app.delete("/api/projects/{project_id}/images/{n}", status_code=204)
    def delete_image(project_id: str, n: int) -> Response:
        """``store.delete_image(project_id, n)``; return ``Response(status_code=204)``.

        Deletes the PNG and the settings file of image ``n`` (no renumbering, #25).
        A missing image -> 404, an invalid project id or ``n < 1`` -> 400 (both come from
        the exception handlers above, the route does not catch anything).
        """
        store.delete_image(project_id, n)
        return Response(status_code=204)

    @app.get("/api/config")
    def get_config() -> dict[str, Any]:
        """Return ``{"loras": [...], "warning": str | None}`` for the LoRA slots (#34).

        Call ``load_loras(lora_config_path or config.LORA_CONFIG_PATH)`` from ``.loras`` (import it
        at the top) and serialise each ``Lora`` with ``asdict`` -> ``{"key", "label", "default",
        "toggle"}``. `load_loras` re-reads the file on every call, so editing ``loras.json`` only
        needs a browser reload. A missing or broken file must NOT raise - it comes back as
        ``warning`` with the defaults.
        """
        loaded = load_loras(lora_config_path or config.LORA_CONFIG_PATH)
        return {"loras": [asdict(lora) for lora in loaded.loras], "warning": loaded.warning}

    @app.get("/api/queue")
    def list_jobs() -> list[dict[str, Any]]:
        """Return ``[asdict(job) for job in queue.list_jobs()]``."""
        return [asdict(job) for job in queue.list_jobs()]

    @app.post("/api/queue", status_code=201)
    async def submit_job(body: SubmitJob) -> dict[str, Any]:
        """Return ``asdict(queue.submit(body.project_id, body.request))``.

        Must stay ``async def`` so ``put_nowait`` runs on the event loop of the worker.
        """
        return asdict(queue.submit(body.project_id, body.request))

    @app.delete("/api/queue/{job_id}", status_code=204)
    async def cancel_job(job_id: str) -> Response:
        """``queue.cancel(job_id)``; return ``Response(status_code=204)``."""
        queue.cancel(job_id)
        return Response(status_code=204)

    @app.delete("/api/queue", status_code=204)
    async def clear_queue() -> Response:
        """``queue.clear_finished()``; return ``Response(status_code=204)``.

        Removes the ``done``/``error``/``cancelled`` jobs from the queue history (#30);
        ``queued``/``running`` jobs stay. Must stay ``async def`` like ``cancel_job`` so it
        runs on the event loop of the worker instead of a threadpool.
        """
        queue.clear_finished()
        return Response(status_code=204)

    if web_dist is not None and web_dist.is_dir():
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="web")
    return app


def _add_exception_handlers(app: FastAPI) -> None:
    """Map domain exceptions to HTTP status codes with ``{"detail": str(exc)}``."""
    mapping: list[tuple[type[Exception], int]] = [
        (ProjectExists, 409),  # before ProjectError (subclass)
        (ProjectError, 400),
        (NotFound, 404),
        (JobNotCancellable, 409),
        (ViewerError, 500),
    ]
    for exc_type, status in mapping:

        async def handler(_: Request, exc: Exception, status: int = status) -> JSONResponse:
            return JSONResponse({"detail": str(exc)}, status_code=status)

        app.add_exception_handler(exc_type, handler)


def build_default_app() -> FastAPI:
    """App with the real store, bridge and viewer from ``config``."""
    store = ProjectStore(config.PROJECTS_DIR)
    bridge = BridgeClient(config.BRIDGE_URL, config.BRIDGE_TIMEOUT)
    return create_app(
        store,
        RenderQueue(store, bridge),
        web_dist=config.WEB_DIST_DIR,
        lora_config_path=config.LORA_CONFIG_PATH,
    )


def main() -> None:
    """Entry point: ``uv run flux-workbench``."""
    env_file = config.ENV_FILE if config.ENV_FILE.exists() else "none"
    print(
        f"Flux Workbench: http://{config.HOST}:{config.PORT}  "
        f"(Bridge: {config.BRIDGE_URL}, Env: {env_file})"
    )
    uvicorn.run(build_default_app(), host=config.HOST, port=config.PORT)


if __name__ == "__main__":
    main()
