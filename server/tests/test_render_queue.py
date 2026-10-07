import asyncio
import json

import pytest

from flux_workbench.bridge import BridgeError
from flux_workbench.projects import NotFound, ProjectError
from flux_workbench.render_queue import JobNotCancellable, RenderQueue

from .conftest import FakeRenderer, make_project

PID = "20261007-x"


async def run_until_idle(queue: RenderQueue) -> None:
    worker = asyncio.create_task(queue.run_worker())
    await asyncio.wait_for(queue.join(), timeout=5)
    worker.cancel()
    with pytest.raises(asyncio.CancelledError):
        await worker


async def test_jobs_run_sequentially_and_create_next_numbers(store) -> None:
    folder = make_project(store, PID, {1: {"request": {}}})
    renderer = FakeRenderer()
    queue = RenderQueue(store, renderer)
    first = queue.submit(PID, {"prompt": "a"})
    second = queue.submit(PID, {"prompt": "b"})

    await run_until_idle(queue)

    assert renderer.max_active == 1
    assert [c["prompt"] for c in renderer.calls] == ["a", "b"]
    assert (first.status, first.image_n) == ("done", 2)
    assert (second.status, second.image_n) == ("done", 3)
    saved = json.loads((folder / "3.json").read_text())
    assert saved == {"request": {"prompt": "b"}, "effective": {"prompt": "b", "seed": 1001}}


async def test_error_does_not_stop_queue(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer(errors={0: BridgeError("HTTP 400: bad steps")}))
    failed = queue.submit(PID, {"prompt": "a"})
    ok = queue.submit(PID, {"prompt": "b"})

    await run_until_idle(queue)

    assert (failed.status, failed.error) == ("error", "HTTP 400: bad steps")
    assert (ok.status, ok.image_n) == ("done", 1)


async def test_unexpected_exception_marks_error(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer(errors={0: KeyError("boom")}))
    job = queue.submit(PID, {"prompt": "a"})
    await run_until_idle(queue)
    assert job.status == "error"
    assert job.error is not None and job.error.startswith("Interner Fehler")


async def test_project_deleted_while_queued(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())
    job = queue.submit(PID, {"prompt": "a"})
    store.delete_project(PID)
    await run_until_idle(queue)
    assert job.status == "error"
    assert job.error is not None and PID in job.error


async def test_cancelled_job_is_skipped(store) -> None:
    make_project(store, PID, {})
    renderer = FakeRenderer()
    queue = RenderQueue(store, renderer)
    job = queue.submit(PID, {"prompt": "a"})
    queue.cancel(job.id)
    await run_until_idle(queue)
    assert job.status == "cancelled"
    assert renderer.calls == []


async def test_cancel_errors(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())
    job = queue.submit(PID, {"prompt": "a"})
    await run_until_idle(queue)
    with pytest.raises(JobNotCancellable):
        queue.cancel(job.id)
    with pytest.raises(NotFound):
        queue.cancel("unknown")


async def test_submit_validation(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())
    with pytest.raises(ProjectError):
        queue.submit(PID, {"prompt": "  "})
    with pytest.raises(ProjectError):
        queue.submit(PID, {})
    with pytest.raises(NotFound):
        queue.submit("20261007-missing", {"prompt": "a"})
    with pytest.raises(ProjectError):
        queue.submit("../x", {"prompt": "a"})
    assert queue.list_jobs() == []


async def test_submit_copies_request_and_lists_in_order(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())
    request = {"prompt": "a", "hires": {"scale": 1.5}}
    first = queue.submit(PID, request)
    request["hires"]["scale"] = 2.0
    second = queue.submit(PID, {"prompt": "b"})
    assert first.request["hires"]["scale"] == 1.5
    assert [j.id for j in queue.list_jobs()] == [first.id, second.id]
    assert first.status == "queued"
