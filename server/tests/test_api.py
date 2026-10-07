import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from flux_workbench.app import create_app
from flux_workbench.render_queue import RenderQueue
from flux_workbench.viewer import ViewerError

from .conftest import PNG, FakeRenderer, make_project

PID = "20261007-x"


@pytest.fixture
def opened() -> list[Path]:
    return []


@pytest.fixture
def api(store, opened, tmp_path) -> Iterator[TestClient]:
    def viewer(path: Path) -> None:
        if path.name == "99.png":
            raise ViewerError("Viewer konnte nicht gestartet werden: nope")
        opened.append(path)

    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<html>workbench</html>")
    app = create_app(store, RenderQueue(store, FakeRenderer()), viewer=viewer, web_dist=web)
    with TestClient(app) as client:
        yield client


def test_project_crud(api: TestClient, store) -> None:
    assert api.get("/api/projects").json() == []
    resp = api.post("/api/projects", json={"name": "Mein Auto!"})
    assert resp.status_code == 201
    assert resp.json() == {"id": "20261007-Mein_Auto"}
    assert api.get("/api/projects").json() == ["20261007-Mein_Auto"]
    assert api.post("/api/projects", json={"name": "Mein Auto"}).status_code == 409
    assert api.post("/api/projects", json={"name": "!!!"}).status_code == 400
    assert api.delete("/api/projects/20261007-Mein_Auto").status_code == 204
    assert api.get("/api/projects").json() == []
    assert api.delete("/api/projects/20261007-Mein_Auto").status_code == 404


def test_images_settings_and_png(api: TestClient, store) -> None:
    make_project(store, PID, {n: {"request": {"steps": n}, "effective": None} for n in [10, 1, 2]})
    assert api.get(f"/api/projects/{PID}/images").json() == [1, 2, 10]
    png = api.get(f"/api/projects/{PID}/images/2")
    assert png.status_code == 200
    assert png.headers["content-type"] == "image/png"
    assert png.content == PNG
    settings = api.get(f"/api/projects/{PID}/images/2/settings").json()
    assert settings == {"request": {"steps": 2}, "effective": None}
    assert api.get(f"/api/projects/{PID}/images/5").status_code == 404


def test_path_traversal_rejected(api: TestClient) -> None:
    assert api.get("/api/projects/..%2F..%2Fetc/images").status_code in (400, 404)
    assert api.get("/api/projects/not-a-project/images").status_code == 400
    assert api.delete("/api/projects/..").status_code in (400, 404, 405)


def test_open_image(api: TestClient, store, opened) -> None:
    folder = make_project(store, PID, {1: {}, 99: {}})
    assert api.post(f"/api/projects/{PID}/images/1/open").status_code == 204
    assert opened == [folder / "1.png"]
    assert api.post(f"/api/projects/{PID}/images/3/open").status_code == 404
    failed = api.post(f"/api/projects/{PID}/images/99/open")
    assert failed.status_code == 500
    assert "Viewer" in failed.json()["detail"]


def test_queue_flow(api: TestClient, store) -> None:
    folder = make_project(store, PID, {})
    resp = api.post("/api/queue", json={"project_id": PID, "request": {"prompt": "car"}})
    assert resp.status_code == 201
    job = resp.json()
    assert job["project_id"] == PID and job["status"] in ("queued", "running", "done")

    deadline = time.monotonic() + 5
    while api.get("/api/queue").json()[0]["status"] != "done":
        assert time.monotonic() < deadline
        time.sleep(0.02)
    assert api.get("/api/queue").json()[0]["image_n"] == 1
    assert (folder / "1.png").exists()
    assert api.delete(f"/api/queue/{job['id']}").status_code == 409
    assert api.delete("/api/queue/unknown").status_code == 404


def test_queue_validation(api: TestClient, store) -> None:
    make_project(store, PID, {})
    bad = api.post("/api/queue", json={"project_id": PID, "request": {"prompt": ""}})
    assert bad.status_code == 400
    missing = api.post("/api/queue", json={"project_id": "20261007-no", "request": {"prompt": "a"}})
    assert missing.status_code == 404


def test_serves_web_app(api: TestClient) -> None:
    resp = api.get("/")
    assert resp.status_code == 200
    assert "workbench" in resp.text
