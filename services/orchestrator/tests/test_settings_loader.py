from __future__ import annotations

import importlib.util
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


def test_settings_import_does_not_fail_for_short_docker_like_path(tmp_path, monkeypatch):
    module_path = tmp_path / "app" / "src" / "sofort_orchestrator" / "infra" / "settings.py"
    module_path.parent.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "src" / "sofort_orchestrator" / "infra" / "settings.py"
    module_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    monkeypatch.delenv("DATABASE_SERVICE_BASE_URL", raising=False)

    module = _load_settings_module(module_path, "test_settings_short_path")

    assert module.settings.base_url == "http://localhost:8000"


def test_load_local_env_uses_nearest_dotenv_without_overriding_existing_values(tmp_path, monkeypatch):
    module_path = tmp_path / "repo" / "services" / "orchestrator" / "src" / "sofort_orchestrator" / "infra" / "settings.py"
    module_path.parent.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "src" / "sofort_orchestrator" / "infra" / "settings.py"
    module_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    nearest_env = module_path.parents[3] / ".env"
    nearest_env.write_text(
        "DATABASE_SERVICE_BASE_URL=http://from-dotenv:8000\nORCHESTRATOR_HTTP_RETRIES=7\nORCHESTRATOR_SERVICE_AUTH_TOKEN=test-token\n",
        encoding="utf-8",
    )

    monkeypatch.setenv("DATABASE_SERVICE_BASE_URL", "http://already-set:9000")
    monkeypatch.delenv("ORCHESTRATOR_HTTP_RETRIES", raising=False)

    module = _load_settings_module(module_path, "test_settings_nearest_dotenv")

    assert module.settings.base_url == "http://already-set:9000"
    assert module.settings.retries == 7
    assert module.settings.service_auth_token == "test-token"


def test_load_local_env_skips_missing_dotenv(tmp_path, monkeypatch):
    module_path = tmp_path / "docker" / "src" / "sofort_orchestrator" / "infra" / "settings.py"
    module_path.parent.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "src" / "sofort_orchestrator" / "infra" / "settings.py"
    module_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    monkeypatch.delenv("ORCHESTRATOR_HTTP_TIMEOUT_SECONDS", raising=False)

    module = _load_settings_module(module_path, "test_settings_missing_dotenv")

    assert module.settings.timeout_seconds == 8.0
