from __future__ import annotations

from .workspace import BENIM_DEPOM_DATABASE_ALIAS, get_active_database_alias


class InventoryWorkspaceDatabaseRouter:
    """Routes warehouse inventory models to the requested workspace database."""

    app_label = "database"

    def db_for_read(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return get_active_database_alias()
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return get_active_database_alias()
        return None

    def allow_relation(self, obj1, obj2, **hints):
        if obj1._meta.app_label == self.app_label and obj2._meta.app_label == self.app_label:
            return True
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if db == BENIM_DEPOM_DATABASE_ALIAS:
            return app_label == self.app_label
        return None
