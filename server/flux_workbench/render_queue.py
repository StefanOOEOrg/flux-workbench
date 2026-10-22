"""In-memory FIFO render queue with exactly one worker (strictly sequential bridge calls)."""

import asyncio
import copy
import logging
import time
import uuid
from collections.abc import Callable
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

    def __init__(
        self, store: ProjectStore, renderer: Renderer, clock: Callable[[], float] = time.monotonic
    ) -> None:
        """Keep ``store``, ``renderer`` and ``clock`` (seconds, monotonic; tests inject a fake);
        create ``self._jobs: list[Job] = []`` (all jobs in submit order, for listing) and
        ``self._queue: asyncio.Queue[Job] = asyncio.Queue()``."""
        self.store = store
        self.renderer = renderer
        self.clock = clock
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
        self.store.project_dir(project_id)
        prompt = request.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ProjectError("prompt fehlt")
        job = Job(project_id=project_id, request=copy.deepcopy(request))
        self._jobs.append(job)
        self._queue.put_nowait(job)
        return job

    def list_jobs(self) -> list[Job]:
        """Return a copy of ``_jobs`` (submit order, oldest first)."""
        return list(self._jobs)

    def cancel(self, job_id: str) -> None:
        """Set a queued job's status to ``"cancelled"`` (the worker will skip it).

        Raises:
            NotFound: unknown ``job_id``.
            JobNotCancellable: status is not ``"queued"``.
        """
        job = next((j for j in self._jobs if j.id == job_id), None)
        if job is None:
            raise NotFound(job_id)
        if job.status != "queued":
            raise JobNotCancellable(job_id)
        job.status = "cancelled"

    def clear_finished(self) -> None:
        """Remove every job that is finished (#30): ``done``, ``error`` and ``cancelled``.

        ``queued`` and ``running`` jobs stay in ``_jobs`` in their original order - a running
        job keeps being listed and still flips to ``done`` when it finishes, a queued job is
        still processed by the worker. ``asyncio.Queue`` is not touched (cancelled jobs sitting
        there are simply skipped by ``process``).

        No effect on the filesystem: images and settings of ``done`` jobs stay in the project.
        Empty queue or only queued/running jobs -> no change, no exception.
        """
        self._jobs = [j for j in self._jobs if j.status not in ("done", "error", "cancelled")]

    async def process(self, job: Job) -> None:
        """Run one job; never raises.

        - If ``job.status == "cancelled"``: return without calling the renderer.
        - Set ``status = "running"``; ``start = self.clock()``;
          ``result = await self.renderer.render(job.request)``;
          ``render_seconds = round(self.clock() - start, 1)`` - pure bridge time, measured
          directly around the ``render`` call (NOT including queue wait or saving).
        - ``n = self.store.save_render(job.project_id, result.png,
          {"request": job.request, "effective": result.effective,
          "render_seconds": render_seconds})``; then ``image_n = n``, ``status = "done"``.
        - Errors (nothing is saved, no ``render_seconds`` anywhere):
        - ``BridgeError`` -> ``status = "error"``, ``error = str(exc)``.
        - ``NotFound`` / ``ProjectError`` (project deleted meanwhile) ->
          ``status = "error"``, ``error = f"Project not found: {job.project_id}"``.
        - Any other ``Exception`` -> ``log.exception(...)``, ``status = "error"``,
          ``error = f"Internal error: {exc}"``.
        """
        if job.status == "cancelled":
            return
        job.status = "running"
        try:
            start = self.clock()
            result = await self.renderer.render(job.request)
            render_seconds = round(self.clock() - start, 1)
            n = self.store.save_render(
                job.project_id,
                result.png,
                {
                    "request": job.request,
                    "effective": result.effective,
                    "render_seconds": render_seconds,
                },
            )
        except BridgeError as exc:
            job.status = "error"
            job.error = str(exc)
            return
        except (NotFound, ProjectError):
            job.status = "error"
            job.error = f"Project not found: {job.project_id}"
            return
        except Exception as exc:
            log.exception("Render job %s fehlgeschlagen", job.id)
            job.status = "error"
            job.error = f"Internal error: {exc}"
            return
        job.image_n = n
        job.status = "done"

    async def run_worker(self) -> None:
        """Forever: ``job = await self._queue.get()``, ``await self.process(job)``,
        then ``self._queue.task_done()`` (in ``finally``). Started once as an asyncio task
        by the app lifespan; cancellation (``CancelledError``) simply ends the loop."""
        while True:
            job = await self._queue.get()
            try:
                await self.process(job)
            finally:
                self._queue.task_done()

    async def join(self) -> None:
        """Wait until every submitted job has been processed (``await self._queue.join()``)."""
        await self._queue.join()


# Re-exported for the API's exception mapping.
__all__ = ["Job", "JobNotCancellable", "NotFound", "ProjectError", "RenderQueue", "BridgeError"]
