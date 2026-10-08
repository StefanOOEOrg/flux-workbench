import json

import pytest

from flux_workbench.projects import (
    MAX_COMMENT_LEN,
    NotFound,
    ProjectError,
    ProjectExists,
    sanitize_name,
)

from .conftest import PNG, make_project


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Mein Auto!", "Mein_Auto"),
        ("  a  b ", "a_b"),
        ("../etc", "etc"),
        ("Größe", "Groesse"),
        ("_-x-_", "x"),
        ("a" * 80, "a" * 60),
    ],
)
def test_sanitize_name(raw: str, expected: str) -> None:
    assert sanitize_name(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "!!!", "/.."])
def test_sanitize_name_empty_raises(raw: str) -> None:
    with pytest.raises(ProjectError):
        sanitize_name(raw)


def test_create_project_uses_date_prefix(store) -> None:
    project_id = store.create_project("Mein Auto!")
    assert project_id == "20261007-Mein_Auto"
    assert (store.root / project_id).is_dir()


def test_create_project_twice_raises_exists(store) -> None:
    store.create_project("x")
    with pytest.raises(ProjectExists):
        store.create_project("x")


def test_list_projects_newest_first_and_filtered(store) -> None:
    for name in ["20261001-a", "20261005-b", "20260930-c", "no-date", "20261001-bad name"]:
        (store.root / name).mkdir()
    (store.root / "20261009-file").write_text("x")
    assert store.list_projects() == ["20261005-b", "20261001-a", "20260930-c"]


def test_list_projects_empty(store) -> None:
    assert store.list_projects() == []


def test_delete_project_removes_folder(store) -> None:
    folder = make_project(store, "20261007-x", {1: {"request": {}}})
    store.delete_project("20261007-x")
    assert not folder.exists()


@pytest.mark.parametrize("bad", ["..", "../x", "20261007-x/..", "x", "", "20261007-a/b"])
def test_invalid_project_id_rejected(store, bad: str) -> None:
    with pytest.raises(ProjectError):
        store.project_dir(bad)


def test_unknown_project_not_found(store) -> None:
    with pytest.raises(NotFound):
        store.list_images("20261007-missing")


