#!/usr/bin/env python3
"""Validate that only the deploy gateway publishes a host port."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Resolve a Docker Compose deployment and verify that only "
            "the gateway publishes a loopback host port."
        )
    )
    parser.add_argument(
        "--compose",
        required=True,
        type=Path,
        help="Deployment Docker Compose file.",
    )
    parser.add_argument(
        "--env-file",
        required=True,
        type=Path,
        help="Environment file used to resolve the Compose configuration.",
    )
    parser.add_argument(
        "--expected-gateway-port",
        required=True,
        type=int,
        help="Expected loopback host port published by the gateway.",
    )
    return parser.parse_args()


def load_resolved_compose(
    compose_file: Path,
    env_file: Path,
) -> dict[str, Any]:
    command = [
        "docker",
        "compose",
        "--env-file",
        str(env_file),
        "-f",
        str(compose_file),
        "config",
        "--format",
        "json",
    ]

    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        raise SystemExit(
            f"Docker Compose validation failed with exit code "
            f"{result.returncode}"
        )

    try:
        document = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(
            f"Docker Compose returned invalid JSON: {error}"
        ) from error

    if not isinstance(document, dict):
        raise SystemExit("Resolved Docker Compose document is not an object")

    return document


def normalized(value: object) -> str:
    if value is None:
        return ""

    return str(value)


def main() -> int:
    args = parse_args()

    if not args.compose.is_file():
        raise SystemExit(f"Compose file not found: {args.compose}")

    if not args.env_file.is_file():
        raise SystemExit(f"Environment file not found: {args.env_file}")

    document = load_resolved_compose(
        args.compose,
        args.env_file,
    )

    services = document.get("services")

    if not isinstance(services, dict):
        raise SystemExit("Resolved Compose document has no services object")

    gateway = services.get("gateway")

    if not isinstance(gateway, dict):
        raise SystemExit("Resolved Compose document has no gateway service")

    violations: list[str] = []

    for service_name, service_config in sorted(services.items()):
        if not isinstance(service_config, dict):
            violations.append(
                f"{service_name}: service configuration is not an object"
            )
            continue

        ports = service_config.get("ports") or []

        if service_name != "gateway" and ports:
            violations.append(
                f"{service_name}: internal service must not publish host "
                f"ports: {ports!r}"
            )

    gateway_ports = gateway.get("ports") or []

    if len(gateway_ports) != 1:
        violations.append(
            "gateway: expected exactly one published port, "
            f"found {len(gateway_ports)}"
        )
    else:
        binding = gateway_ports[0]

        if not isinstance(binding, dict):
            violations.append(
                f"gateway: normalized port binding is not an object: "
                f"{binding!r}"
            )
        else:
            host_ip = normalized(binding.get("host_ip"))
            published = normalized(binding.get("published"))
            target = normalized(binding.get("target"))

            if host_ip != "127.0.0.1":
                violations.append(
                    "gateway: host_ip must be 127.0.0.1, "
                    f"got {host_ip!r}"
                )

            if published != str(args.expected_gateway_port):
                violations.append(
                    "gateway: unexpected published host port: "
                    f"{published!r}; expected "
                    f"{args.expected_gateway_port}"
                )

            if target != "8080":
                violations.append(
                    "gateway: container target must be 8080, "
                    f"got {target!r}"
                )

    if violations:
        print(
            f"Gateway-only port validation failed for {args.compose}:",
            file=sys.stderr,
        )

        for violation in violations:
            print(f"- {violation}", file=sys.stderr)

        return 1

    print(
        f"{args.compose}: gateway-only host publishing is valid "
        f"(127.0.0.1:{args.expected_gateway_port} -> gateway:8080)"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
