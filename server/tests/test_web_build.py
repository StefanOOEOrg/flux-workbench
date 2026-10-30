"""Tests for the stale-build detection (#69)."""

import os
from pathlib import Path

from flux_workbench.web_build import newest_mtime, web_build_is_stale


def touch(path: Path, mtime: float) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x", encoding="utf-8")
    os.utime(path, (mtime, mtime))
    return path


def test_stale_when_a_source_file_is_newer(tmp_path: Path) -> None:
    src = tmp_path / "src"
    dist = tmp_path / "dist"
    touch(dist / "index.html", 1000)
    touch(src / "app.ts", 2000)

    assert web_build_is_stale(src, dist) is True


def test_fresh_when_the_build_is_newer(tmp_path: Path) -> None:
    src = tmp_path / "src"
    dist = tmp_path / "dist"
    touch(src / "app.ts", 1000)
    touch(dist / "index.html", 2000)

    assert web_build_is_stale(src, dist) is False


def test_equal_timestamps_count_as_fresh(tmp_path: Path) -> None:
    src = tmp_path / "src"
    dist = tmp_path / "dist"
    touch(src / "app.ts", 1000)
    touch(dist / "index.html", 1000)

    assert web_build_is_stale(src, dist) is False


def test_no_index_in_dist_is_not_stale(tmp_path: Path) -> None:
    src = tmp_path / "src"
    dist = tmp_path / "dist"
    touch(src / "app.ts", 2000)
    dist.mkdir()

    assert web_build_is_stale(src, dist) is False


def test_missing_or_empty_src_is_not_stale(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    touch(dist / "index.html", 1000)

    assert web_build_is_stale(tmp_path / "missing", dist) is False
    (tmp_path / "empty").mkdir()
    assert web_build_is_stale(tmp_path / "empty", dist) is False


def test_nested_source_files_count(tmp_path: Path) -> None:
    src = tmp_path / "src"
    dist = tmp_path / "dist"
    touch(dist / "index.html", 1000)
    touch(src / "deep" / "nested" / "component.html", 3000)

    assert web_build_is_stale(src, dist) is True


def test_newest_mtime_of_an_empty_tree_is_zero(tmp_path: Path) -> None:
    assert newest_mtime(tmp_path) == 0.0
