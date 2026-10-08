"""In-memory FIFO render queue with exactly one worker (strictly sequential bridge calls)."""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Protocol

from .bridge import BridgeError, RenderResult
from .projects import NotFound, ProjectError, ProjectStore

log = logging.getLogger(__name__)

JobStatus = Literal["queued", "running", "done", "error", "cancelled"]


class Renderer(Protocol):
    """What the queue needs from the bridge (``BridgeClient`` or a test fake)."""

    async def render(self, request: dict[str, Any]) -> RenderResult: ...


class JobNotCancellable(RuntimeError):
    """Job is not ``queued`` any more. API maps this to HTTP 409."""


@dataclass
class Job:
    """One render job. Mutated only by ``RenderQueue``."""

    project_id: str
    request: dict[str, Any]
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    status: JobStatus = "queued"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    #: Number of the saved image once ``status == "done"``.
    image_n: int | None = None
    #: Error text once ``status == "error"``.
    error: str | None = None


class RenderQueue:
    """FIFO queue across all projects. One ``run_worker`` task processes jobs one by one."""

    def __init__(self, store: ProjectStore, renderer: Renderer) -> None:
        """Keep ``store`` and ``renderer``; create ``self._jobs: list[Job] = []`` (all jobs in
        submit order, for listing) and ``self._queue: asyncio.Queue[Job] = asyncio.Queue()``."""
        self.store = store
        self.renderer = renderer
        self._jobs: list[Job] = []
        self._queue: asyncio.Queue[Job] = asyncio.Queue()

    def submit(self, project_id: str, request: dict[str, Any]) -> Job:
        """Validate, create a ``Job``, append it to ``_jobs``, ``put_nowait`` it and return it.

        Validation (before anything is queued):
        - ``self.store.project_dir(project_id)`` (raises ProjectError / NotFound).
        - ``request["prompt"]`` must exist and be a non-empty string after ``strip()``,
          otherwise ``ProjectError("prompt fehlt")``.

        Store a deep copy of ``request`` (``copy.deepcopy``) so later edits by the caller
        do not change the job.
        """
        raise NotImplementedError

    def list_jobs(self) -> list[Job]:
        """Return a copy of ``_jobs`` (submit order, oldest first)."""
        raise NotImplementedError

    def cancel(self, job_id: str) -> None:
        """Set a queued job's status to ``"cancelled"`` (the worker will skip it).

        Raises:
            NotFound: unknown ``job_id``.
            JobNotCancellable: status is not ``"queued"``.
        """
        raise NotImplementedError

    async def process(self, job: Job) -> None:
        """Run one job; never raises.

        - If ``job.status == "cancelled"``: return without calling the renderer.
        - Set ``status = "running"``; ``result = await self.renderer.render(job.request)``.
        - ``n = self.store.save_render(job.project_id, result.png,
          {"request": job.request, "effective": result.effective})``;
          then ``image_n = n``, ``status = "done"``.
        - ``BridgeError`` -> ``status = "error"``, ``error = str(exc)``.
        - ``NotFound`` / ``ProjectError`` (project deleted meanwhile) ->
          ``status = "error"``, ``error = f"Projekt nicht gefunden: {job.project_id}"``.
        - Any other ``Exception`` -> ``log.exception(...)``, ``status = "error"``,
          ``error = f"Interner Fehler: {exc}"``.
        """
        raise NotImplementedError

    async def run_worker(self) -> None:
        """Forever: ``job = await self._queue.get()``, ``await self.process(job)``,
        then ``self._queue.task_done()`` (in ``finally``). Started once as an asyncio task
        by the app lifespan; cancellation (``CancelledError``) simply ends the loop."""
        raise NotImplementedError

    async def join(self) -> None:
        """Wait until every submitted job has been processed (``await self._queue.join()``)."""
        await self._queue.join()


# Re-exported for the API's exception mapping.
__all__ = ["Job", "JobNotCancellable", "NotFound", "ProjectError", "RenderQueue", "BridgeError"]