def test_delete_never_leaves_root(store, tmp_path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    with pytest.raises(ProjectError):
        store.delete_project("../outside")
    assert outside.is_dir()


def test_list_images_numeric_order(store) -> None:
    folder = make_project(store, "20261007-x", {n: {} for n in [10, 2, 1]})
    (folder / "bild.png").write_bytes(PNG)
    (folder / "3.json").write_text("{}")
    (folder / "11.png").write_bytes(PNG)  # png without json is still listed
    assert store.list_images("20261007-x") == [1, 2, 10, 11]


def test_image_path(store) -> None:
    folder = make_project(store, "20261007-x", {1: {}})
    assert store.image_path("20261007-x", 1) == folder / "1.png"
    with pytest.raises(NotFound):
        store.image_path("20261007-x", 2)
    with pytest.raises(ProjectError):
        store.image_path("20261007-x", 0)


def test_read_settings_new_format(store) -> None:
    data = {"request": {"prompt": "p"}, "effective": {"prompt": "p", "seed": 5}}
    make_project(store, "20261007-x", {1: data})
    assert store.read_settings("20261007-x", 1) == {**data, "comment": ""}


def test_read_settings_plain_dict_is_request(store) -> None:
    make_project(store, "20261007-x", {1: {"prompt": "p", "steps": 3}})
    assert store.read_settings("20261007-x", 1) == {
        "request": {"prompt": "p", "steps": 3},
        "effective": None,
        "comment": "",
    }


def test_read_settings_missing_keys_filled(store) -> None:
    make_project(store, "20261007-x", {1: {"effective": {"a": 1}}, 2: {"request": {"a": 1}}})
    assert store.read_settings("20261007-x", 1) == {
        "request": {},
        "effective": {"a": 1},
        "comment": "",
    }
    assert store.read_settings("20261007-x", 2) == {
        "request": {"a": 1},
        "effective": None,
        "comment": "",
    }


@pytest.mark.parametrize(("raw", "expected"), [("gut", "gut"), (None, ""), (5, ""), ("", "")])
def test_read_settings_comment(store, raw: object, expected: str) -> None:
    make_project(store, "20261007-x", {1: {"request": {}, "effective": None, "comment": raw}})
    assert store.read_settings("20261007-x", 1)["comment"] == expected


def test_save_comment_keeps_request_and_effective(store) -> None:
    data = {"request": {"prompt": "p"}, "effective": {"seed": 5}}
    folder = make_project(store, "20261007-x", {3: data})
    png_before = (folder / "3.png").read_bytes()
    store.save_comment("20261007-x", 3, "Bus verwaschen – ä")
    saved = json.loads((folder / "3.json").read_text(encoding="utf-8"))
    assert saved == {**data, "comment": "Bus verwaschen – ä"}
    assert (folder / "3.png").read_bytes() == png_before
    store.save_comment("20261007-x", 3, "")
    assert store.read_settings("20261007-x", 3)["comment"] == ""


def test_save_comment_converts_plain_dict(store) -> None:
    folder = make_project(store, "20261007-x", {1: {"prompt": "p"}})
    store.save_comment("20261007-x", 1, "c")
    saved = json.loads((folder / "1.json").read_text(encoding="utf-8"))
    assert saved == {"request": {"prompt": "p"}, "effective": None, "comment": "c"}


def test_save_comment_errors(store) -> None:
    folder = make_project(store, "20261007-x", {1: {"request": {}}})
    (folder / "2.json").write_text("not json")
    with pytest.raises(ProjectError):
        store.save_comment("20261007-x", 1, "x" * (MAX_COMMENT_LEN + 1))
    with pytest.raises(ProjectError):
        store.save_comment("20261007-x", 2, "c")
    with pytest.raises(ProjectError):
        store.save_comment("20261007-x", 0, "c")
    with pytest.raises(ProjectError):
        store.save_comment("../x", 1, "c")
    with pytest.raises(NotFound):
        store.save_comment("20261007-x", 9, "c")
    store.save_comment("20261007-x", 1, "x" * MAX_COMMENT_LEN)


def test_list_project_infos(store) -> None:
    make_project(store, "20261001-a", {1: {}, 2: {}})
    make_project(store, "20261005-b", {})
    (store.root / "20261005-b" / "7.png").write_bytes(PNG)
    assert store.list_project_infos() == [
        {"id": "20261005-b", "image_count": 1},
        {"id": "20261001-a", "image_count": 2},
    ]


def test_read_settings_errors(store) -> None:
    folder = make_project(store, "20261007-x", {})
    (folder / "1.json").write_text("not json")
    (folder / "2.json").write_text("[1, 2]")
    with pytest.raises(ProjectError):
        store.read_settings("20261007-x", 1)
    with pytest.raises(ProjectError):
        store.read_settings("20261007-x", 2)
    with pytest.raises(NotFound):
        store.read_settings("20261007-x", 3)


def test_next_number(store) -> None:
    folder = make_project(store, "20261007-x", {})
    assert store.next_number("20261007-x") == 1
    (folder / "4.png").write_bytes(PNG)
    (folder / "7.json").write_text("{}")
    assert store.next_number("20261007-x") == 8


def test_save_render_writes_png_and_json(store) -> None:
    folder = make_project(store, "20261007-x", {1: {}})
    settings = {"request": {"prompt": "ä"}, "effective": {"seed": 1}}
    n = store.save_render("20261007-x", PNG, settings)
    assert n == 2
    assert (folder / "2.png").read_bytes() == PNG
    assert json.loads((folder / "2.json").read_text(encoding="utf-8")) == settings
