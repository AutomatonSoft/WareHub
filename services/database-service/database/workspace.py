from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps
from typing import Final

from django.db import transaction


SOFORT_WORKSPACE: Final = "sofort"
BENIM_DEPOM_WORKSPACE: Final = "benim_depom"
BENIM_DEPOM_DATABASE_ALIAS: Final = "benim_depom"
WORKSPACE_QUERY_PARAM: Final = "workspace"
WORKSPACE_HEADER: Final = "X-WareHub-Inventory-Workspace"

_active_workspace: ContextVar[str] = ContextVar("active_inventory_workspace", default=SOFORT_WORKSPACE)


class InvalidInventoryWorkspace(ValueError):
    pass


def normalize_workspace(value: object | None) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized or normalized == SOFORT_WORKSPACE:
        return SOFORT_WORKSPACE
    if normalized == BENIM_DEPOM_WORKSPACE:
        return BENIM_DEPOM_WORKSPACE
    raise InvalidInventoryWorkspace(f"Unsupported inventory workspace: {normalized}")


def get_active_workspace() -> str:
    return _active_workspace.get()


def get_active_database_alias() -> str:
    if get_active_workspace() == BENIM_DEPOM_WORKSPACE:
        return BENIM_DEPOM_DATABASE_ALIAS
    return "default"


def set_active_workspace(workspace: str):
    return _active_workspace.set(workspace)


def reset_active_workspace(token) -> None:
    _active_workspace.reset(token)


@contextmanager
def inventory_workspace(workspace: str):
    token = set_active_workspace(normalize_workspace(workspace))
    try:
        yield
    finally:
        reset_active_workspace(token)


@contextmanager
def workspace_atomic():
    with transaction.atomic(using=get_active_database_alias()):
        yield


def workspace_atomic_view(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        with workspace_atomic():
            return view(*args, **kwargs)

    return wrapped
