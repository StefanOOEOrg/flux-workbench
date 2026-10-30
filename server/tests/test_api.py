import json
import os
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from flux_workbench import app as app_module
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
            raise ViewerError("Viewer could not be started: nope")
        opened.append(path)

    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<html>workbench</html>")
    app = create_app(
        store,
        RenderQueue(store, FakeRenderer()),
        viewer=viewer,
        web_dist=web,
        lora_config_path=tmp_path / "loras.json",
    )
    with TestClient(app) as client:
        yield client


def test_project_crud(api: TestClient, store) -> None:
    assert api.get("/api/projects").json() == []
    resp = api.post("/api/projects", json={"name": "Mein Auto!"})
    assert resp.status_code == 201
    assert resp.json() == {"id": "20261007-Mein_Auto"}
    assert api.get("/api/projects").json() == [{"id": "20261007-Mein_Auto", "image_count": 0}]
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
    assert settings == {
        "request": {"steps": 2},
        "effective": None,
        "comment": "",
        "render_seconds": None,
    }
    assert api.get(f"/api/projects/{PID}/images/5").status_code == 404


def test_save_comment(api: TestClient, store) -> None:
    folder = make_project(store, PID, {1: {"request": {"prompt": "p"}, "effective": None}})
    url = f"/api/projects/{PID}/images/1/comment"
    assert api.put(url, json={"comment": "zu dunkel"}).status_code == 204
    assert api.get(f"/api/projects/{PID}/images/1/settings").json()["comment"] == "zu dunkel"
    assert json.loads((folder / "1.json").read_text())["request"] == {"prompt": "p"}
    other = f"/api/projects/{PID}/images/9/comment"
    assert api.put(other, json={"comment": "x"}).status_code == 404
    assert api.put(url, json={"comment": "x" * 5001}).status_code == 400
    assert api.put(url, json={}).status_code == 422


def test_delete_image(api: TestClient, store) -> None:
    folder = make_project(
        store, PID, {n: {"request": {"steps": n}, "effective": None} for n in [1, 2, 3]}
    )
    assert api.delete(f"/api/projects/{PID}/images/2").status_code == 204
    assert not (folder / "2.png").exists()
    assert not (folder / "2.json").exists()
    assert api.get(f"/api/projects/{PID}/images").json() == [1, 3]
    assert api.get(f"/api/projects/{PID}/images/2").status_code == 404
    assert api.get(f"/api/projects/{PID}/images/2/settings").status_code == 404
    assert api.get(f"/api/projects/{PID}/images/1").content == PNG
    assert api.get("/api/projects").json() == [{"id": PID, "image_count": 2}]
    assert api.delete(f"/api/projects/{PID}/images/2").status_code == 404
    assert api.delete(f"/api/projects/{PID}/images/0").status_code == 400
    assert api.delete("/api/projects/not-a-project/images/1").status_code == 400
    assert api.delete("/api/projects/..%2F..%2Fetc/images/1").status_code in (400, 404, 405)


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


def test_clear_queue(api: TestClient, store) -> None:
    make_project(store, PID, {})
    assert api.delete("/api/queue").status_code == 204
    assert api.get("/api/queue").json() == []

    created = api.post("/api/queue", json={"project_id": PID, "request": {"prompt": "car"}})
    assert created.status_code == 201
    deadline = time.monotonic() + 5
    while api.get("/api/queue").json()[0]["status"] != "done":
        assert time.monotonic() < deadline
        time.sleep(0.02)

    assert api.delete("/api/queue").status_code == 204
    assert api.get("/api/queue").json() == []


def test_queue_validation(api: TestClient, store) -> None:
    make_project(store, PID, {})
    bad = api.post("/api/queue", json={"project_id": PID, "request": {"prompt": ""}})
    assert bad.status_code == 400
    missing = api.post("/api/queue", json={"project_id": "20261007-no", "request": {"prompt": "a"}})
    assert missing.status_code == 404


