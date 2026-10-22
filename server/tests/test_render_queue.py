import asyncio
import json
from typing import Any

import pytest

from flux_workbench.bridge import BridgeError, RenderResult
from flux_workbench.projects import NotFound, ProjectError
from flux_workbench.render_queue import JobNotCancellable, RenderQueue

from .conftest import PNG, FakeRenderer, make_project

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
    queue = RenderQueue(store, renderer, clock=FakeClock())
    first = queue.submit(PID, {"prompt": "a"})
    second = queue.submit(PID, {"prompt": "b"})

    await run_until_idle(queue)

    assert renderer.max_active == 1
    assert [c["prompt"] for c in renderer.calls] == ["a", "b"]
    assert (first.status, first.image_n) == ("done", 2)
    assert (second.status, second.image_n) == ("done", 3)
    saved = json.loads((folder / "3.json").read_text())
    assert saved == {
        "request": {"prompt": "b"},
        "effective": {"prompt": "b", "seed": 1001},
        "render_seconds": 2.5,
    }


class FakeClock:
    """Each call returns a value 2.46 s later than the previous one."""

    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        value = self.now
        self.now += 2.46
        return value


async def test_render_seconds_measures_only_the_bridge_call(store) -> None:
    folder = make_project(store, PID, {})
    ticks: list[str] = []
    renderer = FakeRenderer()
    real_render = renderer.render

    async def render(request: dict) -> object:
        ticks.append("render")
        return await real_render(request)

    renderer.render = render  # type: ignore[method-assign]

    def clock() -> float:
        ticks.append("clock")
        return {1: 10.0, 3: 171.44}.get(len(ticks), 999.0)

    queue = RenderQueue(store, renderer, clock=clock)
    queue.submit(PID, {"prompt": "a"})
    await run_until_idle(queue)

    assert ticks == ["clock", "render", "clock"]
    saved = json.loads((folder / "1.json").read_text())
    assert saved["render_seconds"] == 161.4


async def test_failed_render_writes_nothing(store) -> None:
    folder = make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer(errors={0: BridgeError("HTTP 400")}), clock=FakeClock())
    queue.submit(PID, {"prompt": "a"})
    await run_until_idle(queue)
    assert list(folder.iterdir()) == []


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
    assert job.error is not None and job.error.startswith("Internal error")


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


async def test_clear_finished_removes_done_error_and_cancelled(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer(errors={0: BridgeError("boom")}))
    failed = queue.submit(PID, {"prompt": "fails"})
    await run_until_idle(queue)
    assert failed.status == "error"
    cancelled = queue.submit(PID, {"prompt": "skip me"})
    queue.cancel(cancelled.id)

    queue.clear_finished()

    assert queue.list_jobs() == []


def test_clear_finished_keeps_queued_jobs(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())
    first = queue.submit(PID, {"prompt": "a"})
    second = queue.submit(PID, {"prompt": "b"})

    queue.clear_finished()

    assert [j.id for j in queue.list_jobs()] == [first.id, second.id]
    assert [j.status for j in queue.list_jobs()] == ["queued", "queued"]


def test_clear_finished_on_empty_queue_changes_nothing(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())

    queue.clear_finished()

    assert queue.list_jobs() == []


async def test_clear_finished_keeps_the_running_job_and_still_saves_it(store) -> None:
    folder = make_project(store, PID, {})
    renderer = BlockingRenderer()
    queue = RenderQueue(store, renderer)
    job = queue.submit(PID, {"prompt": "slow"})
    worker = asyncio.create_task(queue.run_worker())
    try:
        await asyncio.wait_for(renderer.started.wait(), timeout=5)
        assert job.status == "running"

        queue.clear_finished()

        assert [j.id for j in queue.list_jobs()] == [job.id]
        renderer.release.set()
        await asyncio.wait_for(queue.join(), timeout=5)
    finally:
        worker.cancel()
        with pytest.raises(asyncio.CancelledError):
            await worker
    assert (job.status, job.image_n) == ("done", 1)
    assert (folder / "1.png").exists()


async def test_clear_finished_lets_new_jobs_run_normally(store) -> None:
    make_project(store, PID, {})
    queue = RenderQueue(store, FakeRenderer())
    done = queue.submit(PID, {"prompt": "first"})
    await run_until_idle(queue)
    assert (done.status, done.image_n) == ("done", 1)

    queue.clear_finished()
    fresh = queue.submit(PID, {"prompt": "second"})
    await run_until_idle(queue)

    assert [j.id for j in queue.list_jobs()] == [fresh.id]
    assert (fresh.status, fresh.image_n) == ("done", 2)


class BlockingRenderer:
    """Renders only after the test releases it, so a job can be observed as ``running``."""

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def render(self, request: dict[str, Any]) -> RenderResult:
        self.started.set()
        await self.release.wait()
        return RenderResult(png=PNG, effective={**request, "seed": 7})
