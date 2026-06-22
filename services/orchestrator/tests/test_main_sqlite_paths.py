from __future__ import annotations

from pathlib import Path

from src.sofort_orchestrator import main


def test_ensure_sqlite_parent_dir_resolves_relative_paths_from_service_root(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "_ORCHESTRATOR_SERVICE_ROOT", tmp_path)

    resolved = main._ensure_sqlite_parent_dir("./data/orchestrator_jobs.sqlite3")

    assert resolved == str(tmp_path / "data" / "orchestrator_jobs.sqlite3")
    assert (tmp_path / "data").is_dir()


def test_product_editor_store_path_uses_same_parent_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "_ORCHESTRATOR_SERVICE_ROOT", tmp_path)

    jobs_path = "./data/orchestrator_jobs.sqlite3"
    product_editor_path = jobs_path.replace(".sqlite3", "_product_editor.sqlite3")

    resolved = main._ensure_sqlite_parent_dir(product_editor_path)

    assert resolved == str(tmp_path / "data" / "orchestrator_jobs_product_editor.sqlite3")
    assert (tmp_path / "data").is_dir()