def test_config_route(api: TestClient, tmp_path) -> None:
    assert api.get("/api/config").json() == {"loras": [], "warning": None}

    (tmp_path / "loras.json").write_text(
        json.dumps({"loras": [{"key": "lora3", "label": "Detail", "default": 0.4}]}),
        encoding="utf-8",
    )
    assert api.get("/api/config").json() == {
        "loras": [{"key": "lora3", "label": "Detail", "default": 0.4, "toggle": False}],
        "warning": None,
    }


def test_config_route_reports_a_broken_file(api: TestClient, tmp_path) -> None:
    (tmp_path / "loras.json").write_text("not json", encoding="utf-8")

    body = api.get("/api/config").json()

    assert [entry["key"] for entry in body["loras"]] == ["lora_strength", "lora2"]
    assert "loras.json" in body["warning"]


def test_serves_web_app(api: TestClient) -> None:
    resp = api.get("/")
    assert resp.status_code == 200
    assert "workbench" in resp.text


def test_root_explains_the_missing_build(store, tmp_path) -> None:
    """#61: a fresh clone without `npm run build` must not stare at a bare 404."""
    app = create_app(
        store,
        RenderQueue(store, FakeRenderer()),
        web_dist=tmp_path / "missing",
        lora_config_path=tmp_path / "loras.json",
    )
    with TestClient(app) as client:
        resp = client.get("/")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert "not built" in resp.text
    assert "npm" in resp.text
    assert "build" in resp.text


def test_main_warns_before_start_when_web_dist_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """#61: a fresh clone sees the build hint before the start line, then the server starts."""
    started: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(app_module.config, "WEB_DIST_DIR", tmp_path / "missing")
    monkeypatch.setattr(app_module.config, "ENV_FILE", tmp_path / ".env")
    monkeypatch.setattr(app_module, "build_default_app", lambda: "app")
    monkeypatch.setattr(app_module.uvicorn, "run", lambda *a, **kw: started.append((a, kw)))

    app_module.main()

    out = capsys.readouterr().out.splitlines()
    assert out[0] == (
        "Web app not built: run 'npm ci && npm run build' in web/ (the UI will not load)"
    )
    assert "Flux Workbench: http://" in out[1]
    assert started and started[0][1] == {
        "host": app_module.config.HOST,
        "port": app_module.config.PORT,
    }


def test_main_warns_when_the_web_build_is_stale(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """#69: a `git pull` without a rebuild must be visible before the start line."""
    src = tmp_path / "src"
    dist = tmp_path / "dist"
    src.mkdir()
    dist.mkdir()
    (dist / "index.html").write_text("old", encoding="utf-8")
    os.utime(dist / "index.html", (1000, 1000))
    (src / "app.ts").write_text("new", encoding="utf-8")
    os.utime(src / "app.ts", (2000, 2000))
    monkeypatch.setattr(app_module.config, "WEB_SRC_DIR", src)
    monkeypatch.setattr(app_module.config, "WEB_DIST_DIR", dist)
    monkeypatch.setattr(app_module.config, "ENV_FILE", tmp_path / ".env")
    monkeypatch.setattr(app_module, "build_default_app", lambda: "app")
    monkeypatch.setattr(app_module.uvicorn, "run", lambda *a, **kw: None)

    app_module.main()

    out = capsys.readouterr().out.splitlines()
    assert out[0] == (
        "Web build is older than the sources: run 'npm run build' in web/ "
        "(the UI may be out of date)"
    )
    assert "Flux Workbench: http://" in out[1]


def test_main_prints_no_build_hint_when_web_dist_exists(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """#61: with a built UI the start line stays exactly as before."""
    dist = tmp_path / "dist"
    dist.mkdir()
    monkeypatch.setattr(app_module.config, "WEB_DIST_DIR", dist)
    monkeypatch.setattr(app_module.config, "ENV_FILE", tmp_path / ".env")
    monkeypatch.setattr(app_module, "build_default_app", lambda: "app")
    monkeypatch.setattr(app_module.uvicorn, "run", lambda *a, **kw: None)

    app_module.main()

    assert "Web app not built" not in capsys.readouterr().out
