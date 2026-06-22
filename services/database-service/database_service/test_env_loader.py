from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path


def _load_settings_module(module_path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(module_name, None)

    return module


def test_settings_reads_only_repo_root_dotenv_without_overriding_process_values(tmp_path, monkeypatch):
    module_path = tmp_path / "repo" / "services" / "database-service" / "database_service" / "settings.py"
    module_path.parent.mkdir(parents=True)
    source = Path(__file__).resolve().parent / "settings.py"
    module_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    repo_root_env = module_path.parents[3] / ".env"
    repo_root_env.write_text(
        "\n".join(
            (
                "SECRET_KEY=root-secret",
                "ALLOWED_HOSTS=root.example.test,localhost",
                "BACKEND_AUTH_BASE_URL=http://from-root/api/v1",
                "POSTGRES_DB=root-db",
                "POSTGRES_USER=root-user",
                "POSTGRES_PASSWORD=root-password",
                "POSTGRES_HOST=root-host",
                "POSTGRES_PORT=6543",
            )
        )
        + "\n",
        encoding="utf-8",
    )

    ignored_service_env = module_path.parents[1] / ".env"
    ignored_service_env.write_text(
        "\n".join(
            (
                "SECRET_KEY=service-secret",
                "ALLOWED_HOSTS=service.example.test",
                "BACKEND_AUTH_BASE_URL=http://from-service-local/api/v1",
                "POSTGRES_DB=service-db",
            )
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setenv("POSTGRES_DB", "process-db")
    monkeypatch.delenv("BACKEND_AUTH_BASE_URL", raising=False)

    module = _load_settings_module(module_path, "test_database_service_settings_root_dotenv")

    assert module.SECRET_KEY == "root-secret"
    assert module.ALLOWED_HOSTS == ["root.example.test", "localhost"]
    assert module.BACKEND_AUTH_BASE_URL == "http://from-root/api/v1"
    assert module.DATABASES["default"]["NAME"] == "process-db"
    assert module.DATABASES["default"]["USER"] == "root-user"
    assert module.DATABASES["default"]["HOST"] == "root-host"
    assert module.DATABASES["default"]["PORT"] == "6543"
