from __future__ import annotations

import json
import sys
from importlib import import_module
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main() -> None:
    app = import_module("src.sofort_orchestrator.main").app
    target = ROOT / "openapi" / "orchestrator-openapi.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    schema = app.openapi()
    target.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
