#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import OrderedDict
from pathlib import Path


def parse_env_file(path: Path) -> OrderedDict[str, str]:
    values: OrderedDict[str, str] = OrderedDict()
    if not path.exists():
        return values

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            raise ValueError(f"Malformed env line in {path} at line {line_number}.")
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise ValueError(f"Empty env key in {path} at line {line_number}.")
        values[key] = value

    return values


def write_env_file(path: Path, values: OrderedDict[str, str]) -> None:
    lines = [f"{key}={value}" for key, value in values.items()]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_runtime_env(template_path: Path, override_path: Path | None, output_path: Path) -> None:
    merged = parse_env_file(template_path)
    if override_path is not None and override_path.exists():
        for key, value in parse_env_file(override_path).items():
            merged[key] = value
    write_env_file(output_path, merged)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build a runtime env file from a committed template and a secret override file."
    )
    parser.add_argument("--template", required=True, help="Path to the committed sanitized env template.")
    parser.add_argument(
        "--override",
        required=False,
        help="Path to the secret override env file. May be omitted or empty; template values remain as defaults.",
    )
    parser.add_argument("--output", required=True, help="Output path for the merged runtime env file.")
    args = parser.parse_args()

    template_path = Path(args.template).resolve()
    override_path = Path(args.override).resolve() if args.override else None
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    build_runtime_env(template_path, override_path, output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
